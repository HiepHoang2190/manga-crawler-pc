import {
  DASHBOARD_TREND_DAYS_KEY,
  loadDashboardTrendDays,
  saveDashboardTrendDays,
  extractPathBasename,
  resolveTargetChapterIndex,
  computeHorizontalWheelDelta,
} from './dashboardPrefs.mjs';

describe('dashboardPrefs helpers', () => {
  const createMemoryStorage = (initial = {}) => {
    const map = new Map(Object.entries(initial));
    return {
      getItem: (key) => (map.has(key) ? map.get(key) : null),
      setItem: (key, val) => map.set(key, String(val)),
    };
  };

  test('exports expected storage key', () => {
    expect(DASHBOARD_TREND_DAYS_KEY).toBe('dashboard_trend_days_v1');
  });

  test('loadDashboardTrendDays defaults to 30 and accepts valid 7/30 values only', () => {
    expect(loadDashboardTrendDays(createMemoryStorage())).toBe(30);
    expect(loadDashboardTrendDays(createMemoryStorage({ [DASHBOARD_TREND_DAYS_KEY]: '7' }))).toBe(7);
    expect(loadDashboardTrendDays(createMemoryStorage({ [DASHBOARD_TREND_DAYS_KEY]: '30' }))).toBe(30);
    expect(loadDashboardTrendDays(createMemoryStorage({ [DASHBOARD_TREND_DAYS_KEY]: '14' }))).toBe(30);
    expect(loadDashboardTrendDays(createMemoryStorage({ [DASHBOARD_TREND_DAYS_KEY]: 'abc' }))).toBe(30);
    expect(
      loadDashboardTrendDays({
        getItem: () => {
          throw new Error('storage disabled');
        },
      })
    ).toBe(30);
  });

  test('saveDashboardTrendDays validates 7/30 and ignores throwing storage', () => {
    const storage = createMemoryStorage();
    saveDashboardTrendDays(7, storage);
    expect(loadDashboardTrendDays(storage)).toBe(7);
    saveDashboardTrendDays('30', storage);
    expect(loadDashboardTrendDays(storage)).toBe(30);
    saveDashboardTrendDays(14, storage);
    expect(loadDashboardTrendDays(storage)).toBe(30);
    expect(() =>
      saveDashboardTrendDays(7, {
        setItem: () => {
          throw new Error('quota exceeded');
        },
      })
    ).not.toThrow();
  });

  test('extractPathBasename extracts leaf folder name across POSIX and Windows paths', () => {
    expect(extractPathBasename('/Users/admin/Downloads/Manga')).toBe('Manga');
    expect(extractPathBasename('/Users/admin/Downloads/Manga///')).toBe('Manga');
    expect(extractPathBasename('C:\\Games\\Manga Downloads\\')).toBe('Manga Downloads');
    expect(extractPathBasename('')).toBe('');
    expect(extractPathBasename('   ')).toBe('');
    expect(extractPathBasename(null)).toBe('');
  });

  test('resolveTargetChapterIndex prefers exact URL, normalized URL/title/folder, chapter number, then 0', () => {
    const chapters = [
      { title: 'Chapter 1', url: 'https://x.com/ch-1' },
      { title: 'Chapter 2', url: 'https://x.com/ch-2/' },
      { title: 'Chương 3: Đấu trí', url: '/offline/chuong-3' },
      { title: 'Chapter 004', folderBasename: 'Chapter 004', url: 'offline://local/ch4' },
    ];
    expect(resolveTargetChapterIndex(chapters, { chapterUrl: 'https://x.com/ch-1' })).toBe(0);
    expect(resolveTargetChapterIndex(chapters, { chapterUrl: 'http://x.com/ch-2' })).toBe(1);
    expect(
      resolveTargetChapterIndex(chapters, {
        chapterUrl: 'https://old-domain.com/ch-3',
        chapterTitle: '  chương 3: đấu trí ',
      })
    ).toBe(2);
    expect(
      resolveTargetChapterIndex(chapters, {
        chapterUrl: 'https://x.com/manga/chap-4',
        chapterTitle: '4',
      })
    ).toBe(3);
    expect(
      resolveTargetChapterIndex(chapters, {
        chapterUrl: 'https://x.com/missing',
        chapterTitle: 'missing',
      })
    ).toBe(0);
    expect(resolveTargetChapterIndex([], { chapterUrl: 'https://x.com/ch-1' })).toBe(0);
    expect(resolveTargetChapterIndex(null)).toBe(0);
  });

  test('computeHorizontalWheelDelta converts vertical wheel to horizontal delta only when overflowing', () => {
    expect(
      computeHorizontalWheelDelta({
        deltaX: 0,
        deltaY: 120,
        deltaMode: 0,
        ctrlKey: false,
        scrollWidth: 900,
        clientWidth: 500,
      })
    ).toEqual({ handled: true, delta: 120 });

    // Line mode (deltaMode === 1 -> 16px per line) & page mode (deltaMode === 2 -> clientWidth)
    expect(
      computeHorizontalWheelDelta({
        deltaX: 0,
        deltaY: -3,
        deltaMode: 1,
        ctrlKey: false,
        scrollWidth: 900,
        clientWidth: 500,
      })
    ).toEqual({ handled: true, delta: -48 });
    expect(
      computeHorizontalWheelDelta({
        deltaX: 0,
        deltaY: 1,
        deltaMode: 2,
        ctrlKey: false,
        scrollWidth: 900,
        clientWidth: 500,
      })
    ).toEqual({ handled: true, delta: 500 });

    // Ignored when no horizontal overflow, ctrlKey zoom, zero deltaY, or trackpad horizontal swipe
    expect(
      computeHorizontalWheelDelta({
        deltaX: 0,
        deltaY: 100,
        deltaMode: 0,
        ctrlKey: false,
        scrollWidth: 500,
        clientWidth: 500,
      })
    ).toEqual({ handled: false, delta: 0 });
    expect(
      computeHorizontalWheelDelta({
        deltaX: 0,
        deltaY: 100,
        deltaMode: 0,
        ctrlKey: true,
        scrollWidth: 900,
        clientWidth: 500,
      })
    ).toEqual({ handled: false, delta: 0 });
    expect(
      computeHorizontalWheelDelta({
        deltaX: 0,
        deltaY: 100,
        deltaMode: 0,
        ctrlKey: false,
        scrollWidth: 400,
        clientWidth: 500,
      })
    ).toEqual({ handled: false, delta: 0 });
    expect(
      computeHorizontalWheelDelta({
        deltaX: 40,
        deltaY: 10,
        deltaMode: 0,
        ctrlKey: false,
        scrollWidth: 900,
        clientWidth: 500,
      })
    ).toEqual({ handled: false, delta: 0 });
    expect(
      computeHorizontalWheelDelta({
        deltaX: -40,
        deltaY: 40,
        deltaMode: 0,
        ctrlKey: false,
        scrollWidth: 900,
        clientWidth: 500,
      })
    ).toEqual({ handled: false, delta: 0 });
    expect(computeHorizontalWheelDelta()).toEqual({ handled: false, delta: 0 });
    expect(
      computeHorizontalWheelDelta({
        deltaX: 0,
        deltaY: 0,
        deltaMode: 0,
        ctrlKey: false,
        scrollWidth: 900,
        clientWidth: 500,
      })
    ).toEqual({ handled: false, delta: 0 });
  });
});
