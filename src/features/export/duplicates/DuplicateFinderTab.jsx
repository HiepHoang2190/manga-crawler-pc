import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../../context/I18nContext';
import { ResizeSplitter, SearchableSelect, SourcePicker, useToolsSidebarResize } from '../../../shared';
import { ToolsStudioActionSlot, ToolsStudioCenterSlot } from '../../tools-studio/ToolsStudioActionSlot';
import { formatBytes, toggleGroupCollapseInSet } from './duplicateUtils';

const previewThumbnailCache = new Map();

function GroupThumbnail({ item, onPreviewClick, tooltipText }) {
  const [dataUrl, setDataUrl] = useState(() => {
    if (!item?.fullPath) return null;
    return previewThumbnailCache.get(item.fullPath) || null;
  });
  const [loading, setLoading] = useState(() => !previewThumbnailCache.has(item?.fullPath));
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!item?.fullPath) {
      setDataUrl(null);
      setLoading(false);
      return;
    }

    if (previewThumbnailCache.has(item.fullPath)) {
      setDataUrl(previewThumbnailCache.get(item.fullPath));
      setLoading(false);
      setHasError(false);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setHasError(false);

    const api = typeof window !== 'undefined' ? window.electronAPI : null;
    const readFn = api?.readImagePreview || api?.duplicateReadPreview;

    if (readFn) {
      readFn(item.fullPath)
        .then((res) => {
          if (!isMounted) return;
          if (res?.ok && res?.dataUrl) {
            previewThumbnailCache.set(item.fullPath, res.dataUrl);
            setDataUrl(res.dataUrl);
          } else {
            setHasError(true);
          }
        })
        .catch(() => {
          if (isMounted) setHasError(true);
        })
        .finally(() => {
          if (isMounted) setLoading(false);
        });
    } else {
      setLoading(false);
    }

    return () => {
      isMounted = false;
    };
  }, [item?.fullPath]);

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onPreviewClick?.();
      }}
      data-tooltip={tooltipText}
      aria-label={tooltipText}
      className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-lg overflow-hidden border border-outline-variant/30 bg-surface-container-highest shrink-0 group/thumb cursor-pointer shadow-xs transition-transform active:scale-95 select-none"
    >
      {dataUrl ? (
        <img
          src={dataUrl}
          alt={item?.name || ''}
          className="w-full h-full object-cover transition-transform duration-200 group-hover/thumb:scale-105"
          loading="lazy"
        />
      ) : loading ? (
        <div className="w-full h-full flex items-center justify-center animate-pulse bg-surface-container-highest text-on-surface-variant/40">
          <span className="material-symbols-outlined text-[20px]">image</span>
        </div>
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-surface-container-highest text-on-surface-variant/40">
          <span className="material-symbols-outlined text-[20px]">{hasError ? 'broken_image' : 'photo_library'}</span>
        </div>
      )}

      {/* Hover overlay with zoom icon */}
      <div className="absolute inset-0 bg-black/45 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity duration-150">
        <span className="material-symbols-outlined text-white text-[18px] drop-shadow-sm">zoom_in</span>
      </div>
    </div>
  );
}

