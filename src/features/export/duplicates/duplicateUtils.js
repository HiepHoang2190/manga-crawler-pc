export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Standardize file paths for comparison across Windows and POSIX.
 * Normalizes backslashes to forward slashes and converts to lower-case on Windows.
 */
export function normalizePathForCompare(p) {
  if (!p || typeof p !== 'string') return '';
  return p.replace(/\\/g, '/').toLowerCase();
}

/**
 * Filters out deleted files from buckets and duplicate groups.
 * If a duplicate group only has <= 1 remaining file, the duplicate set is resolved and removed.
 * If a bucket has no remaining duplicate groups, the bucket is removed.
 */
export function removeDeletedFilesFromBuckets(prevBuckets, deletedList) {
  if (!prevBuckets || !Array.isArray(deletedList) || deletedList.length === 0) {
    return prevBuckets;
  }
  const deletedSet = new Set(deletedList.map(normalizePathForCompare));
  return prevBuckets
    .map((bucket) => {
      const updatedGroups = (bucket.duplicateGroups || [])
        .map((group) => {
          const remainingFiles = (group.files || []).filter(
            (f) => !deletedSet.has(normalizePathForCompare(f?.fullPath))
          );
          return {
            ...group,
            files: remainingFiles,
          };
        })
        .filter((group) => group.files.length > 1);

      return {
        ...bucket,
        duplicateGroups: updatedGroups,
      };
    })
    .filter((bucket) => bucket.duplicateGroups.length > 0);
}

/**
 * Toggles a group id presence in a Set of collapsed groups.
 */
export function toggleGroupCollapseInSet(prevSet, groupId) {
  const next = new Set(prevSet);
  if (next.has(groupId)) {
    next.delete(groupId);
  } else {
    next.add(groupId);
  }
  return next;
}

const SMART_GROUP_CATEGORIES = new Set([
  'QR_CODE',
  'CREDIT_PAGE',
  'AD_BANNER',
  'BLANK_PAGE',
]);
const SMART_CATEGORY_SORT_ORDER = {
  QR_CODE: 0,
  CREDIT_PAGE: 1,
  AD_BANNER: 2,
  BLANK_PAGE: 3,
};

function getSortBucketRank(item) {
  if (item?.duplicateGroup == null && item?.category && SMART_GROUP_CATEGORIES.has(item.category)) {
    return 0;
  }
  if (item?.duplicateGroup != null) return 1;
  return 2;
}

/**
 * Strictly transitive comparator placing smart trash groups first, then numbered duplicate groups cleanly.
 */
export function compareDuplicatesFirst(a, b) {
  const rankA = getSortBucketRank(a);
  const rankB = getSortBucketRank(b);
  if (rankA !== rankB) return rankA - rankB;

  if (rankA === 0) {
    const orderA = SMART_CATEGORY_SORT_ORDER[a.category] ?? 99;
    const orderB = SMART_CATEGORY_SORT_ORDER[b.category] ?? 99;
    if (orderA !== orderB) return orderA - orderB;
  } else if (rankA === 1) {
    if (a.duplicateGroup !== b.duplicateGroup) {
      return Number(a.duplicateGroup) - Number(b.duplicateGroup);
    }
    if (Boolean(a.isOriginal) !== Boolean(b.isOriginal)) {
      return a.isOriginal ? -1 : 1;
    }
  }
  return (a.name || '').localeCompare(b.name || '', undefined, { numeric: true });
}

/**
 * Removes deleted/dismissed file paths (cross-platform normalized) and dissolves 1-item duplicate groups
 * while keeping standalone smart-detected items intact.
 */
export function removePathsAndDissolveGroups(prevItems, pathsToRemove) {
  if (!Array.isArray(prevItems) || prevItems.length === 0) return [];
  const removeList = Array.isArray(pathsToRemove) ? pathsToRemove : [pathsToRemove];
  const removeSet = new Set(removeList.map(normalizePathForCompare).filter(Boolean));
  if (removeSet.size === 0) return prevItems;

  const remaining = prevItems.filter(
    (item) => item?.fullPath && !removeSet.has(normalizePathForCompare(item.fullPath))
  );
  const groupCounts = new Map();
  for (const item of remaining) {
    if (item.duplicateGroup != null) {
      groupCounts.set(item.duplicateGroup, (groupCounts.get(item.duplicateGroup) || 0) + 1);
    }
  }
  return remaining.filter(
    (item) => item.duplicateGroup == null || (groupCounts.get(item.duplicateGroup) || 0) > 1
  );
}

