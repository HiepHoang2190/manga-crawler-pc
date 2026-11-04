const PREFS_KEY = 'ebookReaderPrefs_v1';

/** @type {ReaderPreferences} */
const DEFAULT_PREFS = {
  fontSize: 18,
  fontFamily: 'serif',
  lineHeight: 1.8,
  marginPercent: 8,
  theme: 'light',
  layoutMode: 'paginated',
};

/**
 * @typedef {{ fontSize: number, fontFamily: string, lineHeight: number, marginPercent: number, theme: string, layoutMode: string }} ReaderPreferences
 */

/**
 * @returns {ReaderPreferences}
 */
export function loadEbookPrefs() {
  if (typeof window === 'undefined') return { ...DEFAULT_PREFS };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const stored = JSON.parse(raw);
    if (!stored || typeof stored !== 'object') return { ...DEFAULT_PREFS };
    return { ...DEFAULT_PREFS, ...stored };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

/**
 * @param {Partial<ReaderPreferences>} partial
 * @returns {void}
 */
export function saveEbookPrefs(partial) {
  if (typeof window === 'undefined') return;
  try {
    const current = loadEbookPrefs();
    const next = { ...current, ...partial };
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      /* quota */
    }
  } catch {
    /* parse error */
  }
}
