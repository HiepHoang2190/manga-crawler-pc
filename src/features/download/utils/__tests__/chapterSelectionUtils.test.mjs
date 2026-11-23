import {
  extractPrimaryChapterNumber,
  parseChapterRangeSelection,
  filterChaptersByQuery,
  selectUndownloadedChapterUrls,
} from '../chapterSelectionUtils.mjs';

describe('chapterSelectionUtils', () => {
  const sampleChapters = [
    { title: 'Chapter 1: Khởi đầu', url: 'https://example.com/c1', volume: '1' },
    { title: 'Chap 2 - Cuộc gặp', url: 'https://example.com/c2', volume: '1' },
    { title: 'Chương 3.5: Ngoại truyện', url: 'https://example.com/c3.5', volume: '1' },
    { title: 'Ch. 10: Cao trào', url: 'https://example.com/c10', volume: '2' },
    { title: 'Special Oneshot', url: 'https://example.com/oneshot', volume: '2' },
  ];

  test('extractPrimaryChapterNumber extracts integers and decimals cleanly', () => {
    expect(extractPrimaryChapterNumber('Chapter 12: Hello')).toBe(12);
    expect(extractPrimaryChapterNumber('Chap 004')).toBe(4);
    expect(extractPrimaryChapterNumber('Chương 12.5 - Bonus')).toBe(12.5);
    expect(extractPrimaryChapterNumber('Ch. 7')).toBe(7);
    expect(extractPrimaryChapterNumber('Special Oneshot')).toBeNull();
    expect(extractPrimaryChapterNumber('')).toBeNull();
  });

  test('parseChapterRangeSelection parses ranges, reversed ranges, decimals, and fallback indices', () => {
    expect(parseChapterRangeSelection('', sampleChapters)).toEqual([]);
    expect(parseChapterRangeSelection('   ', sampleChapters)).toEqual([]);

    // Match 1-3 -> c1, c2; decimal 3.5 -> c3.5; single 10 -> c10
    expect(parseChapterRangeSelection('1-3, 3.5, 10', sampleChapters)).toEqual([
      'https://example.com/c1',
      'https://example.com/c2',
      'https://example.com/c3.5',
      'https://example.com/c10',
    ]);

    // Reversed range 10-1 includes c2, c3.5, c10 and c1
    expect(parseChapterRangeSelection('10-2', sampleChapters)).toEqual([
      'https://example.com/c2',
      'https://example.com/c3.5',
      'https://example.com/c10',
    ]);

    // Oneshot (index 5 in 1-based list) has no chapter number -> fallback 1-based position 5
    expect(parseChapterRangeSelection('5', sampleChapters)).toEqual([
      'https://example.com/oneshot',
    ]);
  });

  test('filterChaptersByQuery matches title and volume diacritic-insensitively', () => {
    expect(filterChaptersByQuery(sampleChapters, '')).toEqual(sampleChapters);
    expect(filterChaptersByQuery(sampleChapters, 'khoi dau')).toEqual([sampleChapters[0]]);
    expect(filterChaptersByQuery(sampleChapters, 'ngoai truyen')).toEqual([sampleChapters[2]]);
    expect(filterChaptersByQuery(sampleChapters, 'oneshot')).toEqual([sampleChapters[4]]);
  });

  test('selectUndownloadedChapterUrls selects only pending chapters', () => {
    const statusMap = {
      'https://example.com/c1': 'completed',
      'https://example.com/c2': 'queued',
      'https://example.com/c3.5': 'pending',
      'https://example.com/c10': 'inProgress',
      'https://example.com/oneshot': 'pending',
    };
    expect(selectUndownloadedChapterUrls(sampleChapters, (ch) => statusMap[ch.url])).toEqual([
      'https://example.com/c3.5',
      'https://example.com/oneshot',
    ]);
  });
});
