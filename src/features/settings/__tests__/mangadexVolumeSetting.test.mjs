const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { store = {}; },
  };
})();
global.localStorage = localStorageMock;

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  loadMangadexVolumeFolderGrouping,
  saveMangadexVolumeFolderGrouping,
} from '../../../utils/appSettings.js';
import { createChapterEntry } from '../../download/queueMutations.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const userDataBackupPath = path.resolve(dirname, '../../../utils/userDataBackup.js');

describe('MangaDex Volume Grouping Settings & Queue Payload', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  test('loadMangadexVolumeFolderGrouping defaults to true', () => {
    expect(loadMangadexVolumeFolderGrouping()).toBe(true);
  });

  test('saveMangadexVolumeFolderGrouping saves correctly to localStorage', () => {
    saveMangadexVolumeFolderGrouping(false);
    expect(loadMangadexVolumeFolderGrouping()).toBe(false);

    saveMangadexVolumeFolderGrouping(true);
    expect(loadMangadexVolumeFolderGrouping()).toBe(true);
  });

  test('createChapterEntry preserves volume metadata when present', () => {
    const entryWithVol = createChapterEntry({
      url: 'https://mangadex.org/chapter/123',
      title: 'Chapter 1',
      volume: '1',
    });
    expect(entryWithVol.volume).toBe('1');

    const entryWithoutVol = createChapterEntry({
      url: 'https://mangadex.org/chapter/456',
      title: 'Chapter 105',
    });
    expect(entryWithoutVol.volume).toBeUndefined();
  });

  test('userDataBackup whitelists mangadex_volume_folder_grouping_v1', () => {
    const content = fs.readFileSync(userDataBackupPath, 'utf8');
    expect(content).toMatch(/'mangadex_volume_folder_grouping_v1'/);
  });
});
