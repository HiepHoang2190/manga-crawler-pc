import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../../context/I18nContext';
import { EmptyState, ResizeSplitter, SearchableSelect, SourcePicker, useToolsSidebarResize } from '../../../shared';
import { ToolsStudioActionSlot, ToolsStudioCenterSlot } from '../../tools-studio/ToolsStudioActionSlot';
import DuplicateFinderSkeleton from './DuplicateFinderSkeleton';
import DuplicatePreviewModal from './DuplicatePreviewModal';
import {
  formatBytes,
  toggleGroupCollapseInSet,
  getDuplicateGroupKey,
  collectAllGroupIds,
  resolveSmartCategoryBadgeMeta,
  compareDuplicatesFirst,
  removePathsAndDissolveGroups,
  applyDuplicateRangeSelection,
  computeSelectedDuplicateStats,
  getVisibleSelectablePaths,
  findNextPreviewPath,
  resolveDuplicateSelectionPreset,
} from './duplicateUtils';

const SMART_SCAN_STORAGE_KEY = 'duplicate_smart_scan_v1';

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
  const [previewPath, setPreviewPath] = useState(null);
  const [previewDataUrl, setPreviewDataUrl] = useState(null);
  const [previewError, setPreviewError] = useState(false);

  // Search & sort states
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('name_asc');
  const [smartMode, setSmartMode] = useState(() => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return true;
      const saved = window.localStorage.getItem(SMART_SCAN_STORAGE_KEY);
      return saved === null ? true : saved !== 'false';
    } catch {
      return true;
    }
  });
  const [scannedSmartMode, setScannedSmartMode] = useState(false);

  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(SMART_SCAN_STORAGE_KEY, String(smartMode));
      }
    } catch {
      // ignore storage quota / privacy errors
    }
  }, [smartMode]);

  // Collapsed groups state (Set of groupIds that are currently collapsed)
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
  const lastClickedIndexRef = useRef(null);
  const lastClickedSelectedRef = useRef(true);

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
    setScannedSmartMode(false);
    setStats({ total: 0, duplicates: 0, ok: 0 });
    setScanError('');
    setSelectedForDelete(new Set());
    setScanProgress(null);
    setPreviewPath(null);
    setDeleteMessage('');
    setSearchQuery('');
    setCollapsedGroups(new Set());
    lastClickedIndexRef.current = null;
    lastClickedSelectedRef.current = true;
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
      setScannedSmartMode(false);
      setStats({ total: 0, duplicates: 0, ok: 0 });
      setLoadingFiles(false);
      return;
    }

    setLoadingFiles(true);
    setHasScanned(false);
    setScannedSmartMode(false);
    setScannedDuplicates([]);
    setSelectedForDelete(new Set());
    setScanError('');
    setDeleteMessage('');
    setSortBy('name_asc');

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
    setPreviewPath(null);
    try {
      const payload = folders.length > 0
        ? {
            roots: folders,
            recursive: includeSubfolders,
            maxDepth: 8,
            smartMode,
          }
        : {
            files: sourceFiles,
            recursive: false,
            smartMode,
          };
      const r = await api.duplicateScan(payload);
      if (r?.cancelled) {
        setScanError(t('duplicateTab.cancelled'));
        return;
      }
      if (!r?.ok) {
        setScannedDuplicates([]);
        setHasScanned(false);
        setScannedSmartMode(false);
        setSelectedForDelete(new Set());
        setScanError(r?.error || t('duplicateTab.scanFailed'));
        return;
      }

      const effectiveSmartMode = Boolean(r.smartMode ?? smartMode);
      const allScanned = Array.isArray(r.images) ? r.images : [];
      const duplicateImages = effectiveSmartMode
        ? allScanned.filter((img) => img.isDuplicate || img.isSuggestedForTrash)
        : allScanned.filter((img) => img.isDuplicate);

      setScannedDuplicates(duplicateImages);
      setHasScanned(true);
      setScannedSmartMode(effectiveSmartMode);
      setSortBy('duplicates_first');
      // Mặc định thu gọn (collapse) tất cả nhóm trùng sau khi quét
      setCollapsedGroups(collectAllGroupIds(duplicateImages));

      setStats(
        r.stats || {
          total: allScanned.length,
          duplicates: duplicateImages.filter((img) => !img.isOriginal).length,
          ok: allScanned.filter((img) => !img.isDuplicate).length,
        }
      );

      // Mặc định chọn tất cả ảnh trùng (classic) hoặc chỉ ảnh đề xuất xóa/bản sao (smartMode)
      const autoSelected = new Set();
      if (effectiveSmartMode) {
        for (const img of duplicateImages) {
          if (img.isSuggestedForTrash || !img.isOriginal) {
            autoSelected.add(img.fullPath);
          }
        }
      } else {
        for (const img of duplicateImages) {
          autoSelected.add(img.fullPath);
        }
      }
      setSelectedForDelete(autoSelected);
    } catch (e) {
      setScannedDuplicates([]);
      setHasScanned(false);
      setScannedSmartMode(false);
      setSelectedForDelete(new Set());
      setScanError(String(e?.message || e));
    } finally {
      setScanning(false);
      setScanProgress(null);
    }
  }, [api, hasSource, folders, sourceFiles, includeSubfolders, smartMode, t]);

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

  // Remove single image from list (does not delete file on disk)
  const handleRemoveItem = useCallback((pathToRemove) => {
    if (hasScanned) {
      setScannedDuplicates((prev) => removePathsAndDissolveGroups(prev, [pathToRemove]));
      setStats((prev) => ({
        ...prev,
        total: Math.max(0, (prev.total || 0) - 1),
      }));
    } else {
      setImportedFiles((prev) => removePathsAndDissolveGroups(prev, [pathToRemove]));
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

  const allSourceItems = useMemo(
    () => (hasScanned ? scannedDuplicates : importedFiles),
    [hasScanned, scannedDuplicates, importedFiles]
  );

  const selectedStats = useMemo(
    () => computeSelectedDuplicateStats(allSourceItems, selectedForDelete),
    [allSourceItems, selectedForDelete]
  );
  const selectedCount = selectedStats.selectedCount;
  const importedTotalBytes = useMemo(
    () => importedFiles.reduce((sum, f) => sum + (Number(f?.sizeBytes) || 0), 0),
    [importedFiles]
  );
  const copiesCount = useMemo(
    () => scannedDuplicates.filter((img) => img.isDuplicate && !img.isOriginal).length,
    [scannedDuplicates]
  );
  const smartTrashCount = useMemo(
    () => scannedDuplicates.filter((img) => img.isSuggestedForTrash && !img.isDuplicate).length,
    [scannedDuplicates]
  );
  const totalGroupCount = useMemo(
    () => collectAllGroupIds(scannedDuplicates).size,
    [scannedDuplicates]
  );
  const totalReclaimableBytes = useMemo(
    () =>
      scannedDuplicates.reduce(
        (sum, img) => sum + (img.isSuggestedForTrash || !img.isOriginal ? Number(img?.sizeBytes) || 0 : 0),
        0
      ),
    [scannedDuplicates]
  );

  // Deletion logic (scoped strictly to active items in list)
  const handleDelete = useCallback(() => {
    if (!api?.duplicateDeleteFiles || selectedCount === 0 || !hasSource) return;
    setShowDeleteConfirm(true);
  }, [api, selectedCount, hasSource]);

  const executeDelete = useCallback(async () => {
    setShowDeleteConfirm(false);
    if (!api?.duplicateDeleteFiles || selectedCount === 0 || !hasSource) return;
    const activeSet = new Set(allSourceItems.map((img) => img.fullPath));
    const paths = [...selectedForDelete].filter((p) => activeSet.has(p));
    if (paths.length === 0) return;
    const allowedRoots = folders.length > 0 ? folders : sourceFiles;
    setDeleteBusy(true);
    setDeleteMessage('');
    try {
      const r = await api.duplicateDeleteFiles(allowedRoots, paths);
      if (!r?.ok) {
        setDeleteMessage(r?.error || t('duplicateTab.deleteFailed'));
        return;
      }

      const deletedList = r.deleted || [];
      if (deletedList.length > 0) {
        const deletedSet = new Set(deletedList);
        setScannedDuplicates((prev) => removePathsAndDissolveGroups(prev, deletedList));
        setImportedFiles((prev) => removePathsAndDissolveGroups(prev, deletedList));
        setStats((prev) => ({
          ...prev,
          total: Math.max(0, (prev.total || 0) - deletedList.length),
        }));
        setSelectedForDelete((prev) => {
          const next = new Set(prev);
          for (const p of deletedSet) next.delete(p);
          return next;
        });

        if (r.errors && r.errors.length > 0) {
          setDeleteMessage(t('duplicateTab.deletePartial', { deleted: deletedList.length, errors: r.errors.length }));
        } else {
          setDeleteMessage(t('duplicateTab.deleteDone', { count: deletedList.length }));
        }
      } else if (r.errors && r.errors.length > 0) {
        setDeleteMessage(r.errors[0]?.error || t('duplicateTab.deleteFailed'));
      }
    } catch (e) {
      setDeleteMessage(String(e?.message || e));
    } finally {
      setDeleteBusy(false);
    }
  }, [api, selectedCount, hasSource, allSourceItems, selectedForDelete, folders, sourceFiles, t]);

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

    // 2. Sort
    list.sort((a, b) => {
      if (hasScanned && sortBy === 'duplicates_first') {
        return compareDuplicatesFirst(a, b);
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
  }, [hasScanned, scannedDuplicates, importedFiles, searchQuery, sortBy]);

  const allDisplayedChecked = useMemo(() => {
    if (displayedItems.length === 0) return false;
    return displayedItems.every((item) => selectedForDelete.has(item.fullPath));
  }, [displayedItems, selectedForDelete]);

  const visibleSelectedInDisplayedCount = useMemo(
    () => computeSelectedDuplicateStats(displayedItems, selectedForDelete).selectedCount,
    [displayedItems, selectedForDelete]
  );

  const handleToggleSelectAll = useCallback(() => {
    lastClickedIndexRef.current = null;
    lastClickedSelectedRef.current = true;
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

  // Quick select duplicate copies & smart suggested trash across displayed items
  const selectExceptFirstPerGroup = useCallback(() => {
    lastClickedIndexRef.current = null;
    lastClickedSelectedRef.current = true;
    setSelectedForDelete((prev) => {
      const next = new Set(prev);
      for (const item of displayedItems) {
        if (item.isSuggestedForTrash || (item.isDuplicate && !item.isOriginal)) {
          next.add(item.fullPath);
        } else {
          next.delete(item.fullPath);
        }
      }
      return next;
    });
  }, [displayedItems]);

  const handleClearDisplayedSelection = useCallback(() => {
    lastClickedIndexRef.current = null;
    lastClickedSelectedRef.current = true;
    setSelectedForDelete((prev) => {
      const next = new Set(prev);
      for (const item of displayedItems) next.delete(item.fullPath);
      return next;
    });
  }, [displayedItems]);

  const selectionPreset = useMemo(
    () => resolveDuplicateSelectionPreset(displayedItems, selectedForDelete),
    [displayedItems, selectedForDelete]
  );

  const displayedHasCopies = useMemo(
    () =>
      displayedItems.some((item) => item.isSuggestedForTrash || !item.isOriginal) &&
      displayedItems.some((item) => !item.isSuggestedForTrash && item.isOriginal),
    [displayedItems]
  );

  const selectionPresetOptions = useMemo(() => {
    const total = displayedItems.length;
    const copiesPresetLabel =
      scannedSmartMode && smartTrashCount > 0
        ? t('duplicateTab.selectSuggestedTrash')
        : t('duplicateTab.keepOneOriginal');
    const copiesPresetIcon =
      scannedSmartMode && smartTrashCount > 0 ? 'auto_delete' : 'filter_1';

    const baseOptions = [
      {
        value: 'all',
        label:
          selectionPreset === 'all'
            ? `${t('duplicateTab.checkAll')} (${visibleSelectedInDisplayedCount}/${total})`
            : t('duplicateTab.checkAll'),
        materialIcon: 'check_box',
      },
      ...(displayedHasCopies
        ? [
            {
              value: 'copies',
              label:
                selectionPreset === 'copies'
                  ? `${copiesPresetLabel} (${visibleSelectedInDisplayedCount}/${total})`
                  : copiesPresetLabel,
              materialIcon: copiesPresetIcon,
            },
          ]
        : []),
      {
        value: 'none',
        label:
          selectionPreset === 'none'
            ? `${t('duplicateTab.uncheckAll')} (0/${total})`
            : t('duplicateTab.uncheckAll'),
        materialIcon: 'check_box_outline_blank',
      },
    ];

    if (selectionPreset === 'custom') {
      return [
        {
          value: 'custom',
          label: t('duplicateTab.selectionCustom', {
            selected: visibleSelectedInDisplayedCount,
            total,
          }),
          materialIcon: 'indeterminate_check_box',
        },
        ...baseOptions,
      ];
    }
    return baseOptions;
  }, [selectionPreset, displayedItems.length, visibleSelectedInDisplayedCount, displayedHasCopies, scannedSmartMode, smartTrashCount, t]);

  const handleSelectionPresetChange = useCallback(
    (mode) => {
      if (mode === 'all') {
        if (!allDisplayedChecked) handleToggleSelectAll();
      } else if (mode === 'copies') {
        selectExceptFirstPerGroup();
      } else if (mode === 'none') {
        handleClearDisplayedSelection();
      }
    },
    [allDisplayedChecked, handleToggleSelectAll, selectExceptFirstPerGroup, handleClearDisplayedSelection]
  );

  // Gom nhóm ảnh trùng theo từng cụm/nhóm trùng (Duplicate Group) hoặc nhóm Smart category
  const groupedDuplicates = useMemo(() => {
    if (!hasScanned) return [];
    const map = new Map();
    for (const item of displayedItems) {
      const gId = getDuplicateGroupKey(item);
      if (!map.has(gId)) {
        map.set(gId, []);
      }
      map.get(gId).push(item);
    }
    return Array.from(map.entries()).map(([groupId, items]) => {
      const isSmartTrashGroup = String(groupId).startsWith('smart:');
      const smartBadgeMeta = isSmartTrashGroup ? resolveSmartCategoryBadgeMeta(items[0], t) : null;
      const originals = isSmartTrashGroup
        ? []
        : items.filter((img) => img.isOriginal && !img.isSuggestedForTrash);
      const copies = isSmartTrashGroup
        ? items
        : items.filter((img) => img.isSuggestedForTrash || !img.isOriginal);
      const totalSize = items.reduce((sum, img) => sum + (img.sizeBytes || 0), 0);
      const reclaimableSize = copies.reduce((sum, img) => sum + (img.sizeBytes || 0), 0);
      const allCopiesChecked =
        copies.length > 0 && copies.every((img) => selectedForDelete.has(img.fullPath));
      const someCopiesChecked = copies.some((img) => selectedForDelete.has(img.fullPath));
      const allItemsChecked =
        items.length > 0 && items.every((img) => selectedForDelete.has(img.fullPath));
      const someItemsChecked = items.some((img) => selectedForDelete.has(img.fullPath));
      const allOriginalsChecked =
        !isSmartTrashGroup &&
        originals.length > 0 &&
        originals.every((img) => selectedForDelete.has(img.fullPath));
      const onlyCopiesSelected =
        !isSmartTrashGroup &&
        copies.length > 0 &&
        allCopiesChecked &&
        originals.every((img) => !selectedForDelete.has(img.fullPath));

      return {
        groupId,
        isSmartTrashGroup,
        smartBadgeMeta,
        items,
        originals,
        copies,
        totalSize,
        reclaimableSize,
        allCopiesChecked,
        someCopiesChecked,
        allItemsChecked,
        someItemsChecked,
        allOriginalsChecked,
        onlyCopiesSelected,
      };
    });
  }, [hasScanned, displayedItems, selectedForDelete, t]);

  // Visual render order of visible rows for Shift+click range selection
  const visibleSelectablePaths = useMemo(
    () => getVisibleSelectablePaths(groupedDuplicates, collapsedGroups),
    [groupedDuplicates, collapsedGroups]
  );
  const visibleSelectablePathsKey = useMemo(
    () => visibleSelectablePaths.join('\n'),
    [visibleSelectablePaths]
  );

  useEffect(() => {
    lastClickedIndexRef.current = null;
    lastClickedSelectedRef.current = true;
  }, [visibleSelectablePathsKey]);

  const handleSelectRow = useCallback(
    (clickedPath, shiftKey = false) => {
      const clickedIndex = visibleSelectablePaths.indexOf(clickedPath);
      if (clickedIndex < 0) return;
      if (shiftKey && typeof window !== 'undefined') {
        window.getSelection?.()?.removeAllRanges?.();
      }
      const anchorIndex = lastClickedIndexRef.current;
      const anchorTargetSelected = lastClickedSelectedRef.current;
      setSelectedForDelete((prev) => {
        const res = applyDuplicateRangeSelection({
          prevSelected: prev,
          visiblePaths: visibleSelectablePaths,
          clickedIndex,
          anchorIndex,
          anchorTargetSelected,
          shiftKey,
        });
        lastClickedIndexRef.current = res.nextAnchorIndex;
        lastClickedSelectedRef.current = res.nextAnchorTargetSelected;
        return res.nextSelected;
      });
    },
    [visibleSelectablePaths]
  );

  const toggleGroupSelection = useCallback((group) => {
    lastClickedIndexRef.current = null;
    lastClickedSelectedRef.current = true;
    setSelectedForDelete((prev) => {
      const next = new Set(prev);
      if (group.allItemsChecked) {
        for (const item of group.items) {
          next.delete(item.fullPath);
        }
      } else {
        for (const item of group.items) {
          next.add(item.fullPath);
        }
      }
      return next;
    });
  }, []);

  const selectOnlyGroupCopies = useCallback((group) => {
    if (!group?.copies?.length) return;
    lastClickedIndexRef.current = null;
    lastClickedSelectedRef.current = true;
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
    lastClickedIndexRef.current = null;
    lastClickedSelectedRef.current = true;
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

  // Preview modal image loading & keyboard navigation (keeps viewed item stable when toggling in 'selected' filter)
  const activeItem = useMemo(() => {
    if (!previewPath) return null;
    return (
      displayedItems.find((item) => item.fullPath === previewPath) ||
      allSourceItems.find((item) => item.fullPath === previewPath) ||
      null
    );
  }, [previewPath, displayedItems, allSourceItems]);

  useEffect(() => {
    if (previewPath !== null && !activeItem) {
      setPreviewPath(null);
    }
  }, [previewPath, activeItem]);

  useEffect(() => {
    if (!activeItem || !api) {
      setPreviewDataUrl(null);
      setPreviewError(false);
      return;
    }
    let active = true;
    setPreviewDataUrl(null);
    setPreviewError(false);
    const readPreview = api.readImagePreview || api.duplicateReadPreview;
    if (readPreview) {
      Promise.resolve(readPreview(activeItem.fullPath))
        .then((res) => {
          if (!active) return;
          if (res?.ok && res?.dataUrl) {
            setPreviewDataUrl(res.dataUrl);
          } else {
            setPreviewError(true);
          }
        })
        .catch(() => {
          if (!active) return;
          setPreviewError(true);
        });
    } else {
      setPreviewError(true);
    }
    return () => {
      active = false;
    };
  }, [activeItem, api]);

  useEffect(() => {
    if (!activeItem) return undefined;
    const onKey = (e) => {
      if (showDeleteConfirm) return;
      if (e.key === 'Escape') {
        setPreviewPath(null);
        return;
      }
      if (e.key === 'ArrowLeft') {
        setPreviewPath((prev) => findNextPreviewPath(displayedItems, prev, -1));
        return;
      }
      if (e.key === 'ArrowRight') {
        setPreviewPath((prev) => findNextPreviewPath(displayedItems, prev, 1));
        return;
      }
      const target = e.target;
      const tag = target?.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        tag === 'BUTTON' ||
        target?.getAttribute?.('role') === 'button' ||
        target?.isContentEditable
      ) {
        return;
      }
      if (e.key === ' ' && hasScanned && activeItem?.fullPath && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        togglePath(activeItem.fullPath);
      }
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [activeItem, displayedItems, hasScanned, showDeleteConfirm, togglePath]);

  const hasItemsToDisplay = hasScanned ? scannedDuplicates.length > 0 : importedFiles.length > 0;

  return (
    <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden bg-surface">
      <ToolsStudioCenterSlot active={isActive}>
        <div className="flex items-center gap-2">
          {scanning ? (
            <button
              type="button"
              onClick={handleCancelScan}
              disabled={!api?.duplicateCancelScan}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-error/30 bg-error/15 px-3.5 text-xs font-semibold text-error transition-colors hover:bg-error/25 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer shrink-0 whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-[16px] leading-none">stop_circle</span>
              <span>{t('duplicateTab.stop')}</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={!hasElectron || !hasSource || deleteBusy || loadingFiles || (!hasScanned && importedFiles.length === 0)}
              onClick={handleScan}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-semibold text-on-primary shadow-2xs transition-all hover:opacity-95 active:scale-95 disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer shrink-0 whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-[16px] leading-none">travel_explore</span>
              <span>{hasScanned ? t('duplicateTab.rescan') : t('duplicateTab.start')}</span>
            </button>
          )}
        </div>
      </ToolsStudioCenterSlot>
      <ToolsStudioActionSlot active={isActive}></ToolsStudioActionSlot>

      {/* ─── left sidebar: controls & scan action ─── */}
      {showSidebar && (
        <div
          style={{ width: `${sidebarWidth}px` }}
          className="relative shrink-0 flex flex-col h-full border-r border-outline-variant/20 overflow-visible select-none"
        >
          <div className="flex-1 flex flex-col overflow-y-auto custom-scrollbar px-4 py-5 space-y-5 mr-1.5">
            {!hasElectron && (
              <p className="text-xs text-amber-600 dark:text-amber-400">{t('duplicateTab.desktopOnly')}</p>
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

            {/* (1b) Tuỳ chọn Quét thông minh (Default-on Smart Duplicate & Ad Detector) */}
            <label
              data-testid="duplicate-smart-mode-toggle"
              className={`flex items-start gap-2.5 rounded-xl border p-3 transition-colors select-none ${
                scanning || deleteBusy || !hasElectron
                  ? 'opacity-50 cursor-not-allowed border-outline-variant/20 bg-surface-container-low'
                  : smartMode
                    ? 'cursor-pointer border-primary/40 bg-primary/10'
                    : 'cursor-pointer border-outline-variant/20 bg-surface-container-high/45 hover:border-outline-variant/45'
              }`}
            >
              <input
                type="checkbox"
                checked={smartMode}
                disabled={scanning || deleteBusy || !hasElectron}
                onChange={(e) => setSmartMode(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded accent-primary cursor-pointer disabled:cursor-not-allowed shrink-0"
              />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-on-surface">
                  <span className="material-symbols-outlined text-[15px] text-primary leading-none">
                    auto_awesome
                  </span>
                  <span>{t('duplicateTab.smartMode.label')}</span>
                </div>
                <p className="text-[11px] leading-snug text-on-surface-variant/85">
                  {t('duplicateTab.smartMode.description')}
                </p>
              </div>
            </label>

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

            {/* (2) Thẻ thống kê tổng quan (đồng bộ Khám phá / Thư viện) */}
            <div className="mt-auto pt-2">
              <div
                data-testid="duplicate-overview-card"
                className="rounded-xl border border-primary/15 bg-primary/5 p-3"
              >
                <div className="text-[10px] font-bold text-primary mb-2 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[13px]">bar_chart</span>
                  <span>{t('duplicateTab.overview.title')}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                  <span className="text-on-surface-variant">{t('duplicateTab.overview.totalImages')}</span>
                  <span className="font-bold text-on-surface text-right tabular-nums">
                    {hasScanned ? stats.total : importedFiles.length}
                  </span>
                  <span className="text-on-surface-variant">{t('duplicateTab.overview.duplicateGroups')}</span>
                  <span className="font-bold text-primary text-right tabular-nums">
                    {hasScanned ? totalGroupCount : '—'}
                  </span>
                  <span className="text-on-surface-variant">{t('duplicateTab.overview.duplicateCopies')}</span>
                  <span className="font-bold text-rose-600 dark:text-rose-400 text-right tabular-nums">
                    {hasScanned ? copiesCount : '—'}
                  </span>
                  <span className="text-on-surface-variant">{t('duplicateTab.overview.reclaimable')}</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 text-right tabular-nums">
                    {hasScanned ? formatBytes(totalReclaimableBytes) : '—'}
                  </span>
                  {hasScanned && scannedSmartMode && (
                    <>
                      <span className="text-on-surface-variant">{t('duplicateTab.overview.smartTrash')}</span>
                      <span className="font-bold text-amber-600 dark:text-amber-400 text-right tabular-nums">
                        {smartTrashCount}
                      </span>
                    </>
                  )}
                </div>
                <div className="mt-2.5 pt-2 border-t border-primary/10 space-y-1.5 text-[10px] text-on-surface-variant/75 leading-relaxed">
                  <div className="flex items-start gap-1.5">
                    <span className="w-4 h-4 flex items-center justify-center shrink-0 text-primary/70">
                      <span className="material-symbols-outlined text-[13px] leading-none">touch_app</span>
                    </span>
                    <span className="flex-1 min-w-0 leading-snug pt-0.5">{t('duplicateTab.overview.tip')}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <ResizeSplitter
            variant="overlay"
            side="right"
            onPointerDown={handleSplitPointerDown}
            ariaLabel={t('sidebar.resizeSplit')}
          />
        </div>
      )}

      {/* ─── right panel: edge-to-edge workspace, selection bar & slim footer ─── */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface">
        {/* Thanh công cụ Inline đồng bộ 1 hàng h-8 */}
        {hasSource && hasItemsToDisplay && !scanning && !loadingFiles && (
          <div className="shrink-0 flex flex-nowrap items-center justify-between gap-2 border-b border-outline-variant/20 px-4 sm:px-6 py-2.5 bg-surface-container-low/50 select-none overflow-x-auto no-scrollbar">
            {/* Left: Selection Preset Select & Contextual Delete CTA */}
            <div className="flex items-center gap-2 shrink-0">
              {!hasScanned ? (
                <div className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-surface-container-highest/70 border border-outline-variant/20 px-3 text-xs text-on-surface whitespace-nowrap">
                  <span className="material-symbols-outlined text-[16px] leading-none text-primary">photo_library</span>
                  <span className="font-semibold text-on-surface">
                    {t('duplicateTab.readyToScan', { count: displayedItems.length })}
                  </span>
                </div>
              ) : (
                <>
                  <SearchableSelect
                    size="sm"
                    value={selectionPreset}
                    onChange={handleSelectionPresetChange}
                    options={selectionPresetOptions}
                    placeholder=""
                    showPlaceholderOption={false}
                    disabled={displayedItems.length === 0}
                    ariaLabel={t('duplicateTab.selectionModeAria')}
                    className="w-56 min-w-[13rem] shrink-0"
                  />

                  {selectedCount > 0 && (
                    <button
                      type="button"
                      data-testid="duplicate-delete-selected-btn"
                      disabled={!hasElectron || deleteBusy}
                      onClick={handleDelete}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-error/30 bg-error/15 px-3 text-xs font-semibold text-error hover:bg-error/25 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed shrink-0 transition-colors whitespace-nowrap"
                    >
                      <span className="material-symbols-outlined text-[16px] leading-none">delete</span>
                      <span className="tabular-nums">
                        {deleteBusy
                          ? t('duplicateTab.deleting')
                          : t('duplicateTab.deleteSelectedWithSize', {
                              count: selectedCount,
                              size: formatBytes(selectedStats.selectedBytes),
                            })}
                      </span>
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Right: Flexible Search + Sort h-8 + Collapse toggle (same row) */}
            {hasScanned && (
              <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
                <div className="flex h-8 items-center gap-1.5 bg-surface-container-highest rounded-lg px-2.5 border border-outline-variant/25 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/30 transition-colors flex-1 min-w-[7rem] max-w-[15rem]">
                  <span className="material-symbols-outlined text-outline shrink-0 text-[16px] leading-none">
                    search
                  </span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('duplicateTab.searchPlaceholder')}
                    className="min-h-0 h-7 bg-transparent border-none text-xs leading-normal focus:ring-0 p-0 flex-1 min-w-0 text-on-surface outline-none placeholder:text-outline"
                  />
                  {searchQuery ? (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      data-tooltip={t('duplicateTab.clearSearch')}
                      aria-label={t('duplicateTab.clearSearch')}
                      className="cursor-pointer shrink-0 rounded-md p-0.5 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
                    >
                      <span className="material-symbols-outlined text-[14px] leading-none">close</span>
                    </button>
                  ) : null}
                </div>

                <SearchableSelect
                  size="sm"
                  value={sortBy}
                  onChange={setSortBy}
                  options={[
                    { value: 'duplicates_first', label: t('duplicateTab.sortDuplicatesFirst'), materialIcon: 'content_copy' },
                    { value: 'name_asc', label: t('duplicateTab.sortNameAsc'), materialIcon: 'sort_by_alpha' },
                    { value: 'name_desc', label: t('duplicateTab.sortNameDesc'), materialIcon: 'sort_by_alpha' },
                    { value: 'size_desc', label: t('duplicateTab.sortSizeDesc'), materialIcon: 'format_size' },
                    { value: 'size_asc', label: t('duplicateTab.sortSizeAsc'), materialIcon: 'format_size' },
                  ]}
                  placeholder=""
                  showPlaceholderOption={false}
                  ariaLabel={t('duplicateTab.sortDuplicatesFirst')}
                  className="w-48 min-w-[11.5rem] shrink-0"
                />

                {groupedDuplicates.length > 1 && (
                  <button
                    type="button"
                    onClick={toggleAllGroupsCollapse}
                    data-tooltip={allGroupsCollapsed ? t('duplicateTab.expandAll') : t('duplicateTab.collapseAll')}
                    aria-label={allGroupsCollapsed ? t('duplicateTab.expandAll') : t('duplicateTab.collapseAll')}
                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-outline-variant/20 bg-surface-container-highest text-on-surface-variant hover:text-primary hover:border-primary/40 cursor-pointer transition-colors shrink-0"
                  >
                    <span className="material-symbols-outlined text-[18px] leading-none">
                      {allGroupsCollapsed ? 'unfold_more' : 'unfold_less'}
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Vùng danh sách nội dung */}
        <div className="custom-scrollbar flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 bg-surface flex flex-col">
          {!hasSource ? (
            <EmptyState
              icon="travel_explore"
              title={t('duplicateTab.selectSource')}
              description={t('duplicateTab.noSourceSelected')}
            />
          ) : loadingFiles ? (
            <DuplicateFinderSkeleton
              mode="files"
              statusText={t('duplicateTab.loadingFiles')}
            />
          ) : scanning ? (
            <DuplicateFinderSkeleton
              mode="groups"
              statusText={t('duplicateTab.scanning')}
              progress={scanProgress}
            />
          ) : !hasScanned && importedFiles.length === 0 ? (
            <EmptyState
              icon="folder_off"
              title={t('duplicateTab.noResults')}
            />
          ) : hasScanned && scannedDuplicates.length === 0 ? (
            <EmptyState
              icon="check_circle"
              title={scannedSmartMode ? t('duplicateTab.noDuplicatesFoundSmart') : t('duplicateTab.noDuplicatesFound')}
              description={t('duplicateTab.allImagesUnique')}
            />
          ) : displayedItems.length === 0 ? (
            <EmptyState
              icon="search_off"
              title={t('duplicateTab.noMatchingFilter')}
              action={
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                  }}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-outline-variant/25 bg-surface-container-highest px-3.5 text-xs font-semibold text-on-surface hover:border-primary/40 hover:text-primary transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[15px] leading-none">restart_alt</span>
                  <span>{t('duplicateTab.resetFilters')}</span>
                </button>
              }
            />
          ) : hasScanned ? (
            <div className="space-y-3">
              {groupedDuplicates.map((group) => {
                const representativeItem = group.originals[0] || group.items[0];
                const isCollapsed = collapsedGroups.has(group.groupId);
                return (
                  <div
                    key={`group-${group.groupId}`}
                    className={`rounded-xl border shadow-xs transition-colors overflow-hidden ${
                      group.allOriginalsChecked
                        ? 'border-amber-500/45 bg-amber-500/[0.04]'
                        : 'border-outline-variant/20 bg-surface-container-low/40'
                    }`}
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
                        'flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 px-3.5 py-2.5 bg-surface-container-high/60 text-xs cursor-pointer select-none transition-colors hover:bg-surface-container-high',
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
                            group.isSmartTrashGroup
                              ? (group.allItemsChecked ? t('duplicateTab.uncheckAll') : t('duplicateTab.selectEntireGroup'))
                              : (group.allItemsChecked || group.allCopiesChecked
                                  ? t('duplicateTab.uncheckAll')
                                  : t('duplicateTab.selectAllExceptFirst'))
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
                            onPreviewClick={() => setPreviewPath(representativeItem.fullPath)}
                          />
                        )}

                        {/* Thông tin nhóm */}
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {group.isSmartTrashGroup && group.smartBadgeMeta ? (
                              <span
                                className={`shrink-0 inline-flex items-center gap-1 font-bold text-xs px-2 py-0.5 rounded-md border ${group.smartBadgeMeta.badgeClass}`}
                              >
                                <span className="material-symbols-outlined text-[13px] leading-none">
                                  {group.smartBadgeMeta.icon}
                                </span>
                                <span>{group.smartBadgeMeta.groupLabel}</span>
                              </span>
                            ) : (
                              <span className="shrink-0 font-bold text-xs text-primary px-2 py-0.5 rounded-md bg-primary/10 border border-primary/25">
                                {t('duplicateTab.group', { id: group.groupId })}
                              </span>
                            )}

                            <span className="truncate text-on-surface-variant font-medium">
                              {t('duplicateTab.groupFilesCount', { count: group.items.length })}
                              {!group.isSmartTrashGroup && group.copies.length > 0 && (
                                <span className="text-rose-500 dark:text-rose-400 font-semibold ml-1">
                                  ({group.copies.length} {t('duplicateTab.filterCopiesOnly') || 'bản sao'})
                                </span>
                              )}
                            </span>

                            {group.reclaimableSize > 0 && (
                              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 shrink-0 tabular-nums">
                                <span className="material-symbols-outlined text-[13px]">delete_sweep</span>
                                <span>{formatBytes(group.reclaimableSize)}</span>
                              </span>
                            )}

                            {!group.isSmartTrashGroup && group.allOriginalsChecked && (
                              <span
                                data-testid="duplicate-group-all-selected-warning"
                                className="inline-flex items-center gap-1 rounded-md border border-amber-500/35 bg-amber-500/12 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300 shrink-0"
                              >
                                <span className="material-symbols-outlined text-[13px] leading-none">warning</span>
                                <span>{t('duplicateTab.allOriginalsSelectedWarning')}</span>
                              </span>
                            )}
                          </div>

                          {/* Thông số ảnh đại diện */}
                          {representativeItem && (
                            <div className="flex items-center gap-2 text-[11px] text-on-surface-variant/75 min-w-0">
                              <span
                                className="truncate font-medium text-on-surface text-xs"
                                data-tooltip={representativeItem.fullPath}
                              >
                                {representativeItem.name}
                              </span>
                              {representativeItem.width && representativeItem.height ? (
                                <span className="shrink-0 font-mono text-[10px] text-on-surface-variant/65 tabular-nums">
                                  {representativeItem.width}×{representativeItem.height}
                                </span>
                              ) : null}
                              <span className="shrink-0 font-mono text-[10px] text-on-surface-variant/65 tabular-nums">
                                {formatBytes(representativeItem.sizeBytes)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Các nút thao tác nhanh theo nhóm */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {group.isSmartTrashGroup ? (
                          <button
                            type="button"
                            aria-pressed={group.allItemsChecked}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleGroupSelection(group);
                            }}
                            className={`h-7 px-2.5 rounded-lg text-[11px] border transition-colors cursor-pointer whitespace-nowrap ${
                              group.allItemsChecked
                                ? 'border-primary/40 bg-primary/15 text-primary font-semibold'
                                : 'border-outline-variant/25 bg-surface-container-highest text-on-surface font-medium hover:border-primary/40 hover:text-primary'
                            }`}
                          >
                            {t('duplicateTab.selectEntireGroup')}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={group.copies.length === 0}
                            aria-pressed={group.onlyCopiesSelected}
                            onClick={(e) => {
                              e.stopPropagation();
                              selectOnlyGroupCopies(group);
                            }}
                            className={`h-7 px-2.5 rounded-lg text-[11px] border transition-colors cursor-pointer whitespace-nowrap disabled:opacity-45 disabled:cursor-not-allowed ${
                              group.onlyCopiesSelected
                                ? 'border-primary/40 bg-primary/15 text-primary font-semibold'
                                : 'border-outline-variant/25 bg-surface-container-highest text-on-surface font-medium hover:border-primary/40 hover:text-primary'
                            }`}
                            data-tooltip={t('duplicateTab.selectAllExceptFirst')}
                          >
                            {t('duplicateTab.selectGroupCopies')}
                          </button>
                        )}
                        <button
                          type="button"
                          aria-pressed={!group.someItemsChecked}
                          onClick={(e) => {
                            e.stopPropagation();
                            uncheckGroup(group);
                          }}
                          className={`h-7 px-2.5 rounded-lg text-[11px] border transition-colors cursor-pointer whitespace-nowrap ${
                            !group.someItemsChecked
                              ? 'border-primary/40 bg-primary/15 text-primary font-semibold'
                              : 'border-outline-variant/25 bg-surface-container-highest text-on-surface font-medium hover:border-primary/40 hover:text-primary'
                          }`}
                          data-tooltip={t('duplicateTab.uncheckAll')}
                        >
                          {t('duplicateTab.unselectGroup')}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleGroupCollapse(group.groupId);
                          }}
                          className="w-7 h-7 flex items-center justify-center rounded-lg border border-outline-variant/25 bg-surface-container-highest text-on-surface-variant hover:text-primary hover:border-primary/40 transition-colors cursor-pointer shrink-0"
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
                          const isChecked = selectedForDelete.has(item.fullPath);
                          const rowSmartMeta = resolveSmartCategoryBadgeMeta(item, t);
                          return (
                            <li
                              key={item.fullPath}
                              onClick={() => setPreviewPath(item.fullPath)}
                              className={`flex items-center gap-2.5 px-3.5 py-2 text-sm hover:bg-surface-container-high cursor-pointer transition-colors group select-none ${
                                isChecked ? 'bg-primary/[0.04]' : ''
                              }`}
                            >
                              {/* 1. Checkbox (hỗ trợ Shift+click chọn nhiều dòng) */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectRow(item.fullPath, Boolean(e.shiftKey));
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
                                  rowSmartMeta
                                    ? rowSmartMeta.iconClass
                                    : item.isOriginal
                                      ? 'text-cyan-500 dark:text-cyan-400'
                                      : 'text-rose-500 dark:text-rose-400',
                                ].join(' ')}
                              >
                                {rowSmartMeta ? rowSmartMeta.icon : item.isOriginal ? 'photo_library' : 'content_copy'}
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
                                  className="truncate text-[10px] text-on-surface-variant/65 font-mono"
                                  data-tooltip={item.fullPath}
                                >
                                  {item.relativePath}
                                </p>
                              </div>

                              {/* 4. Kích thước gốc & Dung lượng */}
                              <div className="shrink-0 text-[11px] font-mono text-on-surface-variant/70 text-right tabular-nums">
                                {item.width && item.height ? <span>{item.width}×{item.height} · </span> : null}
                                <span>{formatBytes(item.sizeBytes)}</span>
                              </div>

                              {/* 5. Badges trạng thái */}
                              {rowSmartMeta ? (
                                <span
                                  data-tooltip={rowSmartMeta.tooltip}
                                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold border ${rowSmartMeta.badgeClass}`}
                                >
                                  {rowSmartMeta.label}
                                </span>
                              ) : (
                                <>
                                  {item.matchType === 'fuzzy' && (
                                    <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold border border-primary/30 bg-primary/10 text-primary">
                                      {t('duplicateTab.badgeFuzzy')}
                                    </span>
                                  )}
                                  {item.isOriginal ? (
                                    <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold border border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                                      {t('duplicateTab.originalBadge')}
                                    </span>
                                  ) : (
                                    <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold border border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400">
                                      {t('duplicateTab.duplicateBadge')}
                                    </span>
                                  )}
                                </>
                              )}

                              {/* 6. Cụm nút hành động đồng chuẩn h-8 w-8 rounded-lg border */}
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPreviewPath(item.fullPath);
                                  }}
                                  data-tooltip={t('duplicateTab.preview')}
                                  aria-label={t('duplicateTab.preview')}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-outline-variant/20 bg-surface-container-highest text-on-surface-variant hover:text-primary hover:border-primary/40 shrink-0 cursor-pointer transition-colors"
                                >
                                  <span className="material-symbols-outlined text-[16px] leading-none">visibility</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenItemFolder(item.fullPath);
                                  }}
                                  data-tooltip={t('duplicateTab.openFolder')}
                                  aria-label={t('duplicateTab.openFolder')}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-outline-variant/20 bg-surface-container-highest text-on-surface-variant hover:text-primary hover:border-primary/40 shrink-0 cursor-pointer transition-colors"
                                >
                                  <span className="material-symbols-outlined text-[16px] leading-none">folder_open</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveItem(item.fullPath);
                                  }}
                                  data-tooltip={t('duplicateTab.removeFromList')}
                                  aria-label={t('duplicateTab.removeFromList')}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-outline-variant/20 bg-surface-container-highest text-on-surface-variant hover:text-on-surface hover:border-outline-variant/50 shrink-0 cursor-pointer transition-colors"
                                >
                                  <span className="material-symbols-outlined text-[16px] leading-none">close</span>
                                </button>
                              </div>
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
            <ul className="space-y-1.5">
              {displayedItems.map((item, idx) => (
                <li
                  key={item.fullPath}
                  onClick={() => setPreviewPath(item.fullPath)}
                  className="flex items-center gap-2.5 rounded-xl border border-outline-variant/20 bg-surface-container-low/40 px-3.5 py-2 text-sm hover:border-primary/35 hover:bg-surface-container-high cursor-pointer transition-colors select-none"
                >
                  {/* Số thứ tự */}
                  <span className="w-6 shrink-0 text-center font-mono text-[11px] text-on-surface-variant/55 tabular-nums select-none">
                    {idx + 1}
                  </span>

                  {/* Icon loại file */}
                  <span className="material-symbols-outlined shrink-0 text-[18px] text-on-surface-variant/60">
                    image
                  </span>

                  {/* Tên tệp & Đường dẫn tương đối */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-on-surface text-xs sm:text-sm">
                      {item.name}
                    </p>
                    <p className="truncate text-[10px] text-on-surface-variant/60 font-mono">
                      {item.relativePath}
                    </p>
                  </div>

                  {/* Kích thước gốc & Dung lượng */}
                  <div className="shrink-0 text-[11px] font-mono text-on-surface-variant/70 text-right tabular-nums">
                    {item.width && item.height ? <span>{item.width}×{item.height} · </span> : null}
                    <span>{formatBytes(item.sizeBytes)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Slim Bottom Summary Footer */}
        {hasSource && hasItemsToDisplay && !scanning && !loadingFiles && (
          <div
            data-testid="duplicate-summary-footer"
            className="border-t border-outline-variant/20 bg-surface-container-low/80 backdrop-blur-md px-4 sm:px-6 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 select-none shrink-0"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary tabular-nums shadow-2xs truncate">
                {hasScanned
                  ? t('duplicateTab.footerGroupsSummary', {
                      groups: totalGroupCount,
                      total: scannedDuplicates.length,
                      copies: copiesCount,
                    })
                  : t('duplicateTab.footerPendingSummary', {
                      count: importedFiles.length,
                      size: formatBytes(importedTotalBytes),
                    })}
              </span>
            </div>
            {hasScanned && (
              <div className="text-xs text-on-surface-variant font-medium tabular-nums">
                {t('duplicateTab.footerSelectedSummary', {
                  count: selectedCount,
                  size: formatBytes(selectedStats.selectedBytes),
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Theme-Aware Studio Preview Modal */}
      <DuplicatePreviewModal
        item={activeItem}
        previewDataUrl={previewDataUrl}
        previewError={previewError}
        hasScanned={hasScanned}
        isSelected={Boolean(activeItem && selectedForDelete.has(activeItem.fullPath))}
        currentIndex={activeItem ? displayedItems.findIndex((it) => it.fullPath === activeItem.fullPath) : -1}
        totalCount={displayedItems.length}
        onToggleSelect={togglePath}
        onOpenFolder={handleOpenItemFolder}
        onPrev={() => setPreviewPath((prev) => findNextPreviewPath(displayedItems, prev, -1))}
        onNext={() => setPreviewPath((prev) => findNextPreviewPath(displayedItems, prev, 1))}
        onClose={() => setPreviewPath(null)}
        t={t}
      />

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
                  {t('duplicateTab.deleteConfirm', { count: selectedCount })}{' '}
                  <span className="font-mono font-semibold text-on-surface">
                    ({formatBytes(selectedStats.selectedBytes)})
                  </span>
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
