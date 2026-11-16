import { describe, it, expect } from '@jest/globals';
import {
  extractScanlationGroups,
  filterChaptersByGroup,
  dedupeChaptersByNumber,
} from '../chapterGroupUtils.js';

describe('chapterGroupUtils', () => {
  const sampleChapters = [
    {
      url: 'https://mangadex.org/chapter/ch6-group1',
      title: 'Chapter 6 - Em họ và cơn mưa rào <:3 {Dịch giả Miền Tây}',
    },
    {
      url: 'https://mangadex.org/chapter/ch5-group1',
      title: 'Chapter 5 - Con trai? <:3 {Dịch giả Miền Tây}',
    },
    {
      url: 'https://mangadex.org/chapter/ch5-group2',
      title: 'Chapter 5 - Con trai? {Dịch vì đam mê}',
    },
    {
      url: 'https://mangadex.org/chapter/ch4-group1',
      title: 'Chapter 4 - Em họ và lễ hội mùa hè (Phần 2) <:3 {Dịch giả Miền Tây}',
    },
    {
      url: 'https://mangadex.org/chapter/ch4-group2',
      title: 'Chapter 4 - Em họ và lễ hội hè (Phần 2) {Dịch vì đam mê}',
    },
    {
      url: 'https://mangadex.org/chapter/ch3-group1',
      title: 'Chapter 3 - Em họ và lễ hội mùa hè (Phần 1) >:3 {Dịch giả Miền Tây}',
    },
    {
      url: 'https://mangadex.org/chapter/ch3-group2',
      title: 'Chapter 3 - Em họ và lễ hội hè (Phần 1) {Dịch vì đam mê}',
    },
    {
      url: 'https://mangadex.org/chapter/ch2-group1',
      title: 'Chapter 2 - Biển và cô em họ <:3 {Dịch giả Miền Tây}',
    },
    {
      url: 'https://mangadex.org/chapter/ch2-group2',
      title: 'Chapter 2 - Biển và em họ {Dịch vì đam mê}',
    },
    {
      url: 'https://mangadex.org/chapter/ch1-group1',
      title: 'Chapter 1 - Anh thích em đúng không? <:3 {Dịch giả Miền Tây}',
    },
    {
      url: 'https://mangadex.org/chapter/ch1-group2',
      title: 'Chapter 1 - Anh thích em đúng hông? {Dịch vì đam mê}',
    },
    {
      url: 'https://mangadex.org/chapter/ch0-nogroup',
      title: 'Oneshot - Lời mở đầu',
    },
  ];

  describe('extractScanlationGroups', () => {
    it('returns empty groups array for empty or invalid input', () => {
      expect(extractScanlationGroups([])).toEqual([]);
      expect(extractScanlationGroups(null)).toEqual([]);
    });

    it('extracts all unique groups sorted by chapter count descending', () => {
      const groups = extractScanlationGroups(sampleChapters);
      expect(groups).toHaveLength(4); // all, Dịch giả Miền Tây (6), Dịch vì đam mê (5), no-group (1)
      expect(groups[0]).toEqual({
        id: 'all',
        label: 'Tất cả nhóm dịch',
        count: 12,
      });
      expect(groups[1]).toEqual({
        id: 'Dịch giả Miền Tây',
        label: 'Dịch giả Miền Tây',
        count: 6,
      });
      expect(groups[2]).toEqual({
        id: 'Dịch vì đam mê',
        label: 'Dịch vì đam mê',
        count: 5,
      });
      expect(groups[3]).toEqual({
        id: '__no_group__',
        label: 'Không rõ nhóm dịch',
        count: 1,
      });
    });
  });

  describe('filterChaptersByGroup', () => {
    it('returns all chapters when group is "all" or null', () => {
      expect(filterChaptersByGroup(sampleChapters, 'all')).toEqual(sampleChapters);
      expect(filterChaptersByGroup(sampleChapters, null)).toEqual(sampleChapters);
    });

    it('filters strictly by specific group', () => {
      const filtered = filterChaptersByGroup(sampleChapters, 'Dịch vì đam mê');
      expect(filtered).toHaveLength(5);
      expect(filtered.every((ch) => ch.title.includes('{Dịch vì đam mê}'))).toBe(true);
    });

    it('filters chapters without a group when selecting __no_group__', () => {
      const filtered = filterChaptersByGroup(sampleChapters, '__no_group__');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].title).toBe('Oneshot - Lời mở đầu');
    });
  });

  describe('dedupeChaptersByNumber', () => {
    it('deduplicates chapters sharing the same chapter number, picking the majority group by default', () => {
      const deduped = dedupeChaptersByNumber(sampleChapters);
      // Dịch giả Miền Tây has 6 chapters, Dịch vì đam mê has 5 chapters.
      // So chapters 1-5 should pick Dịch giả Miền Tây, chapter 6 is Dịch giả Miền Tây, and Oneshot is kept.
      // Total deduped should be 7 chapters (Chap 6, 5, 4, 3, 2, 1, Oneshot).
      expect(deduped).toHaveLength(7);

      const urls = deduped.map((c) => c.url);
      expect(urls).toContain('https://mangadex.org/chapter/ch6-group1');
      expect(urls).toContain('https://mangadex.org/chapter/ch5-group1');
      expect(urls).not.toContain('https://mangadex.org/chapter/ch5-group2');
      expect(urls).toContain('https://mangadex.org/chapter/ch1-group1');
      expect(urls).not.toContain('https://mangadex.org/chapter/ch1-group2');
      expect(urls).toContain('https://mangadex.org/chapter/ch0-nogroup');
    });

    it('deduplicates picking preferred group when specified', () => {
      const deduped = dedupeChaptersByNumber(sampleChapters, 'Dịch vì đam mê');
      expect(deduped).toHaveLength(7);

      const urls = deduped.map((c) => c.url);
      // For Chap 1-5, preferred group is Dịch vì đam mê
      expect(urls).toContain('https://mangadex.org/chapter/ch5-group2');
      expect(urls).not.toContain('https://mangadex.org/chapter/ch5-group1');
      expect(urls).toContain('https://mangadex.org/chapter/ch1-group2');
      expect(urls).not.toContain('https://mangadex.org/chapter/ch1-group1');
      // Chap 6 only exists in Dịch giả Miền Tây, so it is kept as fallback!
      expect(urls).toContain('https://mangadex.org/chapter/ch6-group1');
      expect(urls).toContain('https://mangadex.org/chapter/ch0-nogroup');
    });

    it('distinguishes chapters with the same chapter number in different volumes', () => {
      const multiVolChapters = [
        {
          url: 'https://example.com/v1-ch1-g1',
          title: 'Vol 1 Chapter 1 {Group A}',
          volume: '1',
        },
        {
          url: 'https://example.com/v1-ch1-g2',
          title: 'Vol 1 Chapter 1 {Group B}',
          volume: '1',
        },
        {
          url: 'https://example.com/v2-ch1-g1',
          title: 'Vol 2 Chapter 1 {Group A}',
          volume: '2',
        },
      ];

      const deduped = dedupeChaptersByNumber(multiVolChapters);
      expect(deduped).toHaveLength(2);
      const urls = deduped.map((c) => c.url);
      expect(urls).toContain('https://example.com/v1-ch1-g1');
      expect(urls).not.toContain('https://example.com/v1-ch1-g2');
      expect(urls).toContain('https://example.com/v2-ch1-g1');
    });

    it('accurately deduplicates Volume 1 with multiple translation groups to 6 unique chapters', () => {
      const volume1Chapters = [
        { url: 'https://mangadex.org/chapter/6', title: 'Chapter 6 - Em họ và cơn mưa rào <:3 (Vol 1) [vi] {Dịch giả Miền Tây}', volume: '1' },
        { url: 'https://mangadex.org/chapter/5-g1', title: 'Chapter 5 - Con trai  3 (Vol 1) [vi] {Dịch giả Miền Tây}', volume: '1' },
        { url: 'https://mangadex.org/chapter/5-g2', title: 'Chapter 5 - Con trai (Vol 1) [vi] {Dịch vì đam mê}', volume: '1' },
        { url: 'https://mangadex.org/chapter/4-g1', title: 'Chapter 4 - Em họ và lễ hội mùa hè (Phần 2)  3 (Vol 1) [vi] {Dịch giả Miền Tây}', volume: '1' },
        { url: 'https://mangadex.org/chapter/4-g2', title: 'Chapter 4 - Em họ và lễ hội hè (Phần 2) (Vol 1) [vi] {Dịch vì đam mê}', volume: '1' },
        { url: 'https://mangadex.org/chapter/3-g1', title: 'Chapter 3 - Em họ và lễ hội mùa hè (Phần 1)  3 (Vol 1) [vi] {Dịch giả Miền Tây}', volume: '1' },
        { url: 'https://mangadex.org/chapter/3-g2', title: 'Chapter 3 - Em họ và lễ hội hè (Phần 1) (Vol 1) [vi] {Dịch vì đam mê}', volume: '1' },
        { url: 'https://mangadex.org/chapter/2-g1', title: 'Chapter 2 - Biển và cô em họ  3 (Vol 1) [vi] {Dịch giả Miền Tây}', volume: '1' },
        { url: 'https://mangadex.org/chapter/2-g2', title: 'Chapter 2 - Biển và em họ (Vol 1) [vi] {Dịch vì đam mê}', volume: '1' },
        { url: 'https://mangadex.org/chapter/1-g1', title: 'Chapter 1 - Anh thích em đúng không  3 (Vol 1) [vi] {Dịch giả Miền Tây}', volume: '1' },
        { url: 'https://mangadex.org/chapter/1-g2', title: 'Chapter 1 - Anh thích em đúng hông (Vol 1) [vi] {Dịch vì đam mê}', volume: '1' },
      ];

      const deduped = dedupeChaptersByNumber(volume1Chapters);
      expect(deduped).toHaveLength(6);
      const urls = deduped.map((c) => c.url);
      expect(urls).toEqual([
        'https://mangadex.org/chapter/6',
        'https://mangadex.org/chapter/5-g1',
        'https://mangadex.org/chapter/4-g1',
        'https://mangadex.org/chapter/3-g1',
        'https://mangadex.org/chapter/2-g1',
        'https://mangadex.org/chapter/1-g1',
      ]);
    });
  });
});
