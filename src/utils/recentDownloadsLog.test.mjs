// src/utils/recentDownloadsLog.test.mjs
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';

const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { store = {}; },
  };
})();
global.localStorage = localStorageMock;

const { pushRecentDownload, getRecentDownloads, RECENT_DOWNLOADS_KEY, RECENT_DOWNLOADS_CAP } =
  await import('./recentDownloadsLog.js');

beforeEach(() => localStorageMock.clear());

test('push then getRecent returns entry within window', () => {
  const now = Date.now();
  pushRecentDownload({
    mangaId: 'm1', mangaTitle: 'One Piece',
    chapterTitle: 'Ch 1', chapterUrl: 'https://x/1',
    coverUrl: 'https://x/cover.jpg', connectorId: 'mangadex',
    completedAt: now,
  });
  const got = getRecentDownloads(24 * 3600 * 1000);
  assert.equal(got.length, 1);
  assert.equal(got[0].mangaTitle, 'One Piece');
});

test('entries older than window are filtered out', () => {
  const old = Date.now() - 48 * 3600 * 1000;
  pushRecentDownload({
    mangaId: 'm1', mangaTitle: 'Old', chapterTitle: 'Ch 1',
    chapterUrl: 'https://x/1', coverUrl: '', connectorId: 'x',
    completedAt: old,
  });
  assert.equal(getRecentDownloads(24 * 3600 * 1000).length, 0);
});

test('log is capped at RECENT_DOWNLOADS_CAP', () => {
  for (let i = 0; i < RECENT_DOWNLOADS_CAP + 20; i++) {
    pushRecentDownload({
      mangaId: `m${i}`, mangaTitle: `T${i}`, chapterTitle: 'Ch',
      chapterUrl: `u${i}`, coverUrl: '', connectorId: 'x',
      completedAt: Date.now(),
    });
  }
  const all = getRecentDownloads(Number.MAX_SAFE_INTEGER);
  assert.ok(all.length <= RECENT_DOWNLOADS_CAP);
});

test('Property: roundtrip preserves arbitrary entries', () => {
  fc.assert(
    fc.property(
      fc.record({
        mangaId: fc.string({ minLength: 1, maxLength: 16 }),
        mangaTitle: fc.string({ minLength: 1, maxLength: 64 }),
        chapterTitle: fc.string({ minLength: 1, maxLength: 64 }),
        chapterUrl: fc.webUrl(),
        coverUrl: fc.option(fc.webUrl(), { nil: '' }),
        connectorId: fc.string({ minLength: 1, maxLength: 24 }),
        completedAt: fc.integer({ min: 0, max: Date.now() + 86400000 }),
      }),
      (entry) => {
        localStorageMock.clear();
        pushRecentDownload(entry);
        const back = getRecentDownloads(Number.MAX_SAFE_INTEGER);
        return back[0].mangaId === entry.mangaId && back[0].chapterUrl === entry.chapterUrl;
      }
    ),
  );
});
