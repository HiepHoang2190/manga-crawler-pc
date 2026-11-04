// src/utils/recentDownloadsLog.js
export const RECENT_DOWNLOADS_KEY = 'dashboardRecentDownloads';
export const RECENT_DOWNLOADS_CAP = 100;

/**
 * @typedef {Object} RecentDownloadEntry
 * @property {string} mangaId
 * @property {string} mangaTitle
 * @property {string} chapterTitle
 * @property {string} chapterUrl
 * @property {string} coverUrl
 * @property {string} connectorId
 * @property {number} completedAt  - epoch ms
 */

function loadAll() {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_DOWNLOADS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAll(entries) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(RECENT_DOWNLOADS_KEY, JSON.stringify(entries));
  } catch {
    /* quota — drop silently */
  }
}

export function pushRecentDownload(entry) {
  if (!entry || typeof entry !== 'object') return;
  const list = loadAll();
  list.unshift({ ...entry });
  if (list.length > RECENT_DOWNLOADS_CAP) list.length = RECENT_DOWNLOADS_CAP;
  saveAll(list);
}

export function getRecentDownloads(windowMs) {
  const cutoff = Date.now() - Math.max(0, Number(windowMs) || 0);
  return loadAll().filter((e) => Number(e?.completedAt) >= cutoff);
}
