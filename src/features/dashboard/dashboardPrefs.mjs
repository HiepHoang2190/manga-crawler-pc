export const DASHBOARD_TREND_DAYS_KEY = 'dashboard_trend_days_v1';

const VALID_TREND_DAYS = new Set([7, 30]);

function resolveStorage(explicitStorage) {
  if (explicitStorage) return explicitStorage;
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

export function loadDashboardTrendDays(explicitStorage) {
  try {
    const storage = resolveStorage(explicitStorage);
    const raw = storage?.getItem?.(DASHBOARD_TREND_DAYS_KEY);
    if (raw === null || raw === undefined || raw === '') return 30;
    const parsed = Number(raw);
    return VALID_TREND_DAYS.has(parsed) ? parsed : 30;
  } catch {
    return 30;
  }
}

export function saveDashboardTrendDays(days, explicitStorage) {
  const normalized = Number(days);
  if (!VALID_TREND_DAYS.has(normalized)) return;
  try {
    const storage = resolveStorage(explicitStorage);
    storage?.setItem?.(DASHBOARD_TREND_DAYS_KEY, String(normalized));
  } catch {
    // Ignore storage quota or security errors
  }
}

export function extractPathBasename(fullPath) {
  const trimmed = String(fullPath || '').trim().replace(/[\\/]+$/, '');
  if (!trimmed) return '';
  const parts = trimmed.split(/[\\/]/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : '';
}

function normalizeUrlForMatch(url) {
  return String(url || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');
}

function normalizeChapterText(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function extractChapterNumber(text) {
  const s = normalizeChapterText(text);
  if (!s) return null;
  const prefixed = s.match(/(?:^|\b)(?:chapter|chap|chương|chuong|ch|ep(?:isode)?)\.?\s*(\d+(?:\.\d+)?)\b/i);
  if (prefixed) return Number(prefixed[1]);
  const standalone = s.match(/^(\d+(?:\.\d+)?)$/);
  if (standalone) return Number(standalone[1]);
  const trailing = s.match(/\b(\d+(?:\.\d+)?)$/);
  return trailing ? Number(trailing[1]) : null;
}

export function resolveTargetChapterIndex(
  chapters,
  { chapterUrl = '', chapterTitle = '' } = {}
) {
  if (!Array.isArray(chapters) || chapters.length === 0) return 0;

  const targetUrl = String(chapterUrl || '').trim();
  if (targetUrl) {
    const byUrl = chapters.findIndex((c) => String(c?.url || '').trim() === targetUrl);
    if (byUrl >= 0) return byUrl;

    const normTargetUrl = normalizeUrlForMatch(targetUrl);
    if (normTargetUrl) {
      const byNormUrl = chapters.findIndex(
        (c) => normalizeUrlForMatch(c?.url) === normTargetUrl
      );
      if (byNormUrl >= 0) return byNormUrl;
    }
  }

  const normTargetTitle = normalizeChapterText(chapterTitle);
  if (normTargetTitle) {
    const byTitle = chapters.findIndex((c) => {
      const titleNorm = normalizeChapterText(c?.title);
      const folderNorm = normalizeChapterText(c?.folderBasename || extractPathBasename(c?.url));
      return titleNorm === normTargetTitle || (folderNorm && folderNorm === normTargetTitle);
    });
    if (byTitle >= 0) return byTitle;
  }

  const targetUrlLeaf = extractPathBasename(targetUrl);
  const targetNum = extractChapterNumber(chapterTitle) ?? extractChapterNumber(targetUrlLeaf);
  if (targetNum !== null && Number.isFinite(targetNum)) {
    const byNum = chapters.findIndex((c) => {
      const chNum =
        extractChapterNumber(c?.title) ??
        extractChapterNumber(c?.folderBasename || extractPathBasename(c?.url));
      return chNum !== null && chNum === targetNum;
    });
    if (byNum >= 0) return byNum;
  }

  return 0;
}

export function computeHorizontalWheelDelta({
  deltaX = 0,
  deltaY = 0,
  deltaMode = 0,
  ctrlKey = false,
  scrollWidth = 0,
  clientWidth = 0,
} = {}) {
  if (ctrlKey) return { handled: false, delta: 0 };
  if (!(Number(scrollWidth) > Number(clientWidth))) {
    return { handled: false, delta: 0 };
  }

  const dx = Number(deltaX) || 0;
  const dy = Number(deltaY) || 0;
  if (!Number.isFinite(dy) || dy === 0 || (dx !== 0 && Math.abs(dx) >= Math.abs(dy))) {
    return { handled: false, delta: 0 };
  }

  const lineScale = 16;
  const pageScale = Number(clientWidth) > 0 ? Number(clientWidth) : 320;
  const multiplier = deltaMode === 1 ? lineScale : deltaMode === 2 ? pageScale : 1;
  return { handled: true, delta: dy * multiplier };
}
