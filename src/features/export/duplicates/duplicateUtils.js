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

