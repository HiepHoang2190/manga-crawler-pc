import {
  normalizePathForCompare,
  removeDeletedFilesFromBuckets,
  toggleGroupCollapseInSet,
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
});
