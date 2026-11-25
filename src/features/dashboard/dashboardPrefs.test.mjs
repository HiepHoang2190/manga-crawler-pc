import {
  DASHBOARD_TREND_DAYS_KEY,
  loadDashboardTrendDays,
  saveDashboardTrendDays,
  extractPathBasename,
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
});
