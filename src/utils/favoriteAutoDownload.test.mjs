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
});
