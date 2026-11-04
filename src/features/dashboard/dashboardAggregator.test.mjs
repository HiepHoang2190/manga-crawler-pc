// src/utils/dashboardAggregator.test.mjs
import assert from 'node:assert/strict';

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
// readingProgress.loadReadingProgressMap() guards with `typeof window === 'undefined'`,
// so define a window stub in Node so the function reads from our mocked localStorage.
global.window = globalThis;

const READING_KEY = 'mangaReaderProgressByManga';
const { getContinueReading } = await import('./dashboardAggregator.js');

beforeEach(() => localStorageMock.clear());

test('returns null when no progress entries', () => {
  assert.equal(getContinueReading(), null);
});

test('returns latest entry by updatedAt', () => {
  const map = {
    'siteA::https://a/m1': { chapterUrl: 'https://a/m1/c5', updatedAt: 1000 },
    'siteB::https://b/m2': { chapterUrl: 'https://b/m2/c10', updatedAt: 5000 },
    'siteA::https://a/m3': { chapterUrl: 'https://a/m3/c1', updatedAt: 3000 },
  };
  localStorageMock.setItem(READING_KEY, JSON.stringify(map));
  const out = getContinueReading();
  assert.equal(out.chapterUrl, 'https://b/m2/c10');
  assert.equal(out.mangaUrl, 'https://b/m2');
  assert.equal(out.siteId, 'siteB');
});

test('ignores entries without chapterUrl', () => {
  const map = {
    'siteA::https://a/m1': { updatedAt: 9999 },
    'siteA::https://a/m2': { chapterUrl: 'https://a/m2/c1', updatedAt: 5000 },
  };
  localStorageMock.setItem(READING_KEY, JSON.stringify(map));
  assert.equal(getContinueReading().mangaUrl, 'https://a/m2');
});

const { getNewChapterFavorites, getQueueStatus } = await import('./dashboardAggregator.js');

test('getNewChapterFavorites returns top N favorites with unread', () => {
  const favorites = [
    { id: 'f1', title: 'A', coverUrl: 'a.jpg', hasNew: true, mangaUrl: 'https://x/a' },
    { id: 'f2', title: 'B', coverUrl: 'b.jpg', hasNew: false },
    { id: 'f3', title: 'C', coverUrl: 'c.jpg', hasNew: true, mangaUrl: 'https://x/c' },
  ];
  const out = getNewChapterFavorites(favorites, 2);
  assert.equal(out.items.length, 2);
  assert.equal(out.totalCount, 2);
  assert.deepEqual(out.items.map(i => i.id), ['f1', 'f3']);
});

test('getNewChapterFavorites handles empty input', () => {
  const out = getNewChapterFavorites(null, 5);
  assert.deepEqual(out, { items: [], totalCount: 0 });
});

test('getQueueStatus counts running + waiting + extracts current', () => {
  const queue = [
    { id: 'g1', chapters: [
      { id: 'c1', status: 'done' },
      { id: 'c2', status: 'downloading', chapterTitle: 'Ch 2', progress: 0.42 },
      { id: 'c3', status: 'waiting' },
    ], mangaTitle: 'Manga 1' },
    { id: 'g2', chapters: [
      { id: 'c4', status: 'waiting' },
      { id: 'c5', status: 'waiting' },
    ], mangaTitle: 'Manga 2' },
  ];
  const out = getQueueStatus(queue);
  assert.equal(out.runningCount, 1);
  assert.equal(out.waitingCount, 3);
  assert.equal(out.currentJob?.chapterTitle, 'Ch 2');
  assert.equal(out.currentJob?.mangaTitle, 'Manga 1');
});

test('getQueueStatus returns zeros for empty queue', () => {
  assert.deepEqual(getQueueStatus([]), { runningCount: 0, waitingCount: 0, currentJob: null });
});

const { getRecentDownloadsForDashboard, getLibraryStats } = await import('./dashboardAggregator.js');

