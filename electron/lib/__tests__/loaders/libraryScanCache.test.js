'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { LibraryScanCache } = require('../../library/libraryScanCache');

describe('LibraryScanCache', () => {
  let tmpFile;

  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `test-scan-cache-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    } catch {
      /* */
    }
  });

  test('returns null for non-existent entry', () => {
    const cache = new LibraryScanCache({ filePath: tmpFile });
    expect(cache.get('/fake/path', 100, null)).toBeNull();
  });

  test('stores and retrieves an entry when mtime matches', () => {
    const cache = new LibraryScanCache({ filePath: tmpFile });
    const item = {
      mangaTitle: 'Naruto',
      chapterCount: 700,
      hasDb: true,
      mangaUrl: 'https://example.com/naruto',
      siteId: 'site1',
      absolutePath: '/manga/naruto',
    };

    cache.set('/manga/naruto', 1000, 2000, item);
    const retrieved = cache.get('/manga/naruto', 1000, 2000);
    expect(retrieved).toEqual(item);
  });

  test('returns null when dir mtime changes', () => {
    const cache = new LibraryScanCache({ filePath: tmpFile });
    const item = { mangaTitle: 'One Piece', chapterCount: 1000, absolutePath: '/manga/op' };

    cache.set('/manga/op', 1000, null, item);
    expect(cache.get('/manga/op', 1001, null)).toBeNull();
  });

  test('returns null when db mtime changes', () => {
    const cache = new LibraryScanCache({ filePath: tmpFile });
    const item = { mangaTitle: 'Bleach', chapterCount: 686, absolutePath: '/manga/bleach' };

    cache.set('/manga/bleach', 1000, 2000, item);
    expect(cache.get('/manga/bleach', 1000, 2001)).toBeNull();
  });

  test('persists to disk and reloads correctly', () => {
    const cache1 = new LibraryScanCache({ filePath: tmpFile });
    const item = { mangaTitle: 'Dragon Ball', chapterCount: 519, absolutePath: '/manga/db' };

    cache1.set('/manga/db', 5000, 6000, item);
    cache1.flushNow();

    expect(fs.existsSync(tmpFile)).toBe(true);

    const cache2 = new LibraryScanCache({ filePath: tmpFile });
    cache2.loadFromDisk();
    const retrieved = cache2.get('/manga/db', 5000, 6000);
    expect(retrieved).toEqual(item);
  });

  test('invalidate removes specific path from cache', () => {
    const cache = new LibraryScanCache({ filePath: tmpFile });
    const item = { mangaTitle: 'Hunter x Hunter', chapterCount: 400, absolutePath: '/manga/hxh' };

    cache.set('/manga/hxh', 1000, null, item);
    cache.invalidate('/manga/hxh');
    expect(cache.get('/manga/hxh', 1000, null)).toBeNull();
  });

  test('clear removes all entries', () => {
    const cache = new LibraryScanCache({ filePath: tmpFile });
    cache.set('/manga/1', 100, null, { mangaTitle: '1' });
    cache.set('/manga/2', 200, null, { mangaTitle: '2' });
    cache.clear();
    expect(cache.get('/manga/1', 100, null)).toBeNull();
    expect(cache.get('/manga/2', 200, null)).toBeNull();
  });
});
