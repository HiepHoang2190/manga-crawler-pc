import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

global.localStorage = localStorageMock;

const {
  loadFavoriteAutoDownloadEnabled,
  saveFavoriteAutoDownloadEnabled,
  loadFavoriteAutoDownloadMode,
  saveFavoriteAutoDownloadMode,
  loadFavoriteAutoDownloadWorkflowId,
  saveFavoriteAutoDownloadWorkflowId,
  FAVORITE_AUTO_DOWNLOAD_ENABLED_KEY,
  FAVORITE_AUTO_DOWNLOAD_MODE_KEY,
  FAVORITE_AUTO_DOWNLOAD_WORKFLOW_ID_KEY,
  FAVORITE_AUTO_CHECK_LAST_AT_KEY,
  FAVORITE_AUTO_CHECK_INTERVAL_PRESETS,
  loadFavoriteAutoCheckLastAt,
  saveFavoriteAutoCheckLastAt,
  selectPeriodicCheckFavorites,
  shouldRunStartupCatchUpCheck,
  formatFavoriteAutoCheckInterval,
  formatFavoriteAutoCheckLastAt,
} = await import('./appSettings.js');

const dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Favorite Auto Download Settings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('enabled flag defaults to false and saves boolean correctly', () => {
    expect(loadFavoriteAutoDownloadEnabled()).toBe(false);
    saveFavoriteAutoDownloadEnabled(true);
    expect(loadFavoriteAutoDownloadEnabled()).toBe(true);
    expect(localStorage.getItem(FAVORITE_AUTO_DOWNLOAD_ENABLED_KEY)).toBe('true');
    saveFavoriteAutoDownloadEnabled(false);
    expect(loadFavoriteAutoDownloadEnabled()).toBe(false);
  });

  test('mode defaults to queue and validates workflow vs queue', () => {
    expect(loadFavoriteAutoDownloadMode()).toBe('queue');
    saveFavoriteAutoDownloadMode('workflow');
    expect(loadFavoriteAutoDownloadMode()).toBe('workflow');
    expect(localStorage.getItem(FAVORITE_AUTO_DOWNLOAD_MODE_KEY)).toBe('workflow');

    saveFavoriteAutoDownloadMode('other_invalid_mode');
    expect(loadFavoriteAutoDownloadMode()).toBe('queue');
  });

  test('workflowId defaults to empty string and saves correctly', () => {
    expect(loadFavoriteAutoDownloadWorkflowId()).toBe('');
    saveFavoriteAutoDownloadWorkflowId('wf_sample_123');
    expect(loadFavoriteAutoDownloadWorkflowId()).toBe('wf_sample_123');
    expect(localStorage.getItem(FAVORITE_AUTO_DOWNLOAD_WORKFLOW_ID_KEY)).toBe('wf_sample_123');
  });

  test('userDataBackup appSettings keys include auto download keys', () => {
    const src = fs.readFileSync(path.join(dirname, 'userDataBackup.js'), 'utf8');
    expect(src).toMatch(/mangaFavoriteAutoDownloadEnabled/);
    expect(src).toMatch(/mangaFavoriteAutoDownloadMode/);
    expect(src).toMatch(/mangaFavoriteAutoDownloadWorkflowId/);
  });

  test('periodic check interval presets and last-checked persistence behave safely', () => {
    expect(FAVORITE_AUTO_CHECK_INTERVAL_PRESETS).toEqual([15, 30, 60, 180, 360, 720, 1440]);
    expect(loadFavoriteAutoCheckLastAt()).toBe(0);

    saveFavoriteAutoCheckLastAt(1700000123456);
    expect(localStorage.getItem(FAVORITE_AUTO_CHECK_LAST_AT_KEY)).toBe('1700000123456');
    expect(loadFavoriteAutoCheckLastAt()).toBe(1700000123456);

    localStorage.setItem(FAVORITE_AUTO_CHECK_LAST_AT_KEY, 'not-a-number');
    expect(loadFavoriteAutoCheckLastAt()).toBe(0);
    saveFavoriteAutoCheckLastAt(-5);
    expect(loadFavoriteAutoCheckLastAt()).toBe(0);
  });

  test('selectPeriodicCheckFavorites includes default/opt-in items and skips muted notifyWatch: false', () => {
    expect(selectPeriodicCheckFavorites(null)).toEqual([]);
    const list = [
      { id: '1', title: 'A' },
      { id: '2', title: 'B', notifyWatch: true },
      { id: '3', title: 'C', notifyWatch: false },
      null,
    ];
    expect(selectPeriodicCheckFavorites(list).map((f) => f.id)).toEqual(['1', '2']);
  });

  test('shouldRunStartupCatchUpCheck triggers only when enabled, previously checked, and overdue', () => {
    const hourMs = 60 * 60 * 1000;
    const now = 1_700_000_000_000;
    expect(shouldRunStartupCatchUpCheck({ enabled: false, intervalMin: 60, lastCheckAt: now - 2 * hourMs, now })).toBe(false);
    expect(shouldRunStartupCatchUpCheck({ enabled: true, intervalMin: 60, lastCheckAt: 0, now })).toBe(false);
    expect(shouldRunStartupCatchUpCheck({ enabled: true, intervalMin: 60, lastCheckAt: now - 30 * 60 * 1000, now })).toBe(false);
    expect(shouldRunStartupCatchUpCheck({ enabled: true, intervalMin: 60, lastCheckAt: now - hourMs, now })).toBe(true);
    expect(shouldRunStartupCatchUpCheck({ enabled: true, intervalMin: 60, lastCheckAt: now - 3 * hourMs, now })).toBe(true);
  });

  test('formatFavoriteAutoCheckInterval formats minutes, whole hours, and hours+minutes', () => {
    const t = (key, vars = {}) => {
      if (key === 'settings.time.minutes') return `${vars.m} phút`;
      if (key === 'settings.time.hours') return `${vars.h} giờ`;
      if (key === 'settings.time.hoursMinutes') return `${vars.h}g ${vars.m}p`;
      return key;
    };
    expect(formatFavoriteAutoCheckInterval(15, t)).toBe('15 phút');
    expect(formatFavoriteAutoCheckInterval(180, t)).toBe('3 giờ');
    expect(formatFavoriteAutoCheckInterval(90, t)).toBe('1g 30p');
  });

  test('formatFavoriteAutoCheckLastAt formats invalid/zero as never and positive timestamps cleanly', () => {
    const t = (key) => (key === 'settings.favoritesAutoCheckNever' ? 'Chưa chạy' : key);
    expect(formatFavoriteAutoCheckLastAt(0, t)).toBe('Chưa chạy');
    expect(formatFavoriteAutoCheckLastAt(-1, t)).toBe('Chưa chạy');
    expect(formatFavoriteAutoCheckLastAt('bad', t)).toBe('Chưa chạy');
    const formatted = formatFavoriteAutoCheckLastAt(1700000123456, t);
    expect(typeof formatted).toBe('string');
    expect(formatted.length).toBeGreaterThan(0);
    expect(formatted).not.toBe('Chưa chạy');
  });
});