export default function DuplicateFinderTab({
  savePath = '',
  onRunningChange,
  sidebarWidth: propWidth,
  handleSplitPointerDown: propHandleSplit,
  showSidebar = true,
  isActive = true,
}) {
  const { t } = useI18n();
  const api = typeof window !== 'undefined' ? window.electronAPI : null;

  const { sidebarWidth: defaultSidebarWidth, handleSplitPointerDown: defaultHandleSplit } =
    useToolsSidebarResize();
  const sidebarWidth = propWidth ?? defaultSidebarWidth;
  const handleSplitPointerDown = propHandleSplit ?? defaultHandleSplit;

  // Source selection states (supports multiple folders or individual files)
  const [folders, setFolders] = useState([]);
  const [sourceFiles, setSourceFiles] = useState([]);
  const [includeSubfolders, setIncludeSubfolders] = useState(true);

  // Pre-scan imported files vs Post-scan duplicates
  const [importedFiles, setImportedFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [scannedDuplicates, setScannedDuplicates] = useState([]);
  const [hasScanned, setHasScanned] = useState(false);
  const [stats, setStats] = useState({ total: 0, duplicates: 0, ok: 0 });
  const [scanError, setScanError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(null);

  // Selection for deletion
  const [selectedForDelete, setSelectedForDelete] = useState(() => new Set());
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Preview modal states
  const [previewIndex, setPreviewIndex] = useState(null);
  const [previewDataUrl, setPreviewDataUrl] = useState(null);

  // Search, sort & filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('name_asc');
  const [filterStatus, setFilterStatus] = useState('all');

  // Collapsed groups state (Set of groupIds that are currently collapsed)
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());

  // Notify parent of running state
  useEffect(() => {
    onRunningChange?.(scanning || deleteBusy || loadingFiles);
  }, [scanning, deleteBusy, loadingFiles, onRunningChange]);

  const hasElectron = Boolean(api?.duplicateScan);
  const hasSource = Boolean((folders && folders.length > 0) || (sourceFiles && sourceFiles.length > 0));

  const resetAllState = useCallback(() => {
    previewThumbnailCache.clear();
    setImportedFiles([]);
    setScannedDuplicates([]);
    setHasScanned(false);
    setStats({ total: 0, duplicates: 0, ok: 0 });
    setScanError('');
    setSelectedForDelete(new Set());
    setScanProgress(null);
    setPreviewIndex(null);
    setDeleteMessage('');
    setSearchQuery('');
    setFilterStatus('all');
    setCollapsedGroups(new Set());
  }, []);

  // Listen to scan progress from main process
  useEffect(() => {
    if (!api?.onDuplicateScanProgress) return;
    const cleanup = api.onDuplicateScanProgress((data) => {
      setScanProgress(data);
    });
    return cleanup;
  }, [api]);

  // Initial select folder
  const handleSelectFolder = useCallback(async () => {
    if (!api) return;
    const selectFn = api.duplicateSelectFolders || api.selectDirectory;
    if (!selectFn) return;
    const res = await selectFn();
    let selected = [];
    if (Array.isArray(res?.folders) && res.folders.length > 0) {
      selected = res.folders;
    } else if (typeof res === 'string' && res) {
      selected = [res];
    } else if (res?.folder) {
      selected = [res.folder];
    }
    if (selected.length > 0) {
      setFolders([...new Set(selected)]);
      setSourceFiles([]);
      resetAllState();
    }
  }, [api, resetAllState]);

  // Add more folders to the existing list
  const handleAddFolders = useCallback(async () => {
    if (!api) return;
    const selectFn = api.duplicateSelectFolders || api.selectDirectory;
    if (!selectFn) return;
    const res = await selectFn();
    let selected = [];
    if (Array.isArray(res?.folders) && res.folders.length > 0) {
      selected = res.folders;
    } else if (typeof res === 'string' && res) {
      selected = [res];
    } else if (res?.folder) {
      selected = [res.folder];
    }
    if (selected.length > 0) {
      setFolders((prev) => {
        const set = new Set(prev);
        for (const f of selected) {
          if (f) set.add(f);
        }
        return [...set];
      });
      setSourceFiles([]);
    }
  }, [api]);

  // Remove a specific folder from the list
  const handleRemoveFolder = useCallback((folderToRemove) => {
    setFolders((prev) => prev.filter((f) => f !== folderToRemove));
  }, []);

  // Select individual image files
  const handleSelectFiles = useCallback(async () => {
    if (!api?.selectImageFiles) return;
    const files = await api.selectImageFiles();
    if (files && files.length > 0) {
      setSourceFiles(files);
      setFolders([]);
      resetAllState();
    }
  }, [api, resetAllState]);

  // Clear all sources
  const handleClearAll = useCallback(() => {
    setFolders([]);
    setSourceFiles([]);
    resetAllState();
  }, [resetAllState]);

  // Fast list all imported files on source selection (NO auto-scan)
  useEffect(() => {
    let active = true;
    if (!hasSource || !api?.duplicateListFiles) {
      setImportedFiles([]);
      setScannedDuplicates([]);
      setHasScanned(false);
      setLoadingFiles(false);
      return;
    }

    setLoadingFiles(true);
    setHasScanned(false);
    setScannedDuplicates([]);
    setSelectedForDelete(new Set());
    setScanError('');
    setDeleteMessage('');
    setSortBy('name_asc');
    setFilterStatus('all');

    api.duplicateListFiles({ folders, sourceFiles, includeSubfolders })
      .then((res) => {
        if (!active) return;
        if (res?.ok && Array.isArray(res.files)) {
          setImportedFiles(res.files);
          setStats({ total: res.files.length, duplicates: 0, ok: res.files.length });
        } else {
          setImportedFiles([]);
        }
      })
      .catch(() => {
        if (!active) return;
        setImportedFiles([]);
      })
      .finally(() => {
        if (active) setLoadingFiles(false);
      });

    return () => {
      active = false;
    };
  }, [folders, sourceFiles, includeSubfolders, api, hasSource]);

  // Scan execution when user clicks "Quét trùng"
  const handleScan = useCallback(async () => {
    if (!api?.duplicateScan || !hasSource) return;
    setScanning(true);
    setScanError('');
    setDeleteMessage('');
    setScanProgress(null);
    setPreviewIndex(null);
    try {
      const payload = folders.length > 0
        ? {
            roots: folders,
            recursive: includeSubfolders,
            maxDepth: 8,
          }
        : {
            files: sourceFiles,
            recursive: false,
          };
      const r = await api.duplicateScan(payload);
      if (r?.cancelled) {
        setScanError(t('duplicateTab.cancelled'));
        return;
      }
      if (!r?.ok) {
        setScannedDuplicates([]);
        setHasScanned(false);
        setSelectedForDelete(new Set());
        setScanError(r?.error || t('duplicateTab.scanFailed'));
        return;
      }

      const allScanned = Array.isArray(r.images) ? r.images : [];
      // User requirement: "khi bấm Quét chỉ hiện thị ảnh bị trùng thôi"
      const duplicateImages = allScanned.filter((img) => img.isDuplicate);

      setScannedDuplicates(duplicateImages);
      setHasScanned(true);
      setSortBy('duplicates_first');
      setFilterStatus('all');
      setCollapsedGroups(new Set());

      setStats(
        r.stats || {
          total: allScanned.length,
          duplicates: duplicateImages.filter((img) => !img.isOriginal).length,
          ok: allScanned.filter((img) => !img.isDuplicate).length,
        }
      );

      // Auto-select duplicate copies for deletion (leaving originals unselected)
      const autoSelected = new Set();
      for (const img of duplicateImages) {
        if (!img.isOriginal) {
          autoSelected.add(img.fullPath);
        }
      }
      setSelectedForDelete(autoSelected);
    } catch (e) {
      setScannedDuplicates([]);
      setHasScanned(false);
      setSelectedForDelete(new Set());
      setScanError(String(e?.message || e));
    } finally {
      setScanning(false);
      setScanProgress(null);
    }
  }, [api, hasSource, folders, sourceFiles, includeSubfolders, t]);

  const handleCancelScan = useCallback(() => {
    if (api?.duplicateCancelScan) {
      api.duplicateCancelScan();
    }
  }, [api]);

  // Image row check / uncheck
  const togglePath = useCallback((fullPath) => {
    setSelectedForDelete((prev) => {
      const next = new Set(prev);
      if (next.has(fullPath)) next.delete(fullPath);
      else next.add(fullPath);
      return next;
    });
  }, []);

  // Quick select duplicate copies only (except first original)
  const selectExceptFirstPerGroup = useCallback(() => {
    const next = new Set();
    for (const img of scannedDuplicates) {
      if (img.isDuplicate && !img.isOriginal) {
        next.add(img.fullPath);
      }
    }
    setSelectedForDelete(next);
  }, [scannedDuplicates]);

  // Remove single image from list (does not delete file on disk)
  const handleRemoveItem = useCallback((pathToRemove) => {
    if (hasScanned) {
      setScannedDuplicates((prev) => prev.filter((img) => img.fullPath !== pathToRemove));
    } else {
      setImportedFiles((prev) => prev.filter((f) => f.fullPath !== pathToRemove));
    }
    setSelectedForDelete((prev) => {
      if (!prev.has(pathToRemove)) return prev;
      const next = new Set(prev);
      next.delete(pathToRemove);
      return next;
    });
  }, [hasScanned]);

  // Mở thư mục chứa file trong Finder / File Explorer
  const handleOpenItemFolder = useCallback((fullPath) => {
    if (!fullPath || !api) return;
    if (api.showItemInFolder) {
      api.showItemInFolder(fullPath);
    } else if (api.openFolder) {
      api.openFolder(fullPath);
    }
  }, [api]);

  // Deletion logic
  const handleDelete = useCallback(() => {
    if (!api?.duplicateDeleteFiles || !selectedForDelete.size || !hasSource) return;
    setShowDeleteConfirm(true);
  }, [api, selectedForDelete, hasSource]);

  const executeDelete = useCallback(async () => {
    setShowDeleteConfirm(false);
    if (!api?.duplicateDeleteFiles || !selectedForDelete.size || !hasSource) return;
    const paths = [...selectedForDelete];
    const allowedRoots = folders.length > 0 ? folders : sourceFiles;
    setDeleteBusy(true);
    setDeleteMessage('');
    try {
      const r = await api.duplicateDeleteFiles(allowedRoots, paths);
      if (!r?.ok) {
        setDeleteMessage(r?.error || t('duplicateTab.deleteFailed'));
        return;
      }

      const deletedSet = new Set(r.deleted || []);
      if (deletedSet.size > 0) {
        setScannedDuplicates((prev) => prev.filter((img) => !deletedSet.has(img.fullPath)));
        setImportedFiles((prev) => prev.filter((img) => !deletedSet.has(img.fullPath)));
        setSelectedForDelete((prev) => {
          const next = new Set(prev);
          for (const p of deletedSet) next.delete(p);
          return next;
        });

        if (r.errors && r.errors.length > 0) {
          setDeleteMessage(t('duplicateTab.deletePartial', { deleted: deletedSet.size, errors: r.errors.length }));
        } else {
          setDeleteMessage(t('duplicateTab.deleteDone', { count: deletedSet.size }));
        }
      } else if (r.errors && r.errors.length > 0) {
        setDeleteMessage(r.errors[0]?.error || t('duplicateTab.deleteFailed'));
      }
    } catch (e) {
      setDeleteMessage(String(e?.message || e));
    } finally {
      setDeleteBusy(false);
    }
  }, [api, selectedForDelete, hasSource, folders, sourceFiles, t]);

  const selectedCount = selectedForDelete.size;
  const copiesCount = useMemo(
    () => scannedDuplicates.filter((img) => !img.isOriginal).length,
    [scannedDuplicates]
  );

  // Danh sách các tùy chọn cho dropdown Bộ lọc trạng thái (Filter)
  const filterOptions = useMemo(() => {
    const totalCount = hasScanned ? scannedDuplicates.length : importedFiles.length;
    const allLabel = hasScanned
      ? `${t('duplicateTab.filterAllDuplicates')} (${totalCount})`
      : `${t('duplicateTab.filterAll')} (${totalCount})`;

    return [
      {
        value: 'all',
        label: allLabel,
        materialIcon: 'layers',
      },
      ...(selectedCount > 0
        ? [
            {
              value: 'selected',
              label: `${t('duplicateTab.filterSelected')} (${selectedCount})`,
              materialIcon: 'check_box',
            },
          ]
        : []),
    ];
  }, [
    hasScanned,
    scannedDuplicates.length,
    importedFiles.length,
    selectedCount,
    t,
  ]);

  // Tự động trả về 'all' nếu đang lọc 'selected' mà toàn bộ selection bị hủy
  useEffect(() => {
    if (filterStatus === 'selected' && selectedCount === 0) {
      setFilterStatus('all');
    }
  }, [filterStatus, selectedCount]);

  // Filtered and Sorted Images
  const displayedItems = useMemo(() => {
    let list = hasScanned ? [...scannedDuplicates] : [...importedFiles];

    // 1. Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (item) =>
          (item.name || '').toLowerCase().includes(q) ||
          (item.relativePath || '').toLowerCase().includes(q) ||
          (item.fullPath || '').toLowerCase().includes(q)
      );
    }

    // 2. Status filter
    if (filterStatus === 'selected') {
      list = list.filter((item) => selectedForDelete.has(item.fullPath));
    }

    // 3. Sort
    list.sort((a, b) => {
      if (hasScanned && sortBy === 'duplicates_first') {
        if (a.duplicateGroup && b.duplicateGroup && a.duplicateGroup !== b.duplicateGroup) {
          return a.duplicateGroup - b.duplicateGroup;
        }
        if (a.isOriginal !== b.isOriginal) return a.isOriginal ? -1 : 1;
        return (a.name || '').localeCompare(b.name || '', undefined, { numeric: true });
      }
      if (sortBy === 'name_asc') {
        return (a.name || '').localeCompare(b.name || '', undefined, { numeric: true });
      }
      if (sortBy === 'name_desc') {
        return (b.name || '').localeCompare(a.name || '', undefined, { numeric: true });
      }
      if (sortBy === 'size_desc') {
        return (b.sizeBytes || 0) - (a.sizeBytes || 0);
      }
      if (sortBy === 'size_asc') {
        return (a.sizeBytes || 0) - (b.sizeBytes || 0);
      }
      return 0;
    });

    return list;
  }, [hasScanned, scannedDuplicates, importedFiles, searchQuery, filterStatus, sortBy, selectedForDelete]);

  // Master Checkbox State
  const allDisplayedChecked = useMemo(() => {
    if (displayedItems.length === 0) return false;
    return displayedItems.every((item) => selectedForDelete.has(item.fullPath));
  }, [displayedItems, selectedForDelete]);

  const someDisplayedChecked = useMemo(() => {
    if (displayedItems.length === 0) return false;
    return displayedItems.some((item) => selectedForDelete.has(item.fullPath));
  }, [displayedItems, selectedForDelete]);

  const handleToggleSelectAll = useCallback(() => {
    setSelectedForDelete((prev) => {
      const next = new Set(prev);
      if (allDisplayedChecked) {
        for (const item of displayedItems) next.delete(item.fullPath);
      } else {
        for (const item of displayedItems) next.add(item.fullPath);
      }
      return next;
    });
  }, [allDisplayedChecked, displayedItems]);

  // Gom nhóm ảnh trùng theo từng cụm/nhóm trùng (Duplicate Group)
  const groupedDuplicates = useMemo(() => {
    if (!hasScanned) return [];
    const map = new Map();
    for (const item of displayedItems) {
      const gId = item.duplicateGroup ?? 'ungrouped';
      if (!map.has(gId)) {
        map.set(gId, []);
      }
      map.get(gId).push(item);
    }
    return Array.from(map.entries()).map(([groupId, items]) => {
      const originals = items.filter((img) => img.isOriginal);
      const copies = items.filter((img) => !img.isOriginal);
      const totalSize = items.reduce((sum, img) => sum + (img.sizeBytes || 0), 0);
      const reclaimableSize = copies.reduce((sum, img) => sum + (img.sizeBytes || 0), 0);
      const allCopiesChecked =
        copies.length > 0 && copies.every((img) => selectedForDelete.has(img.fullPath));
      const someCopiesChecked = copies.some((img) => selectedForDelete.has(img.fullPath));
      const allItemsChecked =
        items.length > 0 && items.every((img) => selectedForDelete.has(img.fullPath));
      const someItemsChecked = items.some((img) => selectedForDelete.has(img.fullPath));

      return {
        groupId,
        items,
        originals,
        copies,
        totalSize,
        reclaimableSize,
        allCopiesChecked,
        someCopiesChecked,
        allItemsChecked,
        someItemsChecked,
      };
    });
  }, [hasScanned, displayedItems, selectedForDelete]);

  const toggleGroupSelection = useCallback((group) => {
    setSelectedForDelete((prev) => {
      const next = new Set(prev);
      if (group.allItemsChecked || group.allCopiesChecked) {
        for (const item of group.items) {
          next.delete(item.fullPath);
        }
      } else {
        for (const copy of group.copies) {
          next.add(copy.fullPath);
        }
      }
      return next;
    });
  }, []);

  const selectOnlyGroupCopies = useCallback((group) => {
    setSelectedForDelete((prev) => {
      const next = new Set(prev);
      for (const orig of group.originals) {
        next.delete(orig.fullPath);
      }
      for (const copy of group.copies) {
        next.add(copy.fullPath);
      }
      return next;
    });
  }, []);

  const uncheckGroup = useCallback((group) => {
    setSelectedForDelete((prev) => {
      const next = new Set(prev);
      for (const item of group.items) {
        next.delete(item.fullPath);
      }
      return next;
    });
  }, []);

  // Collapse / Expand từng khối nhóm trùng
  const toggleGroupCollapse = useCallback((groupId) => {
    setCollapsedGroups((prev) => toggleGroupCollapseInSet(prev, groupId));
  }, []);

  const allGroupsCollapsed = useMemo(() => {
    return (
      groupedDuplicates.length > 0 &&
      groupedDuplicates.every((g) => collapsedGroups.has(g.groupId))
    );
  }, [groupedDuplicates, collapsedGroups]);

  const toggleAllGroupsCollapse = useCallback(() => {
    setCollapsedGroups((prev) => {
      const allCollapsed =
        groupedDuplicates.length > 0 &&
        groupedDuplicates.every((g) => prev.has(g.groupId));
      if (allCollapsed) {
        return new Set();
      }
      return new Set(groupedDuplicates.map((g) => g.groupId));
    });
  }, [groupedDuplicates]);

  // Preview modal image loading & keyboard navigation
  const activeItem = previewIndex !== null ? displayedItems[previewIndex] : null;

  useEffect(() => {
    if (!activeItem || !api) {
      setPreviewDataUrl(null);
      return;
    }
    let active = true;
    const readPreview = api.readImagePreview || api.duplicateReadPreview;
    if (readPreview) {
      readPreview(activeItem.fullPath).then((res) => {
        if (!active) return;
        if (res?.ok && res?.dataUrl) {
          setPreviewDataUrl(res.dataUrl);
        }
      });
    }
    return () => {
      active = false;
    };
  }, [activeItem, api]);

  useEffect(() => {
    if (previewIndex === null) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setPreviewIndex(null);
      else if (e.key === 'ArrowLeft') {
        setPreviewIndex((prev) => (prev > 0 ? prev - 1 : displayedItems.length - 1));
      } else if (e.key === 'ArrowRight') {
        setPreviewIndex((prev) => (prev < displayedItems.length - 1 ? prev + 1 : 0));
      }
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [previewIndex, displayedItems.length]);

  const hasItemsToDisplay = hasScanned ? scannedDuplicates.length > 0 : importedFiles.length > 0;

  return (
    <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden bg-surface">
      <ToolsStudioCenterSlot active={isActive}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!hasElectron || !hasSource || scanning || deleteBusy || loadingFiles || (!hasScanned && importedFiles.length === 0)}
            onClick={handleScan}
            className="flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-semibold text-on-primary shadow-xs transition-all hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px] leading-none">travel_explore</span>
            <span>{scanning ? t('duplicateTab.scanning') : t('duplicateTab.start')}</span>
          </button>
          <button
            type="button"
            onClick={handleCancelScan}
            disabled={!scanning || !api?.duplicateCancelScan}
            className="flex h-8 items-center justify-center gap-1 rounded-lg border border-error/40 px-2.5 text-xs font-semibold text-error transition-colors hover:bg-error/10 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px] leading-none">stop_circle</span>
            <span>{t('duplicateTab.stop')}</span>
          </button>
        </div>
      </ToolsStudioCenterSlot>
      <ToolsStudioActionSlot active={isActive}></ToolsStudioActionSlot>

      {/* ─── left sidebar: controls & scan action ─── */}
      {showSidebar && (
        <div
          style={{ width: `${sidebarWidth}px` }}
          className="relative shrink-0 flex flex-col h-full border-r border-outline-variant/20 overflow-visible select-none"
        >
          <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-5 space-y-5 mr-1.5">
            {!hasElectron && (
              <p className="text-xs text-amber-400">{t('duplicateTab.desktopOnly')}</p>
            )}

            {/* (1) Nguồn ảnh: Hỗ trợ 1 hoặc nhiều thư mục (có nút Thêm thư mục khác) */}
            <SourcePicker
              folders={folders}
              onSelectFolder={handleSelectFolder}
              onAddFolder={handleAddFolders}
              onRemoveFolder={handleRemoveFolder}
              onClear={handleClearAll}
              includeSubfolders={includeSubfolders}
              onIncludeSubfoldersChange={setIncludeSubfolders}
              disabled={scanning || deleteBusy || loadingFiles || !hasElectron}
              foldersMaxHeightClass="max-h-[55vh]"
            />

            {/* (2) Contextual Callout thuật toán */}
            <p className="rounded-lg border border-outline-variant/20 bg-surface-container-high p-2.5 text-[11px] leading-relaxed text-on-surface-variant">
              {t('duplicateTab.algorithmHint')}
            </p>

            {/* Thông báo lỗi / kết quả */}
            {scanError ? (
              <p className="text-xs text-error whitespace-pre-wrap" role="alert">
                {scanError}
              </p>
            ) : null}

            {deleteMessage ? (
              <p className="text-xs text-on-surface whitespace-pre-wrap border border-outline-variant/20 rounded-xl p-3 bg-surface-container-highest/50">
                {deleteMessage}
              </p>
            ) : null}
          </div>

          <ResizeSplitter
            variant="overlay"
            side="right"
            onPointerDown={handleSplitPointerDown}
            ariaLabel={t('sidebar.resizeSplit')}
          />
        </div>
      )}

      {/* ─── right panel: results & actions ─── */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col p-4 overflow-hidden">
        {/* Progress Bar khi đang quét */}
        {scanning && scanProgress && (
          <div className="shrink-0 space-y-1 pb-3">
            <div className="h-1 overflow-hidden rounded-full bg-surface-container-highest">
              <div
                className="h-full bg-primary transition-[width] duration-150"
                style={{
                  width: `${Math.max(0, Math.min(100, (scanProgress.processed / Math.max(1, scanProgress.total)) * 100))}%`,
                }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-on-surface-variant">
              <p className="truncate">
                {t('duplicateTab.scanning')} {scanProgress.processed} / {scanProgress.total}
                {scanProgress.currentFile ? ` — ${scanProgress.currentFile}` : ''}
              </p>
              <span className="shrink-0 font-mono ml-2">
                {Math.round((scanProgress.processed / Math.max(1, scanProgress.total)) * 100)}%
              </span>
            </div>
          </div>
        )}

        {/* Khung danh sách chuẩn Tools Studio */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-outline-variant/15 bg-surface-container-lowest/50 shadow-sm">
          {/* Thanh công cụ đỉnh Toolbar */}
          {hasSource && hasItemsToDisplay && (
            <div className="shrink-0 flex items-center justify-between gap-2 border-b border-outline-variant/15 px-3 py-2 bg-surface-container-low/40 min-h-[3rem] overflow-x-auto no-scrollbar">
              {/* Left: When !hasScanned, show simple count badge. When hasScanned, show selection & filter controls */}
              <div className="flex items-center gap-1.5 shrink-0">
                {!hasScanned ? (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-container-highest/60 border border-outline-variant/15 text-xs text-on-surface select-none">
                    <span className="material-symbols-outlined text-[17px] text-primary">photo_library</span>
                    <span className="font-semibold text-on-surface">
                      {t('duplicateTab.readyToScan', { count: displayedItems.length })}
                    </span>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleToggleSelectAll}
                      aria-label={allDisplayedChecked ? t('duplicateTab.uncheckAll') : t('duplicateTab.checkAll')}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-surface-container-highest/70 hover:bg-surface-container-highest text-on-surface transition-colors cursor-pointer border border-outline-variant/20 shrink-0"
                    >
                      <span className="material-symbols-outlined text-[18px] leading-none text-primary">
                        {allDisplayedChecked
                          ? 'check_box'
                          : someDisplayedChecked
                            ? 'indeterminate_check_box'
                            : 'check_box_outline_blank'}
                      </span>
                    </button>

                    {/* Nút chọn nhanh bản sao trùng (nằm cạnh Checkbox All) */}
                    {copiesCount > 0 && (
                      <button
                        type="button"
                        onClick={selectExceptFirstPerGroup}
                        data-tooltip={t('duplicateTab.selectAllExceptFirst')}
                        aria-label={t('duplicateTab.selectAllExceptFirst')}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container-highest/80 border border-outline-variant/20 cursor-pointer transition-colors shrink-0"
                      >
                        <span className="material-symbols-outlined text-[18px] leading-none">filter_1</span>
                      </button>
                    )}

                    {/* Dropdown Bộ lọc trạng thái */}
                    <SearchableSelect
                      value={filterStatus}
                      onChange={setFilterStatus}
                      options={filterOptions}
                      className="min-w-[12.5rem] sm:min-w-[14rem]"
                    />

                    {/* Nút thu gọn / mở rộng tất cả nhóm trùng */}
                    {groupedDuplicates.length > 1 && (
                      <button
                        type="button"
                        onClick={toggleAllGroupsCollapse}
                        data-tooltip={allGroupsCollapsed ? t('duplicateTab.expandAll') : t('duplicateTab.collapseAll')}
                        aria-label={allGroupsCollapsed ? t('duplicateTab.expandAll') : t('duplicateTab.collapseAll')}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container-highest/80 border border-outline-variant/20 cursor-pointer transition-colors shrink-0"
                      >
                        <span className="material-symbols-outlined text-[18px] leading-none">
                          {allGroupsCollapsed ? 'unfold_more' : 'unfold_less'}
                        </span>
                      </button>
                    )}
                  </>
                )}
              </div>

              {/* Right: Search + Sort + Delete Button (chỉ hiển thị sau khi đã quét xong) */}
              {hasScanned && (
                <div className="flex items-center gap-2 shrink-0">
                  <div className="relative flex items-center">
                    <span className="material-symbols-outlined absolute left-2.5 text-[15px] text-on-surface-variant/50 pointer-events-none">
                      search
                    </span>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={t('duplicateTab.searchPlaceholder')}
                      className="h-8 w-32 sm:w-36 rounded-lg bg-surface-container-highest/80 pl-8 pr-7 text-xs outline-none focus:ring-1 focus:ring-primary placeholder:text-on-surface-variant/40 transition-all"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2 text-on-surface-variant/60 hover:text-on-surface text-[14px] cursor-pointer"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  <SearchableSelect
                    value={sortBy}
                    onChange={setSortBy}
                    options={[
                      { value: 'duplicates_first', label: t('duplicateTab.sortDuplicatesFirst'), materialIcon: 'content_copy' },
                      { value: 'name_asc', label: t('duplicateTab.sortNameAsc'), materialIcon: 'sort_by_alpha' },
                      { value: 'name_desc', label: t('duplicateTab.sortNameDesc'), materialIcon: 'sort_by_alpha' },
                      { value: 'size_desc', label: t('duplicateTab.sortSizeDesc'), materialIcon: 'format_size' },
                      { value: 'size_asc', label: t('duplicateTab.sortSizeAsc'), materialIcon: 'format_size' },
                    ]}
                    className="min-w-[11.5rem]"
                  />

                  <button
                    type="button"
                    disabled={!hasElectron || !selectedCount || deleteBusy}
                    onClick={handleDelete}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-error text-on-error font-bold hover:opacity-90 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed shrink-0 shadow-xs transition-opacity h-8"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                    <span>{deleteBusy ? t('duplicateTab.deleting') : t('duplicateTab.delete')}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Vùng danh sách nội dung */}
          {!hasSource ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-on-surface-variant/40">
              <span className="material-symbols-outlined text-[48px]">travel_explore</span>
              <p className="text-sm">{t('duplicateTab.noSourceSelected')}</p>
            </div>
          ) : loadingFiles ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-on-surface-variant">
              <span className="material-symbols-outlined text-4xl text-primary animate-spin">
                progress_activity
              </span>
              <p className="text-sm font-medium text-on-surface">{t('duplicateTab.loadingFiles')}</p>
            </div>
          ) : scanning ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-on-surface-variant">
              <span className="material-symbols-outlined text-4xl text-primary animate-spin">
                progress_activity
              </span>
              <p className="text-sm font-medium text-on-surface">{t('duplicateTab.scanning')}</p>
              {scanProgress && (
                <p className="text-xs text-on-surface-variant font-mono">
                  {scanProgress.processed} / {scanProgress.total} (
                  {Math.round((scanProgress.processed / Math.max(1, scanProgress.total)) * 100)}%)
                </p>
              )}
            </div>
          ) : !hasScanned && importedFiles.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-on-surface-variant/40 p-6 text-center">
              <span className="material-symbols-outlined text-[48px]">folder_off</span>
              <p className="text-sm font-medium text-on-surface">{t('duplicateTab.noResults')}</p>
            </div>
          ) : hasScanned && scannedDuplicates.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
              <span className="material-symbols-outlined text-[54px] text-emerald-400">check_circle</span>
              <p className="text-base font-bold text-on-surface">{t('duplicateTab.noDuplicatesFound')}</p>
              <p className="text-xs text-on-surface-variant/70 max-w-md">{t('duplicateTab.allImagesUnique')}</p>
            </div>
          ) : displayedItems.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-on-surface-variant/40">
              <span className="material-symbols-outlined text-[48px]">search_off</span>
              <p className="text-sm font-medium text-on-surface">{t('duplicateTab.noMatchingFilter')}</p>
            </div>
          ) : hasScanned ? (
            <div className="min-h-0 flex-1 overflow-y-auto py-1.5 pr-1 custom-scrollbar space-y-3">
              {groupedDuplicates.map((group) => {
                const representativeItem = group.originals[0] || group.items[0];
                const isCollapsed = collapsedGroups.has(group.groupId);
                return (
                  <div
                    key={`group-${group.groupId}`}
                    className="mx-1 rounded-xl border border-outline-variant/20 bg-surface-container-low/40 overflow-hidden shadow-xs"
                  >
                    {/* Header nhóm trùng */}
                    <div
                      onClick={() => toggleGroupCollapse(group.groupId)}
                      role="button"
                      tabIndex={0}
                      aria-expanded={!isCollapsed}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleGroupCollapse(group.groupId);
                        }
                      }}
                      data-tooltip={isCollapsed ? t('duplicateTab.expandGroup') : t('duplicateTab.collapseGroup')}
                      className={[
                        'flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 px-3 py-2.5 bg-surface-container-high/60 text-xs cursor-pointer select-none transition-colors hover:bg-surface-container-high',
                        isCollapsed ? '' : 'border-b border-outline-variant/15',
                      ].join(' ')}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {/* Master Checkbox của nhóm */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleGroupSelection(group);
                          }}
                          aria-label={
                            group.allItemsChecked || group.allCopiesChecked
                              ? t('duplicateTab.uncheckAll')
                              : t('duplicateTab.selectAllExceptFirst')
                          }
                          className="flex items-center justify-center p-0.5 rounded text-on-surface-variant/70 hover:text-primary transition-colors cursor-pointer shrink-0"
                        >
                          <span
                            className={[
                              'material-symbols-outlined text-[20px] leading-none select-none pointer-events-none',
                              group.allItemsChecked || group.someItemsChecked
                                ? 'text-primary'
                                : 'text-on-surface-variant/35 hover:text-on-surface-variant/60',
                            ].join(' ')}
                          >
                            {group.allItemsChecked
                              ? 'check_box'
                              : group.someItemsChecked
                                ? 'indeterminate_check_box'
                                : 'check_box_outline_blank'}
                          </span>
                        </button>

                        {/* Preview Thumbnail ảnh đại diện cho nhóm */}
                        {representativeItem && (
                          <GroupThumbnail
                            item={representativeItem}
                            tooltipText={t('duplicateTab.preview')}
                            onPreviewClick={() => {
                              const repIdx = displayedItems.indexOf(representativeItem);
                              if (repIdx !== -1) setPreviewIndex(repIdx);
                            }}
                          />
                        )}

                        {/* Thông tin nhóm */}
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="shrink-0 font-bold text-xs text-primary px-2 py-0.5 rounded-md bg-primary/10 border border-primary/25">
                              {t('duplicateTab.group', { id: group.groupId })}
                            </span>

                            <span className="truncate text-on-surface-variant font-medium">
                              {t('duplicateTab.groupFilesCount', { count: group.items.length })}
                              {group.copies.length > 0 && (
                                <span className="text-rose-400 font-semibold ml-1">
                                  ({group.copies.length} {t('duplicateTab.filterCopiesOnly') || 'bản sao'})
                                </span>
                              )}
                            </span>

                            {group.reclaimableSize > 0 && (
                              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 shrink-0">
                                <span className="material-symbols-outlined text-[13px]">delete_sweep</span>
                                <span>{formatBytes(group.reclaimableSize)}</span>
                              </span>
                            )}
                          </div>

                          {/* Thông số ảnh đại diện */}
                          {representativeItem && (
                            <div className="flex items-center gap-2 text-[11px] text-on-surface-variant/70 min-w-0">
                              <span
                                className="truncate font-medium text-on-surface text-xs"
                                data-tooltip={representativeItem.fullPath}
                              >
                                {representativeItem.name}
                              </span>
                              {representativeItem.width && representativeItem.height ? (
                                <span className="shrink-0 font-mono text-[10px] text-on-surface-variant/60">
                                  {representativeItem.width}×{representativeItem.height}
                                </span>
                              ) : null}
                              <span className="shrink-0 font-mono text-[10px] text-on-surface-variant/60">
                                {formatBytes(representativeItem.sizeBytes)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Các nút thao tác nhanh theo nhóm */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            selectOnlyGroupCopies(group);
                          }}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-surface-container-highest/80 hover:bg-surface-container-highest text-on-surface hover:text-primary transition-colors cursor-pointer"
                          data-tooltip={t('duplicateTab.selectAllExceptFirst')}
                        >
                          {t('duplicateTab.filterCopiesOnly') || 'Chọn bản sao'}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            uncheckGroup(group);
                          }}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-on-surface-variant/60 hover:text-on-surface hover:bg-surface-container-highest transition-colors cursor-pointer"
                          data-tooltip={t('duplicateTab.uncheckAll')}
                        >
                          {t('duplicateTab.cancel') || 'Bỏ chọn'}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleGroupCollapse(group.groupId);
                          }}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-on-surface-variant/60 hover:text-primary hover:bg-surface-container-highest transition-colors cursor-pointer shrink-0"
                          data-tooltip={isCollapsed ? t('duplicateTab.expandGroup') : t('duplicateTab.collapseGroup')}
                          aria-label={isCollapsed ? t('duplicateTab.expandGroup') : t('duplicateTab.collapseGroup')}
                        >
                          <span
                            className={[
                              'material-symbols-outlined text-[18px] transition-transform duration-200 select-none pointer-events-none',
                              isCollapsed ? 'rotate-0 text-on-surface-variant/60' : 'rotate-180 text-primary',
                            ].join(' ')}
                          >
                            expand_more
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Danh sách các ảnh trong nhóm */}
                    {!isCollapsed && (
                      <ul className="divide-y divide-outline-variant/10">
                      {group.items.map((item) => {
                        const idx = displayedItems.indexOf(item);
                        const isChecked = selectedForDelete.has(item.fullPath);
                        return (
                          <li
                            key={item.fullPath}
                            onClick={() => setPreviewIndex(idx)}
                            className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-surface-container-high cursor-pointer transition-colors group"
                          >
                            {/* 1. Checkbox */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                togglePath(item.fullPath);
                              }}
                              aria-label={isChecked ? t('duplicateTab.uncheckAll') : t('duplicateTab.checkAll')}
                              className="flex items-center justify-center p-0.5 rounded text-on-surface-variant/70 hover:text-primary transition-colors cursor-pointer shrink-0"
                            >
                              <span
                                className={[
                                  'material-symbols-outlined text-[20px] leading-none select-none pointer-events-none',
                                  isChecked ? 'text-primary' : 'text-on-surface-variant/35 hover:text-on-surface-variant/60',
                                ].join(' ')}
                              >
                                {isChecked ? 'check_box' : 'check_box_outline_blank'}
                              </span>
                            </button>

                            {/* 2. Icon loại file */}
                            <span
                              className={[
                                'material-symbols-outlined shrink-0 text-[18px]',
                                item.isOriginal ? 'text-cyan-400' : 'text-rose-400',
                              ].join(' ')}
                            >
                              {item.isOriginal ? 'photo_library' : 'content_copy'}
                            </span>

                            {/* 3. Tên tệp & Đường dẫn tương đối */}
                            <div className="min-w-0 flex-1">
                              <p
                                className="truncate font-medium text-on-surface text-xs sm:text-sm"
                                data-tooltip={item.fullPath}
                              >
                                {item.name}
                              </p>
                              <p
                                className="truncate text-[10px] text-on-surface-variant/60 font-mono"
                                data-tooltip={item.fullPath}
                              >
                                {item.relativePath}
                              </p>
                            </div>

                            {/* 4. Kích thước gốc & Dung lượng */}
                            <div className="shrink-0 text-[11px] font-mono text-on-surface-variant/70 text-right">
                              {item.width && item.height ? <span>{item.width}×{item.height} · </span> : null}
                              <span>{formatBytes(item.sizeBytes)}</span>
                            </div>

                            {/* 5. Badges trạng thái */}
                            {item.isOriginal ? (
                              <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold border border-cyan-500/30 bg-cyan-500/10 text-cyan-400">
                                {t('duplicateTab.originalBadge')}
                              </span>
                            ) : (
                              <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold border border-rose-500/30 bg-rose-500/10 text-rose-400">
                                {t('duplicateTab.duplicateBadge')}
                              </span>
                            )}

                            {/* 6. Nút Xem Trước */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewIndex(idx);
                              }}
                              data-tooltip={t('duplicateTab.preview')}
                              aria-label={t('duplicateTab.preview')}
                              className="p-1 rounded text-on-surface-variant/50 hover:text-primary hover:bg-surface-container-highest shrink-0 cursor-pointer transition-colors"
                            >
                              <span className="material-symbols-outlined text-[18px]">visibility</span>
                            </button>

                            {/* 7. Nút Mở Thư Mục Chứa Ảnh */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenItemFolder(item.fullPath);
                              }}
                              data-tooltip={t('duplicateTab.openFolder')}
                              aria-label={t('duplicateTab.openFolder')}
                              className="p-1 rounded text-on-surface-variant/50 hover:text-primary hover:bg-surface-container-highest shrink-0 cursor-pointer transition-colors"
                            >
                              <span className="material-symbols-outlined text-[18px]">folder_open</span>
                            </button>

                            {/* 8. Nút Xóa Khỏi Danh Sách */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveItem(item.fullPath);
                              }}
                              aria-label={t('duplicateTab.removeFromList')}
                              className="p-1 rounded text-on-surface-variant/50 hover:text-error hover:bg-error/10 shrink-0 cursor-pointer transition-colors"
                            >
                              <span className="material-symbols-outlined text-[18px]">delete</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <ul className="min-h-0 flex-1 overflow-y-auto py-1 pr-1 custom-scrollbar">
              {displayedItems.map((item, idx) => (
                <li
                  key={item.fullPath}
                  className="mx-1 flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm hover:bg-surface-container-high transition-colors select-none"
                >
                  {/* Số thứ tự */}
                  <span className="w-6 shrink-0 text-center font-mono text-[11px] text-on-surface-variant/40 select-none">
                    {idx + 1}
                  </span>

                  {/* Icon loại file */}
                  <span className="material-symbols-outlined shrink-0 text-[18px] text-on-surface-variant/40">
                    image
                  </span>

                  {/* Tên tệp & Đường dẫn tương đối */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-on-surface text-xs sm:text-sm">
                      {item.name}
                    </p>
                    <p className="truncate text-[10px] text-on-surface-variant/50 font-mono">
                      {item.relativePath}
                    </p>
                  </div>

                  {/* Kích thước gốc & Dung lượng */}
                  <div className="shrink-0 text-[11px] font-mono text-on-surface-variant/60 text-right">
                    {item.width && item.height ? <span>{item.width}×{item.height} · </span> : null}
                    <span>{formatBytes(item.sizeBytes)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Interactive Preview Modal (Portal z-[9990]) */}
      {previewIndex !== null && displayedItems[previewIndex] && typeof document !== 'undefined'
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={t('duplicateTab.preview')}
              className="fixed inset-0 z-[9990] flex flex-col items-center justify-center bg-black/92 backdrop-blur-md text-white p-4"
              onClick={() => setPreviewIndex(null)}
            >
              <button
                type="button"
                onClick={() => setPreviewIndex(null)}
                data-tooltip={t('duplicateTab.closePreview')}
                aria-label={t('duplicateTab.closePreview')}
                className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px] leading-none">close</span>
              </button>

              {displayedItems.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewIndex((prev) => (prev > 0 ? prev - 1 : displayedItems.length - 1));
                    }}
                    className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white cursor-pointer transition-colors"
                  >
                    <span className="material-symbols-outlined text-[24px]">arrow_back_ios_new</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewIndex((prev) => (prev < displayedItems.length - 1 ? prev + 1 : 0));
                    }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white cursor-pointer transition-colors"
                  >
                    <span className="material-symbols-outlined text-[24px]">arrow_forward_ios</span>
                  </button>
                </>
              )}

              <div
                className="inline-flex max-h-[90vh] max-w-[92vw] flex-col items-center justify-center gap-3"
                onClick={(e) => e.stopPropagation()}
              >
                {previewDataUrl ? (
                  <img
                    src={previewDataUrl}
                    alt=""
                    className="max-h-[80vh] w-auto max-w-full object-contain rounded-xl shadow-2xl ring-1 ring-white/10"
                  />
                ) : (
                  <div className="w-64 h-64 flex items-center justify-center">
                    <span className="material-symbols-outlined text-4xl text-primary animate-spin">
                      progress_activity
                    </span>
                  </div>
                )}
                <div className="flex flex-col items-center gap-1 text-center">
                  <p className="max-w-2xl text-xs font-mono text-white/90 px-2 break-all font-semibold">
                    {displayedItems[previewIndex].name}
                  </p>
                  <p className="max-w-2xl text-[11px] font-mono text-white/60 px-2 break-all">
                    {displayedItems[previewIndex].fullPath}
                  </p>
                  <div className="flex items-center gap-2 text-xs font-mono text-white/70">
                    {displayedItems[previewIndex].width && displayedItems[previewIndex].height ? (
                      <span>
                        {displayedItems[previewIndex].width}×{displayedItems[previewIndex].height}
                      </span>
                    ) : null}
                    <span>•</span>
                    <span>{formatBytes(displayedItems[previewIndex].sizeBytes)}</span>
                    {hasScanned && displayedItems[previewIndex].isDuplicate ? (
                      <>
                        <span>•</span>
                        <span
                          className={
                            displayedItems[previewIndex].isOriginal
                              ? 'text-cyan-400 font-bold'
                              : 'text-rose-400 font-bold'
                          }
                        >
                          {displayedItems[previewIndex].isOriginal
                            ? t('duplicateTab.originalBadge')
                            : t('duplicateTab.duplicateBadge')}{' '}
                          ({t('duplicateTab.group', { id: displayedItems[previewIndex].duplicateGroup })})
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {/* Delete Confirmation Modal (Portal z-[9990]) */}
      {showDeleteConfirm && typeof document !== 'undefined' ? (
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          >
            <div className="max-w-md w-full rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-2xl flex flex-col overflow-hidden animate-in fade-in-0 zoom-in-95 duration-100">
              <div className="p-6 pb-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-full bg-error/10 text-error flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[22px]">delete</span>
                  </div>
                  <h3 className="text-lg font-bold text-on-surface">
                    {t('duplicateTab.confirmDeleteTitle')}
                  </h3>
                </div>
                <p className="text-sm text-on-surface-variant leading-relaxed pl-13">
                  {t('duplicateTab.deleteConfirm', { count: selectedForDelete.size })}
                </p>
              </div>
              <div className="px-6 py-4 flex items-center justify-end gap-2 bg-surface-container-low/40 border-t border-outline-variant/10">
                <button
                  type="button"
                  className="px-4 py-2 text-xs font-bold rounded-xl text-on-surface hover:bg-surface-container-highest transition-colors cursor-pointer"
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  {t('duplicateTab.cancel')}
                </button>
                <button
                  type="button"
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-error text-on-error hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer shadow-sm"
                  onClick={executeDelete}
                >
                  <span className="material-symbols-outlined text-[16px]">delete</span>
                  {t('duplicateTab.delete')}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      ) : null}
    </div>
  );
}
