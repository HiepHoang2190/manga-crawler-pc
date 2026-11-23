/**
 * Service helpers for Bookmarked/Followed Manga in Explore.
 */

/**
 * Filter favorites based on search query, status, and connector site.
 * @param {object} params
 * @param {Array} [params.favorites]
 * @param {object} [params.favoriteSyncById]
 * @param {string} [params.query]
 * @param {'all'|'hasNew'} [params.statusFilter]
 * @param {string} [params.siteFilter]
 * @returns {Array}
 */
export function filterFavorites({
  favorites = [],
  favoriteSyncById = {},
  query = '',
  statusFilter = 'all',
  siteFilter = '',
}) {
  if (!Array.isArray(favorites)) return [];
  const q = String(query || '').trim().toLowerCase();
  const sFilter = String(siteFilter || '').trim();

  return favorites.filter((item) => {
    if (!item) return false;

    // Site filter
    if (sFilter && String(item.siteId || '') !== sFilter) {
      return false;
    }

    // Query filter
    if (q) {
      const title = String(item.title || '').toLowerCase();
      if (!title.includes(q)) return false;
    }

    // Status filter
    const sync = favoriteSyncById[item.id];
    const hasNew = Boolean(sync?.hasNew);

    if (statusFilter === 'hasNew') {
      return hasNew;
    }

    return true;
  });
}

/**
 * Compute counts and connector breakdown for favorites.
 * @param {object} params
 * @param {Array} [params.favorites]
 * @param {object} [params.favoriteSyncById]
 * @returns {{ total: number, hasNewCount: number, siteBreakdown: Array<{ siteId: string, count: number, hasNewCount: number }> }}
 */
export function computeFavoritesStats({ favorites = [], favoriteSyncById = {} }) {
  const total = favorites.length;
  let hasNewCount = 0;
  const siteMap = new Map();

  favorites.forEach((item) => {
    if (!item) return;
    const siteId = String(item.siteId || 'unknown');
    const sync = favoriteSyncById[item.id];
    const isNew = Boolean(sync?.hasNew);

    if (isNew) {
      hasNewCount++;
    }

    const current = siteMap.get(siteId) || { siteId, count: 0, hasNewCount: 0 };
    current.count++;
    if (isNew) current.hasNewCount++;
    siteMap.set(siteId, current);
  });

  const siteBreakdown = Array.from(siteMap.values()).sort((a, b) =>
    a.siteId.localeCompare(b.siteId, undefined, { sensitivity: 'base' })
  );

  return {
    total,
    hasNewCount,
    siteBreakdown,
  };
}

/**
 * Run a concurrent check queue with concurrency limit and AbortSignal support.
 * @param {object} params
 * @param {Array} params.list
 * @param {(item: object) => Promise<any>} params.checkFn
 * @param {number} [params.concurrency=2]
 * @param {AbortSignal} [params.abortSignal]
 * @param {(progress: { current: number, total: number, item: object }) => void} [params.onProgress]
 * @param {(result: { item: object, res: any }) => void} [params.onItemResult]
 * @returns {Promise<Array>}
 */
export async function runFavoriteCheckQueue({
  list = [],
  checkFn,
  concurrency = 2,
  abortSignal,
  onProgress,
  onItemResult,
}) {
  if (!Array.isArray(list) || list.length === 0 || typeof checkFn !== 'function') {
    return [];
  }

  if (abortSignal?.aborted) {
    return [];
  }

  const queue = [...list];
  const results = [];
  const total = list.length;
  let completed = 0;

  const runWorker = async () => {
    while (queue.length > 0) {
      if (abortSignal?.aborted) break;
      const item = queue.shift();
      if (!item) break;

      if (typeof onProgress === 'function' && !abortSignal?.aborted) {
        onProgress({ current: Math.min(total, completed + 1), completed, total, item });
      }

      try {
        const res = await checkFn(item, abortSignal);
        if (abortSignal?.aborted) break;
        completed++;
        results.push({ item, res });
        if (typeof onProgress === 'function') {
          onProgress({ current: completed, completed, total, item });
        }
        if (typeof onItemResult === 'function') {
          onItemResult({ item, res });
        }
      } catch (err) {
        if (abortSignal?.aborted) break;
        completed++;
        results.push({ item, error: err });
        if (typeof onProgress === 'function') {
          onProgress({ current: completed, completed, total, item });
        }
        if (typeof onItemResult === 'function') {
          onItemResult({ item, error: err });
        }
      }
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, total) }, () => runWorker());
  const allWorkers = Promise.all(workers);

  if (!abortSignal) {
    await allWorkers;
    return results;
  }

  let onAbort;
  const abortPromise = new Promise((resolve) => {
    onAbort = () => resolve();
    abortSignal.addEventListener('abort', onAbort, { once: true });
  });

  try {
    await Promise.race([allWorkers, abortPromise]);
  } finally {
    abortSignal.removeEventListener('abort', onAbort);
  }

  return results;
}
