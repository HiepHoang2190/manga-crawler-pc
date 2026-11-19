import { describe, test, expect, beforeEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] ?? null,
    setItem: (key, val) => {
      store[key] = String(val);
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();
global.localStorage = localStorageMock;

import { loadChapterSortOrder, saveChapterSortOrder, CHAPTER_SORT_STORAGE_KEY } from '../panelUiPrefs.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const userDataBackupPath = path.resolve(dirname, '../userDataBackup.js');

describe('Chapter Sort Order Persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('CHAPTER_SORT_STORAGE_KEY is chapter_sort_order_v1', () => {
    expect(CHAPTER_SORT_STORAGE_KEY).toBe('chapter_sort_order_v1');
  });

  test('loadChapterSortOrder returns desc by default when localStorage is empty', () => {
    expect(loadChapterSortOrder()).toBe('desc');
  });

  test('loadChapterSortOrder returns asc when set to asc', () => {
    localStorage.setItem(CHAPTER_SORT_STORAGE_KEY, 'asc');
    expect(loadChapterSortOrder()).toBe('asc');
  });

  test('loadChapterSortOrder returns desc for any invalid or missing value', () => {
    localStorage.setItem(CHAPTER_SORT_STORAGE_KEY, 'unknown_value');
    expect(loadChapterSortOrder()).toBe('desc');
  });

  test('saveChapterSortOrder stores valid direction into localStorage', () => {
    saveChapterSortOrder('asc');
    expect(localStorage.getItem(CHAPTER_SORT_STORAGE_KEY)).toBe('asc');
    saveChapterSortOrder('desc');
    expect(localStorage.getItem(CHAPTER_SORT_STORAGE_KEY)).toBe('desc');
  });

  test('userDataBackup.js whitelists chapter_sort_order_v1 in BACKUP_SECTIONS.ui.keys', () => {
    const content = fs.readFileSync(userDataBackupPath, 'utf8');
    expect(content).toMatch(/'chapter_sort_order_v1'/);
  });
});
