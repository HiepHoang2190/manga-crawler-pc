import {
  normalizePathForCompare,
  removeDeletedFilesFromBuckets,
  removePathsAndDissolveGroups,
  compareDuplicatesFirst,
  toggleGroupCollapseInSet,
  getDuplicateGroupKey,
  collectAllGroupIds,
  applyDuplicateRangeSelection,
  computeSelectedDuplicateStats,
  getVisibleSelectablePaths,
  findNextPreviewPath,
  resolveDuplicateSelectionPreset,
} from './duplicateUtils.js';

describe('DuplicateFinder - Bucket State Updates on Deletion', () => {
  describe('normalizePathForCompare', () => {
    test('normalizes backslashes to forward slashes and converts to lowercase', () => {
      expect(normalizePathForCompare('F:\\LINH\\COMICS\\Chap 016\\019.webp')).toBe(
        'f:/linh/comics/chap 016/019.webp'
      );
      expect(normalizePathForCompare('F:/LINH/COMICS/Chap 016/019.webp')).toBe(
        'f:/linh/comics/chap 016/019.webp'
      );
    });

    test('handles empty or non-string input safely', () => {
      expect(normalizePathForCompare('')).toBe('');
      expect(normalizePathForCompare(null)).toBe('');
      expect(normalizePathForCompare(undefined)).toBe('');
    });
  });

  describe('removeDeletedFilesFromBuckets', () => {
    test('removes deleted files even when deletedPaths use Windows backslashes and fullPath uses forward slashes', () => {
      const prevBuckets = [
        {
          id: 'bucket-1',
          label: 'Chap 016',
          duplicateGroups: [
            {
              hash: 'hash-abc',
              files: [
                { fullPath: 'F:/LINH/COMICS/Chap 016/001.webp', name: '001.webp' },
                { fullPath: 'F:/LINH/COMICS/Chap 016/019.webp', name: '019.webp' },
              ],
            },
          ],
        },
      ];

      // Simulated return from Electron shell.trashItem or unlink on Windows (backslashes)
      const deletedList = ['F:\\LINH\\COMICS\\Chap 016\\019.webp'];

      const result = removeDeletedFilesFromBuckets(prevBuckets, deletedList);

      // The group had 2 files, one was deleted -> remainingFiles = 1 -> group dissolved
      // Bucket now has 0 duplicate groups -> bucket removed
      expect(result).toEqual([]);
    });

    test('keeps duplicate group when remainingFiles length is still > 1', () => {
      const prevBuckets = [
        {
          id: 'bucket-1',
          label: 'Chap 016',
          duplicateGroups: [
            {
              hash: 'hash-abc',
              files: [
                { fullPath: 'F:/LINH/COMICS/Chap 016/001.webp', name: '001.webp' },
                { fullPath: 'F:/LINH/COMICS/Chap 016/002.webp', name: '002.webp' },
                { fullPath: 'F:/LINH/COMICS/Chap 016/003.webp', name: '003.webp' },
              ],
            },
          ],
        },
      ];

      const deletedList = ['F:\\LINH\\COMICS\\Chap 016\\003.webp'];

      const result = removeDeletedFilesFromBuckets(prevBuckets, deletedList);

      expect(result.length).toBe(1);
      expect(result[0].duplicateGroups.length).toBe(1);
      expect(result[0].duplicateGroups[0].files.length).toBe(2);
      expect(result[0].duplicateGroups[0].files.map((f) => f.name)).toEqual([
        '001.webp',
        '002.webp',
      ]);
    });

    test('handles case-insensitivity on Windows drives correctly', () => {
      const prevBuckets = [
        {
          id: 'bucket-1',
          duplicateGroups: [
            {
              hash: 'hash-abc',
              files: [
                { fullPath: 'f:/linh/comics/001.webp', name: '001.webp' },
                { fullPath: 'f:/linh/comics/002.webp', name: '002.webp' },
              ],
            },
          ],
        },
      ];

      // uppercase drive and path returned
      const deletedList = ['F:\\LINH\\COMICS\\002.webp'];

      const result = removeDeletedFilesFromBuckets(prevBuckets, deletedList);
      expect(result).toEqual([]);
    });

    test('returns original buckets when deletedList is empty or invalid', () => {
      const prevBuckets = [{ id: 'b1', duplicateGroups: [] }];
      expect(removeDeletedFilesFromBuckets(prevBuckets, [])).toBe(prevBuckets);
      expect(removeDeletedFilesFromBuckets(prevBuckets, null)).toBe(prevBuckets);
    });
  });

  describe('toggleGroupCollapseInSet', () => {
    test('adds groupId to set when not present (collapses group)', () => {
      const initialSet = new Set();
      const updated = toggleGroupCollapseInSet(initialSet, 1);
      expect(updated.has(1)).toBe(true);
      expect(initialSet.has(1)).toBe(false); // immutable
    });

    test('removes groupId from set when present (expands group)', () => {
      const initialSet = new Set([1, 2]);
      const updated = toggleGroupCollapseInSet(initialSet, 1);
      expect(updated.has(1)).toBe(false);
      expect(updated.has(2)).toBe(true);
    });

    test('handles multiple group toggles independently', () => {
      let set = new Set();
      set = toggleGroupCollapseInSet(set, 'group-a');
      set = toggleGroupCollapseInSet(set, 'group-b');
      expect(Array.from(set)).toEqual(['group-a', 'group-b']);

      set = toggleGroupCollapseInSet(set, 'group-a');
      expect(Array.from(set)).toEqual(['group-b']);
    });
  });

  describe('collectAllGroupIds', () => {
    test('returns empty Set when items is empty or invalid', () => {
      expect(collectAllGroupIds([])).toEqual(new Set());
      expect(collectAllGroupIds(null)).toEqual(new Set());
      expect(collectAllGroupIds(undefined)).toEqual(new Set());
    });

    test('collects all unique duplicate group IDs', () => {
      const items = [
        { fullPath: '/a.jpg', duplicateGroup: 1 },
        { fullPath: '/b.jpg', duplicateGroup: 1 },
        { fullPath: '/c.jpg', duplicateGroup: 2 },
        { fullPath: '/d.jpg', duplicateGroup: 3 },
      ];
      const result = collectAllGroupIds(items);
      expect(result.size).toBe(3);
      expect(result.has(1)).toBe(true);
      expect(result.has(2)).toBe(true);
      expect(result.has(3)).toBe(true);
    });

    test('falls back to ungrouped when duplicateGroup is nullish', () => {
      const items = [
        { fullPath: '/a.jpg', duplicateGroup: null },
        { fullPath: '/b.jpg' },
      ];
      const result = collectAllGroupIds(items);
      expect(result.size).toBe(1);
      expect(result.has('ungrouped')).toBe(true);
    });
  });

  describe('applyDuplicateRangeSelection', () => {
    const visiblePaths = ['/a.jpg', '/b.jpg', '/c.jpg', '/d.jpg', '/e.jpg'];

    test('single click selects an unselected path and sets anchor', () => {
      const res = applyDuplicateRangeSelection({
        prevSelected: new Set(['/a.jpg']),
        visiblePaths,
        clickedIndex: 2,
        anchorIndex: null,
        anchorTargetSelected: true,
        shiftKey: false,
      });
      expect([...res.nextSelected].sort()).toEqual(['/a.jpg', '/c.jpg']);
      expect(res.nextAnchorIndex).toBe(2);
      expect(res.nextAnchorTargetSelected).toBe(true);
    });

    test('single click deselects an already-selected path and sets anchor target false', () => {
      const res = applyDuplicateRangeSelection({
        prevSelected: new Set(['/a.jpg', '/c.jpg', '/d.jpg']),
        visiblePaths,
        clickedIndex: 2,
        anchorIndex: 0,
        anchorTargetSelected: true,
        shiftKey: false,
      });
      expect([...res.nextSelected].sort()).toEqual(['/a.jpg', '/d.jpg']);
      expect(res.nextAnchorIndex).toBe(2);
      expect(res.nextAnchorTargetSelected).toBe(false);
    });

    test('Shift+click forward selects inclusive range while preserving outside selections', () => {
      const res = applyDuplicateRangeSelection({
        prevSelected: new Set(['/a.jpg', '/b.jpg']),
        visiblePaths,
        clickedIndex: 3,
        anchorIndex: 1,
        anchorTargetSelected: true,
        shiftKey: true,
      });
      expect([...res.nextSelected].sort()).toEqual(['/a.jpg', '/b.jpg', '/c.jpg', '/d.jpg']);
      expect(res.nextAnchorIndex).toBe(1);
      expect(res.nextAnchorTargetSelected).toBe(true);
    });

    test('Shift+click backward selects inclusive range', () => {
      const res = applyDuplicateRangeSelection({
        prevSelected: new Set(['/e.jpg']),
        visiblePaths,
        clickedIndex: 1,
        anchorIndex: 4,
        anchorTargetSelected: true,
        shiftKey: true,
      });
      expect([...res.nextSelected].sort()).toEqual(['/b.jpg', '/c.jpg', '/d.jpg', '/e.jpg']);
      expect(res.nextAnchorIndex).toBe(4);
      expect(res.nextAnchorTargetSelected).toBe(true);
    });

    test('Shift+click after deselecting anchor deselects range while preserving outside selections', () => {
      const res = applyDuplicateRangeSelection({
        prevSelected: new Set(visiblePaths),
        visiblePaths,
        clickedIndex: 3,
        anchorIndex: 1,
        anchorTargetSelected: false,
        shiftKey: true,
      });
      expect([...res.nextSelected].sort()).toEqual(['/a.jpg', '/e.jpg']);
      expect(res.nextAnchorIndex).toBe(1);
      expect(res.nextAnchorTargetSelected).toBe(false);
    });

    test('Shift+click with null or out-of-bounds anchor falls back to toggling clickedIndex', () => {
      const resNull = applyDuplicateRangeSelection({
        prevSelected: new Set(),
        visiblePaths,
        clickedIndex: 2,
        anchorIndex: null,
        anchorTargetSelected: true,
        shiftKey: true,
      });
      expect([...resNull.nextSelected]).toEqual(['/c.jpg']);
      expect(resNull.nextAnchorIndex).toBe(2);
      expect(resNull.nextAnchorTargetSelected).toBe(true);

      const resOob = applyDuplicateRangeSelection({
        prevSelected: new Set(['/c.jpg']),
        visiblePaths,
        clickedIndex: 2,
        anchorIndex: 99,
        anchorTargetSelected: true,
        shiftKey: true,
      });
      expect([...resOob.nextSelected]).toEqual([]);
      expect(resOob.nextAnchorIndex).toBe(2);
      expect(resOob.nextAnchorTargetSelected).toBe(false);
    });

    test('out-of-bounds clickedIndex returns cloned set without throwing', () => {
      const prev = new Set(['/a.jpg']);
      const res = applyDuplicateRangeSelection({
        prevSelected: prev,
        visiblePaths,
        clickedIndex: -1,
        anchorIndex: 0,
        anchorTargetSelected: true,
        shiftKey: true,
      });
      expect(res.nextSelected).not.toBe(prev);
      expect([...res.nextSelected]).toEqual(['/a.jpg']);
      expect(res.nextAnchorIndex).toBe(0);
    });
  });

  describe('computeSelectedDuplicateStats', () => {
    test('sums selectedCount and selectedBytes only for matching items in list', () => {
      const items = [
        { fullPath: '/a.jpg', sizeBytes: 1024 },
        { fullPath: '/b.jpg', sizeBytes: 2048 },
        { fullPath: '/c.jpg', sizeBytes: 512 },
      ];
      const selected = new Set(['/b.jpg', '/c.jpg', '/missing.jpg']);
      expect(computeSelectedDuplicateStats(items, selected)).toEqual({
        selectedCount: 2,
        selectedBytes: 2560,
      });
    });

    test('handles invalid sizeBytes, empty arrays, and non-Set inputs gracefully', () => {
      const items = [
        { fullPath: '/a.jpg', sizeBytes: null },
        { fullPath: '/b.jpg', sizeBytes: NaN },
        { fullPath: '/c.jpg', sizeBytes: 100 },
      ];
      expect(computeSelectedDuplicateStats(items, new Set(['/a.jpg', '/b.jpg', '/c.jpg']))).toEqual({
        selectedCount: 3,
        selectedBytes: 100,
      });
      expect(computeSelectedDuplicateStats(null, new Set(['/a.jpg']))).toEqual({
        selectedCount: 0,
        selectedBytes: 0,
      });
      expect(computeSelectedDuplicateStats(items, null)).toEqual({
        selectedCount: 0,
        selectedBytes: 0,
      });
    });
  });

  describe('getVisibleSelectablePaths', () => {
    test('returns paths in visual group order and skips collapsed groups', () => {
      const grouped = [
        { groupId: 1, items: [{ fullPath: '/g1-a.jpg' }, { fullPath: '/g1-b.jpg' }] },
        { groupId: 2, items: [{ fullPath: '/g2-a.jpg' }, { fullPath: '/g2-b.jpg' }] },
        { groupId: 3, items: [{ fullPath: '/g3-a.jpg' }] },
      ];
      const collapsed = new Set([2]);
      expect(getVisibleSelectablePaths(grouped, collapsed)).toEqual([
        '/g1-a.jpg',
        '/g1-b.jpg',
        '/g3-a.jpg',
      ]);
    });
  });

  describe('findNextPreviewPath', () => {
    test('wraps forward/backward and handles deselected current item safely', () => {
      const items = [{ fullPath: '/a.jpg' }, { fullPath: '/b.jpg' }, { fullPath: '/c.jpg' }];
      expect(findNextPreviewPath(items, '/a.jpg', -1)).toBe('/c.jpg');
      expect(findNextPreviewPath(items, '/c.jpg', 1)).toBe('/a.jpg');
      expect(findNextPreviewPath(items, '/removed.jpg', 1)).toBe('/a.jpg');
      expect(findNextPreviewPath(items, '/removed.jpg', -1)).toBe('/c.jpg');
      expect(findNextPreviewPath([], '/a.jpg', 1)).toBeNull();
    });
  });

  describe('resolveDuplicateSelectionPreset', () => {
    const items = [
      { fullPath: '/orig.jpg', isOriginal: true },
      { fullPath: '/copy1.jpg', isOriginal: false },
      { fullPath: '/copy2.jpg', isOriginal: false },
    ];

    test('returns "none" when list is empty or nothing is selected', () => {
      expect(resolveDuplicateSelectionPreset([], new Set(['/orig.jpg']))).toBe('none');
      expect(resolveDuplicateSelectionPreset(items, new Set())).toBe('none');
      expect(resolveDuplicateSelectionPreset(items, new Set(['/other.jpg']))).toBe('none');
    });

    test('returns "all" when every displayed item is selected', () => {
      expect(
        resolveDuplicateSelectionPreset(items, new Set(['/orig.jpg', '/copy1.jpg', '/copy2.jpg']))
      ).toBe('all');
    });

    test('returns "copies" when all non-originals are selected and zero originals are selected', () => {
      expect(resolveDuplicateSelectionPreset(items, new Set(['/copy1.jpg', '/copy2.jpg']))).toBe(
        'copies'
      );
    });

    test('returns "custom" for arbitrary partial subsets', () => {
      expect(resolveDuplicateSelectionPreset(items, new Set(['/orig.jpg', '/copy1.jpg']))).toBe(
        'custom'
      );
      expect(resolveDuplicateSelectionPreset(items, new Set(['/copy1.jpg']))).toBe('custom');
      expect(resolveDuplicateSelectionPreset(items, new Set(['/orig.jpg']))).toBe('custom');
    });

    test('prefers "all" over "copies" when all displayed items are copies or originals', () => {
      const onlyCopies = [
        { fullPath: '/c1.jpg', isOriginal: false },
        { fullPath: '/c2.jpg', isOriginal: false },
      ];
      expect(resolveDuplicateSelectionPreset(onlyCopies, new Set(['/c1.jpg', '/c2.jpg']))).toBe(
        'all'
      );
    });

    test('smartMode: getDuplicateGroupKey maps smart categories into semantic groups and preset detects suggested trash', () => {
      const smartItems = [
        { fullPath: '/orig.jpg', isOriginal: true, duplicateGroup: 1, category: 'DUPLICATE', isSuggestedForTrash: false },
        { fullPath: '/copy.jpg', isOriginal: false, duplicateGroup: 1, category: 'DUPLICATE', isSuggestedForTrash: true },
        { fullPath: '/qr.jpg', isOriginal: false, duplicateGroup: null, category: 'QR_CODE', isSuggestedForTrash: true },
        { fullPath: '/blank.jpg', isOriginal: false, duplicateGroup: null, category: 'BLANK_PAGE', isSuggestedForTrash: true },
      ];
      expect(getDuplicateGroupKey(smartItems[0])).toBe(1);
      expect(getDuplicateGroupKey(smartItems[2])).toBe('smart:QR_CODE');
      expect(collectAllGroupIds(smartItems)).toEqual(new Set([1, 'smart:QR_CODE', 'smart:BLANK_PAGE']));
      expect(
        resolveDuplicateSelectionPreset(smartItems, new Set(['/copy.jpg', '/qr.jpg', '/blank.jpg']))
      ).toBe('copies');
    });

    test('compareDuplicatesFirst enforces strictly transitive ordering without interleaving smart & duplicate groups', () => {
      const mixed = [
        { fullPath: '/g2_orig.jpg', name: '010.jpg', duplicateGroup: 2, isOriginal: true },
        { fullPath: '/g1_copy.jpg', name: '003.jpg', duplicateGroup: 1, isOriginal: false },
        { fullPath: '/blank.jpg', name: '002.jpg', duplicateGroup: null, category: 'BLANK_PAGE' },
        { fullPath: '/qr.jpg', name: '099.jpg', duplicateGroup: null, category: 'QR_CODE' },
        { fullPath: '/g1_orig.jpg', name: '005.jpg', duplicateGroup: 1, isOriginal: true },
      ];
      mixed.sort(compareDuplicatesFirst);
      expect(mixed.map((m) => m.fullPath)).toEqual([
        '/qr.jpg',
        '/blank.jpg',
        '/g1_orig.jpg',
        '/g1_copy.jpg',
        '/g2_orig.jpg',
      ]);
    });

    test('removePathsAndDissolveGroups dissolves 1-file numeric duplicate groups while preserving smart trash items', () => {
      const items = [
        { fullPath: 'C:/manga/g1_orig.jpg', duplicateGroup: 1, isOriginal: true },
        { fullPath: 'C:/manga/g1_copy.jpg', duplicateGroup: 1, isOriginal: false },
        { fullPath: 'C:/manga/blank1.jpg', duplicateGroup: null, category: 'BLANK_PAGE', isSuggestedForTrash: true },
        { fullPath: 'C:/manga/blank2.jpg', duplicateGroup: null, category: 'BLANK_PAGE', isSuggestedForTrash: true },
      ];
      const next = removePathsAndDissolveGroups(items, ['c:\\manga\\g1_copy.jpg', 'C:/manga/blank1.jpg']);
      expect(next.map((i) => i.fullPath)).toEqual(['C:/manga/blank2.jpg']);
    });
  });
});
