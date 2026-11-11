export const KINDLE_ELIGIBLE_SOURCES = new Set(['save', 'extra', 'recentExtracted']);

export function isKindleEligible(row) {
  return KINDLE_ELIGIBLE_SOURCES.has(String(row?.source || ''));
}

export function isExtractedTempRow(row) {
  if (!row) return false;
  if (row.source === 'recentExtracted') return true;
  if (row.releaseOnRemove && row.extractPath) return true;
  const p = String(row.extractPath || row.absolutePath || '').trim();
  return p.includes('manga-crawler-cbz');
}

export const EXTRA_PATHS_KEY = 'offlineLibraryExtraPaths_v1';

export const OFFLINE_SORT_CYCLE = ['titleAsc', 'titleDesc'];

export const SORT_LABEL_KEYS = {
  titleAsc: 'favorites.sort.titleAsc',
  titleDesc: 'favorites.sort.titleDesc',
};

export const FAV_MS_ICON_20 =
  "material-symbols-outlined leading-none shrink-0 block text-[20px] [font-variation-settings:'FILL'_0,'wght'_400,'GRAD'_0,'opsz'_24]";

export const FAV_MS_ICON_18 =
  "material-symbols-outlined leading-none shrink-0 block text-[18px] [font-variation-settings:'FILL'_0,'wght'_400,'GRAD'_0,'opsz'_24]";

export function normalizeExtraEntry(x) {
  if (!x || typeof x.path !== 'string' || !x.path.trim()) return null;
  const path = x.path.trim();
  const kind = x.kind === 'cbz' ? 'cbz' : 'manga';
  return { path, kind };
}

export function loadExtraPaths() {
  try {
    const raw = localStorage.getItem(EXTRA_PATHS_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw);
    if (!Array.isArray(p)) return [];
    return p.map(normalizeExtraEntry).filter(Boolean);
  } catch {
    return [];
  }
}

export function saveExtraPaths(list) {
  try {
    const normalized = list.map(normalizeExtraEntry).filter(Boolean);
    localStorage.setItem(EXTRA_PATHS_KEY, JSON.stringify(normalized));
  } catch {
    /* */
  }
}

