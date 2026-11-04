// src/utils/dashboardAggregator.js
import { loadReadingProgressMap } from '../../utils/readingProgress.js';

/**
 * Best-effort manga title from a manga URL when the favorite is missing.
 * Falls back to the raw URL if parsing fails.
 * @param {string} url
 * @returns {string}
 */
export function prettifyUrlForTitle(url) {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop() || u.hostname;
    return decodeURIComponent(last.replace(/[-_]/g, ' '));
  } catch {
    return String(url || '');
  }
}

/**
 * Best-effort chapter title from a chapter URL (last path segment, decoded).
 * @param {string} url
 * @returns {string}
 */
export function prettifyChapterTitle(url) {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop() || '';
    return decodeURIComponent(last.replace(/[-_]/g, ' ')) || u.pathname;
  } catch {
    return String(url || '');
  }
}

/**
 * Parse "siteId::mangaUrl" key produced by getReaderProgressKey().
 * @param {string} key
 * @returns {{ siteId: string, mangaUrl: string } | null}
 */
function parseProgressKey(key) {
  if (typeof key !== 'string') return null;
  const sep = key.indexOf('::');
  if (sep < 0) return null;
  const siteId = key.slice(0, sep);
  const rest = key.slice(sep + 2);
  if (!rest.startsWith('http')) return null; // skip cbz/offline keys
  return { siteId, mangaUrl: rest };
}

/**
 * @returns {{ siteId:string, mangaUrl:string, chapterUrl:string, updatedAt:number } | null}
 */
export function getContinueReading() {
  const map = loadReadingProgressMap();
  let best = null;
  for (const [rawKey, entry] of Object.entries(map)) {
    if (!entry || typeof entry !== 'object') continue;
    if (!entry.chapterUrl) continue;
    const parsed = parseProgressKey(rawKey);
    if (!parsed) continue;
    const ts = Number(entry.updatedAt) || 0;
    if (!best || ts > best.updatedAt) {
      best = { ...parsed, chapterUrl: String(entry.chapterUrl), updatedAt: ts };
    }
  }
  return best;
}

/**
 * @param {Array<{id:string,title:string,coverUrl?:string,mangaUrl?:string,hasNew?:boolean}>} favorites
 * @param {number} limit
 */
export function getNewChapterFavorites(favorites, limit = 5) {
  if (!Array.isArray(favorites)) return { items: [], totalCount: 0 };
  const withNew = favorites.filter((f) => f && f.hasNew === true);
  return {
    items: withNew.slice(0, Math.max(0, limit)),
    totalCount: withNew.length,
  };
}

/**
 * Queue snapshot has shape produced by loadQueueSnapshotFromStorage().
 * @param {Array<{chapters:Array<{status:string,chapterTitle?:string,progress?:number}>,mangaTitle?:string}>} queue
 */
export function getQueueStatus(queue) {
  if (!Array.isArray(queue)) return { runningCount: 0, waitingCount: 0, currentJob: null };
  let runningCount = 0;
  let waitingCount = 0;
  let currentJob = null;
  for (const group of queue) {
    if (!group || !Array.isArray(group.chapters)) continue;
    for (const c of group.chapters) {
      if (c?.status === 'downloading') {
        runningCount += 1;
        if (!currentJob) {
          currentJob = {
            mangaTitle: group.mangaTitle || '',
            chapterTitle: c.chapterTitle || '',
            progress: typeof c.progress === 'number' ? c.progress : 0,
          };
        }
      } else if (c?.status === 'waiting') {
        waitingCount += 1;
      }
    }
  }
  return { runningCount, waitingCount, currentJob };
}

/**
 * @param {Array<import('./recentDownloadsLog.js').RecentDownloadEntry>} entries
 * @param {number} limit
 */
export function getRecentDownloadsForDashboard(entries, limit = 10) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return { items: [], totalChapters: 0, totalMangas: 0 };
  }
  const sorted = [...entries].sort(
    (a, b) => (Number(b.completedAt) || 0) - (Number(a.completedAt) || 0),
  );
  const byManga = new Map();
  for (const e of sorted) {
    if (!byManga.has(e.mangaId)) byManga.set(e.mangaId, e);
  }
  const items = [...byManga.values()].slice(0, Math.max(0, limit));
  return {
    items,
    totalChapters: entries.length,
    totalMangas: byManga.size,
  };
}

