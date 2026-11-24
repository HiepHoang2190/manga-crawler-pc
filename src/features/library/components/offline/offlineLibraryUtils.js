export const KINDLE_ELIGIBLE_SOURCES = new Set(['save', 'extra', 'recentExtracted']);

export function isKindleEligible(row) {
  return KINDLE_ELIGIBLE_SOURCES.has(String(row?.source || ''));
}

/**
 * Returns true only for entries stored locally that have at least one downloaded chapter
 * (or are explicitly opened local text ebooks whose text chapter count is tracked as 0).
 */
export function isDownloadedOfflineRow(row) {
  if (!row) return false;
  if (row.source === 'favorite') return false;
  const hasLocalPath = Boolean(String(row.absolutePath || '').trim());
  if (!hasLocalPath) return false;
  if (row.source === 'recentArchive' && Boolean(String(row.ebookPath || '').trim())) {
    return true;
  }
  return Number(row.chapterCount || 0) > 0;
}

/**
 * Builds the displayed Offline Library rows from local directories and recent extracted/ebook
 * entries, omitting online-only favorites and empty folders while enriching matched local rows
 * with favorite sync/badge metadata.
 */
export function buildOfflineDisplayRows({
  rows = [],
  recentExtractedCbzEntries = [],
  favorites = [],
  favoriteSyncById = {},
  favoriteTabBadgeReadById = {},
  isFavoriteTabBadgeUnread,
} = {}) {
  const list = (Array.isArray(rows) ? rows : []).filter(isDownloadedOfflineRow);
  const seenPaths = new Set(list.map((r) => String(r.absolutePath || '').trim()));

  const extractedEntries = Array.isArray(recentExtractedCbzEntries)
    ? recentExtractedCbzEntries
    : [];
  const prependedExtracted = [];
  for (const entry of extractedEntries) {
    const extractedPath = String(entry?.openPath || entry?.extractPath || '').trim();
    if (!extractedPath || seenPaths.has(extractedPath)) continue;
    const candidate = {
      key: `recentExtracted:${extractedPath}`,
      source: String(entry?.sourceKind || 'extracted') === 'file' ? 'recentArchive' : 'recentExtracted',
      mangaTitle:
        String(entry?.title || '').trim() ||
        extractedPath.split(/[/\\]/).filter(Boolean).pop() ||
        extractedPath,
      chapterCount: Number(entry?.chapterCount || 0),
      hasDb: false,
      absolutePath: extractedPath,
      extractPath: String(entry?.extractPath || '').trim(),
      releaseOnRemove: Boolean(String(entry?.extractPath || '').trim()),
      ebookPath: String(entry?.ebookPath || '').trim(),
      localCoverPath: String(entry?.localCoverPath || '').trim(),
      sourceFile: String(entry?.sourceFile || '').trim(),
    };
    if (!isDownloadedOfflineRow(candidate)) continue;
    seenPaths.add(extractedPath);
    prependedExtracted.push(candidate);
  }

  const localDownloaded = [...prependedExtracted, ...list];

  const favByUrl = new Map();
  const favById = new Map();
  const favByTitle = new Map();
  for (const f of Array.isArray(favorites) ? favorites : []) {
    if (f?.id) favById.set(f.id, f);
    const u = String(f?.mangaUrl || f?.url || '').trim();
    if (u) favByUrl.set(u, f);
    const favTitle = String(f?.title || '').trim().toLowerCase();
    if (favTitle) favByTitle.set(favTitle, f);
  }

  return localDownloaded.map((r) => {
    const url = String(r.mangaUrl || '').trim();
    const rowTitle = String(r.mangaTitle || '').trim().toLowerCase();
    const localUrl = r.absolutePath ? `file://${r.absolutePath}` : '';
    const localId = localUrl ? `local::${localUrl}` : '';
    const matchedFav =
      (url && favByUrl.get(url)) ||
      (localUrl && favByUrl.get(localUrl)) ||
      (localId && favById.get(localId)) ||
      (rowTitle && favByTitle.get(rowTitle));
    if (matchedFav) {
      const sync = favoriteSyncById[matchedFav.id];
      return {
        ...r,
        isFavorite: true,
        favoriteId: matchedFav.id,
        notifyWatch: matchedFav.notifyWatch,
        siteId: r.siteId || matchedFav.siteId || '',
        mangaUrl: r.mangaUrl || matchedFav.mangaUrl || matchedFav.url || '',
        coverUrl: matchedFav.coverUrl || '',
        sync,
        isBadgeUnread:
          typeof isFavoriteTabBadgeUnread === 'function'
            ? isFavoriteTabBadgeUnread(matchedFav.id, sync, favoriteTabBadgeReadById)
            : false,
      };
    }
    return {
      ...r,
      isFavorite: false,
    };
  });
}