test('getRecentDownloadsForDashboard dedupes by manga, sorts by completedAt desc', () => {
  const now = Date.now();
  // Seed via recentDownloadsLog format (raw entries)
  const entries = [
    { mangaId: 'm1', mangaTitle: 'A', chapterTitle: 'Ch 5', chapterUrl: 'u5', coverUrl: 'a.jpg', connectorId: 'x', completedAt: now - 1000 },
    { mangaId: 'm2', mangaTitle: 'B', chapterTitle: 'Ch 1', chapterUrl: 'u1', coverUrl: 'b.jpg', connectorId: 'x', completedAt: now - 500 },
    { mangaId: 'm1', mangaTitle: 'A', chapterTitle: 'Ch 6', chapterUrl: 'u6', coverUrl: 'a.jpg', connectorId: 'x', completedAt: now - 100 },
  ];
  const out = getRecentDownloadsForDashboard(entries, 10);
  assert.equal(out.items.length, 2);
  assert.equal(out.items[0].mangaId, 'm1'); // most recent first
  assert.equal(out.items[0].chapterTitle, 'Ch 6'); // latest of m1
  assert.equal(out.totalChapters, 3);
  assert.equal(out.totalMangas, 2);
});

test('getLibraryStats counts manga + chapters + tops connector', () => {
  const library = [
    { id: 'a', siteId: 'mangadex', chapters: [{}, {}, {}] },
    { id: 'b', siteId: 'mangadex', chapters: [{}] },
    { id: 'c', siteId: 'nettruyen', chapters: [{}, {}] },
  ];
  const out = getLibraryStats(library, 1024 * 1024 * 1024 * 5); // 5 GB on disk
  assert.equal(out.mangaCount, 3);
  assert.equal(out.totalChapterCount, 6);
  assert.equal(out.totalStorageBytes, 5368709120);
  assert.equal(out.topConnectorId, 'mangadex');
});

test('getLibraryStats topConnectorId is null when library empty', () => {
  const out = getLibraryStats([], 0);
  assert.equal(out.topConnectorId, null);
  assert.equal(out.mangaCount, 0);
});

test('getLibraryStats tie-breaks by chapter count then alpha', () => {
  const library = [
    { id: 'a', siteId: 'beta',  chapters: [{}] },
    { id: 'b', siteId: 'alpha', chapters: [{}] },
    { id: 'c', siteId: 'beta',  chapters: [{}, {}] }, // beta has more chapters
  ];
  const out = getLibraryStats(library, 0);
  assert.equal(out.topConnectorId, 'beta');
});

const { prettifyUrlForTitle, prettifyChapterTitle } = await import('./dashboardAggregator.js');

test('prettifyUrlForTitle uses last path segment with separators replaced', () => {
  assert.equal(
    prettifyUrlForTitle('https://example.com/manga/one-piece-by-oda'),
    'one piece by oda',
  );
});

test('prettifyUrlForTitle decodes percent-encoded segments', () => {
  assert.equal(
    prettifyUrlForTitle('https://example.com/truyen/n%E1%BB%AF-ph%E1%BB%A5'),
    'nữ phụ',
  );
});

test('prettifyUrlForTitle falls back to hostname when no path segments', () => {
  assert.equal(prettifyUrlForTitle('https://example.com/'), 'example.com');
});

test('prettifyUrlForTitle returns the input when not a valid URL', () => {
  assert.equal(prettifyUrlForTitle('not a url'), 'not a url');
  assert.equal(prettifyUrlForTitle(''), '');
  assert.equal(prettifyUrlForTitle(null), '');
});

test('prettifyChapterTitle uses last segment with separators replaced', () => {
  assert.equal(
    prettifyChapterTitle('https://example.com/manga/one-piece/chapter-1099'),
    'chapter 1099',
  );
});

test('prettifyChapterTitle falls back to pathname when last segment empty', () => {
  assert.equal(prettifyChapterTitle('https://example.com/'), '/');
});

test('prettifyChapterTitle returns input when not a valid URL', () => {
  assert.equal(prettifyChapterTitle('chapter-1'), 'chapter-1');
  assert.equal(prettifyChapterTitle(null), '');
});

const { getKpiTiles, getDownloadsPerDay, getConnectorBreakdown } = await import('./dashboardAggregator.js');

test('getKpiTiles: empty inputs → all zeros with storageBytes=null preserved', () => {
  const nowMs = Date.now();
  const out = getKpiTiles({ favorites: [], downloadHistory: [], storageBytes: null, nowMs });
  assert.deepEqual(out, {
    mangaCount: 0,
    chapterCount: 0,
    storageBytes: null,
    downloadsToday: 0,
  });
});