/**
 * @param {Array<{id:string,siteId?:string,chapters?:any[]}>} library
 * @param {number} storageBytes
 */
export function getLibraryStats(library, storageBytes) {
  const list = Array.isArray(library) ? library : [];
  const mangaCount = list.length;
  let totalChapterCount = 0;
  const perConnector = new Map(); // siteId -> { mangas, chapters }
  for (const m of list) {
    const chCount = Array.isArray(m?.chapters) ? m.chapters.length : 0;
    totalChapterCount += chCount;
    const sid = String(m?.siteId || '');
    if (!sid) continue;
    const agg = perConnector.get(sid) || { mangas: 0, chapters: 0 };
    agg.mangas += 1;
    agg.chapters += chCount;
    perConnector.set(sid, agg);
  }
  let topConnectorId = null;
  if (perConnector.size > 0) {
    const sorted = [...perConnector.entries()].sort((a, b) => {
      if (b[1].mangas !== a[1].mangas) return b[1].mangas - a[1].mangas;
      if (b[1].chapters !== a[1].chapters) return b[1].chapters - a[1].chapters;
      return a[0].localeCompare(b[0]);
    });
    topConnectorId = sorted[0][0];
  }
  return {
    mangaCount,
    totalChapterCount,
    totalStorageBytes: Math.max(0, Number(storageBytes) || 0),
    topConnectorId,
  };
}

/**
 * @param {{
 *   favorites: Array,
 *   downloadHistory: Array,
 *   storageBytes: number | null,
 *   nowMs: number,
 * }} args
 */
export function getKpiTiles({ favorites, downloadHistory, storageBytes, nowMs }) {
  const favs = Array.isArray(favorites) ? favorites : [];
  const hist = Array.isArray(downloadHistory) ? downloadHistory : [];
  const mangaCount = favs.length;
  let chapterCount = 0;
  for (const f of favs) {
    const n = Number(f?.chapterCount);
    if (Number.isFinite(n) && n > 0) chapterCount += n;
  }
  const now = Number(nowMs) || Date.now();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startMs = startOfToday.getTime();
  let downloadsToday = 0;
  for (const e of hist) {
    if (!e || e.ok === false) continue;
    const t = e.at ? Date.parse(e.at) : NaN;
    if (Number.isFinite(t) && t >= startMs) downloadsToday += 1;
  }
  return {
    mangaCount,
    chapterCount,
    storageBytes: storageBytes == null ? null : Math.max(0, Number(storageBytes) || 0),
    downloadsToday,
  };
}

/**
 * @param {Array} downloadHistory
 * @param {{ days?: number, nowMs?: number }} [opts]
 * @returns {Array<{ dateISO: string, count: number }>} length = days (oldest → newest)
 */
export function getDownloadsPerDay(downloadHistory, { days = 30, nowMs } = {}) {
  const hist = Array.isArray(downloadHistory) ? downloadHistory : [];
  const now = Number(nowMs) || Date.now();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const dayMs = 24 * 3600 * 1000;
  const buckets = new Array(days).fill(0);
  const startWindow = startOfToday.getTime() - (days - 1) * dayMs;
  for (const e of hist) {
    if (!e || e.ok === false) continue;
    const t = e.at ? Date.parse(e.at) : NaN;
    if (!Number.isFinite(t) || t < startWindow) continue;
    const idx = Math.floor((t - startWindow) / dayMs);
    if (idx >= 0 && idx < days) buckets[idx] += 1;
  }
  return buckets.map((count, i) => {
    // startWindow is a LOCAL-midnight epoch ms; build the ISO date from local
    // Date parts so the label matches what the user calls "today" instead of
    // the UTC date (matters in any timezone whose local midnight straddles UTC).
    const d = new Date(startWindow + i * dayMs);
    const y = d.getFullYear().toString().padStart(4, '0');
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return { dateISO: `${y}-${m}-${day}`, count };
  });
}

