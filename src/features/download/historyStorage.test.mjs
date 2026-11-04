import {
  DOWNLOAD_HISTORY_KEY,
  prependHistory,
  loadDownloadHistory,
  writeDownloadHistory,
} from './historyStorage.js';

describe('DOWNLOAD_HISTORY_KEY', () => {
  test('stays mangaDownloadHistory', () => {
    expect(DOWNLOAD_HISTORY_KEY).toBe('mangaDownloadHistory');
  });
});

describe('prependHistory', () => {
  test('puts the new entry first', () => {
    expect(prependHistory([{ id: 1 }], { id: 2 })).toEqual([{ id: 2 }, { id: 1 }]);
  });

  test('caps at 300 by default matching App slice(0, 300)', () => {
    const previous_entries = Array.from({ length: 300 }, (_, index) => ({ id: index }));
    const next_entries = prependHistory(previous_entries, { id: 'new' });
    expect(next_entries).toHaveLength(300);
    expect(next_entries[0]).toEqual({ id: 'new' });
    expect(next_entries[299]).toEqual({ id: 298 });
  });

  test('respects custom max', () => {
    expect(prependHistory([1, 2, 3], 0, 2)).toEqual([0, 1]);
  });
});

describe('loadDownloadHistory / writeDownloadHistory', () => {
  const memory_store = new Map();

  beforeEach(() => {
    memory_store.clear();
    global.localStorage = {
      getItem: (key) => (memory_store.has(key) ? memory_store.get(key) : null),
      setItem: (key, value) => {
        memory_store.set(key, String(value));
      },
      removeItem: (key) => {
        memory_store.delete(key);
      },
    };
  });

  test('loadDownloadHistory returns [] when empty or invalid', () => {
    expect(loadDownloadHistory()).toEqual([]);
    localStorage.setItem(DOWNLOAD_HISTORY_KEY, '{');
    expect(loadDownloadHistory()).toEqual([]);
    localStorage.setItem(DOWNLOAD_HISTORY_KEY, '{}');
    expect(loadDownloadHistory()).toEqual([]);
  });

  test('writeDownloadHistory persists arrays and removes the key when empty', () => {
    writeDownloadHistory([{ id: 'a' }]);
    expect(loadDownloadHistory()).toEqual([{ id: 'a' }]);
    writeDownloadHistory([]);
    expect(localStorage.getItem(DOWNLOAD_HISTORY_KEY)).toBe(null);
    expect(loadDownloadHistory()).toEqual([]);
  });
});
