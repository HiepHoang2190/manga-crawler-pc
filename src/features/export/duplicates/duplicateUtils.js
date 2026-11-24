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

/**
 * Collects all unique group IDs from duplicate images into a Set for default collapse.
 */
export function collectAllGroupIds(items) {
  const ids = new Set();
  if (!Array.isArray(items)) return ids;
  for (const item of items) {
    if (item) {
      ids.add(item.duplicateGroup ?? 'ungrouped');
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
  let copyCount = 0;
  let selectedCopyCount = 0;
  let selectedOriginalCount = 0;

  for (const item of items) {
    if (!item?.fullPath) continue;
    validCount += 1;
    const isSel = selectedSet.has(item.fullPath);
    if (isSel) selectedCount += 1;
    if (item.isOriginal) {
      if (isSel) selectedOriginalCount += 1;
    } else {
      copyCount += 1;
      if (isSel) selectedCopyCount += 1;
    }
  }

  if (validCount === 0 || selectedCount === 0) return 'none';
  if (selectedCount === validCount) return 'all';
  if (copyCount > 0 && selectedCopyCount === copyCount && selectedOriginalCount === 0) {
    return 'copies';
  }
  return 'custom';
}