export function isExtractedTempRow(row) {
  if (!row) return false;
  if (row.source === 'recentExtracted') return true;
  if (row.releaseOnRemove && row.extractPath) return true;
  const p = String(row.extractPath || row.absolutePath || '').trim();
  return p.includes('manga-crawler-cbz');
}

export const EXTRA_PATHS_KEY = 'offlineLibraryExtraPaths_v1';

export const OFFLINE_SORT_CYCLE = ['titleAsc', 'titleDesc', 'chaptersDesc', 'hasNewFirst'];

export const SORT_LABEL_KEYS = {
  titleAsc: 'favorites.sort.titleAsc',
  titleDesc: 'favorites.sort.titleDesc',
  chaptersDesc: 'offlineLibrary.sort.chaptersDesc',
  hasNewFirst: 'offlineLibrary.sort.hasNewFirst',
};

export const FAV_MS_ICON_20 =
  "material-symbols-outlined leading-none shrink-0 block text-[20px] [font-variation-settings:'FILL'_0,'wght'_400,'GRAD'_0,'opsz'_24]";

export const FAV_MS_ICON_18 =
  "material-symbols-outlined leading-none shrink-0 block text-[18px] [font-variation-settings:'FILL'_0,'wght'_400,'GRAD'_0,'opsz'_24]";

export function hasRowFetchUrl(row) {
  if (!row || String(row.siteId || '').trim().toLowerCase() === 'local') return false;
  const url = String(row.mangaUrl || row.url || '').trim();
  return /^https?:\/\//i.test(url);
}

export function openOfflineRow(
  row,
  { onOpenPinnedCbzFolder, onReadArchivePath, onReadFavorite, onReadOffline } = {}
) {
  if (!row) return;
  if (row.source === 'extraCbz') {
    onOpenPinnedCbzFolder?.(row.absolutePath);
    return;
  }
  if (row.source === 'recentArchive') {
    onReadArchivePath?.(row.absolutePath);
    return;
  }
  if (row.source === 'favorite' && !row.absolutePath) {
    if (onReadFavorite) {
      onReadFavorite(row);
      return;
    }
  }
  onReadOffline?.(row);
}

export function fetchOfflineRow(row, { onFetchFavorite, onFetchManga } = {}) {
  if (!hasRowFetchUrl(row)) return;
  if (row.source === 'favorite' && onFetchFavorite) {
    onFetchFavorite(row);
  } else {
    onFetchManga?.(row);
  }
}

export function getParentDirectoryPath(filePath) {
  const raw = String(filePath || '').trim();
  if (!raw) return '';
  const lastSep = Math.max(raw.lastIndexOf('/'), raw.lastIndexOf('\\'));
  if (lastSep < 0) return '';
  if (lastSep === 0 && raw.startsWith('/')) return '/';
  if (lastSep === 2 && raw[1] === ':') return raw.slice(0, 3);
  return raw.slice(0, lastSep);
}

export function canOpenOfflineRowFolder(row, { onOpenFolder } = {}) {
  if (!row) return false;
  return Boolean(String(row.absolutePath || '').trim()) && typeof onOpenFolder === 'function';
}

export function openOfflineRowFolder(row, { onOpenFolder } = {}) {
  if (!row || typeof onOpenFolder !== 'function') return;
  const absolutePath = String(row.absolutePath || '').trim();
  if (!absolutePath) return;
  const extractPath = String(row.extractPath || '').trim();
  const folderPath =
    row.source === 'recentArchive'
      ? extractPath || getParentDirectoryPath(absolutePath) || absolutePath
      : absolutePath;
  onOpenFolder(folderPath);
}