/**
 * @param {Array} favorites
 * @param {{ limit?: number }} [opts]
 * @returns {{ items: Array<{siteId,name,mangas,chapters,pct}>, others: {mangas,chapters,pct}|null, total: number }}
 */
export function getConnectorBreakdown(favorites, { limit = 5 } = {}) {
  const favs = Array.isArray(favorites) ? favorites : [];
  const byConn = new Map(); // siteId -> { mangas, chapters }
  for (const f of favs) {
    const sid = String(f?.siteId || '');
    if (!sid) continue;
    const agg = byConn.get(sid) || { mangas: 0, chapters: 0 };
    agg.mangas += 1;
    const ch = Number(f?.chapterCount);
    if (Number.isFinite(ch) && ch > 0) agg.chapters += ch;
    byConn.set(sid, agg);
  }
  const total = favs.length;
  if (total === 0 || byConn.size === 0) {
    return { items: [], others: null, total };
  }
  const sorted = [...byConn.entries()].sort((a, b) => {
    if (b[1].mangas !== a[1].mangas) return b[1].mangas - a[1].mangas;
    if (b[1].chapters !== a[1].chapters) return b[1].chapters - a[1].chapters;
    return a[0].localeCompare(b[0]);
  });
  const cap = Math.max(1, limit);
  const top = sorted.slice(0, cap);
  const rest = sorted.slice(cap);
  const items = top.map(([sid, agg]) => ({
    siteId: sid,
    name: sid,
    mangas: agg.mangas,
    chapters: agg.chapters,
    pct: total > 0 ? agg.mangas / total : 0,
  }));
  let others = null;
  if (rest.length > 0) {
    const oMangas = rest.reduce((s, [, a]) => s + a.mangas, 0);
    const oChapters = rest.reduce((s, [, a]) => s + a.chapters, 0);
    others = { mangas: oMangas, chapters: oChapters, pct: total > 0 ? oMangas / total : 0 };
  }
  return { items, others, total };
}

/**
 * @param {Array<{ title?: string, chapterCount?: number }>} favorites
 * @param {{ limit?: number }} [opts]
 */
export function getMangaChapterRankingFromFavorites(favorites, { limit = 20 } = {}) {
  const cap = Math.max(1, limit);
  return [...(Array.isArray(favorites) ? favorites : [])]
    .map((f) => ({
      title: String(f?.title || '').trim(),
      chapterCount: Math.max(0, Number(f?.chapterCount) || 0),
    }))
    .filter((x) => x.title)
    .sort((a, b) => b.chapterCount - a.chapterCount || a.title.localeCompare(b.title))
    .slice(0, cap);
}

/**
 * @param {Array<{ mangaTitle?: string, chapterCount?: number, absolutePath?: string }>} localItems
 * @param {{ limit?: number }} [opts]
 */
export function getMangaChapterRankingFromLocal(localItems, { limit = 20, excludeAbsolutePaths } = {}) {
  const cap = Math.max(1, limit);
  const hidden =
    excludeAbsolutePaths instanceof Set && excludeAbsolutePaths.size > 0
      ? excludeAbsolutePaths
      : null;
  return [...(Array.isArray(localItems) ? localItems : [])]
    .filter((x) => {
      if (!hidden) return true;
      const p = String(x?.absolutePath || '').trim();
      return !p || !hidden.has(p);
    })
    .map((x) => ({
      title: String(x?.mangaTitle || '').trim(),
      chapterCount: Math.max(0, Number(x?.chapterCount) || 0),
      absolutePath: String(x?.absolutePath || '').trim(),
    }))
    .filter((x) => x.title)
    .sort((a, b) => b.chapterCount - a.chapterCount || a.title.localeCompare(b.title))
    .slice(0, cap);
}

/**
 * @param {Array<{ title: string, bytes: number }>} entries
 * @param {{ limit?: number }} [opts]
 */
export function getMangaStorageRanking(entries, { limit = 20 } = {}) {
  const cap = Math.max(1, limit);
  return [...(Array.isArray(entries) ? entries : [])]
    .filter((x) => x && x.title)
    .sort((a, b) => b.bytes - a.bytes || a.title.localeCompare(b.title))
    .slice(0, cap);
}