test('getKpiTiles: non-array inputs default to zeros', () => {
  const out = getKpiTiles({ favorites: null, downloadHistory: undefined, storageBytes: 2048, nowMs: Date.now() });
  assert.equal(out.mangaCount, 0);
  assert.equal(out.chapterCount, 0);
  assert.equal(out.storageBytes, 2048);
  assert.equal(out.downloadsToday, 0);
});

test('getKpiTiles: happy path counts mangas, chapters, todays downloads', () => {
  // Fixed nowMs; compute todayStart in the same way as the code (local tz)
  const nowMs = Date.parse('2025-06-15T12:00:00Z');
  const todayStart = new Date(nowMs);
  todayStart.setHours(0, 0, 0, 0);
  const startMs = todayStart.getTime();
  const yesterdayMs = startMs - 60 * 60 * 1000; // 1h before local midnight
  const midToday = startMs + 6 * 60 * 60 * 1000; // 6h into local today
  const lateToday = startMs + 20 * 60 * 60 * 1000;

  const favorites = [
    { id: 'f1', siteId: 'a', chapterCount: 12 },
    { id: 'f2', siteId: 'a', chapterCount: 0 }, // 0 does not contribute
    { id: 'f3', siteId: 'b', chapterCount: 8 },
  ];
  const downloadHistory = [
    { at: new Date(midToday).toISOString(), ok: true },
    { at: new Date(lateToday).toISOString(), ok: true },
    { at: new Date(yesterdayMs).toISOString(), ok: true }, // yesterday
    { at: new Date(midToday).toISOString(), ok: false }, // failed → skipped
    { ok: true }, // no `at` → skipped
    null, // null entry → skipped
  ];
  const out = getKpiTiles({ favorites, downloadHistory, storageBytes: 1024 * 1024, nowMs });
  assert.equal(out.mangaCount, 3);
  assert.equal(out.chapterCount, 20);
  assert.equal(out.storageBytes, 1024 * 1024);
  assert.equal(out.downloadsToday, 2);
});

test('getKpiTiles: negative or NaN storageBytes clamps to 0 (non-null)', () => {
  const nowMs = Date.now();
  const out1 = getKpiTiles({ favorites: [], downloadHistory: [], storageBytes: -100, nowMs });
  assert.equal(out1.storageBytes, 0);
  const out2 = getKpiTiles({ favorites: [], downloadHistory: [], storageBytes: NaN, nowMs });
  assert.equal(out2.storageBytes, 0);
});