export function normalizeExtraEntry(x) {
  if (!x || typeof x.path !== 'string' || !x.path.trim()) return null;
  const path = x.path.trim();
  const kind = x.kind === 'cbz' ? 'cbz' : x.kind === 'root' ? 'root' : 'manga';
  return { path, kind };
}

export function getSyncNewCount(row) {
  const s = row?.sync;
  if (!s) return 0;
  if (typeof s.newCount === 'number' && Number.isFinite(s.newCount)) {
    return Math.max(0, s.newCount);
  }
  if (s.hasNew) {
    if (typeof s.pendingNewCount === 'number' && s.pendingNewCount > 0) return s.pendingNewCount;
    if (typeof s.remoteCount === 'number' && s.remoteCount > 0) return s.remoteCount;
    return 1;
  }
  return 0;
}

export function rowMatchesSourceFilter(row, sourceFilter) {
  if (!row) return false;
  if (!sourceFilter || sourceFilter === 'all') return true;
  if (sourceFilter === 'favorites') return Boolean(row.isFavorite);
  if (sourceFilter === 'hasNew') return getSyncNewCount(row) > 0;
  if (sourceFilter === 'save') return row.source === 'save';
  if (sourceFilter === 'extra') {
    return (
      row.source === 'extra' ||
      row.source === 'recentExtracted' ||
      row.source === 'recentArchive'
    );
  }
  if (sourceFilter === 'archives') {
    return (
      row.source === 'extraCbz' ||
      row.source === 'recentArchive' ||
      row.archiveKind === 'archive' ||
      row.archiveKind === 'cbz'
    );
  }
  return true;
}

export function filterOfflineLibraryRows(rows, opts) {
  const { sourceFilter = '', query = '' } = opts || {};
  let list = Array.isArray(rows) ? rows : [];
  if (sourceFilter && sourceFilter !== 'all') {
    list = list.filter((r) => rowMatchesSourceFilter(r, sourceFilter));
  }
  const q = String(query || '').trim().toLowerCase();
  if (q) {
    list = list.filter(
      (r) =>
        String(r?.mangaTitle || '').toLowerCase().includes(q) ||
        String(r?.absolutePath || '').toLowerCase().includes(q)
    );
  }
  return list;
}

function compareOfflineTitles(a, b) {
  return String(a?.mangaTitle || '').localeCompare(String(b?.mangaTitle || ''), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

export function sortOfflineLibraryRows(rows, sortMode = 'titleAsc') {
  const arr = [...(Array.isArray(rows) ? rows : [])];
  if (sortMode === 'titleDesc') {
    arr.sort((a, b) => -compareOfflineTitles(a, b));
  } else if (sortMode === 'chaptersDesc') {
    arr.sort((a, b) => {
      const diff = Number(b?.chapterCount || 0) - Number(a?.chapterCount || 0);
      return diff !== 0 ? diff : compareOfflineTitles(a, b);
    });
  } else if (sortMode === 'hasNewFirst') {
    arr.sort((a, b) => {
      const na = getSyncNewCount(a);
      const nb = getSyncNewCount(b);
      if ((na > 0) !== (nb > 0)) return nb > 0 ? 1 : -1;
      if (nb !== na) return nb - na;
      return compareOfflineTitles(a, b);
    });
  } else {
    arr.sort(compareOfflineTitles);
  }
  return arr;
}

export function computeOfflineLibraryStats(rows) {
  const list = Array.isArray(rows) ? rows : [];
  let total = 0;
  let favorites = 0;
  let hasNew = 0;
  let save = 0;
  let extra = 0;
  let archives = 0;
  let totalChapters = 0;

  for (const r of list) {
    if (!r) continue;
    total += 1;
    totalChapters += Number(r.chapterCount || 0);
    if (r.isFavorite) favorites += 1;
    if (getSyncNewCount(r) > 0) hasNew += 1;
    if (rowMatchesSourceFilter(r, 'save')) save += 1;
    if (rowMatchesSourceFilter(r, 'extra')) extra += 1;
    if (rowMatchesSourceFilter(r, 'archives')) archives += 1;
  }

  return {
    total,
    favorites,
    hasNew,
    save,
    extra,
    archives,
    totalChapters,
  };
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