/**
 * Maps a scanned smart-mode category item to its localized badge, group label, icon, and tooltip metadata.
 */
export function resolveSmartCategoryBadgeMeta(item, t) {
  if (!item?.category || !SMART_GROUP_CATEGORIES.has(item.category)) return null;
  if (item.category === 'QR_CODE') {
    return {
      label: t('duplicateTab.badgeQr'),
      groupLabel: t('duplicateTab.smartGroupQr'),
      icon: 'qr_code',
      tooltip: item.details?.qrText || t('duplicateTab.badgeQr'),
      badgeClass: 'border-purple-500/35 bg-purple-500/12 text-purple-600 dark:text-purple-400',
      iconClass: 'text-purple-500 dark:text-purple-400',
    };
  }
  if (item.category === 'CREDIT_PAGE') {
    return {
      label: t('duplicateTab.badgeCredit'),
      groupLabel: t('duplicateTab.smartGroupCredit'),
      icon: 'badge',
      tooltip: t('duplicateTab.badgeCredit'),
      badgeClass: 'border-amber-500/35 bg-amber-500/12 text-amber-700 dark:text-amber-300',
      iconClass: 'text-amber-500 dark:text-amber-400',
    };
  }
  if (item.category === 'AD_BANNER') {
    const reasonCode = item.details?.bannerReasonCode;
    const ratio = item.details?.aspectRatio;
    const bannerTooltip =
      reasonCode === 'aspect_ratio' && ratio
        ? t('duplicateTab.bannerReasonAspect', { ratio })
        : reasonCode === 'short_height' && item.height
          ? t('duplicateTab.bannerReasonHeight', { height: item.height })
          : t('duplicateTab.badgeBanner');
    return {
      label: t('duplicateTab.badgeBanner'),
      groupLabel: t('duplicateTab.smartGroupBanner'),
      icon: 'ad_units',
      tooltip: bannerTooltip,
      badgeClass: 'border-rose-500/35 bg-rose-500/12 text-rose-600 dark:text-rose-400',
      iconClass: 'text-rose-500 dark:text-rose-400',
    };
  }
  return {
    label: t('duplicateTab.badgeBlank'),
    groupLabel: t('duplicateTab.smartGroupBlank'),
    icon: 'crop_square',
    tooltip: t('duplicateTab.badgeBlank'),
    badgeClass: 'border-outline-variant/40 bg-surface-container-highest text-on-surface-variant',
    iconClass: 'text-on-surface-variant',
  };
}

/**
 * Resolves the UI group key for a scanned duplicate or smart-detected item.
 */
export function getDuplicateGroupKey(item) {
  if (item?.duplicateGroup != null) return item.duplicateGroup;
  if (item?.category && SMART_GROUP_CATEGORIES.has(item.category)) {
    return `smart:${item.category}`;
  }
  return 'ungrouped';
}

/**
 * Collects all unique group IDs from duplicate/smart images into a Set for default collapse.
 */
export function collectAllGroupIds(items) {
  const ids = new Set();
  if (!Array.isArray(items)) return ids;
  for (const item of items) {
    if (item) {
      ids.add(getDuplicateGroupKey(item));
    }
  }
  return ids;
}

/**
 * Computes next selected file set and anchor state for single click and Shift+click range selection.
 */
