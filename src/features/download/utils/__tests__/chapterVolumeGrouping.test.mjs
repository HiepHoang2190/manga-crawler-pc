import {
  hasVolumeData,
  groupChaptersByVolume,
} from '../chapterVolumeGrouping.js';

describe('chapterVolumeGrouping', () => {
  describe('hasVolumeData', () => {
    test('returns false for empty, null, or undefined chapters', () => {
      expect(hasVolumeData(null)).toBe(false);
      expect(hasVolumeData(undefined)).toBe(false);
      expect(hasVolumeData([])).toBe(false);
    });

    test('returns false when no chapter has volume', () => {
      const chapters = [
        { url: 'u1', title: 'Chapter 1' },
        { url: 'u2', title: 'Chapter 2', volume: null },
        { url: 'u3', title: 'Chapter 3', volume: '' },
      ];
      expect(hasVolumeData(chapters)).toBe(false);
    });

    test('returns true when at least one chapter has volume', () => {
      const chapters = [
        { url: 'u1', title: 'Chapter 1', volume: '1' },
        { url: 'u2', title: 'Chapter 2', volume: null },
      ];
      expect(hasVolumeData(chapters)).toBe(true);
    });
  });

  describe('groupChaptersByVolume', () => {
    test('groups chapters by volume and places no_volume at the end', () => {
      const chapters = [
        { url: 'u1', title: 'Ch 1', volume: '1' },
        { url: 'u2', title: 'Ch 2', volume: '1' },
        { url: 'u3', title: 'Ch 10', volume: '2' },
        { url: 'u4', title: 'Ch 20', volume: '10' },
        { url: 'u5', title: 'Extra', volume: null },
      ];

      const groups = groupChaptersByVolume(chapters);
      expect(groups).toHaveLength(4);

      // Volume 1
      expect(groups[0].key).toBe('vol_1');
      expect(groups[0].volume).toBe('1');
      expect(groups[0].chapters).toHaveLength(2);
      expect(groups[0].totalCount).toBe(2);

      // Volume 2
      expect(groups[1].key).toBe('vol_2');
      expect(groups[1].volume).toBe('2');
      expect(groups[1].chapters).toHaveLength(1);

      // Volume 10
      expect(groups[2].key).toBe('vol_10');
      expect(groups[2].volume).toBe('10');
      expect(groups[2].chapters).toHaveLength(1);

      // No volume
      expect(groups[3].key).toBe('no_volume');
      expect(groups[3].volume).toBeNull();
      expect(groups[3].chapters).toHaveLength(1);
      expect(groups[3].chapters[0].title).toBe('Extra');
    });

    test('supports desc order for volumes', () => {
      const chapters = [
        { url: 'u1', title: 'Ch 1', volume: '1' },
        { url: 'u2', title: 'Ch 10', volume: '2' },
        { url: 'u3', title: 'Ch 20', volume: '10' },
        { url: 'u4', title: 'Extra', volume: null },
      ];

      const groups = groupChaptersByVolume(chapters, { sortDirection: 'desc' });
      expect(groups[0].volume).toBe('10');
      expect(groups[1].volume).toBe('2');
      expect(groups[2].volume).toBe('1');
      // No volume is still at the end
      expect(groups[3].key).toBe('no_volume');
    });

    test('handles chapters when all belong to no_volume', () => {
      const chapters = [
        { url: 'u1', title: 'Ch 1' },
        { url: 'u2', title: 'Ch 2' },
      ];
      const groups = groupChaptersByVolume(chapters);
      expect(groups).toHaveLength(1);
      expect(groups[0].key).toBe('no_volume');
      expect(groups[0].chapters).toHaveLength(2);
    });
  });
});
