import {
  migrateHiddenMenuIds,
  intersectSelectedUrls,
  filterBulkScanItems,
  buildSessionAfterScan,
  loadBulkScanSessions,
  saveBulkScanSession,
  loadBulkScanSiteId,
  persistBulkScanSiteId,
  BULK_SCAN_SESSIONS_KEY,
  BULK_SCAN_SITE_KEY,
} from './bulkScanSessionPrefs.mjs';

describe('bulkScanSessionPrefs', () => {
  beforeEach(() => {
    globalThis.localStorage = {
      _m: new Map(),
      getItem(k) {
        return this._m.has(k) ? this._m.get(k) : null;
      },
      setItem(k, v) {
        this._m.set(k, String(v));
      },
      removeItem(k) {
        this._m.delete(k);
      },
    };
  });

  test('migrateHiddenMenuIds renames comicvnMoiNhat to bulkScan once', () => {
    expect(migrateHiddenMenuIds(['latestUpdates', 'comicvnMoiNhat', 'help'])).toEqual([
      'latestUpdates',
      'bulkScan',
      'help',
    ]);
    expect(migrateHiddenMenuIds(['bulkScan', 'comicvnMoiNhat'])).toEqual(['bulkScan']);
  });

  test('intersectSelectedUrls keeps only urls still in items', () => {
    const items = [{ mangaUrl: 'a' }, { mangaUrl: 'c' }];
    expect(intersectSelectedUrls(['a', 'b', 'c'], items).sort()).toEqual(['a', 'c']);
  });

  test('filterBulkScanItems selected / unselected', () => {
    const items = [{ mangaUrl: 'a' }, { mangaUrl: 'b' }, { mangaUrl: 'c' }];
    const selected = new Set(['a', 'c']);
    expect(filterBulkScanItems(items, selected, 'selected').map((x) => x.mangaUrl)).toEqual([
      'a',
      'c',
    ]);
    expect(filterBulkScanItems(items, selected, 'unselected').map((x) => x.mangaUrl)).toEqual([
      'b',
    ]);
    expect(filterBulkScanItems(items, selected, 'all')).toHaveLength(3);
  });

  test('buildSessionAfterScan intersects selection and sets scannedAt', () => {
    const items = [
      { mangaUrl: 'https://x/a.html', title: 'A' },
      { mangaUrl: 'https://x/b.html', title: 'B' },
    ];
    const session = buildSessionAfterScan({
      prevSelectedUrls: ['https://x/a.html', 'https://x/gone.html'],
      items,
    });
    expect(session.items).toEqual(items);
    expect(session.selectedUrls).toEqual(['https://x/a.html']);
    expect(typeof session.scannedAt).toBe('string');
    expect(Number.isNaN(Date.parse(session.scannedAt))).toBe(false);
  });

  test('save/load session per siteId', () => {
    saveBulkScanSession('comicvn', {
      items: [{ mangaUrl: 'u1', title: 'T' }],
      selectedUrls: ['u1'],
      scannedAt: '2026-07-26T00:00:00.000Z',
    });
    const all = loadBulkScanSessions();
    expect(all.comicvn.selectedUrls).toEqual(['u1']);
    expect(all.comicvn.items[0].title).toBe('T');
    const raw = localStorage.getItem(BULK_SCAN_SESSIONS_KEY);
    expect(raw).toContain('comicvn');
  });

  test('loadBulkScanSiteId returns empty string when supportedIds is empty', () => {
    expect(loadBulkScanSiteId([])).toBe('');
    expect(loadBulkScanSiteId(null)).toBe('');
  });

  test('loadBulkScanSiteId prefers comicvn when nothing stored, else first id', () => {
    expect(loadBulkScanSiteId(['foo', 'comicvn', 'bar'])).toBe('comicvn');
    expect(loadBulkScanSiteId(['foo', 'bar'])).toBe('foo');
  });

  test('loadBulkScanSiteId returns stored id when valid', () => {
    localStorage.setItem(BULK_SCAN_SITE_KEY, 'bar');
    expect(loadBulkScanSiteId(['foo', 'comicvn', 'bar'])).toBe('bar');
  });

  test('loadBulkScanSiteId falls back when stored id is invalid', () => {
    localStorage.setItem(BULK_SCAN_SITE_KEY, 'invalid');
    expect(loadBulkScanSiteId(['foo', 'comicvn', 'bar'])).toBe('comicvn');

    localStorage.setItem(BULK_SCAN_SITE_KEY, 'invalid');
    expect(loadBulkScanSiteId(['foo', 'bar'])).toBe('foo');
  });

  test('persistBulkScanSiteId writes BULK_SCAN_SITE_KEY', () => {
    persistBulkScanSiteId('mysite');
    expect(localStorage.getItem(BULK_SCAN_SITE_KEY)).toBe('mysite');
  });

  test('saveBulkScanSession refuses to overwrite non-empty session with empty items', () => {
    saveBulkScanSession('comicvn', {
      items: [{ mangaUrl: 'u1', title: 'T' }],
      selectedUrls: ['u1'],
      scannedAt: '2026-07-26T00:00:00.000Z',
    });
    expect(saveBulkScanSession('comicvn', { items: [], selectedUrls: [] })).toBe(false);
    const all = loadBulkScanSessions();
    expect(all.comicvn.items).toHaveLength(1);
    expect(all.comicvn.selectedUrls).toEqual(['u1']);
  });
});
