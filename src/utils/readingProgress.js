/** Tiến đọc dở theo truyện — chủ yếu `chapterUrl`; entry cũ có thể còn field scroll/zoom (bỏ qua). */

export const READING_PROGRESS_STORAGE_KEY = 'mangaReaderProgressByManga';

/**
 * Khóa ổn định cho một truyện (khớp yêu thích khi có URL; offline/CBZ có fallback).
 * @param {object | null | undefined} manga
 * @param {string} siteFallback — state `site` trong App
 * @param {string} sourceUrl — state `sourceUrl` trong App
 * @param {string} savePath — thư mục Save To
 * @returns {string | null}
 */
export function getReaderProgressKey(manga, siteFallback, sourceUrl, savePath) {
  if (!manga || typeof manga !== 'object') return null;
  const siteId = String(manga.siteId || siteFallback || '').trim();
  const url = String(manga.mangaUrl || sourceUrl || '').trim();
  if (url) return `${siteId}::${url}`;

  const cbzFilePath = String(manga.cbzFilePath || '').trim();
  if (cbzFilePath) return `cbzFile::${cbzFilePath}`;

  const pdfFilePath = String(manga.pdfFilePath || '').trim();
  if (pdfFilePath) return `pdfFile::${pdfFilePath}`;

  const offlineAbs = String(manga.offlineMangaDirAbsolute || '').trim();
  if (offlineAbs) return `offline::${offlineAbs}`;

  const cbzDir = String(manga.cbzTempExtractDir || '').trim();
  if (cbzDir) return `cbz::${cbzDir}`;

  const title = String(manga.title || '').trim();
  const sp = String(savePath || '').trim();
  if (title && sp && manga.offlineOnly) return `offlineTitle::${sp}::${title}`;

  return null;
}

/**
 * @param {Array<{ url?: string }>} chapters
 * @param {string} chapterUrl
 * @returns {number | null}
 */
export function findChapterIndexFromSavedUrl(chapters, chapterUrl) {
  if (!chapterUrl || !Array.isArray(chapters)) return null;
  const u = String(chapterUrl);
  const i = chapters.findIndex((c) => String(c?.url || '') === u);
  return i >= 0 ? i : null;
}

export function loadReadingProgressMap() {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(READING_PROGRESS_STORAGE_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw);
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
}

/**
 * @param {string | null | undefined} key
 * @returns {{ chapterUrl?: string, updatedAt?: number, [key: string]: unknown } | null}
 */
export function getReadingProgressEntry(key) {
  if (!key) return null;
  const map = loadReadingProgressMap();
  const e = map[key];
  if (!e || typeof e !== 'object') return null;
  return e;
}

/**
 * @param {string | null | undefined} key
 * @param {object} partial — ví dụ { chapterUrl }, { scrollTop }, hoặc cả hai
 */
export function patchReadingProgress(key, partial) {
  if (!key || !partial || typeof partial !== 'object') return;
  const map = loadReadingProgressMap();
  const prev = map[key] && typeof map[key] === 'object' ? map[key] : {};
  const next = { ...prev, ...partial, updatedAt: Date.now() };
  if (
    typeof partial.chapterUrl === 'string' &&
    partial.chapterUrl !== String(prev.chapterUrl || '') &&
    partial.scrollTop === undefined &&
    partial.scrollRatio === undefined &&
    partial.readerZoom === undefined &&
    partial.anchorFileIndex === undefined &&
    partial.anchorOffsetY === undefined
  ) {
    delete next.scrollTop;
    delete next.scrollRatio;
    delete next.readerZoom;
    delete next.anchorFileIndex;
    delete next.anchorOffsetY;
  }
  map[key] = next;
  try {
    localStorage.setItem(READING_PROGRESS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* quota */
  }
}

/**
 * @param {Array<{ url?: string }>} chapters
 * @param {string | null | undefined} key
 * @returns {number | null}
 */
export function getSavedChapterIndex(chapters, key) {
  const e = getReadingProgressEntry(key);
  if (!e?.chapterUrl) return null;
  return findChapterIndexFromSavedUrl(chapters, e.chapterUrl);
}
