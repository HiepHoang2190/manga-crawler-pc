export const LATEST_LISTING_FRESH_TTL_MS = 5 * 60 * 1000;
export const LATEST_LISTING_STALE_TTL_MS = 30 * 60 * 1000;
export const LATEST_LISTING_CACHE_MAX_ENTRIES = 60;

/**
 * Build deterministic trigger key encoding source, search term, multi-source scope,
 * and connector-specific parameters (`mangadex` language, `minotruyen` category).
 */
export function buildLatestListTriggerKey({
  selectedSiteId = '',
  appliedSearch = '',
  isMultiSourceSearch = false,
  selectedMultiSearchSiteIds = [],
  panelMangadexLanguage = '',
  panelMinotruyenCategory = '',
} = {}) {
  const siteId = String(selectedSiteId || '').trim();
  const search = String(appliedSearch || '').trim();
  const scope = isMultiSourceSearch
    ? `all:${Array.isArray(selectedMultiSearchSiteIds) ? selectedMultiSearchSiteIds.slice().sort().join(',') : ''}`
    : 'one';
  if (siteId === 'mangadex') {
    return `${siteId}|${search}|${scope}|${String(panelMangadexLanguage || '').trim()}`;
  }
  if (siteId === 'minotruyen') {
    return `${siteId}|${search}|${scope}|${String(panelMinotruyenCategory || '').trim()}`;
  }
  return `${siteId}|${search}|${scope}`;
}

export function makeListingPageCacheKey(triggerKey, page = 1) {
  const normalizedPage = Math.max(1, Math.floor(Number(page) || 1));
  return `${String(triggerKey || '').trim()}|p:${normalizedPage}`;
}

/**
 * Bounded LRU cache supporting Fresh TTL (< freshTtlMs) and Stale-While-Revalidate
 * window (freshTtlMs .. staleTtlMs). Empty row sets are intentionally skipped.
 */
export function createLatestUpdatesCache({
  freshTtlMs = LATEST_LISTING_FRESH_TTL_MS,
  staleTtlMs = LATEST_LISTING_STALE_TTL_MS,
  maxEntries = LATEST_LISTING_CACHE_MAX_ENTRIES,
} = {}) {
  const store = new Map();

  return {
    get(cacheKey, now = Date.now()) {
      const key = String(cacheKey || '');
      const entry = store.get(key);
      if (!entry) {
        return { status: 'miss', entry: null, ageMs: Infinity };
      }
      const ageMs = Math.max(0, now - Number(entry.fetchedAt || 0));
      if (ageMs >= staleTtlMs) {
        store.delete(key);
        return { status: 'miss', entry: null, ageMs: Infinity };
      }
      // Refresh LRU recency on valid hit
      store.delete(key);
      store.set(key, entry);
      const status = ageMs < freshTtlMs ? 'fresh' : 'stale';
      return { status, entry, ageMs };
    },

    set(cacheKey, entry, now = Date.now()) {
      const key = String(cacheKey || '');
      if (!key || !entry || !Array.isArray(entry.rows) || entry.rows.length === 0) {
        return;
      }
      const nextEntry = {
        ...entry,
        fetchedAt: typeof entry.fetchedAt === 'number' && entry.fetchedAt > 0 ? entry.fetchedAt : now,
      };
      store.delete(key);
      store.set(key, nextEntry);
      while (store.size > maxEntries) {
        const oldestKey = store.keys().next().value;
        if (oldestKey === undefined) break;
        store.delete(oldestKey);
      }
    },

    delete(cacheKey) {
      store.delete(String(cacheKey || ''));
    },

    invalidateByTriggerKey(triggerKey) {
      const prefix = `${String(triggerKey || '').trim()}|p:`;
      for (const key of Array.from(store.keys())) {
        if (key.startsWith(prefix)) {
          store.delete(key);
        }
      }
    },

    clear() {
      store.clear();
    },

    size() {
      return store.size;
    },
  };
}

export const latestUpdatesPageCache = createLatestUpdatesCache();
