import {
  extractPrimaryChapterNumber,
  parseChapterRangeSelection,
  filterChaptersByQuery,
  selectUndownloadedChapterUrls,
  buildQueueChapterStatusMap,
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

  test('buildQueueChapterStatusMap treats failed done chapters as error and merges matching manga groups by priority', () => {
    const queue = [
      {
        id: 'g1',
        mangaUrl: 'https://example.com/manga ',
        chapters: [
          { chapterUrl: 'https://example.com/c1', status: 'done' },
          { chapterUrl: 'https://example.com/c2', status: 'done', downloadError: 'HTTP 502' },
          { chapterUrl: 'https://example.com/c3.5', status: 'failed', downloadError: 'Timeout' },
        ],
      },
      {
        id: 'g2',
        mangaUrl: 'https://example.com/manga',
        chapters: [
          { chapterUrl: 'https://example.com/c2', status: 'waiting' },
          { chapterUrl: 'https://example.com/c10', status: 'downloading' },
        ],
      },
      {
        id: 'g-other',
        mangaUrl: 'https://example.com/other',
        chapters: [
          { chapterUrl: 'https://example.com/oneshot', status: 'done' },
        ],
      },
    ];

    const map = buildQueueChapterStatusMap(queue, 'https://example.com/manga');
    expect(map.get('https://example.com/c1')).toBe('done');
    // Second group is actively waiting retry -> waiting takes priority over stale error
    expect(map.get('https://example.com/c2')).toBe('waiting');
    // Failed chapter must resolve to 'error' (not 'done') so undownloaded selection picks it up
    expect(map.get('https://example.com/c3.5')).toBe('error');
    expect(map.get('https://example.com/c10')).toBe('downloading');
    expect(map.has('https://example.com/oneshot')).toBe(false);

    // Failed chapter with done+downloadError in single group resolves to 'error' -> rowStatusKey === 'pending'
    const singleGroupMap = buildQueueChapterStatusMap(
      [
        {
          id: 'g-err',
          mangaUrl: 'https://example.com/manga',
          chapters: [{ chapterUrl: 'https://example.com/c2', status: 'done', downloadError: '404' }],
        },
      ],
      'https://example.com/manga'
    );
    expect(singleGroupMap.get('https://example.com/c2')).toBe('error');

    // Priority preservation when lower-priority statuses appear AFTER higher-priority ones
    const priorityMap = buildQueueChapterStatusMap(
      [
        {
          id: 'g-high',
          mangaUrl: 'https://example.com/manga',
          chapters: [
            { chapterUrl: ' https://example.com/c1 ', status: 'downloading' },
            { chapterUrl: 'https://example.com/c2', status: 'done' },
            { chapterUrl: '   ', status: 'done' },
          ],
        },
        {
          id: 'g-low',
          mangaUrl: 'https://example.com/manga',
          chapters: [
            { chapterUrl: 'https://example.com/c1', status: 'done' },
            { chapterUrl: 'https://example.com/c2', status: 'waiting' },
            { chapterUrl: 'https://example.com/c2', status: 'error' },
          ],
        },
      ],
      'https://example.com/manga'
    );
    expect(priorityMap.get('https://example.com/c1')).toBe('downloading');
    expect(priorityMap.get('https://example.com/c2')).toBe('done');
    expect(priorityMap.has('   ')).toBe(false);

    // Safe empty/null inputs
    expect(buildQueueChapterStatusMap(null, 'https://example.com/manga').size).toBe(0);
    expect(buildQueueChapterStatusMap([], '').size).toBe(0);
  });
});
