const BOOKMARKS_KEY = 'ebookBookmarks_v1';
const MAX_BOOKMARKS_PER_BOOK = 100;

function loadBookmarksMap() {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(BOOKMARKS_KEY);
    if (!raw) return {};
    const map = JSON.parse(raw);
    return map && typeof map === 'object' && !Array.isArray(map) ? map : {};
  } catch {
    return {};
  }
}

function saveBookmarksMap(map) {
  try {
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(map));
  } catch {
    /* quota */
  }
}

/**
 * @param {string} absolutePath
 * @returns {Array<{ id: string, index: number, createdAt: number }>}
 */
export function loadBookmarks(absolutePath) {
  const map = loadBookmarksMap();
  const list = map[absolutePath];
  return Array.isArray(list) ? list : [];
}

/**
 * @param {string} absolutePath
 * @param {number} index
 * @returns {{ ok: boolean, warning?: string }}
 */
export function addBookmark(absolutePath, index) {
  const map = loadBookmarksMap();
  const list = Array.isArray(map[absolutePath]) ? map[absolutePath] : [];

  if (list.length >= MAX_BOOKMARKS_PER_BOOK) {
    return { ok: false, warning: `Maximum ${MAX_BOOKMARKS_PER_BOOK} bookmarks per book reached.` };
  }

  const now = Date.now();
  const id = `bm_${now}_${index}`;
  list.push({ id, index, createdAt: now });
  map[absolutePath] = list;
  saveBookmarksMap(map);
  return { ok: true };
}

/**
 * @param {string} absolutePath
 * @param {string} bookmarkId
 * @returns {void}
 */
export function deleteBookmark(absolutePath, bookmarkId) {
  const map = loadBookmarksMap();
  const list = Array.isArray(map[absolutePath]) ? map[absolutePath] : [];
  map[absolutePath] = list.filter((b) => b.id !== bookmarkId);
  saveBookmarksMap(map);
}
