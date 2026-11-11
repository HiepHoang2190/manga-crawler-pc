export const READER_CHAPTER_WIDTH_KEY = 'mangaReaderChapterSidebarWidthPx';
export const READER_CHAPTER_WIDTH_DEFAULT = 360;
export const READER_CHAPTER_WIDTH_MIN = 220;
export const READER_CHAPTER_WIDTH_MAX = 640;
export const READER_WEBTOON_SEAMLESS_KEY = 'mangaReaderWebtoonSeamless';
export const READER_ZOOM_KEY = 'mangaReaderZoom';
export const READER_ZOOM_MIN = 0.5;
export const READER_ZOOM_MAX = 3;
export const READER_ZOOM_STEP = 0.1;
export const READER_NAV_INVERT_KEY = 'mangaReaderChapterNavInvert';

export function clampReaderChapterWidth(px, innerWidth) {
  const w = typeof innerWidth === 'number' ? innerWidth : 1200;
  const max = Math.min(
    READER_CHAPTER_WIDTH_MAX,
    Math.max(READER_CHAPTER_WIDTH_MIN + 120, Math.floor(w * 0.58))
  );
  return Math.max(READER_CHAPTER_WIDTH_MIN, Math.min(max, Math.round(px)));
}

export function loadReaderChapterWidth() {
  if (typeof window === 'undefined') return READER_CHAPTER_WIDTH_DEFAULT;
  try {
    const n = Number(localStorage.getItem(READER_CHAPTER_WIDTH_KEY));
    if (Number.isFinite(n)) return clampReaderChapterWidth(n, window.innerWidth);
  } catch {
    /* */
  }
  return clampReaderChapterWidth(READER_CHAPTER_WIDTH_DEFAULT, window.innerWidth);
}

export function persistReaderChapterWidth(px) {
  try {
    localStorage.setItem(READER_CHAPTER_WIDTH_KEY, String(px));
  } catch {
    /* */
  }
}

export function loadWebtoonSeamless() {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(READER_WEBTOON_SEAMLESS_KEY) === '1';
  } catch {
    return false;
  }
}

export function persistWebtoonSeamless(on) {
  try {
    localStorage.setItem(READER_WEBTOON_SEAMLESS_KEY, on ? '1' : '0');
  } catch {
    /* */
  }
}

export function loadReaderZoom() {
  if (typeof window === 'undefined') return 1;
  try {
    const raw_zoom = localStorage.getItem(READER_ZOOM_KEY);
    if (raw_zoom == null || raw_zoom === '') return 1;
    const n = Number(raw_zoom);
    if (!Number.isFinite(n)) return 1;
    return Math.min(
      READER_ZOOM_MAX,
      Math.max(READER_ZOOM_MIN, Math.round(n * 100) / 100)
    );
  } catch {
    /* */
  }
  return 1;
}

export function persistReaderZoom(z) {
  try {
    localStorage.setItem(READER_ZOOM_KEY, String(z));
  } catch {
    /* */
  }
}

export function clampZoom(z) {
  return Math.min(
    READER_ZOOM_MAX,
    Math.max(READER_ZOOM_MIN, Math.round(z * 100) / 100)
  );
}

export function loadNavInvert() {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(READER_NAV_INVERT_KEY) === '1';
  } catch {
    return false;
  }
}

export function persistNavInvert(on) {
  try {
    localStorage.setItem(READER_NAV_INVERT_KEY, on ? '1' : '0');
  } catch {
    /* */
  }
}

export const LIGHTBOX_SCALE_MIN = 0.25;
export const LIGHTBOX_SCALE_MAX = 4;
export const LIGHTBOX_SCALE_STEP = 0.25;

export function clampLbScale(s) {
  return Math.min(LIGHTBOX_SCALE_MAX, Math.max(LIGHTBOX_SCALE_MIN, Math.round(s * 100) / 100));
}