test('getDownloadsPerDay: buckets length = 30, values at correct indices, day-30 excluded', () => {
  const nowMs = Date.parse('2025-06-15T12:00:00Z');
  const todayStart = new Date(nowMs);
  todayStart.setHours(0, 0, 0, 0);
  const dayMs = 24 * 3600 * 1000;
  const startWindow = todayStart.getTime() - 29 * dayMs;

  const entryAt = (dayOffset, hourInDay = 6) =>
    ({ at: new Date(todayStart.getTime() - dayOffset * dayMs + hourInDay * 3600 * 1000).toISOString(), ok: true });

  const history = [
    entryAt(0), // today → index 29
    entryAt(0, 20), // today second entry
    entryAt(5), // 5 days ago → index 24
    entryAt(29), // 29 days ago → index 0
    entryAt(30), // outside window → excluded
    { at: 'not-a-date', ok: true }, // invalid → excluded
    { ok: false, at: new Date(todayStart.getTime()).toISOString() }, // failed → excluded
  ];

  const out = getDownloadsPerDay(history, { days: 30, nowMs });
  assert.equal(out.length, 30);
  assert.equal(out[29].count, 2, 'today (index 29) should count both today entries');
  assert.equal(out[24].count, 1, '5 days ago at index 24');
  assert.equal(out[0].count, 1, '29 days ago at index 0');
  // day-30 excluded → sum should be 4 (2 today + 1 five + 1 twenty-nine)
  const total = out.reduce((s, e) => s + e.count, 0);
  assert.equal(total, 4);
  // dateISO must reflect the LOCAL date the user sees on their calendar,
  // not the UTC date (which would be off-by-one in non-UTC timezones).
  const localISO = (ms) => {
    const d = new Date(ms);
    const y = d.getFullYear().toString().padStart(4, '0');
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  assert.equal(out[29].dateISO, localISO(todayStart.getTime()));
  assert.equal(out[0].dateISO, localISO(startWindow));
});

test('getDownloadsPerDay: empty/invalid history → all zero buckets', () => {
  const out = getDownloadsPerDay(null, { days: 7 });
  assert.equal(out.length, 7);
  assert.ok(out.every((b) => b.count === 0));
});

test('getConnectorBreakdown: caps at limit, aggregates others, pct sums ~1.0, tie-breaks by chapters then alpha', () => {
  const favs = [
    { siteId: 'a', chapterCount: 10 },
    { siteId: 'a', chapterCount: 20 },
    { siteId: 'b', chapterCount: 10 },
    { siteId: 'b', chapterCount: 10 },
    { siteId: 'c', chapterCount: 5 },
    { siteId: 'd', chapterCount: 5 },
    { siteId: 'e', chapterCount: 3 },
    { siteId: 'f', chapterCount: 1 },
  ];
  const out = getConnectorBreakdown(favs, { limit: 5 });
  assert.equal(out.total, 8);
  assert.equal(out.items.length, 5);
  // a and b tie on mangas (2 each); a has more chapters (30) → a first
  assert.equal(out.items[0].siteId, 'a');
  assert.equal(out.items[0].mangas, 2);
  assert.equal(out.items[0].chapters, 30);
  assert.equal(out.items[1].siteId, 'b');
  assert.equal(out.items[1].chapters, 20);
  // c and d tie on mangas (1) and chapters (5) → alphabetical
  assert.equal(out.items[2].siteId, 'c');
  assert.equal(out.items[3].siteId, 'd');
  assert.equal(out.items[4].siteId, 'e');
  // f is beyond limit → in others
  assert.ok(out.others, 'others should be present');
  assert.equal(out.others.mangas, 1);
  assert.equal(out.others.chapters, 1);
  // Pct sum ~1.0
  const pctSum = out.items.reduce((s, i) => s + i.pct, 0) + (out.others?.pct || 0);
  assert.ok(Math.abs(pctSum - 1) < 1e-9, `pctSum should be ~1, got ${pctSum}`);
});

test('getConnectorBreakdown: fewer than limit → others is null', () => {
  const favs = [
    { siteId: 'x', chapterCount: 3 },
    { siteId: 'y', chapterCount: 2 },
  ];
  const out = getConnectorBreakdown(favs, { limit: 5 });
  assert.equal(out.total, 2);
  assert.equal(out.items.length, 2);
  assert.equal(out.others, null);
});

test('getConnectorBreakdown: empty favorites → empty result', () => {
  const out = getConnectorBreakdown([], { limit: 5 });
  assert.deepEqual(out, { items: [], others: null, total: 0 });
});

test('getConnectorBreakdown: ignores entries without siteId', () => {
  const favs = [
    { siteId: 'a', chapterCount: 5 },
    { chapterCount: 5 }, // no siteId
    { siteId: '', chapterCount: 5 }, // empty siteId
  ];
  const out = getConnectorBreakdown(favs, { limit: 5 });
  assert.equal(out.total, 3); // total still reflects favorites array length
  assert.equal(out.items.length, 1);
  assert.equal(out.items[0].siteId, 'a');
});

test('getMangaChapterRankingFromLocal excludes hidden absolute paths', async () => {
  const { getMangaChapterRankingFromLocal } = await import('./dashboardAggregator.js');
  const hidden = new Set(['/save/hidden-manga']);
  const items = [
    { mangaTitle: 'Visible A', chapterCount: 5, absolutePath: '/save/a' },
    { mangaTitle: 'Hidden', chapterCount: 99, absolutePath: '/save/hidden-manga' },
    { mangaTitle: 'Visible B', chapterCount: 10, absolutePath: '/save/b' },
  ];
  const out = getMangaChapterRankingFromLocal(items, { excludeAbsolutePaths: hidden });
  assert.deepEqual(out.map((x) => x.title), ['Visible B', 'Visible A']);
  assert.equal(out[0].chapterCount, 10);
});

