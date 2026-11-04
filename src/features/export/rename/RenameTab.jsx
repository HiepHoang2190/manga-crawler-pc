import { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../../context/I18nContext';
import { SourcePicker, SearchableSelect, ResizeSplitter, useToolsSidebarResize } from '../../../shared';
import { ToolsStudioActionSlot, ToolsStudioCenterSlot } from '../../tools-studio/ToolsStudioActionSlot';

const CATEGORY_OPTIONS = [
  { value: 'autoNormalize', actions: ['normalize'] },
  { value: 'findReplace', actions: ['literal', 'regex'] },
  { value: 'sequenceNumbers', actions: ['sequence'] },
  { value: 'insertRemove', actions: ['insert', 'remove'] },
  { value: 'changeCase', actions: ['lower', 'upper', 'title'] },
  { value: 'regex', actions: ['matchReplace'] },
  { value: 'truncate', actions: ['fromStart', 'fromEnd'] },
  { value: 'extension', actions: ['set', 'remove', 'addIfMissing'] },
  { value: 'cleanup', actions: ['deleteDsStore'] },
];

const PREVIEW_DEBOUNCE_MS = 400;

function defaultParamsForCategory(category_value) {
  switch (category_value) {
    case 'autoNormalize':
      return { find: '', replace: '' };
    case 'findReplace':
      return { find: '', replace: '', caseSensitive: true };
    case 'sequenceNumbers':
      return {
        prefix: 'Chap ',
        suffix: '',
        start: 1,
        step: 1,
        padding: 3,
        sortEachFolderSeparately: true,
        sortFirst: 'nameAsc',
        sortThen: 'nameSeqAsc',
      };
    case 'insertRemove':
      return { text: '', position: 'start', index: 0, startIndex: 0, length: 0 };
    case 'regex':
      return { pattern: '', replacement: '', caseInsensitive: false };
    case 'truncate':
      return { maxLength: 20 };
    case 'extension':
      return { extension: '' };
    default:
      return {};
  }
}

function defaultActionForCategory(category_value) {
  const category_option = CATEGORY_OPTIONS.find((item) => item.value === category_value);
  return category_option?.actions[0] || 'normalize';
}

function actionLabelKey(category_value, action_value) {
  if (category_value === 'insertRemove' && action_value === 'remove') {
    return 'renameTab.action.removeText';
  }
  if (category_value === 'extension' && action_value === 'set') {
    return 'renameTab.action.setExtension';
  }
  if (category_value === 'extension' && action_value === 'remove') {
    return 'renameTab.action.removeExtension';
  }
  return `renameTab.action.${action_value}`;
}

function actionHintKey(category_value, action_value) {
  if (category_value === 'extension' && action_value === 'remove') {
    return 'renameTab.actionHint.removeExtension';
  }
  return `renameTab.actionHint.${action_value}`;
}

function parentRelFromPath(rel_path) {
  if (!rel_path || typeof rel_path !== 'string') return '';
  const normalized_path = rel_path.replace(/\\/g, '/');
  const slash_index = normalized_path.lastIndexOf('/');
  if (slash_index <= 0) return '';
  return normalized_path.slice(0, slash_index);
}

function blockedReasonKey(reason_value) {
  const normalized_reason = String(reason_value || '').toLowerCase();
  if (normalized_reason.includes('duplicate')) return 'renameTab.blockedReason.duplicateTarget';
  if (normalized_reason.includes('occupied')) return 'renameTab.blockedReason.targetOccupied';
  if (normalized_reason.includes('exists')) return 'renameTab.blockedReason.targetExists';
  return null;
}

function fieldLabelClass() {
  return 'text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50';
}

function textInputClass() {
  return 'h-9 w-full rounded-md border-none bg-surface-container-highest px-3 text-sm outline-none focus:ring-1 focus:ring-primary disabled:opacity-50';
}

export default function RenameTab({
  onRunningChange,
  sidebarWidth: propWidth,
  handleSplitPointerDown: propHandleSplit,
  showSidebar = true,
  isActive = true,
}) {
  const { t } = useI18n();
  const fallbackResize = useToolsSidebarResize();
  const sidebarWidth = propWidth ?? fallbackResize.sidebarWidth;
  const handleSplitPointerDown = propHandleSplit ?? fallbackResize.handleSplitPointerDown;
  const api = typeof window !== 'undefined' ? window.electronAPI : null;

  const [rootDir, setRootDir] = useState('');
  const [sourceFiles, setSourceFiles] = useState([]);
  const [renameMode, setRenameMode] = useState('folders');
  const includeFolders = renameMode === 'folders';
  const includeFiles = renameMode === 'files';
  const [includeSubfolders, setIncludeSubfolders] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('autoNormalize');
  const [selectedAction, setSelectedAction] = useState('normalize');
  const [renameParams, setRenameParams] = useState(() => defaultParamsForCategory('autoNormalize'));
  const [previewOps, setPreviewOps] = useState([]);
  const [blockedOps, setBlockedOps] = useState([]);
  const [unchangedOps, setUnchangedOps] = useState([]);
  const [unchangedCount, setUnchangedCount] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [renameProgress, setRenameProgress] = useState(null);
  const [undoStack, setUndoStack] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [resultMessage, setResultMessage] = useState('');
  // Set of folder parentRel keys that are currently collapsed (default empty = all folders expanded)
  const [collapsedParents, setCollapsedParents] = useState(() => new Set());
  // fromRel values the user unchecked — default empty = all preview ops selected
  const [deselectedRels, setDeselectedRels] = useState(() => new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  const handleModeChange = (next_mode) => {
    if (applying || next_mode === renameMode) return;
    setRenameMode(next_mode);
    setDeselectedRels(new Set());
    if (next_mode === 'folders') {
      if (sourceFiles.length > 0) {
        setSourceFiles([]);
      }
      if (selectedCategory === 'extension' || selectedCategory === 'cleanup') {
        setSelectedCategory('autoNormalize');
        setSelectedAction('normalize');
        setRenameParams(defaultParamsForCategory('autoNormalize'));
      }
    }
  };

  // -- notify parent of running state ---------------------------------------
  useEffect(() => {
    onRunningChange?.(applying);
  }, [applying, onRunningChange]);

  const hasDesktopApi = Boolean(api?.selectDirectory && api?.renamePreview);
  const current_category_options = useMemo(() => {
    if (renameMode === 'folders') {
      return CATEGORY_OPTIONS.filter((item) => item.value !== 'extension' && item.value !== 'cleanup');
    }
    return CATEGORY_OPTIONS;
  }, [renameMode]);

  const current_actions =
    current_category_options.find((item) => item.value === selectedCategory)?.actions || [];

  const category_select_options = useMemo(
    () => current_category_options.map((category_option) => ({
      value: category_option.value,
      label: t(`renameTab.category.${category_option.value}`),
    })),
    [current_category_options, t]
  );

  const action_select_options = useMemo(
    () => current_actions.map((action_value) => ({
      value: action_value,
      label: t(actionLabelKey(selectedCategory, action_value)),
    })),
    [current_actions, selectedCategory, t]
  );

  const sort_select_options = useMemo(
    () => [
      { value: 'nameAsc', label: t('renameTab.sort.nameAsc') },
      { value: 'nameSeqAsc', label: t('renameTab.sort.nameSeqAsc') },
    ],
    [t]
  );

  const position_select_options = useMemo(
    () => [
      { value: 'start', label: t('renameTab.positionStart') },
      { value: 'end', label: t('renameTab.positionEnd') },
      { value: 'index', label: t('renameTab.positionIndex') },
    ],
    [t]
  );

  const updateParam = (param_key, param_value) => {
    setRenameParams((previous_params) => ({
      ...previous_params,
      [param_key]: param_value,
    }));
  };

  const runPreview = useCallback(async () => {
    const hasSource = Boolean(rootDir || (sourceFiles && sourceFiles.length > 0));
    if (!hasSource || !api?.renamePreview) {
      setPreviewOps([]);
      setBlockedOps([]);
      setUnchangedOps([]);
      setUnchangedCount(0);
      setDeselectedRels(new Set());
      setPreviewing(false);
      return;
    }
    if (!includeFolders && !includeFiles) {
      setPreviewOps([]);
      setBlockedOps([]);
      setUnchangedOps([]);
      setUnchangedCount(0);
      setDeselectedRels(new Set());
      setErrorMessage(t('renameTab.needScope'));
      setPreviewing(false);
      return;
    }

    setPreviewing(true);
    setErrorMessage('');
    try {
      const preview_result = await api.renamePreview({
        rootDir,
        sourceFiles,
        includeFolders,
        includeFiles,
        includeSubfolders,
        category: selectedCategory,
        action: selectedAction,
        params: renameParams,
      });
      if (!preview_result?.ok) {
        setPreviewOps([]);
        setBlockedOps([]);
        setUnchangedOps([]);
        setUnchangedCount(0);
        setDeselectedRels(new Set());
        const is_pattern_error = /invalid|pattern|regex|syntax/i.test(
          String(preview_result?.error || '')
        );
        setErrorMessage(
          is_pattern_error
            ? t('renameTab.invalidPattern')
            : preview_result?.error || t('renameTab.failed')
        );
        return;
      }
      setPreviewOps(Array.isArray(preview_result.ops) ? preview_result.ops : []);
      setBlockedOps(Array.isArray(preview_result.blocked) ? preview_result.blocked : []);
      setUnchangedOps(Array.isArray(preview_result.unchanged) ? preview_result.unchanged : []);
      setUnchangedCount(
        typeof preview_result.unchangedCount === 'number'
          ? preview_result.unchangedCount
          : (Array.isArray(preview_result.unchanged) ? preview_result.unchanged.length : 0)
      );
    } catch (preview_error) {
      setPreviewOps([]);
      setBlockedOps([]);
      setUnchangedOps([]);
      setUnchangedCount(0);
      setDeselectedRels(new Set());
      setErrorMessage(String(preview_error?.message || preview_error) || t('renameTab.failed'));
    } finally {
      setPreviewing(false);
    }
  }, [
    api,
    includeFolders,
    includeFiles,
    includeSubfolders,
    renameParams,
    rootDir,
    sourceFiles,
    selectedAction,
    selectedCategory,
    t,
  ]);

  // Debounced preview when root / category / action / params / scope change
  useEffect(() => {
    const hasSource = Boolean(rootDir || (sourceFiles && sourceFiles.length > 0));
    if (!hasSource || !api?.renamePreview || applying) return undefined;

    let effect_active = true;
    const debounce_timer = setTimeout(() => {
      if (!effect_active) return;
      runPreview();
    }, PREVIEW_DEBOUNCE_MS);

    return () => {
      effect_active = false;
      clearTimeout(debounce_timer);
    };
  }, [api, applying, renameParams, rootDir, sourceFiles, runPreview, selectedAction, selectedCategory, renameMode, includeSubfolders]);

  useEffect(() => {
    if (!applying || !api?.subscribeRenameProgress) return undefined;
    return api.subscribeRenameProgress((next_progress) => {
      if (
        next_progress
        && typeof next_progress.done === 'number'
        && typeof next_progress.total === 'number'
      ) {
        setRenameProgress(next_progress);
      }
    });
  }, [api, applying]);

  // Keep unchecked paths that still exist in the latest preview; drop stale ones
  useEffect(() => {
    setDeselectedRels((previous_set) => {
      if (previous_set.size === 0) return previous_set;
      const valid_rels = new Set(
        previewOps.map((rename_op) => rename_op.fromRel).filter(Boolean)
      );
      let changed = false;
      const next_set = new Set();
      for (const rel_path of previous_set) {
        if (valid_rels.has(rel_path)) next_set.add(rel_path);
        else changed = true;
      }
      if (!changed && next_set.size === previous_set.size) return previous_set;
      return next_set;
    });
  }, [previewOps]);

  const handleSelectRoot = async () => {
    if (!api?.selectDirectory) return;
    const selected_dir = await api.selectDirectory();
    if (!selected_dir) return;
    setRootDir(selected_dir);
    setSourceFiles([]);
    setRenameProgress(null);
    setErrorMessage('');
    setResultMessage('');
    setCollapsedParents(new Set());
  };

  const handleSelectFiles = async () => {
    const selectFn = api?.selectFiles || api?.selectImageFiles;
    if (!selectFn) return;
    try {
      const files = await selectFn();
      if (files && files.length > 0) {
        setSourceFiles(files);
        setRootDir('');
        setRenameProgress(null);
        setErrorMessage('');
        setResultMessage('');
        setCollapsedParents(new Set());
      }
    } catch {
      // ignore
    }
  };

  const handleClearRoot = () => {
    setRootDir('');
    setSourceFiles([]);
    setPreviewOps([]);
    setBlockedOps([]);
    setUnchangedOps([]);
    setUnchangedCount(0);
    setDeselectedRels(new Set());
    setRenameProgress(null);
    setErrorMessage('');
    setResultMessage('');
    setCollapsedParents(new Set());
  };

  const handleCategoryChange = (next_category) => {
    setSelectedCategory(next_category);
    setSelectedAction(defaultActionForCategory(next_category));
    setRenameParams(defaultParamsForCategory(next_category));
    setResultMessage('');
    setCollapsedParents(new Set());
  };

  const handleApply = async () => {
    if (!api?.renameApply || previewOps.length === 0) return;
    if (!includeFolders && !includeFiles) {
      setErrorMessage(t('renameTab.needScope'));
      return;
    }

    const selected_ops = previewOps.filter(
      (rename_op) => rename_op?.fromRel && !deselectedRels.has(rename_op.fromRel)
    );
    if (selected_ops.length === 0) return;

    setApplying(true);
    setRenameProgress(null);
    setErrorMessage('');
    setResultMessage('');
    try {
      const apply_result = await api.renameApply({ ops: selected_ops });
      if (apply_result?.cancelled) {
        setResultMessage(t('renameTab.cancelled'));
        await runPreview();
        return;
      }
      if (!apply_result?.ok) {
        setErrorMessage(apply_result?.error || t('renameTab.failed'));
        await runPreview();
        return;
      }

      if (Array.isArray(apply_result.undoOps) && apply_result.undoOps.length > 0) {
        setUndoStack((previous_stack) => [...previous_stack, apply_result.undoOps]);
      }

      setResultMessage(
        selectedCategory === 'cleanup'
          ? t('renameTab.successCleanup', {
            deleted: apply_result.renamed ?? 0,
          })
          : t('renameTab.success', {
            renamed: apply_result.renamed ?? 0,
            unchanged: unchangedCount,
            blocked: blockedOps.length,
            failed: 0,
          })
      );

      try {
        if (apply_result.renamed > 0 && api?.openPath) {
          let targetDir = rootDir;
          if (!targetDir && sourceFiles?.[0]) {
            const normalized = String(sourceFiles[0]).replace(/\\/g, '/');
            const lastSlash = normalized.lastIndexOf('/');
            targetDir = lastSlash === -1 ? '' : normalized.slice(0, lastSlash);
          }
          if (targetDir) await api.openPath(targetDir);
        }
      } finally {
        await runPreview();
      }
    } catch (apply_error) {
      setErrorMessage(String(apply_error?.message || apply_error) || t('renameTab.failed'));
    } finally {
      setApplying(false);
      setRenameProgress(null);
    }
  };

  const handleUndo = async () => {
    if (!api?.renameUndo) return;
    if (undoStack.length === 0) {
      setErrorMessage(t('renameTab.undoEmpty'));
      return;
    }

    const next_stack = [...undoStack];
    const undo_ops = next_stack.pop();
    setUndoStack(next_stack);
    setApplying(true);
    setRenameProgress(null);
    setErrorMessage('');
    setResultMessage('');
    try {
      const undo_result = await api.renameUndo({ undoOps: undo_ops });
      if (undo_result?.cancelled) {
        setResultMessage(t('renameTab.cancelled'));
        await runPreview();
        return;
      }
      if (!undo_result?.ok) {
        // Restore popped batch if undo failed
        setUndoStack((previous_stack) => [...previous_stack, undo_ops]);
        setErrorMessage(undo_result?.error || t('renameTab.failed'));
        await runPreview();
        return;
      }
      setResultMessage(
        t('renameTab.success', {
          renamed: undo_result.renamed ?? 0,
          unchanged: 0,
          blocked: 0,
          failed: 0,
        })
      );
      await runPreview();
    } catch (undo_error) {
      setUndoStack((previous_stack) => [...previous_stack, undo_ops]);
      setErrorMessage(String(undo_error?.message || undo_error) || t('renameTab.failed'));
    } finally {
      setApplying(false);
      setRenameProgress(null);
    }
  };

  const handleStop = async () => {
    if (!api?.cancelRename) return;
    try {
      await api.cancelRename();
    } catch (cancel_error) {
      setErrorMessage(String(cancel_error?.message || cancel_error) || t('renameTab.failed'));
    }
  };

  const toggleParentExpanded = (parent_key) => {
    setCollapsedParents((previous_set) => {
      const next_set = new Set(previous_set);
      if (next_set.has(parent_key)) next_set.delete(parent_key);
      else next_set.add(parent_key);
      return next_set;
    });
  };

  const toggleOpSelected = (from_rel) => {
    if (!from_rel || applying) return;
    setDeselectedRels((previous_set) => {
      const next_set = new Set(previous_set);
      if (next_set.has(from_rel)) next_set.delete(from_rel);
      else next_set.add(from_rel);
      return next_set;
    });
  };

  const handleSelectAllOps = () => {
    if (applying) return;
    setDeselectedRels(new Set());
  };

  const handleDeselectAllOps = () => {
    if (applying) return;
    setDeselectedRels(
      new Set(previewOps.map((rename_op) => rename_op.fromRel).filter(Boolean))
    );
  };

  const handleToggleSelectAllOps = () => {
    if (applying || previewOps.length === 0) return;
    if (deselectedRels.size === 0) handleDeselectAllOps();
    else handleSelectAllOps();
  };

  const groupSelectableRels = (group_value) =>
    (group_value?.rows || [])
      .filter((row_value) => !row_value.blocked && row_value.opType !== 'unchanged' && row_value.fromRel)
      .map((row_value) => row_value.fromRel);

  const getGroupSelectionState = (group_value) => {
    const selectable_rels = groupSelectableRels(group_value);
    if (selectable_rels.length === 0) {
      return { allSelected: false, someSelected: false, selectableCount: 0 };
    }
    let selected_count = 0;
    for (const rel_path of selectable_rels) {
      if (!deselectedRels.has(rel_path)) selected_count += 1;
    }
    return {
      allSelected: selected_count === selectable_rels.length,
      someSelected: selected_count > 0 && selected_count < selectable_rels.length,
      selectableCount: selectable_rels.length,
    };
  };

  const toggleGroupSelected = (group_value) => {
    if (applying) return;
    const selectable_rels = groupSelectableRels(group_value);
    if (selectable_rels.length === 0) return;
    const { allSelected } = getGroupSelectionState(group_value);
    setDeselectedRels((previous_set) => {
      const next_set = new Set(previous_set);
      if (allSelected) {
        for (const rel_path of selectable_rels) next_set.add(rel_path);
      } else {
        for (const rel_path of selectable_rels) next_set.delete(rel_path);
      }
      return next_set;
    });
  };

  const preview_groups = useMemo(() => {
    const group_map = new Map();

    const ensure_group = (parent_key) => {
      if (!group_map.has(parent_key)) {
        group_map.set(parent_key, { parentRel: parent_key, rows: [] });
      }
      return group_map.get(parent_key);
    };

    for (const rename_op of previewOps) {
      const parent_key = parentRelFromPath(rename_op.fromRel);
      ensure_group(parent_key).rows.push({
        key: `op:${rename_op.fromAbs || rename_op.fromRel}`,
        kind: rename_op.kind || 'file',
        fromRel: rename_op.fromRel,
        toRel: rename_op.toRel,
        opType: rename_op.opType || 'rename',
        blocked: false,
      });
    }

    for (const blocked_op of blockedOps) {
      const parent_key = parentRelFromPath(blocked_op.fromRel);
      ensure_group(parent_key).rows.push({
        key: `blocked:${blocked_op.fromRel}:${blocked_op.reason || ''}`,
        kind: 'file',
        fromRel: blocked_op.fromRel,
        toRel: null,
        blocked: true,
        reason: blocked_op.reason,
      });
    }

    for (const unchanged_op of unchangedOps) {
      const parent_key = parentRelFromPath(unchanged_op.fromRel);
      ensure_group(parent_key).rows.push({
        key: `unchanged:${unchanged_op.fromAbs || unchanged_op.fromRel}`,
        kind: unchanged_op.kind || 'file',
        fromRel: unchanged_op.fromRel,
        toRel: unchanged_op.toRel,
        opType: 'unchanged',
        blocked: false,
      });
    }

    const sorted_groups = [...group_map.values()].sort((left_group, right_group) =>
      String(left_group.parentRel).localeCompare(String(right_group.parentRel))
    );
    for (const group_value of sorted_groups) {
      group_value.rows.sort((left_row, right_row) =>
        String(left_row.fromRel).localeCompare(String(right_row.fromRel), undefined, { numeric: true, sensitivity: 'base' })
      );
    }
    return sorted_groups;
  }, [blockedOps, previewOps, unchangedOps]);

  const progress_pct =
    renameProgress?.total > 0
      ? Math.min(100, Math.round((100 * renameProgress.done) / renameProgress.total))
      : 0;
  const selected_ops_count = previewOps.filter(
    (rename_op) => rename_op?.fromRel && !deselectedRels.has(rename_op.fromRel)
  ).length;
  const all_ops_selected = previewOps.length > 0 && deselectedRels.size === 0;
  const some_ops_selected = selected_ops_count > 0 && !all_ops_selected;
  const hasSource = Boolean(rootDir || (sourceFiles && sourceFiles.length > 0));
  const total_items_count = previewOps.length + blockedOps.length + unchangedOps.length;
  const has_any_entries = total_items_count > 0;
  const apply_disabled =
    previewing
    || applying
    || selected_ops_count === 0
    || !hasSource
    || (!includeFolders && !includeFiles);
  const filtered_groups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return preview_groups
      .map((group_value) => {
        let rows = group_value.rows;
        if (q) {
          rows = rows.filter(
            (r) =>
              (r.fromRel || '').toLowerCase().includes(q) ||
              (r.toRel || '').toLowerCase().includes(q)
          );
        }
        if (filterStatus === 'changed') {
          rows = rows.filter((r) => r.opType !== 'unchanged' && !r.blocked && r.fromRel !== r.toRel);
        } else if (filterStatus === 'unchanged') {
          rows = rows.filter((r) => r.opType === 'unchanged' || (!r.blocked && r.fromRel === r.toRel));
        } else if (filterStatus === 'blocked') {
          rows = rows.filter((r) => r.blocked);
        }
        return {
          ...group_value,
          rows,
        };
      })
      .filter((g) => g.rows.length > 0);
  }, [preview_groups, searchQuery, filterStatus]);

  const has_preview_rows = filtered_groups.some((group_value) => group_value.rows.length > 0);

  const filterOptions = useMemo(() => [
    { value: 'all', label: `${t('renameTab.filterAll')} (${total_items_count})`, icon: 'filter_list' },
    { value: 'changed', label: `${t('renameTab.filterChanged')} (${previewOps.length})`, icon: 'edit_note' },
    { value: 'unchanged', label: `${t('renameTab.filterUnchanged')} (${unchangedOps.length})`, icon: 'check_circle' },
    { value: 'blocked', label: `${t('renameTab.filterBlocked')} (${blockedOps.length})`, icon: 'error' },
  ], [t, total_items_count, previewOps.length, unchangedOps.length, blockedOps.length]);

  const renderParamsPanel = () => {
    switch (selectedCategory) {
      case 'autoNormalize':
        return (
          <div className="space-y-2">
            <div className="space-y-1">
              <p className={fieldLabelClass()}>{t('renameTab.autoNormalizeFind')}</p>
              <input
                type="text"
                value={renameParams.find || ''}
                onChange={(event) => updateParam('find', event.target.value)}
                disabled={applying}
                className={textInputClass()}
              />
            </div>
            <div className="space-y-1">
              <p className={fieldLabelClass()}>{t('renameTab.autoNormalizeReplace')}</p>
              <input
                type="text"
                value={renameParams.replace || ''}
                onChange={(event) => updateParam('replace', event.target.value)}
                disabled={applying}
                className={textInputClass()}
              />
            </div>
          </div>
        );
      case 'findReplace':
        return (
          <div className="space-y-2">
            <div className="space-y-1">
              <p className={fieldLabelClass()}>{t('renameTab.find')}</p>
              <input
                type="text"
                value={renameParams.find || ''}
                onChange={(event) => updateParam('find', event.target.value)}
                disabled={applying}
                className={textInputClass()}
              />
            </div>
            <div className="space-y-1">
              <p className={fieldLabelClass()}>{t('renameTab.replace')}</p>
              <input
                type="text"
                value={renameParams.replace || ''}
                onChange={(event) => updateParam('replace', event.target.value)}
                disabled={applying}
                className={textInputClass()}
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-on-surface-variant hover:text-on-surface">
              <input
                type="checkbox"
                checked={Boolean(renameParams.caseSensitive)}
                onChange={(event) => updateParam('caseSensitive', event.target.checked)}
                disabled={applying}
                className="rounded accent-primary"
              />
              {t('renameTab.caseSensitive')}
            </label>
          </div>
        );
      case 'sequenceNumbers':
        return (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <p className={fieldLabelClass()}>{t('renameTab.prefix')}</p>
                <input
                  type="text"
                  value={renameParams.prefix ?? ''}
                  onChange={(event) => updateParam('prefix', event.target.value)}
                  disabled={applying}
                  className={textInputClass()}
                />
              </div>
              <div className="space-y-1">
                <p className={fieldLabelClass()}>{t('renameTab.suffix')}</p>
                <input
                  type="text"
                  value={renameParams.suffix ?? ''}
                  onChange={(event) => updateParam('suffix', event.target.value)}
                  disabled={applying}
                  className={textInputClass()}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <p className={fieldLabelClass()}>{t('renameTab.start')}</p>
                <input
                  type="number"
                  value={renameParams.start ?? 1}
                  onChange={(event) => updateParam('start', Number(event.target.value))}
                  disabled={applying}
                  className={textInputClass()}
                />
              </div>
              <div className="space-y-1">
                <p className={fieldLabelClass()}>{t('renameTab.step')}</p>
                <input
                  type="number"
                  value={renameParams.step ?? 1}
                  onChange={(event) => updateParam('step', Number(event.target.value))}
                  disabled={applying}
                  className={textInputClass()}
                />
              </div>
              <div className="space-y-1">
                <p className={fieldLabelClass()} data-tooltip={t('renameTab.paddingTooltip')}>
                  {t('renameTab.padding')}
                </p>
                <input
                  type="number"
                  min={1}
                  value={renameParams.padding ?? 3}
                  onChange={(event) => updateParam('padding', Number(event.target.value))}
                  disabled={applying}
                  data-tooltip={t('renameTab.paddingTooltip')}
                  className={textInputClass()}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1 min-w-0">
                <p className={fieldLabelClass()}>{t('renameTab.sortFirst')}</p>
                <SearchableSelect
                  value={renameParams.sortFirst || 'nameAsc'}
                  onChange={(next_value) => updateParam('sortFirst', next_value)}
                  options={sort_select_options}
                  disabled={applying}
                  className="w-full min-w-0"
                />
              </div>
              <div className="space-y-1 min-w-0">
                <p className={fieldLabelClass()}>{t('renameTab.sortThen')}</p>
                <SearchableSelect
                  value={renameParams.sortThen || 'nameSeqAsc'}
                  onChange={(next_value) => updateParam('sortThen', next_value)}
                  options={sort_select_options}
                  disabled={applying}
                  className="w-full min-w-0"
                />
              </div>
            </div>
            {renameMode === 'files' && (
              <label className="flex cursor-pointer items-center gap-2 text-xs text-on-surface-variant hover:text-on-surface pt-0.5">
                <input
                  type="checkbox"
                  checked={Boolean(renameParams.sortEachFolderSeparately)}
                  onChange={(event) => updateParam('sortEachFolderSeparately', event.target.checked)}
                  disabled={applying}
                  className="rounded accent-primary"
                />
                {t('renameTab.sortEachFolder')}
              </label>
            )}
          </div>
        );
      case 'insertRemove':
        if (selectedAction === 'remove') {
          return (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <p className={fieldLabelClass()}>{t('renameTab.startIndex')}</p>
                <input
                  type="number"
                  min={0}
                  value={renameParams.startIndex ?? 0}
                  onChange={(event) => updateParam('startIndex', Number(event.target.value))}
                  disabled={applying}
                  className={textInputClass()}
                />
              </div>
              <div className="space-y-1">
                <p className={fieldLabelClass()}>{t('renameTab.length')}</p>
                <input
                  type="number"
                  min={0}
                  value={renameParams.length ?? 0}
                  onChange={(event) => updateParam('length', Number(event.target.value))}
                  disabled={applying}
                  className={textInputClass()}
                />
              </div>
            </div>
          );
        }
        return (
          <div className="space-y-2">
            <div className="space-y-1">
              <p className={fieldLabelClass()}>{t('renameTab.text')}</p>
              <input
                type="text"
                value={renameParams.text || ''}
                onChange={(event) => updateParam('text', event.target.value)}
                disabled={applying}
                className={textInputClass()}
              />
            </div>
            <div className="space-y-1">
              <p className={fieldLabelClass()}>{t('renameTab.position')}</p>
              <SearchableSelect
                value={renameParams.position || 'start'}
                onChange={(next_value) => updateParam('position', next_value)}
                options={position_select_options}
                disabled={applying}
              />
            </div>
            {renameParams.position === 'index' && (
              <div className="space-y-1">
                <p className={fieldLabelClass()}>{t('renameTab.index')}</p>
                <input
                  type="number"
                  min={0}
                  value={renameParams.index ?? 0}
                  onChange={(event) => updateParam('index', Number(event.target.value))}
                  disabled={applying}
                  className={textInputClass()}
                />
              </div>
            )}
          </div>
        );
      case 'regex':
        return (
          <div className="space-y-2">
            <div className="space-y-1">
              <p className={fieldLabelClass()}>{t('renameTab.pattern')}</p>
              <input
                type="text"
                value={renameParams.pattern || ''}
                onChange={(event) => updateParam('pattern', event.target.value)}
                disabled={applying}
                className={textInputClass()}
              />
            </div>
            <div className="space-y-1">
              <p className={fieldLabelClass()}>{t('renameTab.replacement')}</p>
              <input
                type="text"
                value={renameParams.replacement || ''}
                onChange={(event) => updateParam('replacement', event.target.value)}
                disabled={applying}
                className={textInputClass()}
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-on-surface-variant hover:text-on-surface">
              <input
                type="checkbox"
                checked={Boolean(renameParams.caseInsensitive)}
                onChange={(event) => updateParam('caseInsensitive', event.target.checked)}
                disabled={applying}
                className="rounded accent-primary"
              />
              {t('renameTab.caseInsensitive')}
            </label>
          </div>
        );
      case 'truncate':
        return (
          <div className="space-y-1">
            <p className={fieldLabelClass()}>{t('renameTab.maxLength')}</p>
            <input
              type="number"
              min={0}
              value={renameParams.maxLength ?? 20}
              onChange={(event) => updateParam('maxLength', Number(event.target.value))}
              disabled={applying}
              className={textInputClass()}
            />
          </div>
        );
      case 'extension':
        return selectedAction === 'remove' ? null : (
          <div className="space-y-1">
            <p className={fieldLabelClass()}>{t('renameTab.extension')}</p>
            <input
              type="text"
              value={renameParams.extension || ''}
              onChange={(event) => updateParam('extension', event.target.value)}
              disabled={applying}
              placeholder=".jpg"
              className={textInputClass()}
            />
          </div>
        );
      case 'cleanup':
        return null;
      default:
        return null;
    }
  };

  return (
    <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden bg-surface">
      <ToolsStudioCenterSlot active={isActive} />

      <ToolsStudioActionSlot active={isActive}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleApply}
            disabled={!api?.renameApply || apply_disabled}
            className="flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-semibold text-on-primary shadow-xs transition-all hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px] leading-none">drive_file_rename_outline</span>
            <span>{applying ? t('renameTab.applying') : t('renameTab.apply')}</span>
          </button>
          <button
            type="button"
            onClick={handleStop}
            disabled={!applying || !api?.cancelRename}
            className="flex h-8 items-center justify-center gap-1 rounded-lg border border-error/40 px-2.5 text-xs font-semibold text-error transition-colors hover:bg-error/10 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px] leading-none">stop_circle</span>
            <span>{t('renameTab.stop')}</span>
          </button>
          <button
            type="button"
            onClick={handleUndo}
            disabled={applying || undoStack.length === 0 || !api?.renameUndo}
            className="flex h-8 items-center justify-center gap-1 rounded-lg border border-outline-variant/30 px-2.5 text-xs font-medium text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px] leading-none">undo</span>
            <span>
              {t('renameTab.undo')}
              {undoStack.length > 0 ? ` (${undoStack.length})` : ''}
            </span>
          </button>
        </div>
      </ToolsStudioActionSlot>

      {showSidebar && (
        <div
          style={{ width: `${sidebarWidth}px` }}
          className="relative shrink-0 flex flex-col h-full border-r border-outline-variant/20 overflow-visible select-none"
        >
          {/* Sub-tab Navigation */}
          <div className="px-3.5 pt-3 pb-2.5 border-b border-outline-variant/15 shrink-0 bg-surface-container-low/40">
            <div className="grid grid-cols-2 p-1 rounded-xl bg-surface-container-highest/60 border border-outline-variant/20 gap-1">
              <button
                type="button"
                onClick={() => handleModeChange('folders')}
                disabled={applying}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer select-none ${
                  renameMode === 'folders'
                    ? 'bg-primary text-on-primary shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                }`}
              >
                <span className="material-symbols-outlined text-[16px] leading-none">folder</span>
                <span className="truncate">{t('renameTab.modeFolders')}</span>
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('files')}
                disabled={applying}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer select-none ${
                  renameMode === 'files'
                    ? 'bg-primary text-on-primary shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                }`}
              >
                <span className="material-symbols-outlined text-[16px] leading-none">description</span>
                <span className="truncate">{t('renameTab.modeFiles')}</span>
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-5 mr-1.5">
        <div className="space-y-5">
          {!hasDesktopApi && (
            <p className="text-xs text-amber-400">{t('renameTab.desktopOnly')}</p>
          )}

          <SourcePicker
            sourceDir={rootDir}
            sourceFiles={renameMode === 'files' ? sourceFiles : []}
            includeSubfolders={includeSubfolders}
            onIncludeSubfoldersChange={setIncludeSubfolders}
            onSelectFolder={handleSelectRoot}
            onSelectFiles={renameMode === 'files' ? handleSelectFiles : undefined}
            onClear={handleClearRoot}
            disabled={applying || !hasDesktopApi}
            title={renameMode === 'folders' ? t('renameTab.selectFolderSource') : t('renameTab.selectSource')}
          />

          <div className="space-y-2">
            <div className="space-y-1">
              <p className={fieldLabelClass()}>{t('renameTab.category')}</p>
              <SearchableSelect
                value={selectedCategory}
                onChange={handleCategoryChange}
                options={category_select_options}
                disabled={applying}
              />
              <p className="rounded-lg border border-outline-variant/20 bg-surface-container-high p-2.5 text-[11px] leading-relaxed text-on-surface-variant">
                {t(`renameTab.categoryHint.${selectedCategory}`)}
              </p>
            </div>
            {current_actions.length > 1 && (
              <div className="space-y-1">
                <p className={fieldLabelClass()}>{t('renameTab.action')}</p>
                <SearchableSelect
                  value={selectedAction}
                  onChange={setSelectedAction}
                  options={action_select_options}
                  disabled={applying}
                />
                <p className="rounded-lg border border-outline-variant/20 bg-surface-container-high p-2.5 text-[11px] leading-relaxed text-on-surface-variant">
                  {t(actionHintKey(selectedCategory, selectedAction))}
                </p>
              </div>
            )}
          </div>

          {renderParamsPanel()}

          {(errorMessage || (resultMessage && !errorMessage)) && (
            <div className="space-y-1">
              {errorMessage && (
                <p className="text-xs text-error font-medium" role="alert">
                  {errorMessage}
                </p>
              )}
              {resultMessage && !errorMessage && (
                <p className="text-xs text-green-400/90 font-medium" role="status">
                  {resultMessage}
                </p>
              )}
            </div>
          )}
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

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {applying && (
          <div className="shrink-0 space-y-1 px-5 pb-2 pt-4">
            <div className="h-1 overflow-hidden rounded-full bg-surface-container-highest">
              <div
                className="h-full bg-primary transition-[width] duration-150"
                style={{ width: `${progress_pct}%` }}
              />
            </div>
            <p className="truncate text-[11px] text-on-surface-variant">
              {renameProgress?.total
                ? t('renameTab.progress', {
                  done: renameProgress.done,
                  total: renameProgress.total,
                })
                : t('renameTab.applying')}
            </p>
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col px-5 pb-5 pt-4 overflow-hidden">
          <div className="mb-3 space-y-2 shrink-0">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleToggleSelectAllOps}
                disabled={!has_any_entries || previewOps.length === 0}
                aria-label={all_ops_selected ? t('renameTab.deselectAll') : t('renameTab.selectAll')}
                className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-surface-container-highest/70 hover:bg-surface-container-highest text-on-surface transition-colors cursor-pointer border border-outline-variant/20 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                <span className="material-symbols-outlined text-[18px] leading-none text-primary">
                  {all_ops_selected
                    ? 'check_box'
                    : some_ops_selected
                      ? 'indeterminate_check_box'
                      : 'check_box_outline_blank'}
                </span>
              </button>

              <SearchableSelect
                value={filterStatus}
                onChange={(val) => setFilterStatus(val)}
                size="sm"
                showPlaceholderOption={false}
                className="min-w-[11.5rem]"
                options={filterOptions}
                disabled={!has_any_entries}
              />

              <div className="relative flex items-center">
                <span className="material-symbols-outlined pointer-events-none absolute left-2.5 text-[15px] text-on-surface-variant/50">
                  search
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('renameTab.searchPlaceholder')}
                  disabled={!has_any_entries}
                  className="h-8 w-40 rounded-lg bg-surface-container-highest/80 pl-8 pr-7 text-xs text-on-surface outline-none focus:ring-1 focus:ring-primary placeholder:text-on-surface-variant/40 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-on-surface-variant/60 hover:text-on-surface cursor-pointer"
                    data-tooltip={t('renameTab.clearSearch')}
                    aria-label={t('renameTab.clearSearch')}
                  >
                    <span className="material-symbols-outlined text-[15px]">close</span>
                  </button>
                )}
              </div>

              {renameMode === 'files' && (
                <button
                  type="button"
                  onClick={() => {
                    if (collapsedParents.size === 0) {
                      setCollapsedParents(new Set(preview_groups.map((g) => g.parentRel)));
                    } else {
                      setCollapsedParents(new Set());
                    }
                  }}
                  disabled={!has_any_entries}
                  data-tooltip={collapsedParents.size === 0 ? t('renameTab.collapseAll') : t('renameTab.expandAll')}
                  aria-label={collapsedParents.size === 0 ? t('renameTab.collapseAll') : t('renameTab.expandAll')}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-surface-container-highest/70 hover:bg-surface-container-highest text-on-surface transition-colors cursor-pointer border border-outline-variant/20 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                >
                  <span className="material-symbols-outlined text-[18px] leading-none text-on-surface-variant">
                    {collapsedParents.size === 0 ? 'unfold_less' : 'unfold_more'}
                  </span>
                </button>
              )}
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-outline-variant/15 bg-surface-container-lowest/50 shadow-sm">
            {previewing ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-on-surface-variant">
                <span className="material-symbols-outlined text-[36px] animate-spin text-primary">
                  progress_activity
                </span>
                <p className="text-xs">{t('renameTab.scanning')}</p>
              </div>
            ) : has_preview_rows ? (
              <ul className="min-h-0 flex-1 overflow-y-auto py-1 pr-1 custom-scrollbar">
                {filtered_groups.map((group_value) => {
                  const parent_key = group_value.parentRel;
                  const is_expanded = !collapsedParents.has(parent_key);
                  const folder_label = parent_key || '.';
                  const group_selection = getGroupSelectionState(group_value);
                  return (
                    <li key={parent_key || '__root__'} className="mx-1">
                      <div
                        onClick={() => toggleParentExpanded(parent_key)}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-surface-container-high cursor-pointer select-none transition-colors"
                      >
                        {group_selection.selectableCount > 0 ? (
                          <input
                            type="checkbox"
                            checked={group_selection.allSelected}
                            ref={(checkbox_el) => {
                              if (checkbox_el) {
                                checkbox_el.indeterminate = group_selection.someSelected;
                              }
                            }}
                            onChange={() => toggleGroupSelected(group_value)}
                            onClick={(event) => event.stopPropagation()}
                            disabled={applying}
                            className="shrink-0 rounded accent-primary disabled:opacity-50 cursor-pointer"
                            aria-label={folder_label}
                          />
                        ) : (
                          <span className="h-4 w-4 shrink-0" aria-hidden />
                        )}
                        <div className="flex min-w-0 flex-1 items-center gap-2 text-left">
                          <span className="material-symbols-outlined shrink-0 text-[18px] text-on-surface-variant/60">
                            {is_expanded ? 'folder_open' : 'folder'}
                          </span>
                          <span className="min-w-0 flex-1 truncate font-medium text-on-surface">
                            {folder_label}
                          </span>
                          <span className="shrink-0 text-[11px] font-mono text-on-surface-variant">
                            {group_value.rows.length}
                          </span>
                          <span className="material-symbols-outlined shrink-0 text-[18px] text-on-surface-variant/50 transition-transform duration-150">
                            {is_expanded ? 'expand_less' : 'expand_more'}
                          </span>
                        </div>
                      </div>
                      {is_expanded && (
                        <ul className="mb-1 ml-4 border-l border-outline-variant/15 pl-2">
                          {group_value.rows.map((row_value) => {
                            const reason_key = row_value.blocked
                              ? blockedReasonKey(row_value.reason)
                              : null;
                            const is_op_selected = !row_value.blocked
                              && row_value.opType !== 'unchanged'
                              && !deselectedRels.has(row_value.fromRel);
                            return (
                              <li
                                key={row_value.key}
                                className={`flex items-start gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-surface-container-high transition-colors ${
                                  !row_value.blocked && row_value.opType !== 'unchanged' && !is_op_selected ? 'opacity-45' : ''
                                }`}
                              >
                                {row_value.blocked || row_value.opType === 'unchanged' ? (
                                  <span className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                                ) : (
                                  <input
                                    type="checkbox"
                                    checked={is_op_selected}
                                    onChange={() => toggleOpSelected(row_value.fromRel)}
                                    disabled={applying}
                                    className="mt-0.5 shrink-0 rounded accent-primary disabled:opacity-50 cursor-pointer"
                                    aria-label={row_value.fromRel}
                                  />
                                )}
                                <span className="material-symbols-outlined mt-0.5 shrink-0 text-[16px] text-on-surface-variant/50">
                                  {row_value.kind === 'folder' ? 'folder' : 'draft'}
                                </span>
                                <div className="min-w-0 flex-1">
                                  {row_value.blocked ? (
                                    <>
                                      <p className="truncate text-error font-medium">{row_value.fromRel}</p>
                                      <p className="text-[10px] text-error/80">
                                        {t('renameTab.blocked')}
                                        {reason_key ? `: ${t(reason_key)}` : ''}
                                      </p>
                                    </>
                                  ) : row_value.opType === 'delete' ? (
                                    <p className="break-all text-on-surface">
                                      <span className="text-on-surface-variant">{row_value.fromRel}</span>
                                      <span className="mx-1.5 text-on-surface-variant/50">→</span>
                                      <span className="text-error font-medium">{t('renameTab.deleteToTrash')}</span>
                                    </p>
                                  ) : row_value.opType === 'unchanged' ? (
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="truncate text-on-surface-variant" title={row_value.fromRel}>
                                        {row_value.fromRel}
                                      </span>
                                      <span className="shrink-0 rounded bg-surface-container-highest px-1.5 py-0.5 text-[10px] font-medium text-on-surface-variant/60">
                                        {t('renameTab.filterUnchanged')}
                                      </span>
                                    </div>
                                  ) : (
                                    <p className="break-all text-on-surface">
                                      <span className="text-on-surface-variant">{row_value.fromRel}</span>
                                      <span className="mx-1.5 text-on-surface-variant/50">→</span>
                                      <span className="text-primary font-semibold">{row_value.toRel}</span>
                                    </p>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-on-surface-variant/40">
              <span className="material-symbols-outlined text-[48px]">drive_file_rename_outline</span>
              <p className="text-sm">
                {has_any_entries
                  ? t('renameTab.noMatchingFilter')
                  : hasSource
                  ? t('renameTab.empty')
                  : t('renameTab.noSourceSelected')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  </div>
);
}
