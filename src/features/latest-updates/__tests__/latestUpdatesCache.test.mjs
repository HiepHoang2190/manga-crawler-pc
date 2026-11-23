import {
  LATEST_LISTING_FRESH_TTL_MS,
  LATEST_LISTING_STALE_TTL_MS,
  LATEST_LISTING_CACHE_MAX_ENTRIES,
  buildLatestListTriggerKey,
  makeListingPageCacheKey,
  createLatestUpdatesCache,
} from '../latestUpdatesCache.mjs';

describe('latestUpdatesCache key helpers and LRU TTL + SWR engine', () => {
  test('exports expected default TTL and capacity constants', () => {
    expect(LATEST_LISTING_FRESH_TTL_MS).toBe(5 * 60 * 1000);
    expect(LATEST_LISTING_STALE_TTL_MS).toBe(30 * 60 * 1000);
    expect(LATEST_LISTING_CACHE_MAX_ENTRIES).toBe(60);
  });

  test('buildLatestListTriggerKey encodes site, search, scope, and site-specific params cleanly', () => {
    expect(
      buildLatestListTriggerKey({
        selectedSiteId: 'truyenqq',
        appliedSearch: '',
        isMultiSourceSearch: false,
        selectedMultiSearchSiteIds: ['mangadex', 'truyenqq'],
        panelMangadexLanguage: 'vi',
        panelMinotruyenCategory: 'manga',
      }),
    ).toBe('truyenqq||one');

    expect(
      buildLatestListTriggerKey({
        selectedSiteId: 'mangadex',
        appliedSearch: 'solo',
        isMultiSourceSearch: false,
        panelMangadexLanguage: 'en',
      }),
    ).toBe('mangadex|solo|one|en');

    expect(
      buildLatestListTriggerKey({
        selectedSiteId: 'minotruyen',
        appliedSearch: '',
        isMultiSourceSearch: false,
        panelMinotruyenCategory: 'comics',
      }),
    ).toBe('minotruyen||one|comics');

    expect(
      buildLatestListTriggerKey({
        selectedSiteId: 'cuutruyen',
        appliedSearch: 'one piece',
        isMultiSourceSearch: true,
        selectedMultiSearchSiteIds: ['truyenqq', 'cuutruyen'],
      }),
    ).toBe('cuutruyen|one piece|all:cuutruyen,truyenqq');
  });

  test('makeListingPageCacheKey isolates page numbers per trigger key', () => {
    expect(makeListingPageCacheKey('truyenqq||one', 1)).toBe('truyenqq||one|p:1');
    expect(makeListingPageCacheKey('truyenqq||one', 3)).toBe('truyenqq||one|p:3');
    expect(makeListingPageCacheKey('truyenqq||one', 0)).toBe('truyenqq||one|p:1');
  });

  test('returns fresh -> stale -> miss across 5-minute fresh TTL and 30-minute stale TTL', () => {
    const cache = createLatestUpdatesCache({
      freshTtlMs: 5 * 60 * 1000,
      staleTtlMs: 30 * 60 * 1000,
      maxEntries: 10,
    });
    const key = makeListingPageCacheKey('cuutruyen||one', 1);
    const t0 = 1_000_000;

    expect(cache.get(key, t0)).toEqual({ status: 'miss', entry: null, ageMs: Infinity });

    cache.set(
      key,
      { rows: [{ title: 'One', mangaUrl: 'https://cuutruyen.net/1' }], listingTotalPages: 5, fetchError: '' },
      t0,
    );

    // At 4m59s -> fresh
    const freshRes = cache.get(key, t0 + 4 * 60 * 1000 + 59 * 1000);
    expect(freshRes.status).toBe('fresh');
    expect(freshRes.entry.rows).toHaveLength(1);
    expect(freshRes.entry.fetchedAt).toBe(t0);

    // At 5m00s -> stale (SWR)
    const staleRes = cache.get(key, t0 + 5 * 60 * 1000);
    expect(staleRes.status).toBe('stale');
    expect(staleRes.entry.listingTotalPages).toBe(5);

    // At 30m00s -> expired miss and evicted
    const expiredRes = cache.get(key, t0 + 30 * 60 * 1000);
    expect(expiredRes).toEqual({ status: 'miss', entry: null, ageMs: Infinity });
    expect(cache.size()).toBe(0);
  });

  test('never caches empty rows lists', () => {
    const cache = createLatestUpdatesCache();
    const key = makeListingPageCacheKey('truyenqq||one', 1);
    cache.set(key, { rows: [], listingTotalPages: 1, fetchError: 'network' }, 1000);
    expect(cache.size()).toBe(0);
    expect(cache.get(key, 1000).status).toBe('miss');
  });

  test('enforces LRU eviction on maxEntries and refreshes recency on get', () => {
    const cache = createLatestUpdatesCache({ freshTtlMs: 300_000, staleTtlMs: 1_800_000, maxEntries: 3 });
    const k1 = makeListingPageCacheKey('a||one', 1);
    const k2 = makeListingPageCacheKey('b||one', 1);
    const k3 = makeListingPageCacheKey('c||one', 1);
    const k4 = makeListingPageCacheKey('d||one', 1);
    const row = (id) => ({ rows: [{ title: id, mangaUrl: `https://x/${id}` }], listingTotalPages: 1 });

    cache.set(k1, row('a'), 100);
    cache.set(k2, row('b'), 100);
    cache.set(k3, row('c'), 100);
    // Touch k1 so k2 becomes least recently used
    expect(cache.get(k1, 200).status).toBe('fresh');

    cache.set(k4, row('d'), 300);
    expect(cache.size()).toBe(3);
    expect(cache.get(k2, 300).status).toBe('miss');
    expect(cache.get(k1, 300).status).toBe('fresh');
    expect(cache.get(k3, 300).status).toBe('fresh');
    expect(cache.get(k4, 300).status).toBe('fresh');
  });

  test('invalidateByTriggerKey clears all cached pages for that connector trigger only', () => {
    const cache = createLatestUpdatesCache();
    const tq1 = makeListingPageCacheKey('truyenqq||one', 1);
    const tq2 = makeListingPageCacheKey('truyenqq||one', 2);
    const cuu1 = makeListingPageCacheKey('cuutruyen||one', 1);
    const row = (id) => ({ rows: [{ title: id, mangaUrl: `https://x/${id}` }], listingTotalPages: 2 });

    cache.set(tq1, row('tq1'), 1000);
    cache.set(tq2, row('tq2'), 1000);
    cache.set(cuu1, row('cuu1'), 1000);

    cache.invalidateByTriggerKey('truyenqq||one');
    expect(cache.get(tq1, 1000).status).toBe('miss');
    expect(cache.get(tq2, 1000).status).toBe('miss');
    expect(cache.get(cuu1, 1000).status).toBe('fresh');
  });

  test('set updates fetchedAt and refreshes LRU order; delete/clear/NaN page and clock skew behave safely', () => {
    expect(makeListingPageCacheKey('x||one', -3)).toBe('x||one|p:1');
    expect(makeListingPageCacheKey('x||one', 'abc')).toBe('x||one|p:1');

    const cache = createLatestUpdatesCache({ freshTtlMs: 300_000, staleTtlMs: 1_800_000, maxEntries: 2 });
    const k1 = makeListingPageCacheKey('a||one', 1);
    const k2 = makeListingPageCacheKey('b||one', 1);
    const k3 = makeListingPageCacheKey('c||one', 1);
    const row = (id) => ({ rows: [{ title: id, mangaUrl: `https://x/${id}` }], listingTotalPages: 1 });

    cache.set(k1, row('a1'), 100);
    cache.set(k2, row('b1'), 100);
    // Overwrite k1 with newer timestamp so k1 moves to MRU and k2 becomes LRU
    cache.set(k1, row('a2'), 500);
    cache.set(k3, row('c1'), 600);

    expect(cache.get(k2, 600).status).toBe('miss');
    // Clock skew (now < fetchedAt) clamps ageMs >= 0 and keeps entry fresh
    const hit = cache.get(k1, 400);
    expect(hit.status).toBe('fresh');
    expect(hit.ageMs).toBe(0);
    expect(hit.entry.rows[0].title).toBe('a2');

    cache.delete(k1);
    expect(cache.size()).toBe(1);
    cache.clear();
    expect(cache.size()).toBe(0);
  });
});