export function applyDuplicateRangeSelection({
  prevSelected,
  visiblePaths,
  clickedIndex,
  anchorIndex,
  anchorTargetSelected = true,
  shiftKey = false,
}) {
  const nextSelected = new Set(prevSelected instanceof Set ? prevSelected : []);
  const paths = Array.isArray(visiblePaths) ? visiblePaths : [];
  if (!Number.isInteger(clickedIndex) || clickedIndex < 0 || clickedIndex >= paths.length) {
    return {
      nextSelected,
      nextAnchorIndex: anchorIndex ?? null,
      nextAnchorTargetSelected: anchorTargetSelected !== false,
    };
  }

  const clickedPath = paths[clickedIndex];
  const hasValidAnchor =
    Boolean(shiftKey) &&
    Number.isInteger(anchorIndex) &&
    anchorIndex >= 0 &&
    anchorIndex < paths.length;

  if (hasValidAnchor) {
    const from = Math.min(anchorIndex, clickedIndex);
    const to = Math.max(anchorIndex, clickedIndex);
    const shouldSelect = anchorTargetSelected !== false;
    for (let idx = from; idx <= to; idx += 1) {
      const p = paths[idx];
      if (!p) continue;
      if (shouldSelect) nextSelected.add(p);
      else nextSelected.delete(p);
    }
    return {
      nextSelected,
      nextAnchorIndex: anchorIndex,
      nextAnchorTargetSelected: shouldSelect,
    };
  }

  const shouldSelect = !nextSelected.has(clickedPath);
  if (shouldSelect) nextSelected.add(clickedPath);
  else nextSelected.delete(clickedPath);
  return {
    nextSelected,
    nextAnchorIndex: clickedIndex,
    nextAnchorTargetSelected: shouldSelect,
  };
}

/**
 * Computes count and total reclaimable bytes for selected duplicate items currently in the list.
 */
export function computeSelectedDuplicateStats(items, selectedPaths) {
  const list = Array.isArray(items) ? items : [];
  const selectedSet = selectedPaths instanceof Set ? selectedPaths : new Set();
  if (list.length === 0 || selectedSet.size === 0) {
    return { selectedCount: 0, selectedBytes: 0 };
  }
  let selectedCount = 0;
  let selectedBytes = 0;
  for (const item of list) {
    if (!item?.fullPath || !selectedSet.has(item.fullPath)) continue;
    selectedCount += 1;
    const size = Number(item.sizeBytes);
    if (Number.isFinite(size) && size > 0) {
      selectedBytes += size;
    }
  }
  return { selectedCount, selectedBytes };
}

/**
 * Returns selectable file paths in exact visual render order, skipping collapsed groups.
 */
export function getVisibleSelectablePaths(groupedDuplicates, collapsedGroups) {
  const groups = Array.isArray(groupedDuplicates) ? groupedDuplicates : [];
  const collapsed = collapsedGroups instanceof Set ? collapsedGroups : new Set();
  const paths = [];
  for (const group of groups) {
    if (!group || collapsed.has(group.groupId)) continue;
    for (const item of group.items || []) {
      if (item?.fullPath) paths.push(item.fullPath);
    }
  }
  return paths;
}

/**
 * Computes the next fullPath when stepping forward/backward inside the Lightbox.
 */
export function findNextPreviewPath(displayedItems, currentPath, delta) {
  const items = Array.isArray(displayedItems) ? displayedItems : [];
  if (items.length === 0) return null;
  const curIdx = items.findIndex((it) => it?.fullPath === currentPath);
  if (curIdx === -1) {
    return delta < 0 ? items[items.length - 1].fullPath : items[0].fullPath;
  }
  const nextIdx = (curIdx + delta + items.length) % items.length;
  return items[nextIdx]?.fullPath || null;
}

/**
 * Resolves the active bulk-selection preset ('all' | 'copies' | 'none' | 'custom') for displayed items.
 */
export function resolveDuplicateSelectionPreset(displayedItems, selectedPaths) {
  const items = Array.isArray(displayedItems) ? displayedItems : [];
  const selectedSet = selectedPaths instanceof Set ? selectedPaths : new Set();
  if (items.length === 0 || selectedSet.size === 0) return 'none';

  let validCount = 0;
  let selectedCount = 0;
  let suggestedCount = 0;
  let selectedSuggestedCount = 0;
  let selectedKeepCount = 0;

  for (const item of items) {
    if (!item?.fullPath) continue;
    validCount += 1;
    const isSel = selectedSet.has(item.fullPath);
    if (isSel) selectedCount += 1;
    const isSuggested = Boolean(item.isSuggestedForTrash) || !item.isOriginal;
    if (isSuggested) {
      suggestedCount += 1;
      if (isSel) selectedSuggestedCount += 1;
    } else if (isSel) {
      selectedKeepCount += 1;
    }
  }

  if (validCount === 0 || selectedCount === 0) return 'none';
  if (selectedCount === validCount) return 'all';
  if (suggestedCount > 0 && selectedSuggestedCount === suggestedCount && selectedKeepCount === 0) {
    return 'copies';
  }
  return 'custom';
}

