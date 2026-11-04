// src/utils/offlineLibraryHiddenPaths.test.mjs
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v);
    },
    removeItem: (k) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    },
  };
})();
global.localStorage = localStorageMock;

const {
  loadHiddenSavePaths,
  saveHiddenSavePaths,
  clearHiddenSavePaths,
  isHiddenSavePath,
  filterVisibleLocalMangaItems,
  isInsideDirectory,
  unhidePathsForDirectory,
  HIDDEN_SAVE_PATHS_KEY,
} = await import('./offlineLibraryHiddenPaths.js');

beforeEach(() => {
  localStorageMock.clear();
});

test('isInsideDirectory checks exact match and descendant hierarchy', () => {
  assert.equal(isInsideDirectory('/Users/admin/Downloads', '/Users/admin/Downloads'), true);
  assert.equal(isInsideDirectory('/Users/admin/Downloads/folder', '/Users/admin/Downloads'), true);
  assert.equal(isInsideDirectory('/Users/admin/Downloads/folder/sub', '/Users/admin/Downloads'), true);
  assert.equal(isInsideDirectory('/Users/admin/Downloads_other', '/Users/admin/Downloads'), false);
  assert.equal(isInsideDirectory('', '/Users/admin/Downloads'), false);
  assert.equal(isInsideDirectory('/Users/admin/Downloads', ''), false);

  // Normalizes Windows backslashes and trailing slashes
  assert.equal(isInsideDirectory('C:\\Users\\admin\\folder\\', 'C:/Users/admin'), true);
  assert.equal(isInsideDirectory('C:\\Users\\admin\\folder\\manga', 'C:\\Users\\admin\\folder'), true);
});

test('unhidePathsForDirectory unhides child paths when parent directory is added', () => {
  const hidden = new Set([
    '/Users/admin/Downloads/untitled folder 2/Empyreal Cabinet',
    '/Users/admin/Downloads/untitled folder 2/ONE PIECE',
    '/Users/admin/Downloads/other_manga',
  ]);
  saveHiddenSavePaths(hidden);

  const unhiddenCount = unhidePathsForDirectory('/Users/admin/Downloads/untitled folder 2');
  assert.equal(unhiddenCount, 2);

  const remaining = loadHiddenSavePaths();
  assert.equal(remaining.size, 1);
  assert.equal(remaining.has('/Users/admin/Downloads/other_manga'), true);
  assert.equal(remaining.has('/Users/admin/Downloads/untitled folder 2/Empyreal Cabinet'), false);
  assert.equal(remaining.has('/Users/admin/Downloads/untitled folder 2/ONE PIECE'), false);
});

test('unhidePathsForDirectory unhides exact manga directory and explicit paths', () => {
  const hidden = new Set([
    '/Users/admin/Downloads/untitled folder 2/Empyreal Cabinet',
    '/Users/admin/Downloads/manga2',
  ]);
  saveHiddenSavePaths(hidden);

  // Unhide single manga folder
  const unhiddenCount = unhidePathsForDirectory('/Users/admin/Downloads/untitled folder 2/Empyreal Cabinet');
  assert.equal(unhiddenCount, 1);
  assert.equal(loadHiddenSavePaths().has('/Users/admin/Downloads/untitled folder 2/Empyreal Cabinet'), false);

  // Unhide with explicit paths
  const count2 = unhidePathsForDirectory('/some/empty/dir', ['/Users/admin/Downloads/manga2']);
  assert.equal(count2, 1);
  assert.equal(loadHiddenSavePaths().size, 0);
});
