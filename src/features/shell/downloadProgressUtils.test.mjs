import {
  computeQueueTaskbarProgress,
  summarizeQueueCompletion,
  shouldNotifyQueueCompletion,
} from './downloadProgressUtils.mjs';

describe('downloadProgressUtils', () => {
  const sampleQueue = [
    {
      id: 'g1',
      chapters: [
        { status: 'done' },
        { status: 'downloading' },
        { status: 'waiting' },
        { status: 'waiting' },
      ],
    },
  ];

  test('returns inactive (-1) when queue is not processing or empty', () => {
    expect(computeQueueTaskbarProgress(sampleQueue, null, false)).toMatchObject({
      active: false,
      ratio: -1,
      mode: 'none',
      doneChapters: 1,
      totalChapters: 4,
    });
    expect(computeQueueTaskbarProgress([], null, true)).toMatchObject({
      active: false,
      ratio: -1,
      mode: 'none',
      totalChapters: 0,
    });
  });

  test('computes rounded 2-decimal ratio combining completed chapters and active page fraction', () => {
    const res = computeQueueTaskbarProgress(sampleQueue, { current: 5, total: 10 }, true);
    // (1 done + 0.5 page) / 4 = 0.375 -> rounded to 0.38
    expect(res.active).toBe(true);
    expect(res.ratio).toBe(0.38);
    expect(res.percent).toBe(38);
    expect(res.mode).toBe('normal');
  });

  test('switches taskbar mode to error when failed chapters exist', () => {
    const errQueue = [{ id: 'g1', chapters: [{ status: 'error' }, { status: 'waiting' }] }];
    const res = computeQueueTaskbarProgress(errQueue, null, true);
    expect(res.mode).toBe('error');
    expect(res.errorChapters).toBe(1);
    expect(res.ratio).toBe(0.5);
  });

  test('summarizeQueueCompletion aggregates totals including waiting chapters', () => {
    const q = [
      { id: '1', chapters: [{ status: 'done' }, { status: 'skipped' }] },
      { id: '2', chapters: [{ status: 'error' }, { status: 'waiting' }] },
      { id: '3', chapters: [] },
    ];
    expect(summarizeQueueCompletion(q)).toEqual({
      mangaCount: 2,
      total: 4,
      done: 1,
      errors: 1,
      skipped: 1,
      downloading: 0,
      waiting: 1,
    });
  });

  test('shouldNotifyQueueCompletion suppresses notification on manual Stop or unchanged previous done chapters', () => {
    // Manual stop while waiting chapters remain
    expect(
      shouldNotifyQueueCompletion(
        { done: 0, errors: 0 },
        { done: 4, errors: 0, waiting: 16, downloading: 0 }
      )
    ).toEqual({ notify: false, deltaDone: 4, deltaErrors: 0 });

    // Start & immediate stop with zero new completed chapters
    expect(
      shouldNotifyQueueCompletion(
        { done: 5, errors: 0 },
        { done: 5, errors: 0, waiting: 0, downloading: 0 }
      )
    ).toEqual({ notify: false, deltaDone: 0, deltaErrors: 0 });

    // Genuine batch completion
    expect(
      shouldNotifyQueueCompletion(
        { done: 5, errors: 0 },
        { done: 8, errors: 1, waiting: 0, downloading: 0 }
      )
    ).toEqual({ notify: true, deltaDone: 3, deltaErrors: 1 });
  });
});
