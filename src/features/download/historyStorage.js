export const DOWNLOAD_HISTORY_KEY = 'mangaDownloadHistory';

export function prependHistory(prev, entry, max = 300) {
  return [entry, ...prev].slice(0, max);
}

export function loadDownloadHistory() {
  try {
    const raw = localStorage.getItem(DOWNLOAD_HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function writeDownloadHistory(entries) {
  try {
    if (Array.isArray(entries) && entries.length) {
      localStorage.setItem(DOWNLOAD_HISTORY_KEY, JSON.stringify(entries));
    } else {
      localStorage.removeItem(DOWNLOAD_HISTORY_KEY);
    }
  } catch {
    /* ignore quota */
  }
}
