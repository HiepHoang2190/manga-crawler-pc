const PROGRESS_KEY = 'ebookReadingProgress_v1';

/**
 * @param {string} absolutePath
 * @returns {{ index: number, updatedAt: number } | null}
 */
export function loadEbookProgress(absolutePath) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw);
    if (!map || typeof map !== 'object') return null;
    const entry = map[absolutePath];
    if (!entry || typeof entry !== 'object') return null;
    return entry;
  } catch {
    return null;
  }
}

/**
 * @param {string} absolutePath
 * @param {number} index
 * @returns {void}
 */
export function saveEbookProgress(absolutePath, index) {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[absolutePath] = { index, updatedAt: Date.now() };
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(map));
    } catch {
      /* quota */
    }
  } catch {
    /* parse error */
  }
}
