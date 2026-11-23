import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  EmptyState,
  FetchErrorState,
  MultiSelectDropdown,
  SearchableSelect,
  StudioLayout,
  useStudioLayout,
  ViewModeToggle,
} from '../../shared';
import { ChaptersDrawer } from '../reader';
import { dedupeChaptersByNumber } from '../download';
import { ExploreSourceSelect } from '../explore';
import { useI18n } from '../../context/I18nContext';
import { latestListingItemChapterActionsEnabled } from './latestListingChapterActions.js';

const GRID_SKELETON_ITEMS = Array.from({ length: 12 }, (_, idx) => idx);
const LIST_SKELETON_ITEMS = Array.from({ length: 8 }, (_, idx) => idx);

const LatestUpdatesSkeleton = React.memo(function LatestUpdatesSkeleton({ viewMode, statusText }) {
  return (
    <div
      data-testid="latest-updates-skeleton"
      aria-busy="true"
      aria-label={statusText}
      className="space-y-4 select-none"
    >
      <div className="flex items-center gap-2 text-xs font-medium text-on-surface-variant">
        <span className="material-symbols-outlined text-[18px] animate-spin text-primary shrink-0 leading-none">
          progress_activity
        </span>
        <span>{statusText}</span>
      </div>

      {viewMode === 'list' ? (
        <ul className="flex flex-col gap-2">
          {LIST_SKELETON_ITEMS.map((idx) => (
            <li
              key={idx}
              className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-4 rounded-xl border border-outline-variant/20 bg-surface-container-high/35 animate-pulse"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="h-14 w-10 sm:h-16 sm:w-11 shrink-0 rounded-lg bg-surface-container-highest" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-48 max-w-[65%] rounded bg-surface-container-highest" />
                    <div className="h-4 w-16 rounded bg-surface-container-highest/80" />
                  </div>
                  <div className="h-3 w-28 rounded bg-surface-container-highest/70" />
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="h-8 w-24 rounded-lg bg-surface-container-highest" />
                <div className="h-8 w-8 rounded-lg bg-surface-container-highest/80" />
                <div className="h-8 w-8 rounded-lg bg-surface-container-highest/80" />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {GRID_SKELETON_ITEMS.map((idx) => (
            <li
              key={idx}
              className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-outline-variant/20 bg-surface-container-high/35 animate-pulse"
            >
              <div className="aspect-[3/4.2] bg-surface-container-highest" />
              <div className="flex flex-col gap-2 p-3">
                <div className="h-3.5 w-11/12 rounded bg-surface-container-highest" />
                <div className="h-3.5 w-2/3 rounded bg-surface-container-highest/80" />
                <div className="h-3 w-1/2 rounded bg-surface-container-highest/60" />
                <div className="flex items-center gap-1.5 pt-1">
                  <div className="flex-1 h-8 rounded-lg bg-surface-container-highest" />
                  <div className="h-8 w-8 shrink-0 rounded-lg bg-surface-container-highest/80" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

function connectorHost(domain) {
  try {
    return new URL(domain).hostname;
  } catch {
    return domain;
  }
}
const STORAGE_KEY = 'mangaLatestUpdatesSiteId';
const LEGACY_STORAGE_KEY_ARRAY = 'mangaLatestUpdatesSiteIds';
const LAYOUT_KEY = 'mangaLatestUpdatesViewLayout';
const SEARCH_ALL_SOURCES_KEY = 'mangaLatestUpdatesSearchAllSources';

/** Khớp mobile Home tab — giới hạn phân trang danh sách mới cập nhật. */
const LATEST_UPDATES_MAX_LISTING_PAGES = 20;

/** Số lượng truyện hiển thị trên mỗi trang khi tìm kiếm đa nguồn (Client-side pagination). */
const MULTI_SEARCH_PAGE_SIZES = [20, 50, 100];
const PAGE_SIZES = [20, 50, 100];
const LATEST_UPDATES_PAGE_SIZE_KEY = 'mangaLatestUpdatesPageSizePref_v1';
const MULTI_SEARCH_PAGE_SIZE = 20;
const MULTI_SEARCH_PAGE_SIZE_KEY = 'mangaLatestUpdatesMultiSearchPageSize';

const LATEST_SEARCH_PAGINATED_SITE_IDS = new Set(['minotruyen', 'nettruyenar']);

function clampLatestListingPage(pageNum) {
  const n = Math.floor(Number(pageNum) || 1);
  return Math.min(LATEST_UPDATES_MAX_LISTING_PAGES, Math.max(1, n));
}

function clampLatestListingTotalPages(totalPages) {
  const n = Math.floor(Number(totalPages) || 1);
  return Math.min(LATEST_UPDATES_MAX_LISTING_PAGES, Math.max(1, n));
}

function loadLayoutPref() {
  if (typeof window === 'undefined') return 'grid';
  try {
    const v = String(localStorage.getItem(LAYOUT_KEY) || '').toLowerCase();
    if (v === 'list' || v === 'grid') return v;
  } catch {
    /* ignore */
  }
  return 'grid';
}

function saveLayoutPref(mode) {
  try {
    localStorage.setItem(LAYOUT_KEY, mode);
  } catch {
    /* ignore */
  }
}

function loadSearchAllSourcesPref() {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(SEARCH_ALL_SOURCES_KEY) === '1';
  } catch {
    /* ignore */
  }
  return false;
}

function persistSearchAllSourcesPref(enabled) {
  try {
    localStorage.setItem(SEARCH_ALL_SOURCES_KEY, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
}

const MULTI_SEARCH_SELECTED_SITES_KEY = 'mangaLatestUpdatesMultiSearchSelectedSites_v1';

function loadMultiSearchSelectedSiteIds(availableIds) {
  if (typeof window === 'undefined') return [...availableIds];
  try {
    const raw = localStorage.getItem(MULTI_SEARCH_SELECTED_SITES_KEY);
    if (raw != null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((id) => availableIds.includes(String(id || '').trim()));
      }
    }
  } catch {
    /* ignore */
  }
  return [...availableIds];
}

function persistMultiSearchSelectedSiteIds(ids) {
  try {
    localStorage.setItem(MULTI_SEARCH_SELECTED_SITES_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

function safeParseSiteIds(raw, supportedIds) {
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    return arr.filter((id) => supportedIds.includes(String(id || '').trim()));
  } catch {
    return null;
  }
}

function defaultLatestSiteId(supportedIds) {
  if (!supportedIds.length) return '';
  if (supportedIds.includes('moetruyen')) return 'moetruyen';
  return supportedIds[0];
}

/** MoeTruyen and TruyenMoe share one catalog; all-source search should hit one origin. */
function dropMoeFamilySearchTwins(siteIds) {
  const ids = Array.isArray(siteIds) ? [...siteIds] : [];
  if (ids.includes('truyenmoe') && ids.includes('moetruyen')) {
    return ids.filter((id) => id !== 'moetruyen');
  }
  return ids;
}

function formatLatestSearchBlockError(block, supportedConnectors) {
  if (!block || block.ok || !block.error) return '';
  const siteLabel =
    supportedConnectors.find((c) => c.id === block.siteId)?.label || block.siteId || '';
  return siteLabel ? `${siteLabel}: ${block.error}` : String(block.error);
}

function loadStoredSiteId(supportedIds) {
  if (typeof window === 'undefined') return defaultLatestSiteId(supportedIds);
  try {
    const single = localStorage.getItem(STORAGE_KEY);
    if (single && supportedIds.includes(String(single).trim())) {
      return String(single).trim();
    }
    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY_ARRAY);
    const legacyArr = legacyRaw ? safeParseSiteIds(legacyRaw, supportedIds) : null;
    if (legacyArr?.length) {
      const first = String(legacyArr[0]).trim();
      persistSiteId(first);
      return first;
    }
  } catch {
    /* ignore */
  }
  return defaultLatestSiteId(supportedIds);
}

function persistSiteId(id) {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, String(id));
  } catch {
    /* ignore */
  }
}

const MANGADEX_PANEL_LANG_KEY = 'mangaLatestUpdatesMangadexLang';
const MINOTRUYEN_PANEL_CATEGORY_KEY = 'mangaLatestUpdatesMinotruyenCategory';

/** Re-open chapter drawer from [Mới cập nhật] without always re-calling loadManga for the same manga. */
const LATEST_DRAWER_CHAPTER_CACHE_TTL_MS = 30 * 60 * 1000;
const LATEST_DRAWER_CHAPTER_CACHE_MAX_ENTRIES = 48;

function fingerprintMangaLoadOpts(mangaLoadOpts) {
  if (mangaLoadOpts == null || typeof mangaLoadOpts !== 'object') {
    return '';
  }
  try {
    const sortedKeys = Object.keys(mangaLoadOpts).sort();
    return sortedKeys.map((key) => `${key}:${JSON.stringify(mangaLoadOpts[key])}`).join('\u0002');
  } catch {
    return '';
  }
}

function makeLatestDrawerCacheKey(siteId, mangaUrl, optsFingerprint) {
  return `${String(siteId || '').trim()}::${String(mangaUrl || '').trim()}::${optsFingerprint}`;
}

function touchChapterDrawerCache(map, cacheKey, entry) {
  map.delete(cacheKey);
  map.set(cacheKey, entry);
}

function pruneChapterDrawerCache(map, maxEntries) {
  while (map.size > maxEntries) {
    const firstKey = map.keys().next().value;
    map.delete(firstKey);
  }
}

function normalizePanelMangadexLang(raw) {
  const s = String(raw ?? 'vi').toLowerCase();
  if (s === 'en' || s === 'ja') return s;
  return 'vi';
}

function readStoredPanelMangadexLang() {
  if (typeof window === 'undefined') return 'vi';
  try {
    const s = localStorage.getItem(MANGADEX_PANEL_LANG_KEY);
    if (s != null && String(s).trim() !== '') return normalizePanelMangadexLang(s);
  } catch {
    /* ignore */
  }
  return 'vi';
}

function persistPanelMangadexLang(lang) {
  try {
    localStorage.setItem(MANGADEX_PANEL_LANG_KEY, normalizePanelMangadexLang(lang));
  } catch {
    /* ignore */
  }
}

function normalizePanelMinotruyenCategory(raw) {
  const s = String(raw ?? 'manga').trim().toLowerCase();
  return s === 'comics' ? 'comics' : 'manga';
}

function readStoredPanelMinotruyenCategory() {
  if (typeof window === 'undefined') return 'manga';
  try {
    const s = localStorage.getItem(MINOTRUYEN_PANEL_CATEGORY_KEY);
    if (s != null && String(s).trim() !== '') {
      return normalizePanelMinotruyenCategory(s);
    }
  } catch {
    /* ignore */
  }
  return 'manga';
}

function persistPanelMinotruyenCategory(category) {
  try {
    localStorage.setItem(
      MINOTRUYEN_PANEL_CATEGORY_KEY,
      normalizePanelMinotruyenCategory(category),
    );
  } catch {
    /* ignore */
  }
}

/**
 * In-memory cache for latest updates listing to avoid redundant fetches on tab switch / remount.
 */
export const latestUpdatesListingCache = {
  key: '',
  page: 1,
  rows: [],
  listingTotalPages: 1,
  fetchError: '',
};

/**
 * In-memory cache for multi-source search results to avoid redundant fetches on scope switch.
 */
export const latestUpdatesMultiSearchCache = {
  key: '',
  searchTerm: '',
  rows: [],
  fetchError: '',
};

/**
 * Sites that expose connector.fetchLatestUpdates (main process).
 *
 * @param {{ id: string, label?: string, supportsLatestUpdates?: boolean }[]} connectors
 */
export default function LatestUpdatesPanel({
  connectors = [],
  mangaLoadOpts = {},
  onEnqueueLoadedManga,
  queue = [],
  onAddQueuedFromLatest,
  savePath = '',
  /** Đồng bộ manga trong drawer vào Home trước khi đọc (App). */
  prepareDrawerMangaForRead,
  /** Mở reader offline sau [prepareDrawerMangaForRead]. */
  onOpenReaderForDrawerChapter,
  /** Stream đọc sau [prepareDrawerMangaForRead]. */
  onReadChapterOnlineForDrawerChapter,
  /** Danh sách manga yêu thích */
  favorites = [],
  /** Hàm toggle favorite cho manga */
  onToggleFavorite,
  /** Tải ảnh bìa MangaDex (dùng chung logic tab Tải). */
  onDownloadMangadexCovers,
  /** Slot subtabs khi lồng trong ExplorePanel */
  subtabsSlot = null,
  viewMode: propViewMode,
  onViewModeChange,
  isActive = true,
}) {
  const { t } = useI18n();
  const {
    showLeftSidebar,
    toggleLeftSidebar,
    leftWidth,
    handleLeftResizeStart,
  } = useStudioLayout({
    storagePrefix: 'explore_subtabs',
    defaultLeftWidth: 280,
    minLeftWidth: 240,
    maxLeftWidth: 460,
  });
  const supported = useMemo(
    () =>
      connectors
        .filter((c) => c && c.supportsLatestUpdates && c.id)
        .sort((a, b) =>
          String(a.label || a.id).localeCompare(String(b.label || b.id), undefined, { sensitivity: 'base' }),
        ),
    [connectors],
  );

  // Hàm tạo favorite ID giống như trong App.jsx
  const makeFavoriteId = useCallback((manga, siteId) => {
    const url = String(manga?.mangaUrl || '').trim();
    const sid = String(siteId || '').trim();
    return `${sid}::${url}`;
  }, []);

  const favoriteIdSet = useMemo(() => {
    const set = new Set();
    if (Array.isArray(favorites)) {
      for (const f of favorites) {
        if (f?.id) set.add(f.id);
      }
    }
    return set;
  }, [favorites]);

  // Kiểm tra xem manga có trong favorites không (O(1))
  const isMangaFavorite = useCallback((manga, siteId) => {
    if (!manga?.mangaUrl || !siteId) return false;
    return favoriteIdSet.has(makeFavoriteId(manga, siteId));
  }, [favoriteIdSet, makeFavoriteId]);

  // Toggle favorite cho manga từ latest updates
  const handleToggleFavorite = useCallback((manga, siteId) => {
    if (!manga?.title || !manga?.mangaUrl || !siteId || typeof onToggleFavorite !== 'function') return;
    
    const favoriteData = {
      ...manga,
      siteId: siteId,
      mangaUrl: manga.mangaUrl,
    };
    
    onToggleFavorite(favoriteData, siteId);
  }, [onToggleFavorite]);

  const [selectedSiteId, setSelectedSiteId] = useState('');
  useEffect(() => {
    const ids = supported.map((c) => c.id);
    if (!ids.length) {
      setSelectedSiteId('');
      return;
    }
    setSelectedSiteId((prev) => {
      if (prev && ids.includes(prev)) return prev;
      return loadStoredSiteId(ids);
    });
  }, [supported]);

  const selectOptions = useMemo(
    () =>
      supported.map((c) => ({
        value: c.id,
        label: `${c.label || c.id} (${connectorHost(c.domain)})`,
        icon: c.icon,
      })),
    [supported],
  );

  const handleSiteChange = useCallback((nextId) => {
    const id = String(nextId || '').trim();
    setSelectedSiteId(id);
    persistSiteId(id);
  }, []);

  const [page, setPage] = useState(() => latestUpdatesListingCache.page || 1);
  const [raw_page_input, setRawPageInput] = useState(() => String(latestUpdatesListingCache.page || 1));
  const [multiSearchPage, setMultiSearchPage] = useState(1);
  const [rawMultiPageInput, setRawMultiPageInput] = useState('1');
  const [rows, setRows] = useState(() => (Array.isArray(latestUpdatesListingCache.rows) ? latestUpdatesListingCache.rows : []));
  const [listingTotalPages, setListingTotalPages] = useState(() => latestUpdatesListingCache.listingTotalPages || 1);
  const [fetchError, setFetchError] = useState(() => latestUpdatesListingCache.fetchError || '');
  const [errorDismissed, setErrorDismissed] = useState(false);
  const [errorDetailsExpanded, setErrorDetailsExpanded] = useState(false);
  const [busyList, setBusyList] = useState(false);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [isStoppingList, setIsStoppingList] = useState(false);
  const fetchSeqRef = useRef(0);
  const busyListRef = useRef(false);
  const isSearchLoadingRef = useRef(false);
  busyListRef.current = busyList;
  isSearchLoadingRef.current = isSearchLoading;

  useEffect(() => () => {
    if (busyListRef.current || isSearchLoadingRef.current) {
      fetchSeqRef.current += 1;
      try {
        window.electronAPI?.cancelLatestUpdates?.();
      } catch {
        /* ignore */
      }
    }
  }, []);
  const [enqueueKey, setEnqueueKey] = useState('');
  const [inlineChapterBusyKey, setInlineChapterBusyKey] = useState('');
  const [chapterDrawerOpen, setChapterDrawerOpen] = useState(false);
  const [drawerManga, setDrawerManga] = useState(null);
  /** Site id from the row that opened the drawer — merge into manga for reader prev/next + download (some payloads omit siteId). */
  const [drawerLoadSiteId, setDrawerLoadSiteId] = useState('');
  const [drawerChapters, setDrawerChapters] = useState([]);
  /** URL chương đã có ảnh local — filter theo drawer (giống tab Home). */
  const [drawerReadChapterAllowedUrls, setDrawerReadChapterAllowedUrls] = useState(null);
  const [drawerSelectedUrls, setDrawerSelectedUrls] = useState(() => new Set());
  const drawer_chapters_urls_key = useMemo(
    () => drawerChapters.map((c) => String(c?.url ?? '').trim()).join('\u0001'),
    [drawerChapters],
  );
  const [internalViewMode, setInternalViewMode] = useState(() => loadLayoutPref());
  const viewMode = propViewMode !== undefined ? propViewMode : internalViewMode;

  const multiErrorItems = useMemo(() => {
    if (!fetchError || typeof fetchError !== 'string') return [];
    if (!fetchError.includes(' • ')) return [];
    return fetchError
      .split(' • ')
      .map((s) => s.trim())
      .filter(Boolean);
  }, [fetchError]);

  useEffect(() => {
    setErrorDismissed(false);
    setErrorDetailsExpanded(false);
  }, [fetchError]);
  const [searchDraft, setSearchDraft] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [searchAllSources, setSearchAllSources] = useState(() => loadSearchAllSourcesPref());
  const [panelMangadexLanguage, setPanelMangadexLanguage] = useState(() => readStoredPanelMangadexLang());
  const [panelMinotruyenCategory, setPanelMinotruyenCategory] = useState(() =>
    readStoredPanelMinotruyenCategory(),
  );
  const [pluginConsoleLines, setPluginConsoleLines] = useState([]);
  const [pluginConsoleOpen, setPluginConsoleOpen] = useState(false);
  const [pluginConsoleCopyNotice, setPluginConsoleCopyNotice] = useState(false);
  const selectedSiteIdRef = useRef('');
  const searchInputRef = useRef(null);
  /** Rows where loadManga returned zero chapters — disable list + queue actions. */
  const [noChapterRowKeys, setNoChapterRowKeys] = useState(() => new Set());

  const focusSearchInput = useCallback(() => {
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }, []);

  useEffect(() => {
    if (!isActive) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === 'f' && (e.ctrlKey || e.metaKey)) {
        const targetTag = e.target?.tagName?.toLowerCase();
        if (targetTag === 'input' || targetTag === 'textarea') return;
        if (!searchInputRef.current || searchInputRef.current.offsetParent === null) return;
        e.preventDefault();
        focusSearchInput();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusSearchInput, isActive]);

  // Passive cross-feed sync: if any favorite appears in latest rows, update followed sync cache (O(F + R))
  useEffect(() => {
    if (!rows.length || !favorites.length || typeof localStorage === 'undefined') return;
    try {
      const SYNC_STORAGE_KEY = 'crawler:followed-manga-sync-v1';
      const stored = JSON.parse(localStorage.getItem(SYNC_STORAGE_KEY) || '{}');
      let changed = false;

      const rowByUrl = new Map();
      for (const r of rows) {
        if (!r) continue;
        if (r.mangaUrl && !rowByUrl.has(r.mangaUrl)) rowByUrl.set(r.mangaUrl, r);
        if (r.url && !rowByUrl.has(r.url)) rowByUrl.set(r.url, r);
      }

      favorites.forEach((fav) => {
        if (!fav?.mangaUrl) return;
        const matchingRow = rowByUrl.get(fav.mangaUrl);
        if (matchingRow) {
          const rowChapter = String(
            matchingRow.latestChapterLabel || matchingRow.latestChapter || matchingRow.chapterTitle || ''
          ).trim();
          const existingSync = stored[fav.id];

          if (!existingSync) {
            // Baseline establishment when newly indexed: hasNew is FALSE
            let rowChapterCount = fav.chapterCount || 0;
            const match = rowChapter.match(/(\d+(?:\.\d+)?)/);
            if (match) {
              const parsed = parseFloat(match[1]);
              if (Number.isFinite(parsed) && parsed > 0) {
                rowChapterCount = Math.floor(parsed);
              }
            }
            stored[fav.id] = {
              hasNew: false,
              pendingNewCount: 0,
              remoteCount: rowChapterCount,
              latestChapterTitle: rowChapter,
              checkedAt: Date.now(),
            };
            changed = true;
          } else if (
            rowChapter &&
            existingSync.latestChapterTitle &&
            rowChapter !== existingSync.latestChapterTitle
          ) {
            // Compare chapter numbers to ensure the observed chapter is actually newer
            let newNum = null;
            let oldNum = null;
            const mNew = rowChapter.match(/(\d+(?:\.\d+)?)/);
            const mOld = String(existingSync.latestChapterTitle).match(/(\d+(?:\.\d+)?)/);
            if (mNew) newNum = parseFloat(mNew[1]);
            if (mOld) oldNum = parseFloat(mOld[1]);

            const isNewer =
              newNum != null && oldNum != null
                ? newNum > oldNum
                : rowChapter !== existingSync.latestChapterTitle;

            if (isNewer && (!existingSync.hasNew || existingSync.latestChapterTitle !== rowChapter)) {
              const diff =
                newNum != null && oldNum != null && newNum > oldNum
                  ? Math.round(newNum - oldNum)
                  : 1;
              stored[fav.id] = {
                ...existingSync,
                hasNew: true,
                pendingNewCount: Math.max(1, (existingSync.pendingNewCount || 0) + diff),
                remoteCount: newNum ? Math.floor(newNum) : existingSync.remoteCount,
                latestChapterTitle: rowChapter,
                checkedAt: Date.now(),
              };
              changed = true;
            }
          }
        }
      });

      if (changed) {
        localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(stored));
      }
    } catch {
      /* ignore storage errors */
    }
  }, [rows, favorites]);

  const markRowNoChapters = useCallback((siteId, item) => {
    const row_key = `${siteId}::${item.mangaUrl}`;
    setNoChapterRowKeys((prev) => {
      if (prev.has(row_key)) return prev;
      const next = new Set(prev);
      next.add(row_key);
      return next;
    });
  }, []);

  const rowChapterActionsEnabled = useCallback(
    (row) => {
      const row_key = `${row.siteId}::${row.mangaUrl}`;
      if (noChapterRowKeys.has(row_key)) return false;
      return latestListingItemChapterActionsEnabled(row, row.siteId);
    },
    [noChapterRowKeys],
  );

  const setViewModePersist = useCallback(
    (mode) => {
      const next = mode === 'list' ? 'list' : 'grid';
      if (propViewMode === undefined) {
        setInternalViewMode(next);
      }
      saveLayoutPref(next);
      onViewModeChange?.(next);
    },
    [propViewMode, onViewModeChange]
  );

  const selectedSourcesKey = selectedSiteId;

  const selectedDescriptor = useMemo(
    () => supported.find((c) => c.id === selectedSiteId) || null,
    [supported, selectedSiteId],
  );

  const searchCapableSiteIds = useMemo(
    () =>
      supported
        .filter((c) => {
          if (typeof c.supportsLatestUpdatesSearch === 'boolean') {
            return c.supportsLatestUpdatesSearch;
          }
          return (
            c.id === 'moetruyen' ||
            c.id === 'cuutruyen' ||
            c.id === 'mangadex' ||
            c.id === 'truyenqq' ||
            c.id === 'minotruyen' ||
            c.id === 'nettruyenar' ||
            c.id === 'toptruyenzone2' ||
            c.id === 'zettruyen' ||
            c.id === 'yurineko' ||
            c.id === 'truyengg' ||
            c.id === 'baotangtruyen' ||
            c.id === 'nhattruyen' ||
            c.id === 'asurascans' ||
            c.id === 'flamecomics' ||
            c.id === 'sangchanhteam' ||
            c.id === 'tcbscanmanga'
          );
        })
        .map((c) => c.id),
    [supported],
  );

  const [selectedMultiSearchSiteIds, setSelectedMultiSearchSiteIds] = useState(() =>
    loadMultiSearchSelectedSiteIds(searchCapableSiteIds),
  );

  useEffect(() => {
    if (!searchCapableSiteIds.length) return;
    setSelectedMultiSearchSiteIds((prev) => {
      if (prev && prev.length > 0) {
        const valid = prev.filter((id) => searchCapableSiteIds.includes(id));
        return valid.length > 0 ? valid : prev;
      }
      return loadMultiSearchSelectedSiteIds(searchCapableSiteIds);
    });
  }, [searchCapableSiteIds]);

  const handleMultiSearchSiteIdsChange = useCallback((nextIds) => {
    const list = Array.isArray(nextIds) ? nextIds : [];
    setSelectedMultiSearchSiteIds(list);
    persistMultiSearchSelectedSiteIds(list);
  }, []);

  const searchCapableSiteOptions = useMemo(
    () =>
      searchCapableSiteIds.map((id) => {
        const c = supported.find((item) => item.id === id);
        return {
          value: id,
          label: c?.label || id,
          hint: c?.domain ? connectorHost(c.domain) : '',
          icon: c?.icon,
        };
      }),
    [searchCapableSiteIds, supported],
  );

  const selectedMultiDescriptors = useMemo(() => {
    if (!searchAllSources) return [];
    const idSet = new Set(selectedMultiSearchSiteIds);
    return searchCapableSiteIds
      .filter((id) => idSet.has(id))
      .map((id) => supported.find((c) => c.id === id))
      .filter(Boolean);
  }, [searchAllSources, selectedMultiSearchSiteIds, searchCapableSiteIds, supported]);

  const isSearchActive = Boolean(String(appliedSearch || '').trim());
  const isMultiSourceSearch = isSearchActive && searchAllSources;

  const [pageSize, setPageSize] = useState(() => {
    if (typeof localStorage === 'undefined') return 20;
    try {
      const stored = Number(
        localStorage.getItem(LATEST_UPDATES_PAGE_SIZE_KEY) ||
        localStorage.getItem(MULTI_SEARCH_PAGE_SIZE_KEY)
      );
      return PAGE_SIZES.includes(stored) ? stored : 20;
    } catch {
      return 20;
    }
  });

  const pageSizeOptions = useMemo(
    () => PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) })),
    [],
  );

  const multiSearchTotalPages = useMemo(
    () => Math.max(1, Math.ceil(rows.length / pageSize)),
    [rows.length, pageSize],
  );

  const followingCount = useMemo(() => {
    if (!rows.length || !favorites.length) return 0;
    return rows.filter((r) => isMangaFavorite(r, r.siteId)).length;
  }, [rows, favorites, isMangaFavorite]);

  const [lastFetchedAt, setLastFetchedAt] = useState(() => Date.now());

  const displayedRows = useMemo(() => {
    if (!isMultiSourceSearch) return rows.slice(0, pageSize);
    const start = (multiSearchPage - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [isMultiSourceSearch, rows, multiSearchPage, pageSize]);

  const singleFromRow = rows.length === 0 ? 0 : 1;
  const singleToRow = Math.min(rows.length, pageSize);

  const multiSearchFromRow = rows.length === 0 ? 0 : (multiSearchPage - 1) * pageSize + 1;
  const multiSearchToRow = Math.min(multiSearchPage * pageSize, rows.length);

  const contentScrollRef = useRef(null);

  const handleMultiPageJumpSubmit = useCallback(() => {
    const raw = String(rawMultiPageInput || '').trim();
    const parsed = parseInt(raw, 10);
    if (!Number.isFinite(parsed)) {
      setRawMultiPageInput(String(multiSearchPage));
      return;
    }
    const clamped = Math.min(multiSearchTotalPages, Math.max(1, parsed));
    setMultiSearchPage(clamped);
    setRawMultiPageInput(String(clamped));
    contentScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [rawMultiPageInput, multiSearchPage, multiSearchTotalPages]);

  const selectedSupportsSearch = useMemo(() => {
    if (!selectedSiteId) return false;
    if (selectedDescriptor && typeof selectedDescriptor.supportsLatestUpdatesSearch === 'boolean') {
      return selectedDescriptor.supportsLatestUpdatesSearch;
    }
    return searchCapableSiteIds.includes(selectedSiteId);
  }, [selectedDescriptor, selectedSiteId, searchCapableSiteIds]);

  const activeFetchSiteIds = useMemo(() => {
    if (isMultiSourceSearch && searchCapableSiteIds.length) {
      if (selectedMultiSearchSiteIds.length === 0) {
        return [];
      }
      const filtered = searchCapableSiteIds.filter((id) => selectedMultiSearchSiteIds.includes(id));
      return dropMoeFamilySearchTwins(filtered);
    }
    return selectedSiteId ? [selectedSiteId] : [];
  }, [isMultiSourceSearch, searchCapableSiteIds, selectedMultiSearchSiteIds, selectedSiteId]);

  const is_plugin_source = Boolean(selectedDescriptor?.isJsPlugin);
  selectedSiteIdRef.current = selectedSiteId;

  const hasLatestUpdatesSearch = searchCapableSiteIds.length > 0;

  const latestSearchFieldLabels = useMemo(() => {
    if (searchAllSources) {
      return {
        placeholder: t('latestUpdates.searchPlaceholderAll'),
        ariaLabel: t('latestUpdates.searchAriaAll'),
      };
    }
    const siteLabel = String(selectedDescriptor?.label || selectedSiteId || '').trim();
    if (selectedDescriptor?.isJsPlugin && selectedDescriptor.supportsLatestUpdatesSearch) {
      return {
        placeholder: t('latestUpdates.searchPlaceholderJsPlugin', { site: siteLabel }),
        ariaLabel: t('latestUpdates.searchAriaJsPlugin', { site: siteLabel }),
      };
    }
    if (selectedSiteId === 'cuutruyen') {
      return {
        placeholder: t('latestUpdates.searchPlaceholderCuutruyen'),
        ariaLabel: t('latestUpdates.searchAriaCuutruyen'),
      };
    }
    if (selectedSiteId === 'mangadex') {
      return {
        placeholder: t('latestUpdates.searchPlaceholderMangadex'),
        ariaLabel: t('latestUpdates.searchAriaMangadex'),
      };
    }
    if (selectedSiteId === 'truyenqq') {
      return {
        placeholder: t('latestUpdates.searchPlaceholderTruyenqq'),
        ariaLabel: t('latestUpdates.searchAriaTruyenqq'),
      };
    }
    if (selectedSiteId === 'minotruyen') {
      return {
        placeholder: t('latestUpdates.searchPlaceholderMinotruyen'),
        ariaLabel: t('latestUpdates.searchAriaMinotruyen'),
      };
    }
    if (selectedSiteId === 'toptruyenzone2') {
      return {
        placeholder: t('latestUpdates.searchPlaceholderToptruyenzone2'),
        ariaLabel: t('latestUpdates.searchAriaToptruyenzone2'),
      };
    }
    if (selectedSiteId === 'zettruyen') {
      return {
        placeholder: t('latestUpdates.searchPlaceholderZettruyen'),
        ariaLabel: t('latestUpdates.searchAriaZettruyen'),
      };
    }
    if (selectedSiteId === 'yurineko') {
      return {
        placeholder: t('latestUpdates.searchPlaceholderYurineko') || t('latestUpdates.searchPlaceholder'),
        ariaLabel: t('latestUpdates.searchAriaYurineko') || t('latestUpdates.searchAria'),
      };
    }
    if (selectedSiteId === 'batcave') {
      return {
        placeholder: t('latestUpdates.searchPlaceholderBatcave'),
        ariaLabel: t('latestUpdates.searchAriaBatcave'),
      };
    }
    if (selectedSiteId === 'truyengg') {
      return {
        placeholder: t('latestUpdates.searchPlaceholderTruyengg') || t('latestUpdates.searchPlaceholder'),
        ariaLabel: t('latestUpdates.searchAriaTruyengg') || t('latestUpdates.searchAria'),
      };
    }
    if (selectedSiteId === 'baotangtruyen') {
      return {
        placeholder: t('latestUpdates.searchPlaceholderBaotangtruyen') || t('latestUpdates.searchPlaceholder'),
        ariaLabel: t('latestUpdates.searchAriaBaotangtruyen') || t('latestUpdates.searchAria'),
      };
    }
    if (selectedSiteId === 'nhattruyen') {
      return {
        placeholder: t('latestUpdates.searchPlaceholderNhattruyen') || t('latestUpdates.searchPlaceholder'),
        ariaLabel: t('latestUpdates.searchAriaNhattruyen') || t('latestUpdates.searchAria'),
      };
    }
    if (selectedSiteId === 'asurascans') {
      return {
        placeholder: t('latestUpdates.searchPlaceholderAsurascans') || t('latestUpdates.searchPlaceholder'),
        ariaLabel: t('latestUpdates.searchAriaAsurascans') || t('latestUpdates.searchAria'),
      };
    }
    if (selectedSiteId === 'flamecomics') {
      return {
        placeholder: t('latestUpdates.searchPlaceholderFlamecomics') || t('latestUpdates.searchPlaceholder'),
        ariaLabel: t('latestUpdates.searchAriaFlamecomics') || t('latestUpdates.searchAria'),
      };
    }
    if (selectedSiteId === 'sangchanhteam') {
      return {
        placeholder: t('latestUpdates.searchPlaceholderSangchanhteam') || t('latestUpdates.searchPlaceholder'),
        ariaLabel: t('latestUpdates.searchAriaSangchanhteam') || t('latestUpdates.searchAria'),
      };
    }
    if (selectedSiteId === 'tcbscanmanga') {
      return {
        placeholder: t('latestUpdates.searchPlaceholderTcbscanmanga') || t('latestUpdates.searchPlaceholder'),
        ariaLabel: t('latestUpdates.searchAriaTcbscanmanga') || t('latestUpdates.searchAria'),
      };
    }
    if (selectedSiteId === 'nettruyenar') {
      return {
        placeholder: t('latestUpdates.searchPlaceholderNettruyenar'),
        ariaLabel: t('latestUpdates.searchAriaNettruyenar'),
      };
    }
    return {
      placeholder: t('latestUpdates.searchPlaceholder'),
      ariaLabel: t('latestUpdates.searchAria'),
    };
  }, [selectedDescriptor, selectedSiteId, t, searchAllSources]);

  const handleSearchAllSourcesChange = useCallback(
    (nextAll) => {
      const enabled = Boolean(nextAll);
      if (enabled === searchAllSources) return;
      setSearchAllSources(enabled);
      persistSearchAllSourcesPref(enabled);

      if (enabled) {
        // Chuyển sang "Tất cả nguồn"
        setMultiSearchPage(1);
        setRawMultiPageInput('1');
        if (
          latestUpdatesMultiSearchCache.rows?.length > 0 &&
          latestUpdatesMultiSearchCache.searchTerm
        ) {
          // Khôi phục kết quả tìm kiếm đa nguồn đã lưu trong phiên
          setRows(latestUpdatesMultiSearchCache.rows);
          setListingTotalPages(1);
          setPage(1);
          setFetchError(latestUpdatesMultiSearchCache.fetchError || '');
          setAppliedSearch(latestUpdatesMultiSearchCache.searchTerm);
          setSearchDraft(latestUpdatesMultiSearchCache.searchTerm);
        } else {
          // Chưa từng tìm kiếm đa nguồn: giữ nguyên rows hiện tại, không call API
          setAppliedSearch('');
        }
      } else {
        // Chuyển về "Nguồn chọn"
        setMultiSearchPage(1);
        setRawMultiPageInput('1');
        if (
          singleSourceCacheRef.current?.rows?.length > 0 &&
          singleSourceCacheRef.current.siteId === selectedSiteId
        ) {
          // Khôi phục kết quả/feed của nguồn được chọn từ cache
          const cached = singleSourceCacheRef.current;
          setRows(cached.rows);
          setListingTotalPages(cached.listingTotalPages || 1);
          setPage(cached.page || 1);
          setFetchError(cached.fetchError || '');
          setAppliedSearch(cached.appliedSearch || '');
          setSearchDraft(cached.appliedSearch || '');
        } else if (
          latestUpdatesListingCache.rows?.length > 0 &&
          !latestUpdatesListingCache.key.includes('|all:')
        ) {
          setRows(latestUpdatesListingCache.rows);
          setListingTotalPages(latestUpdatesListingCache.listingTotalPages || 1);
          setPage(latestUpdatesListingCache.page || 1);
          setFetchError(latestUpdatesListingCache.fetchError || '');
          setAppliedSearch('');
        }
      }
    },
    [searchAllSources, selectedSiteId],
  );

  const effectiveMangaLoadOpts = useMemo(() => {
    let opts = mangaLoadOpts;
    if (selectedSiteId === 'mangadex') {
      opts = { ...opts, mangadexLanguage: panelMangadexLanguage };
    }
    if (selectedSiteId === 'minotruyen') {
      opts = { ...opts, minotruyenListingCategory: panelMinotruyenCategory };
    }
    return opts;
  }, [selectedSiteId, mangaLoadOpts, panelMangadexLanguage, panelMinotruyenCategory]);

  const mangaLoadOptsFingerprint = useMemo(
    () => fingerprintMangaLoadOpts(effectiveMangaLoadOpts),
    [effectiveMangaLoadOpts],
  );

  const chapterDrawerCacheRef = useRef(new Map());
  const singleSourceCacheRef = useRef({
    siteId: '',
    key: '',
    page: 1,
    rows: [],
    listingTotalPages: 1,
    fetchError: '',
    appliedSearch: '',
  });

  const mangadexPanelLangOptions = useMemo(
    () => [
      { value: 'vi', label: t('sidebar.mangadexLangVi') },
      { value: 'en', label: t('sidebar.mangadexLangEn') },
      { value: 'ja', label: t('sidebar.mangadexLangJa') },
    ],
    [t],
  );

  const minotruyenPanelCategoryOptions = useMemo(
    () => [
      { value: 'manga', label: t('latestUpdates.minotruyenCategoryManga') },
      { value: 'comics', label: t('latestUpdates.minotruyenCategoryComics') },
    ],
    [t],
  );

  const handlePanelMangadexLanguageChange = useCallback((nextVal) => {
    const normalized = normalizePanelMangadexLang(nextVal);
    setPanelMangadexLanguage(normalized);
    persistPanelMangadexLang(normalized);
  }, []);

  const handlePanelMinotruyenCategoryChange = useCallback((nextVal) => {
    const normalized = normalizePanelMinotruyenCategory(nextVal);
    setPanelMinotruyenCategory(normalized);
    persistPanelMinotruyenCategory(normalized);
  }, []);

  const latestListFetchTriggerKey = useMemo(() => {
    const scope = isMultiSourceSearch
      ? `all:${selectedMultiSearchSiteIds.slice().sort().join(',')}`
      : 'one';
    if (selectedSiteId === 'mangadex') {
      return `${selectedSiteId}|${appliedSearch}|${scope}|${panelMangadexLanguage}`;
    }
    if (selectedSiteId === 'minotruyen') {
      return `${selectedSiteId}|${appliedSearch}|${scope}|${panelMinotruyenCategory}`;
    }
    return `${selectedSiteId}|${appliedSearch}|${scope}`;
  }, [
    selectedSiteId,
    appliedSearch,
    isMultiSourceSearch,
    selectedMultiSearchSiteIds,
    panelMangadexLanguage,
    panelMinotruyenCategory,
  ]);

  useEffect(() => {
    setPage(1);
    setRawPageInput('1');
    setListingTotalPages(1);
    setRows([]);
    setFetchError('');
    setSearchDraft('');
    setAppliedSearch('');
    setIsSearchLoading(false);
    setPluginConsoleLines([]);
    setPluginConsoleOpen(false);
  }, [selectedSourcesKey]);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.subscribePluginConsole) return undefined;
    const unsub = api.subscribePluginConsole((payload) => {
      if (!payload || typeof payload.pluginId !== 'string') return;
      if (payload.pluginId !== selectedSiteIdRef.current) return;
      const lev =
        payload.level === 'error' ? 'error' : payload.level === 'warn' ? 'warn' : 'info';
      const line = String(payload.line ?? '');
      setPluginConsoleLines((prev) => {
        const next_row = `[${lev}] ${line}`;
        const next = [...prev, next_row];
        return next.length > 100 ? next.slice(-100) : next;
      });
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    setRawPageInput(String(page));
  }, [page]);

  const handleStopFetch = useCallback(() => {
    if (!busyListRef.current && !isSearchLoadingRef.current) return;
    fetchSeqRef.current += 1;
    setIsStoppingList(true);
    try {
      void window.electronAPI?.cancelLatestUpdates?.();
    } catch {
      /* ignore */
    }
    setBusyList(false);
    setIsSearchLoading(false);
    setIsStoppingList(false);
  }, []);

  /** `pageNum` tường minh để Prev/Next không dùng state `page` bị stale. */
  const runFetchForPage = useCallback(
    async (pageNum, overrideSearch) => {
      const api = window.electronAPI;
      const p = clampLatestListingPage(pageNum);
      if (!api?.fetchLatestUpdates) {
        setIsSearchLoading(false);
        setFetchError(t('latestUpdates.needElectron'));
        return;
      }
      if (!activeFetchSiteIds.length) {
        setIsSearchLoading(false);
        setFetchError(t('latestUpdates.pickSource'));
        return;
      }
      const seq = ++fetchSeqRef.current;
      setIsStoppingList(false);
      setBusyList(true);
      setFetchError('');
      try {
        const searchTerm =
          typeof overrideSearch === 'string' ? overrideSearch : appliedSearch;
        const searchEffective = Boolean(String(searchTerm || '').trim());
        const multiEffective = searchEffective && searchAllSources;
        const res = await api.fetchLatestUpdates({
          siteIds: activeFetchSiteIds,
          page: p,
          searchLimit: pageSize,
          ...effectiveMangaLoadOpts,
          latestUpdatesSearch:
            searchEffective && (multiEffective || selectedSupportsSearch) ? searchTerm : '',
        });
        if (seq !== fetchSeqRef.current || res?.aborted) {
          return;
        }
        if (!res?.ok || !Array.isArray(res.results)) {
          setRows([]);
          setListingTotalPages(1);
          setFetchError(res?.error || t('latestUpdates.fetchFailed'));
          return;
        }
        const merged = [];
        let maxPg = 1;
        for (const block of res.results) {
          const sid = block?.siteId;
          if (!sid) continue;
          const tp =
            typeof block.totalPages === 'number' && block.totalPages >= 1 ? block.totalPages : 1;
          maxPg = Math.max(maxPg, tp);
          if (!block.ok || !block.items?.length) continue;
          const label = supported.find((c) => c.id === sid)?.label || sid;
          for (const it of block.items) {
            merged.push({
              ...it,
              siteId: sid,
              siteLabel: label,
            });
          }
        }
        const calculatedTotalPages = isMultiSourceSearch ? 1 : clampLatestListingTotalPages(maxPg);
        setListingTotalPages(calculatedTotalPages);
        setPage(p);
        setRows(merged);
        setLastFetchedAt(Date.now());
        let warn = '';
        const activeIdSet = new Set(activeFetchSiteIds);
        const anyErr = res.results.some(
          (r) => r && r.ok !== true && r.siteId && activeIdSet.has(r.siteId),
        );
        if (!merged.length) {
          warn =
            anyErr ?
              res.results
                .map((r) => formatLatestSearchBlockError(r, supported))
                .filter(Boolean)
                .join(' · ') || t('latestUpdates.empty')
            : t('latestUpdates.empty');
        } else if (anyErr) {
          const errs = res.results
            .map((r) => formatLatestSearchBlockError(r, supported))
            .filter(Boolean);
          if (errs.length) warn = errs.join(' · ');
        }
        setFetchError(warn);
        if (isMultiSourceSearch) {
          latestUpdatesMultiSearchCache.key = latestListFetchTriggerKey;
          latestUpdatesMultiSearchCache.searchTerm = searchTerm;
          latestUpdatesMultiSearchCache.rows = merged;
          latestUpdatesMultiSearchCache.fetchError = warn;
        } else {
          singleSourceCacheRef.current = {
            siteId: selectedSiteId,
            key: latestListFetchTriggerKey,
            page: p,
            rows: merged,
            listingTotalPages: calculatedTotalPages,
            fetchError: warn,
            appliedSearch: searchTerm,
          };
        }
        latestUpdatesListingCache.key = latestListFetchTriggerKey;
        latestUpdatesListingCache.page = p;
        latestUpdatesListingCache.rows = merged;
        latestUpdatesListingCache.listingTotalPages = calculatedTotalPages;
        latestUpdatesListingCache.fetchError = warn;
      } catch (e) {
        if (seq !== fetchSeqRef.current || e?.name === 'AbortError') {
          return;
        }
        setFetchError(String(e?.message || e || t('latestUpdates.fetchFailed')));
        setRows([]);
        setListingTotalPages(1);
      } finally {
        if (seq === fetchSeqRef.current) {
          setBusyList(false);
          setIsSearchLoading(false);
          setIsStoppingList(false);
        }
      }
    },
    [activeFetchSiteIds, supported, effectiveMangaLoadOpts, t, appliedSearch, selectedSupportsSearch, searchAllSources, pageSize],
  );

  const pagination_search_locked =
    isSearchActive &&
    (isMultiSourceSearch || !LATEST_SEARCH_PAGINATED_SITE_IDS.has(selectedSiteId));

  const go_first_page = useCallback(() => {
    setPage(1);
    setRawPageInput('1');
    contentScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    void runFetchForPage(1);
  }, [runFetchForPage]);

  const go_last_page = useCallback(() => {
    const last_num = clampLatestListingPage(listingTotalPages);
    setPage(last_num);
    setRawPageInput(String(last_num));
    contentScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    void runFetchForPage(last_num);
  }, [listingTotalPages, runFetchForPage]);

  const handle_jump_page_submit = useCallback(() => {
    const raw = String(raw_page_input || '').trim();
    const parsed = parseInt(raw, 10);
    if (!Number.isFinite(parsed)) {
      setRawPageInput(String(page));
      return;
    }
    const clamped_page = Math.min(listingTotalPages, clampLatestListingPage(parsed));
    setRawPageInput(String(clamped_page));
    setPage(clamped_page);
    if (clamped_page !== page) {
      contentScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      void runFetchForPage(clamped_page);
    }
  }, [raw_page_input, listingTotalPages, page, runFetchForPage]);

  const handleManualRefresh = useCallback(() => {
    latestUpdatesListingCache.key = '';
    latestUpdatesListingCache.rows = [];
    setPage(1);
    setRawPageInput('1');
    void runFetchForPage(1);
  }, [runFetchForPage]);

  const handlePageSizeChange = useCallback((val) => {
    const next = Number(val);
    if (PAGE_SIZES.includes(next)) {
      setPageSize(next);
      try {
        localStorage.setItem(LATEST_UPDATES_PAGE_SIZE_KEY, String(next));
        localStorage.setItem(MULTI_SEARCH_PAGE_SIZE_KEY, String(next));
      } catch {
        /* ignore */
      }
      if (isMultiSourceSearch) {
        setMultiSearchPage(1);
        setRawMultiPageInput('1');
      } else {
        setPage(1);
        setRawPageInput('1');
        void runFetchForPage(1);
      }
    }
  }, [isMultiSourceSearch, runFetchForPage]);

  /** Đổi nguồn, từ khóa tìm, hoặc ngôn ngữ MangaDex (ô trong tab) → tải trang 1. */
  useEffect(() => {
    if (!selectedSiteId) return;
    if (
      (latestUpdatesListingCache.key === latestListFetchTriggerKey &&
        latestUpdatesListingCache.rows?.length > 0 &&
        latestUpdatesListingCache.page === 1) ||
      (isMultiSourceSearch &&
        latestUpdatesMultiSearchCache.key === latestListFetchTriggerKey &&
        latestUpdatesMultiSearchCache.rows?.length > 0)
    ) {
      if (isMultiSourceSearch && latestUpdatesMultiSearchCache.key === latestListFetchTriggerKey) {
        setRows(latestUpdatesMultiSearchCache.rows);
        setListingTotalPages(1);
        setFetchError(latestUpdatesMultiSearchCache.fetchError || '');
      } else {
        setRows(latestUpdatesListingCache.rows);
        setListingTotalPages(latestUpdatesListingCache.listingTotalPages || 1);
        setFetchError(latestUpdatesListingCache.fetchError || '');
      }
      setIsSearchLoading(false);
      return;
    }
    void runFetchForPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- latestListFetchTriggerKey
  }, [latestListFetchTriggerKey]);

  const handleApplyLatestSearch = useCallback(() => {
    const trimmed = String(searchDraft || '').trim();
    if (!trimmed) return;
    setIsSearchLoading(true);
    setAppliedSearch(trimmed);
    setPage(1);
    setRawPageInput('1');
    setMultiSearchPage(1);
    setRawMultiPageInput('1');
    if (trimmed === appliedSearch && page === 1) {
      void runFetchForPage(1, trimmed);
    }
  }, [searchDraft, appliedSearch, page, runFetchForPage]);

  const handleClearLatestSearch = useCallback(() => {
    setSearchDraft('');
    setAppliedSearch('');
    setIsSearchLoading(false);
    setPage(1);
    setMultiSearchPage(1);
    setRawMultiPageInput('1');

    if (searchAllSources) {
      latestUpdatesMultiSearchCache.key = '';
      latestUpdatesMultiSearchCache.searchTerm = '';
      latestUpdatesMultiSearchCache.rows = [];
      latestUpdatesMultiSearchCache.fetchError = '';
    } else if (singleSourceCacheRef.current) {
      singleSourceCacheRef.current.appliedSearch = '';
    }

    if (
      singleSourceCacheRef.current?.rows?.length > 0 &&
      singleSourceCacheRef.current.siteId === selectedSiteId
    ) {
      const cached = singleSourceCacheRef.current;
      setRows(cached.rows);
      setListingTotalPages(cached.listingTotalPages || 1);
      setFetchError(cached.fetchError || '');
    }
  }, [searchAllSources, selectedSiteId]);

  const handlePluginConsoleCopy = useCallback(async () => {
    const text = pluginConsoleLines.join('\n');
    if (!String(text || '').trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      setPluginConsoleCopyNotice(true);
      setTimeout(() => setPluginConsoleCopyNotice(false), 1600);
    } catch {
      /* ignore */
    }
  }, [pluginConsoleLines]);

  const handlePluginConsoleClear = useCallback(() => {
    setPluginConsoleLines([]);
  }, []);

  const handleEnqueue = useCallback(
    async (siteId, item) => {
      const api = window.electronAPI;
      const key = `${siteId}::${item.mangaUrl}`;
      if (!api?.loadManga || typeof onEnqueueLoadedManga !== 'function') {
        return;
      }
      setEnqueueKey(key);
      setFetchError('');
      try {
        const loadResult = await api.loadManga(siteId, item.mangaUrl, effectiveMangaLoadOpts);
        const chapter_list = Array.isArray(loadResult?.chapters) ? loadResult.chapters : [];
        if (!loadResult?.ok || !chapter_list.length) {
          markRowNoChapters(siteId, item);
          setFetchError(
            loadResult?.error || t('latestUpdates.noChaptersFetched'),
          );
          return;
        }
        const ent = await Promise.resolve(onEnqueueLoadedManga(loadResult));
        if (!ent || ent.ok !== true) {
          setFetchError(ent?.error || t('latestUpdates.enqueueFailed'));
        }
      } catch (e) {
        setFetchError(String(e?.message || e || t('latestUpdates.enqueueFailed')));
      } finally {
        setEnqueueKey('');
      }
    },
    [effectiveMangaLoadOpts, onEnqueueLoadedManga, markRowNoChapters, t],
  );

  const closeChapterDrawer = useCallback(() => {
    setChapterDrawerOpen(false);
    setDrawerManga(null);
    setDrawerLoadSiteId('');
    setDrawerChapters([]);
    setDrawerReadChapterAllowedUrls(null);
    setDrawerSelectedUrls(new Set());
  }, []);

  const mergedDrawerMangaForApp = useCallback(() => {
    const m = drawerManga;
    if (!m || typeof m !== 'object') return m;
    const site_from_row = String(drawerLoadSiteId || '').trim();
    const site_merged = String(m.siteId || '').trim() || site_from_row || undefined;
    return {
      ...m,
      ...(site_merged ? { siteId: site_merged } : {}),
    };
  }, [drawerManga, drawerLoadSiteId]);

  useEffect(() => {
    if (!chapterDrawerOpen || !drawerManga?.title || !drawer_chapters_urls_key.trim()) {
      setDrawerReadChapterAllowedUrls(null);
      return undefined;
    }
    const base = String(savePath || '').trim();
    const manga_title = String(drawerManga.title || '').trim();
    const api = typeof window !== 'undefined' ? window.electronAPI : null;
    if (!base || !api?.filterChaptersWithLocalImages) {
      setDrawerReadChapterAllowedUrls(new Set());
      return undefined;
    }
    let cancelled = false;
    setDrawerReadChapterAllowedUrls(null);
    (async () => {
      try {
        const r = await api.filterChaptersWithLocalImages(base, manga_title, drawerChapters);
        if (cancelled) return;
        if (r?.ok && Array.isArray(r.chapters)) {
          setDrawerReadChapterAllowedUrls(new Set(r.chapters.map((c) => String(c.url || ''))));
        } else {
          setDrawerReadChapterAllowedUrls(new Set());
        }
      } catch {
        if (!cancelled) setDrawerReadChapterAllowedUrls(new Set());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chapterDrawerOpen, drawerManga?.title, drawer_chapters_urls_key, drawerChapters, savePath]);

  const toggleDrawerChapter = useCallback((url) => {
    const normalized = String(url || '').trim();
    if (!normalized) return;
    setDrawerSelectedUrls((prev) => {
      const next = new Set(prev);
      if (next.has(normalized)) next.delete(normalized);
      else next.add(normalized);
      return next;
    });
  }, []);

  const selectDrawerChaptersAll = useCallback(() => {
    const deduped = dedupeChaptersByNumber(drawerChapters);
    setDrawerSelectedUrls(new Set(deduped.map((ch) => String(ch?.url || '').trim()).filter(Boolean)));
  }, [drawerChapters]);

  const unselectDrawerChaptersAll = useCallback(() => {
    setDrawerSelectedUrls(new Set());
  }, []);

  const handleDrawerAddToQueue = useCallback(() => {
    if (!drawerManga || typeof onAddQueuedFromLatest !== 'function') return;
    const result = onAddQueuedFromLatest(mergedDrawerMangaForApp(), drawerChapters, drawerSelectedUrls);
    if (result && result.ok === false) return;
    closeChapterDrawer();
  }, [drawerManga, drawerChapters, drawerSelectedUrls, onAddQueuedFromLatest, closeChapterDrawer, mergedDrawerMangaForApp]);

  const runFetchAndOpenChapterDrawer = useCallback(
    async (siteId, item) => {
      const api = window.electronAPI;
      const busyKey = `${siteId}::${item.mangaUrl}`;
      const cacheKey = makeLatestDrawerCacheKey(siteId, item.mangaUrl, mangaLoadOptsFingerprint);
      
      if (!api?.loadManga) {
        setFetchError(t('latestUpdates.needElectron'));
        return;
      }

      const cacheMap = chapterDrawerCacheRef.current;
      const cachedEntry = cacheMap.get(cacheKey);
      if (
        cachedEntry &&
        Date.now() - cachedEntry.savedAt <= LATEST_DRAWER_CHAPTER_CACHE_TTL_MS &&
        cachedEntry.manga?.title &&
        Array.isArray(cachedEntry.chapters) &&
        cachedEntry.chapters.length > 0
      ) {
        touchChapterDrawerCache(cacheMap, cacheKey, cachedEntry);
        setDrawerManga({
          ...cachedEntry.manga,
          siteId: String(cachedEntry.drawerLoadSiteId || siteId || '').trim(),
        });
        setDrawerLoadSiteId(String(cachedEntry.drawerLoadSiteId || siteId || '').trim());
        setDrawerChapters(cachedEntry.chapters);
        setDrawerSelectedUrls(new Set());
        setFetchError('');
        setChapterDrawerOpen(true);
        return;
      }

      setInlineChapterBusyKey(busyKey);
      setFetchError('');
      try {
        const res = await api.loadManga(siteId, item.mangaUrl, effectiveMangaLoadOpts);
        if (!res?.ok || !res.manga?.title) {
          setFetchError(res?.error || t('latestUpdates.enqueueLoadIncomplete'));
          return;
        }
        const chapter_list = Array.isArray(res.chapters) ? res.chapters : [];
        if (!chapter_list.length) {
          markRowNoChapters(siteId, item);
          setFetchError(t('latestUpdates.noChaptersFetched'));
          return;
        }
        const drawerSiteId = String(siteId || '').trim();
        const nextCached = {
          savedAt: Date.now(),
          manga: res.manga,
          chapters: chapter_list,
          drawerLoadSiteId: drawerSiteId,
        };
        touchChapterDrawerCache(cacheMap, cacheKey, nextCached);
        pruneChapterDrawerCache(cacheMap, LATEST_DRAWER_CHAPTER_CACHE_MAX_ENTRIES);
        setDrawerManga({
          ...res.manga,
          siteId: drawerSiteId,
        });
        setDrawerLoadSiteId(drawerSiteId);
        setDrawerChapters(chapter_list);
        setDrawerSelectedUrls(new Set());
        setChapterDrawerOpen(true);
      } catch (e) {
        setFetchError(String(e?.message || e || t('latestUpdates.fetchFailed')));
      } finally {
        setInlineChapterBusyKey('');
      }
    },
    [effectiveMangaLoadOpts, mangaLoadOptsFingerprint, markRowNoChapters, t],
  );

  const handleOpenChapterListButton = useCallback(
    (siteId, item) => {
      void runFetchAndOpenChapterDrawer(siteId, item);
    },
    [runFetchAndOpenChapterDrawer],
  );

  const handleDrawerCoverChange = useCallback((cover) => {
    if (!cover) return;
    setDrawerManga((prev) =>
      prev
        ? {
            ...prev,
            coverUrl: cover.url512,
            selectedCover: cover,
          }
        : prev,
    );
  }, []);

  const handleDrawerAddCoversToQueue = useCallback(
    (covers) => {
      const manga_title = String(drawerManga?.title || '').trim();
      if (!manga_title || typeof onDownloadMangadexCovers !== 'function') return;
      void onDownloadMangadexCovers(manga_title, covers);
    },
    [drawerManga?.title, onDownloadMangadexCovers],
  );

  const searchScopeControl =
    hasLatestUpdatesSearch && searchCapableSiteIds.length > 1 ? (
      <div
        className="flex min-w-0 w-full flex-col gap-1.5"
        role="group"
        aria-label={t('latestUpdates.searchScopeLabel')}
      >
        <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant shrink-0">
          {t('latestUpdates.searchScopeLabel')}
        </span>
        <div className="grid grid-cols-2 w-full min-w-0 h-10 rounded-xl border border-outline-variant/30 p-1 bg-surface-container-high/40 gap-1 items-center">
          <button
            type="button"
            aria-pressed={!searchAllSources}
            onClick={() => handleSearchAllSourcesChange(false)}
            className={`h-8 w-full rounded-lg px-2 text-xs font-semibold transition-all flex items-center justify-center text-center cursor-pointer select-none ${
              !searchAllSources
                ? 'bg-primary/20 text-primary font-semibold shadow-2xs'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest/60'
            }`}
          >
            <span className="truncate">{t('latestUpdates.searchScopeSelected')}</span>
          </button>
          <button
            type="button"
            aria-pressed={searchAllSources}
            onClick={() => handleSearchAllSourcesChange(true)}
            className={`h-8 w-full rounded-lg px-2 text-xs font-semibold transition-all flex items-center justify-center text-center cursor-pointer select-none ${
              searchAllSources
                ? 'bg-primary/20 text-primary font-semibold shadow-2xs'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest/60'
            }`}
          >
            <span className="truncate">{t('latestUpdates.searchScopeAll')}</span>
          </button>
        </div>
        {searchAllSources && (
          <div className="pt-0.5">
            <MultiSelectDropdown
              options={searchCapableSiteOptions}
              selectedValues={selectedMultiSearchSiteIds}
              onChange={handleMultiSearchSiteIdsChange}
              size="sm"
            />
          </div>
        )}
      </div>
    ) : null;

  const loadingStatusText = isSearchLoading
    ? t('latestUpdates.searchingHint')
    : selectedDescriptor?.label
      ? t('latestUpdates.loadingFromSite', { site: selectedDescriptor.label })
      : t('latestUpdates.loadingList');

  if (!supported.length) {
    return (
      <StudioLayout>
        <StudioLayout.Content>
          <div className="max-w-2xl mx-auto w-full px-6 py-12 text-center">
            <p className="text-sm text-on-surface-variant leading-relaxed">{t('latestUpdates.noConnectorsYet')}</p>
          </div>
        </StudioLayout.Content>
      </StudioLayout>
    );
  }

  return (
    <StudioLayout>
      <StudioLayout.Toolbar
        showLeftSidebar={showLeftSidebar}
        onToggleLeftSidebar={toggleLeftSidebar}
        leftSidebarTooltip={showLeftSidebar ? t('sidebar.hidePanel') : t('sidebar.showPanel')}
        leftSlot={subtabsSlot}
        rightSlot={
          <div className="flex items-center gap-2">
            {(busyList || isSearchLoading) ? (
              <button
                type="button"
                onClick={handleStopFetch}
                disabled={isStoppingList}
                data-tooltip={isStoppingList ? t('latestUpdates.stopping') : t('latestUpdates.stopFetch')}
                aria-label={isStoppingList ? t('latestUpdates.stopping') : t('latestUpdates.stopFetch')}
                className="h-8 px-3.5 shrink-0 rounded-lg bg-error/15 text-error hover:bg-error/25 border border-error/30 text-xs font-semibold transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[15px] leading-none">stop_circle</span>
                <span>{isStoppingList ? t('latestUpdates.stopping') : t('latestUpdates.stopFetch')}</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={!selectedSiteId}
                onClick={handleManualRefresh}
                data-tooltip={t('latestUpdates.refresh')}
                className="h-8 px-3.5 shrink-0 rounded-lg bg-primary text-xs font-semibold text-on-primary transition-all hover:opacity-95 active:scale-95 disabled:pointer-events-none disabled:opacity-50 inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <span className="material-symbols-outlined text-[15px] leading-none">
                  refresh
                </span>
                <span>{t('latestUpdates.refresh')}</span>
              </button>
            )}

            {is_plugin_source ? (
              <button
                type="button"
                onClick={() => setPluginConsoleOpen((v) => !v)}
                data-tooltip={
                  pluginConsoleOpen
                    ? t('latestUpdates.pluginConsoleHide')
                    : t('latestUpdates.pluginConsoleShow')
                }
                aria-label={
                  pluginConsoleOpen
                    ? t('latestUpdates.pluginConsoleHide')
                    : t('latestUpdates.pluginConsoleShow')
                }
                aria-expanded={pluginConsoleOpen}
                className={`relative inline-flex h-8 w-8 items-center justify-center rounded-lg border border-outline-variant/30 transition-colors cursor-pointer ${
                  pluginConsoleOpen
                    ? 'bg-primary/15 text-primary'
                    : pluginConsoleLines.length > 0
                      ? 'bg-secondary/20 text-on-surface hover:bg-surface-bright'
                      : 'bg-surface-container-high text-on-surface-variant'
                }`}
              >
                <span className="material-symbols-outlined text-[16px] leading-none">terminal</span>
                {pluginConsoleLines.length > 0 && !pluginConsoleOpen ? (
                  <span
                    className="absolute right-0.5 top-0.5 size-2 rounded-full bg-error"
                    aria-hidden
                  />
                ) : null}
              </button>
            ) : null}

            <ViewModeToggle
              viewMode={viewMode}
              onChange={setViewModePersist}
              size="md"
            />
          </div>
        }
      />

      <StudioLayout.Body>
        <StudioLayout.LeftSidebar
          open={showLeftSidebar}
          width={leftWidth}
          onResizeStart={handleLeftResizeStart}
        >
          <div className="p-3.5 space-y-4 flex flex-col flex-1 h-full">
            <ExploreSourceSelect
              mode="picker"
              options={selectOptions}
              value={selectedSiteId}
              onChange={handleSiteChange}
            />

            {!searchAllSources && selectedSiteId === 'mangadex' && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant shrink-0">
                  {t('sidebar.mangadexTranslationLang')}
                </label>
                <SearchableSelect
                  value={panelMangadexLanguage}
                  onChange={handlePanelMangadexLanguageChange}
                  options={mangadexPanelLangOptions}
                  placeholder=""
                  className="w-full min-w-0"
                />
              </div>
            )}

            {!searchAllSources && selectedSiteId === 'minotruyen' && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant shrink-0">
                  {t('latestUpdates.minotruyenCategoryLabel')}
                </label>
                <SearchableSelect
                  value={panelMinotruyenCategory}
                  onChange={handlePanelMinotruyenCategoryChange}
                  options={minotruyenPanelCategoryOptions}
                  placeholder=""
                  className="w-full min-w-0"
                />
              </div>
            )}

            {searchScopeControl && (
              <div className="pt-1">
                {searchScopeControl}
              </div>
            )}

            {hasLatestUpdatesSearch && (
              <div
                className="space-y-2"
                role="search"
                aria-label={t('latestUpdates.searchTitle')}
              >
                <div className="flex items-center justify-between gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant shrink-0">
                    {t('latestUpdates.searchTitle')}
                  </label>
                  {searchAllSources && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-surface-container-highest text-on-surface-variant font-medium truncate max-w-[130px]">
                      {t('latestUpdates.searchScopeActiveBadgeAll')}
                    </span>
                  )}
                </div>

                <div className="relative flex items-center w-full">
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchDraft}
                    onChange={(e) => setSearchDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (!searchDraft.trim()) return;
                        if (searchAllSources && selectedMultiSearchSiteIds.length === 0) return;
                        handleApplyLatestSearch();
                      }
                    }}
                    placeholder={latestSearchFieldLabels.placeholder}
                    aria-label={latestSearchFieldLabels.ariaLabel}
                    className="h-10 w-full rounded-xl bg-surface-container-highest px-3.5 pr-8 text-xs sm:text-sm text-on-surface outline-none border border-outline-variant/25 focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all"
                    autoComplete="off"
                  />
                  {searchDraft && !isSearchLoading ? (
                    <button
                      type="button"
                      onClick={handleClearLatestSearch}
                      aria-label={t('latestUpdates.searchClear')}
                      className="absolute right-2.5 text-on-surface-variant/60 hover:text-on-surface cursor-pointer p-0.5 rounded"
                    >
                      <span className="material-symbols-outlined text-[16px] leading-none">close</span>
                    </button>
                  ) : null}
                </div>

                <button
                  type="button"
                  disabled={busyList || !searchDraft.trim() || (searchAllSources && selectedMultiSearchSiteIds.length === 0)}
                  onClick={handleApplyLatestSearch}
                  aria-label={isSearchLoading ? t('latestUpdates.searching') : t('latestUpdates.searchSubmit')}
                  className="h-10 w-full rounded-xl bg-primary text-on-primary text-xs sm:text-sm font-semibold hover:opacity-90 disabled:opacity-40 disabled:pointer-events-none cursor-pointer flex items-center justify-center gap-1.5 select-none transition-all shadow-xs active:scale-95"
                >
                  <span className={`material-symbols-outlined text-[15px] leading-none ${isSearchLoading ? 'animate-spin' : ''}`}>
                    {isSearchLoading ? 'progress_activity' : 'search'}
                  </span>
                  <span>{isSearchLoading ? t('latestUpdates.searching') : t('latestUpdates.searchSubmit')}</span>
                </button>
              </div>
            )}

            {!searchAllSources && selectedSiteId === 'cuutruyen' && rows.length === 0 && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-100 leading-relaxed">
                {t('latestUpdates.cuutruyenVpnNotice')}
              </div>
            )}

            {/* Thẻ thống kê tổng quan (Stats Card) matching FollowedManga & BulkScan */}
            {rows.length > 0 && (
              <div className="mt-auto pt-2">
                <div className="rounded-xl border border-primary/15 bg-primary/5 p-2.5">
                  <div className="text-[10px] font-bold text-primary mb-2 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[13px]">bar_chart</span>
                    <span>{t('latestUpdates.stats.overviewTitle')}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                    <span className="text-on-surface-variant">{t('latestUpdates.stats.total')}</span>
                    <span className="font-bold text-on-surface text-right tabular-nums">{rows.length}</span>
                    <span className="text-on-surface-variant">{t('latestUpdates.stats.following')}</span>
                    <span
                      className={`font-bold text-right tabular-nums ${
                        followingCount > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-on-surface-variant/80'
                      }`}
                    >
                      {followingCount}
                    </span>
                    <span className="text-on-surface-variant">{t('latestUpdates.stats.page')}</span>
                    <span className="font-bold text-on-surface-variant/80 text-right tabular-nums">
                      {isMultiSourceSearch ? `${multiSearchPage} / ${multiSearchTotalPages}` : `${page} / ${listingTotalPages}`}
                    </span>
                    {isMultiSourceSearch && (
                      <>
                        <span className="text-on-surface-variant">{t('latestUpdates.stats.sources')}</span>
                        <span className="font-bold text-primary text-right tabular-nums">
                          {selectedMultiSearchSiteIds.length}
                        </span>
                      </>
                    )}
                  </div>

                  <div className="mt-2.5 pt-2 border-t border-primary/10 space-y-1.5 text-[10px] text-on-surface-variant/75 leading-relaxed">
                    {lastFetchedAt ? (
                      <div className="flex items-start gap-1.5">
                        <span className="w-4 h-4 flex items-center justify-center shrink-0 text-primary/70">
                          <span className="material-symbols-outlined text-[13px] leading-none">schedule</span>
                        </span>
                        <span className="flex-1 min-w-0 leading-snug pt-0.5">
                          {t('latestUpdates.stats.lastUpdated', {
                            time: new Date(lastFetchedAt).toLocaleTimeString(),
                          })}
                        </span>
                      </div>
                    ) : null}
                    {!searchAllSources && selectedSiteId === 'cuutruyen' && (
                      <div className="flex items-start gap-1.5 text-amber-700 dark:text-amber-300">
                        <span className="w-4 h-4 flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined text-[13px] leading-none">vpn_key</span>
                        </span>
                        <span className="flex-1 min-w-0 leading-snug pt-0.5">{t('latestUpdates.cuutruyenVpnNotice')}</span>
                      </div>
                    )}
                    <div className="flex items-start gap-1.5">
                      <span className="w-4 h-4 flex items-center justify-center shrink-0 text-primary/70">
                        <span className="material-symbols-outlined text-[13px] leading-none">touch_app</span>
                      </span>
                      <span className="flex-1 min-w-0 leading-snug pt-0.5">{t('latestUpdates.stats.tip')}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </StudioLayout.LeftSidebar>

        <StudioLayout.Content>
          <div ref={contentScrollRef} className="custom-scrollbar flex-1 min-h-0 overflow-auto p-4 sm:p-6">
            <div className="w-full min-w-0">
          {rows.length > 0 && fetchError && !errorDismissed ? (
            multiErrorItems.length > 1 ? (
              <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-100 shadow-2xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="material-symbols-outlined text-amber-500 text-[18px] shrink-0 leading-none">
                      wifi_off
                    </span>
                    <span className="font-semibold truncate">
                      {t('latestUpdates.multiFetchErrorSummary', { count: multiErrorItems.length })}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setErrorDetailsExpanded((prev) => !prev)}
                      className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-[11px] font-semibold transition-colors cursor-pointer select-none"
                    >
                      {errorDetailsExpanded ? t('latestUpdates.hideDetails') : t('latestUpdates.viewDetails')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setErrorDismissed(true)}
                      data-tooltip={t('latestUpdates.dismissError')}
                      aria-label={t('latestUpdates.dismissError')}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-lg hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 transition-colors cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px] leading-none">close</span>
                    </button>
                  </div>
                </div>
                {errorDetailsExpanded && (
                  <ul className="mt-2.5 space-y-1.5 border-t border-amber-500/20 pt-2 text-[11px] leading-relaxed">
                    {multiErrorItems.map((err, idx) => (
                      <li key={idx} className="flex items-start gap-1.5 text-amber-900/90 dark:text-amber-200/90">
                        <span className="text-amber-500 font-bold shrink-0">•</span>
                        <span>{err}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-100 flex items-start justify-between gap-2.5 shadow-2xs">
                <div className="flex items-start gap-2 min-w-0">
                  <span className="material-symbols-outlined text-amber-500 text-[18px] shrink-0 leading-none mt-0.5">
                    warning
                  </span>
                  <span className="leading-relaxed break-words">{fetchError}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={handleManualRefresh}
                    data-tooltip={t('fetchError.retry')}
                    aria-label={t('fetchError.retry')}
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[15px] leading-none">refresh</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setErrorDismissed(true)}
                    data-tooltip={t('latestUpdates.dismissError')}
                    aria-label={t('latestUpdates.dismissError')}
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px] leading-none">close</span>
                  </button>
                </div>
              </div>
            )
          ) : null}

          {pluginConsoleOpen && is_plugin_source ? (
            <div className="mb-4 flex max-h-72 min-h-0 flex-col overflow-hidden rounded-lg border border-outline-variant/30 bg-surface-container-highest/90">
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-outline-variant/20 px-3 py-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                  {t('latestUpdates.pluginConsoleTitle')}
                </span>
                <div className="flex items-center gap-1.5">
                  {pluginConsoleCopyNotice ? (
                    <span className="text-[10px] text-primary">{t('latestUpdates.pluginConsoleCopied')}</span>
                  ) : null}
                  <button
                    type="button"
                    disabled={!pluginConsoleLines.length}
                    onClick={() => void handlePluginConsoleCopy()}
                    className="rounded-md px-2 py-1 text-[10px] font-medium text-on-surface-variant hover:bg-surface-container-high disabled:pointer-events-none disabled:opacity-40"
                  >
                    {t('latestUpdates.pluginConsoleCopy')}
                  </button>
                  <button
                    type="button"
                    disabled={!pluginConsoleLines.length}
                    onClick={handlePluginConsoleClear}
                    className="rounded-md px-2 py-1 text-[10px] font-medium text-on-surface-variant hover:bg-surface-container-high disabled:pointer-events-none disabled:opacity-40"
                  >
                    {t('latestUpdates.pluginConsoleClear')}
                  </button>
                </div>
              </div>
              <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-relaxed">
                {pluginConsoleLines.length ? (
                  pluginConsoleLines.map((ln, i) => {
                    const is_err = ln.startsWith('[error]');
                    const is_warn = ln.startsWith('[warn]');
                    return (
                      <p
                        key={`${i}\u0001${ln.slice(0, 80)}`}
                        className={`mb-1 break-words whitespace-pre-wrap ${
                          is_err
                            ? 'text-error'
                            : is_warn
                              ? 'text-amber-600 dark:text-amber-300'
                              : 'text-on-surface-variant'
                        }`}
                      >
                        {ln}
                      </p>
                    );
                  })
                ) : (
                  <p className="text-on-surface-variant/75">{t('latestUpdates.pluginConsoleEmpty')}</p>
                )}
              </div>
            </div>
          ) : null}

          {(busyList || isSearchLoading) ? (
            <LatestUpdatesSkeleton viewMode={viewMode} statusText={loadingStatusText} />
          ) : rows.length > 0 ? (
            viewMode === 'grid' ? (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                {displayedRows.map((row) => {
                  const k = `${row.siteId}::${row.mangaUrl}`;
                  const enqBusy = enqueueKey === k;
                  const openBusy = inlineChapterBusyKey === k;
                  const otherBusy =
                    (enqueueKey !== '' && enqueueKey !== k) ||
                    (inlineChapterBusyKey !== '' && inlineChapterBusyKey !== k);
                  const isFav = isMangaFavorite(row, row.siteId);
                  const chapter_actions_enabled = rowChapterActionsEnabled(row);
                  const chapter_actions_disabled_title = chapter_actions_enabled
                    ? undefined
                    : t('latestUpdates.chapterActionsDisabledTitle');
                  const enqueueDisabled = otherBusy || enqBusy || !chapter_actions_enabled;
                  const chapterListDisabled =
                    otherBusy || enqBusy || openBusy || !chapter_actions_enabled;
                  return (
                    <li
                      key={k}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        if (e.target.closest('button') || e.target.closest('a')) return;
                        if (!chapterListDisabled) {
                          handleOpenChapterListButton(row.siteId, row);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          if (e.target.closest('button') || e.target.closest('a')) return;
                          e.preventDefault();
                          if (!chapterListDisabled) {
                            handleOpenChapterListButton(row.siteId, row);
                          }
                        }
                      }}
                      className={`group flex min-w-0 flex-col overflow-hidden rounded-xl border border-outline-variant/20 bg-surface-container-high/35 transition-all hover:border-outline-variant/40 hover:bg-surface-container-high/55 hover:shadow-md cursor-pointer select-none ${
                        openBusy ? 'ring-2 ring-primary/40' : ''
                      }`}
                    >
                      <div className="relative aspect-[3/4.2] bg-surface-container-highest flex items-center justify-center overflow-hidden">
                        <div className="flex flex-col items-center justify-center gap-1 text-on-surface-variant/40 p-2 text-center pointer-events-none select-none">
                          <span className="material-symbols-outlined text-[32px] leading-none">menu_book</span>
                          <span className="text-[10px] font-medium leading-tight line-clamp-1">{t('latestUpdates.noCover')}</span>
                        </div>
                        {row.coverUrl ? (
                          <img
                            src={row.coverUrl}
                            alt=""
                            className="absolute inset-0 size-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                            decoding="async"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : null}
                        {openBusy ? (
                          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
                            <span className="material-symbols-outlined animate-spin text-[28px] text-white leading-none">
                              progress_activity
                            </span>
                          </div>
                        ) : null}
                        <span className="pointer-events-none absolute left-2 top-2 z-[1] max-w-[calc(100%-3rem)] truncate rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                          {row.siteLabel}
                        </span>
                        {typeof onToggleFavorite === 'function' ? (
                          <button
                            type="button"
                            aria-pressed={isFav}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleFavorite(row, row.siteId);
                            }}
                            className={`absolute right-2 top-2 z-[1] flex h-7 w-7 cursor-pointer items-center justify-center rounded-full shadow-md transition-all ${
                              isFav
                                ? 'bg-rose-500/80 text-white ring-1 ring-white/40 backdrop-blur-[2px] hover:bg-rose-500/90'
                                : 'border border-white/25 bg-black/40 text-white/95 shadow-black/10 backdrop-blur-sm hover:bg-black/50'
                            }`}
                            data-tooltip={
                              isFav
                                ? t('mangaInfo.favoriteRemove')
                                : t('mangaInfo.favoriteAdd')
                            }
                          >
                            <span
                              className="material-symbols-outlined block text-[15px] leading-none"
                              style={
                                isFav
                                  ? { fontVariationSettings: "'FILL' 1, 'wght' 300, 'GRAD' 0, 'opsz' 20" }
                                  : { fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 20" }
                              }
                            >
                              {isFav ? 'favorite' : 'favorite_border'}
                            </span>
                          </button>
                        ) : null}
                      </div>
                      <div className="flex min-h-0 flex-1 flex-col gap-1 p-3">
                        <p className="line-clamp-2 text-sm font-semibold leading-snug text-on-surface group-hover:text-primary transition-colors" data-tooltip={row.title}>
                          {row.title}
                        </p>
                        {row.latestChapterLabel ? (
                          <p className="text-xs text-on-surface-variant">{row.latestChapterLabel}</p>
                        ) : null}
                        <div className="mt-auto flex w-full items-center gap-1.5 pt-1">
                          <button
                            type="button"
                            disabled={chapterListDisabled}
                            data-tooltip={chapter_actions_disabled_title}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenChapterListButton(row.siteId, row);
                            }}
                            className="flex-1 min-w-0 h-8 rounded-lg bg-primary text-on-primary hover:opacity-90 text-xs font-semibold transition-all flex items-center justify-center gap-1.5 disabled:pointer-events-none disabled:opacity-45 cursor-pointer shadow-2xs"
                          >
                            {openBusy ? (
                              <span className="inline-flex items-center justify-center gap-1">
                                <span className="material-symbols-outlined animate-spin text-[14px] leading-none">
                                  progress_activity
                                </span>
                                <span className="truncate">{t('latestUpdates.loading')}</span>
                              </span>
                            ) : (
                              <>
                                <span className="material-symbols-outlined text-[15px] leading-none shrink-0">
                                  format_list_bulleted
                                </span>
                                <span className="truncate whitespace-nowrap">{t('latestUpdates.openChapterList')}</span>
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            disabled={enqueueDisabled}
                            data-tooltip={chapter_actions_disabled_title || t('latestUpdates.addToQueue')}
                            aria-label={t('latestUpdates.addToQueue')}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEnqueue(row.siteId, row);
                            }}
                            className="h-8 w-8 shrink-0 rounded-lg bg-primary text-on-primary hover:opacity-90 transition-all flex items-center justify-center disabled:pointer-events-none disabled:opacity-45 cursor-pointer shadow-2xs"
                          >
                            {enqBusy ? (
                              <span className="material-symbols-outlined animate-spin text-[15px] leading-none">
                                progress_activity
                              </span>
                            ) : (
                              <span className="material-symbols-outlined text-[17px] leading-none">
                                playlist_add
                              </span>
                            )}
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <ul className="flex flex-col gap-2">
                {displayedRows.map((row) => {
                  const k = `${row.siteId}::${row.mangaUrl}`;
                  const enqBusy = enqueueKey === k;
                  const openBusy = inlineChapterBusyKey === k;
                  const otherBusy =
                    (enqueueKey !== '' && enqueueKey !== k) ||
                    (inlineChapterBusyKey !== '' && inlineChapterBusyKey !== k);
                  const isFav = isMangaFavorite(row, row.siteId);
                  const chapter_actions_enabled = rowChapterActionsEnabled(row);
                  const chapter_actions_disabled_title = chapter_actions_enabled
                    ? undefined
                    : t('latestUpdates.chapterActionsDisabledTitle');
                  const enqueueDisabled = otherBusy || enqBusy || !chapter_actions_enabled;
                  const chapterListDisabled =
                    otherBusy || enqBusy || openBusy || !chapter_actions_enabled;
                  return (
                    <li
                      key={k}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        if (e.target.closest('button') || e.target.closest('a')) return;
                        if (!chapterListDisabled) {
                          handleOpenChapterListButton(row.siteId, row);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          if (e.target.closest('button') || e.target.closest('a')) return;
                          e.preventDefault();
                          if (!chapterListDisabled) {
                            handleOpenChapterListButton(row.siteId, row);
                          }
                        }
                      }}
                      className={`group flex cursor-pointer select-none items-center justify-between gap-3 px-3 py-2.5 sm:px-4 rounded-xl border border-outline-variant/20 bg-surface-container-high/35 hover:border-outline-variant/40 hover:bg-surface-container-high/55 hover:shadow-xs transition-all ${
                        openBusy ? 'ring-2 ring-primary/40' : ''
                      }`}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="relative h-14 w-10 sm:h-16 sm:w-11 shrink-0 overflow-hidden rounded-lg bg-surface-container-highest border border-outline-variant/15 flex items-center justify-center shadow-xs">
                          <span className="material-symbols-outlined text-[20px] text-on-surface-variant/40 leading-none select-none">menu_book</span>
                          {row.coverUrl ? (
                            <img
                              src={row.coverUrl}
                              alt=""
                              className="pointer-events-none absolute inset-0 size-full object-cover"
                              loading="lazy"
                              decoding="async"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          ) : null}
                          {openBusy ? (
                            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
                              <span className="material-symbols-outlined animate-spin text-[20px] text-white leading-none">
                                progress_activity
                              </span>
                            </div>
                          ) : null}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <h4 className="truncate text-sm font-semibold text-on-surface group-hover:text-primary transition-colors" data-tooltip={row.title}>
                              {row.title}
                            </h4>
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-primary bg-primary/10 px-2 py-0.5 rounded shrink-0">
                              {row.siteLabel}
                            </span>
                          </div>
                          {row.latestChapterLabel ? (
                            <p className="text-xs text-on-surface-variant truncate">{row.latestChapterLabel}</p>
                          ) : null}
                        </div>
                      </div>

                      {/* Action buttons matching unified list standard */}
                      <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          disabled={chapterListDisabled}
                          data-tooltip={chapter_actions_disabled_title}
                          onClick={() => handleOpenChapterListButton(row.siteId, row)}
                          className="h-8 px-3 rounded-lg text-xs font-semibold bg-primary text-on-primary hover:opacity-90 flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:pointer-events-none disabled:opacity-45 cursor-pointer shadow-2xs whitespace-nowrap"
                        >
                          {openBusy ? (
                            <span className="inline-flex items-center justify-center gap-1.5">
                              <span className="material-symbols-outlined animate-spin text-[14px] leading-none">
                                progress_activity
                              </span>
                              <span>{t('latestUpdates.loading')}</span>
                            </span>
                          ) : (
                            <>
                              <span className="material-symbols-outlined text-[15px] leading-none shrink-0">
                                format_list_bulleted
                              </span>
                              <span className="whitespace-nowrap">{t('latestUpdates.openChapterList')}</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          disabled={enqueueDisabled}
                          data-tooltip={chapter_actions_disabled_title || t('latestUpdates.addToQueue')}
                          aria-label={t('latestUpdates.addToQueue')}
                          onClick={() => handleEnqueue(row.siteId, row)}
                          className="h-8 w-8 shrink-0 rounded-lg bg-primary text-on-primary hover:opacity-90 transition-all flex items-center justify-center disabled:pointer-events-none disabled:opacity-45 cursor-pointer shadow-2xs"
                        >
                          {enqBusy ? (
                            <span className="material-symbols-outlined animate-spin text-[15px] leading-none">
                              progress_activity
                            </span>
                          ) : (
                            <span className="material-symbols-outlined text-[17px] leading-none">
                              playlist_add
                            </span>
                          )}
                        </button>

                        {typeof onToggleFavorite === 'function' ? (
                          <button
                            type="button"
                            aria-pressed={isFav}
                            onClick={() => handleToggleFavorite(row, row.siteId)}
                            className={`h-8 w-8 shrink-0 rounded-lg border transition-all flex items-center justify-center cursor-pointer shadow-2xs ${
                              isFav
                                ? 'border-rose-500/30 bg-rose-500/15 text-rose-500 hover:bg-rose-500/25'
                                : 'border-outline-variant/20 bg-surface-container-highest hover:bg-surface-bright text-on-surface-variant hover:text-rose-500'
                            }`}
                            data-tooltip={
                              isFav
                                ? t('mangaInfo.favoriteRemove')
                                : t('mangaInfo.favoriteAdd')
                            }
                            aria-label={
                              isFav
                                ? t('mangaInfo.favoriteRemove')
                                : t('mangaInfo.favoriteAdd')
                            }
                          >
                            <span
                              className="material-symbols-outlined text-[15px] leading-none"
                              style={
                                isFav
                                  ? { fontVariationSettings: "'FILL' 1, 'wght' 300, 'GRAD' 0, 'opsz' 20" }
                                  : { fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 20" }
                              }
                            >
                              {isFav ? 'favorite' : 'favorite_border'}
                            </span>
                          </button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )
          ) : fetchError ? (
            <FetchErrorState
              message={fetchError}
              multiErrors={multiErrorItems}
              sourceLabel={
                isMultiSourceSearch
                  ? t('latestUpdates.searchScopeAll')
                  : selectedDescriptor?.label || ''
              }
              requiresVpn={Boolean(selectedDescriptor?.requiresVpn)}
              suggestsVpn={Boolean(selectedDescriptor?.suggestsVpn)}
              onRetry={handleManualRefresh}
              secondaryAction={
                isSearchActive ? (
                  <button
                    type="button"
                    onClick={handleClearLatestSearch}
                    className="h-9 px-3.5 rounded-xl border border-outline-variant/25 bg-surface-container-high text-xs font-semibold text-on-surface hover:bg-surface-bright transition-all active:scale-95 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[15px] leading-none">filter_alt_off</span>
                    <span>{t('latestUpdates.searchClear')}</span>
                  </button>
                ) : is_plugin_source ? (
                  <button
                    type="button"
                    onClick={() => setPluginConsoleOpen(true)}
                    className="h-9 px-3.5 rounded-xl border border-outline-variant/25 bg-surface-container-high text-xs font-semibold text-on-surface hover:bg-surface-bright transition-all active:scale-95 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[15px] leading-none">terminal</span>
                    <span>{t('latestUpdates.pluginConsoleShow')}</span>
                  </button>
                ) : null
              }
            />
          ) : (
            <EmptyState
              icon="update"
              {...{ title: t('latestUpdates.empty') }}
              description={t('latestUpdates.hintBelow')}
            />
          )}
        </div>
      </div>

      {/* Modern Bottom Pagination Bar */}
      {!isMultiSourceSearch && selectedSiteId && listingTotalPages > 0 && rows.length > 0 && (
        <div
          className="shrink-0 border-t border-outline-variant/20 bg-surface-container-low/80 backdrop-blur-md px-4 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 select-none"
          role="region"
          aria-label={t('latestUpdates.pageOf', { page, total: listingTotalPages })}
        >
          {/* Left: Status badge */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary tabular-nums shadow-2xs">
              <span className="material-symbols-outlined text-[15px]">auto_stories</span>
              <span>{t('latestUpdates.pageOf', { page, total: listingTotalPages })}</span>
            </span>
          </div>

          {/* Right: Modern Compact Page Navigation & PageSize Selector */}
          <div className="flex items-center gap-2 text-xs text-on-surface-variant sm:ml-auto flex-wrap">
            <SearchableSelect
              value={String(pageSize)}
              onChange={handlePageSizeChange}
              options={pageSizeOptions}
              placeholder=""
              size="sm"
              className="w-[4.5rem]"
              disabled={busyList || pagination_search_locked}
              data-tooltip={t('bulkScan.pageSize')}
              aria-label={t('bulkScan.pageSize')}
            />

            {listingTotalPages > 1 && (
              <div className="flex items-center gap-1">
                {/* First page button */}
                <button
                  type="button"
                  data-tooltip={t('latestUpdates.firstPage')}
                  aria-label={t('latestUpdates.firstPage')}
                  disabled={page <= 1 || busyList || !selectedSiteId || pagination_search_locked}
                  onClick={go_first_page}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-outline-variant/30 bg-surface-container-high text-on-surface-variant hover:bg-surface-bright hover:text-on-surface hover:border-outline-variant/60 active:scale-95 disabled:pointer-events-none disabled:opacity-40 transition-all cursor-pointer shadow-2xs"
                >
                  <span className="material-symbols-outlined text-[17px] leading-none">first_page</span>
                </button>

                {/* Previous page button */}
                <button
                  type="button"
                  aria-label={t('latestUpdates.prevPage')}
                  disabled={page <= 1 || busyList || pagination_search_locked}
                  onClick={() => {
                    const next = Math.max(1, page - 1);
                    setPage(next);
                    contentScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                    void runFetchForPage(next);
                  }}
                  className="inline-flex h-8 px-2.5 shrink-0 items-center gap-1 rounded-xl border border-outline-variant/30 bg-surface-container-high text-on-surface-variant hover:bg-surface-bright hover:text-on-surface hover:border-outline-variant/60 active:scale-95 disabled:pointer-events-none disabled:opacity-40 transition-all cursor-pointer shadow-2xs font-medium"
                >
                  <span className="material-symbols-outlined text-[16px] leading-none">chevron_left</span>
                  <span className="max-sm:hidden">{t('latestUpdates.prevPage')}</span>
                </button>

                {/* Quick jump page input */}
                <form
                  className="flex min-w-0 items-center gap-1.5 px-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handle_jump_page_submit();
                  }}
                >
                  <input
                    type="number"
                    min={1}
                    max={listingTotalPages}
                    inputMode="numeric"
                    aria-label={t('latestUpdates.pageInputAria', { total: listingTotalPages })}
                    disabled={busyList || !selectedSiteId || pagination_search_locked}
                    value={raw_page_input}
                    onChange={(e) => setRawPageInput(e.target.value)}
                    className="h-8 w-12 shrink-0 rounded-xl border border-outline-variant/30 bg-surface-container-highest px-1.5 text-center text-xs font-semibold font-mono text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all disabled:opacity-40 shadow-inner"
                  />
                  <span className="text-on-surface-variant/70 font-medium">/</span>
                  <span className="tabular-nums font-semibold text-on-surface-variant min-w-[1.5rem] text-center">
                    {listingTotalPages}
                  </span>
                </form>

                {/* Next page button */}
                <button
                  type="button"
                  aria-label={t('latestUpdates.nextPage')}
                  disabled={busyList || page >= listingTotalPages || pagination_search_locked}
                  onClick={() => {
                    const next = Math.min(listingTotalPages, page + 1);
                    setPage(next);
                    contentScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                    void runFetchForPage(next);
                  }}
                  className="inline-flex h-8 px-2.5 shrink-0 items-center gap-1 rounded-xl border border-outline-variant/30 bg-surface-container-high text-on-surface-variant hover:bg-surface-bright hover:text-on-surface hover:border-outline-variant/60 active:scale-95 disabled:pointer-events-none disabled:opacity-40 transition-all cursor-pointer shadow-2xs font-medium"
                >
                  <span className="max-sm:hidden">{t('latestUpdates.nextPage')}</span>
                  <span className="material-symbols-outlined text-[16px] leading-none">chevron_right</span>
                </button>

                {/* Last page button */}
                <button
                  type="button"
                  data-tooltip={t('latestUpdates.lastPage')}
                  aria-label={t('latestUpdates.lastPage')}
                  disabled={
                    busyList || !selectedSiteId || page >= listingTotalPages || pagination_search_locked
                  }
                  onClick={go_last_page}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-outline-variant/30 bg-surface-container-high text-on-surface-variant hover:bg-surface-bright hover:text-on-surface hover:border-outline-variant/60 active:scale-95 disabled:pointer-events-none disabled:opacity-40 transition-all cursor-pointer shadow-2xs"
                >
                  <span className="material-symbols-outlined text-[17px] leading-none">last_page</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Multi-source search result summary footer with in-memory pagination */}
      {isMultiSourceSearch && rows.length > 0 && (
        <div
          className="shrink-0 border-t border-outline-variant/20 bg-surface-container-low/80 backdrop-blur-md px-4 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 select-none"
          role="region"
          aria-label={t('latestUpdates.multiSearchSummary', {
            count: rows.length,
            sources: selectedMultiDescriptors.length || searchCapableSiteOptions.length,
          })}
        >
          {/* Left: Summary */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary tabular-nums shadow-2xs">
              <span className="material-symbols-outlined text-[15px]">manage_search</span>
              <span>
                {t('latestUpdates.multiSearchSummary', {
                  count: rows.length,
                  sources: selectedMultiDescriptors.length || searchCapableSiteOptions.length,
                })}
              </span>
            </span>
          </div>

          {/* Right: Client-side Page Navigation Controls & PageSize Selector */}
          <div className="flex items-center gap-2 text-xs text-on-surface-variant sm:ml-auto flex-wrap">
            <SearchableSelect
              value={String(pageSize)}
              onChange={handlePageSizeChange}
              options={pageSizeOptions}
              placeholder=""
              size="sm"
              className="w-[4.5rem]"
              disabled={isSearchLoading}
              data-tooltip={t('bulkScan.pageSize')}
              aria-label={t('bulkScan.pageSize')}
            />

            {multiSearchTotalPages > 1 ? (
              <div className="flex items-center gap-1">
                {/* First page button */}
                <button
                  type="button"
                  data-tooltip={t('latestUpdates.firstPage')}
                  aria-label={t('latestUpdates.firstPage')}
                  disabled={multiSearchPage <= 1 || isSearchLoading}
                  onClick={() => {
                    setMultiSearchPage(1);
                    setRawMultiPageInput('1');
                    contentScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-outline-variant/30 bg-surface-container-high text-on-surface-variant hover:bg-surface-bright hover:text-on-surface hover:border-outline-variant/60 active:scale-95 disabled:pointer-events-none disabled:opacity-40 transition-all cursor-pointer shadow-2xs"
                >
                  <span className="material-symbols-outlined text-[17px] leading-none">first_page</span>
                </button>

                {/* Previous page button */}
                <button
                  type="button"
                  aria-label={t('latestUpdates.prevPage')}
                  disabled={multiSearchPage <= 1 || isSearchLoading}
                  onClick={() => {
                    const next = Math.max(1, multiSearchPage - 1);
                    setMultiSearchPage(next);
                    setRawMultiPageInput(String(next));
                    contentScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="inline-flex h-8 px-2.5 shrink-0 items-center gap-1 rounded-xl border border-outline-variant/30 bg-surface-container-high text-on-surface-variant hover:bg-surface-bright hover:text-on-surface hover:border-outline-variant/60 active:scale-95 disabled:pointer-events-none disabled:opacity-40 transition-all cursor-pointer shadow-2xs font-medium"
                >
                  <span className="material-symbols-outlined text-[16px] leading-none">chevron_left</span>
                  <span className="max-sm:hidden">{t('latestUpdates.prevPage')}</span>
                </button>

                {/* Quick jump page input */}
                <form
                  className="flex min-w-0 items-center gap-1.5 px-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleMultiPageJumpSubmit();
                  }}
                >
                  <input
                    type="number"
                    min={1}
                    max={multiSearchTotalPages}
                    inputMode="numeric"
                    aria-label={t('latestUpdates.pageInputAria', { total: multiSearchTotalPages })}
                    disabled={isSearchLoading}
                    value={rawMultiPageInput}
                    onChange={(e) => setRawMultiPageInput(e.target.value)}
                    className="h-8 w-12 shrink-0 rounded-xl border border-outline-variant/30 bg-surface-container-highest px-1.5 text-center text-xs font-semibold font-mono text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all disabled:opacity-40 shadow-inner"
                  />
                  <span className="text-on-surface-variant/70 font-medium">/</span>
                  <span className="tabular-nums font-semibold text-on-surface-variant min-w-[1.5rem] text-center">
                    {multiSearchTotalPages}
                  </span>
                </form>

                {/* Next page button */}
                <button
                  type="button"
                  aria-label={t('latestUpdates.nextPage')}
                  disabled={multiSearchPage >= multiSearchTotalPages || isSearchLoading}
                  onClick={() => {
                    const next = Math.min(multiSearchTotalPages, multiSearchPage + 1);
                    setMultiSearchPage(next);
                    setRawMultiPageInput(String(next));
                    contentScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="inline-flex h-8 px-2.5 shrink-0 items-center gap-1 rounded-xl border border-outline-variant/30 bg-surface-container-high text-on-surface-variant hover:bg-surface-bright hover:text-on-surface hover:border-outline-variant/60 active:scale-95 disabled:pointer-events-none disabled:opacity-40 transition-all cursor-pointer shadow-2xs font-medium"
                >
                  <span className="max-sm:hidden">{t('latestUpdates.nextPage')}</span>
                  <span className="material-symbols-outlined text-[16px] leading-none">chevron_right</span>
                </button>

                {/* Last page button */}
                <button
                  type="button"
                  data-tooltip={t('latestUpdates.lastPage')}
                  aria-label={t('latestUpdates.lastPage')}
                  disabled={multiSearchPage >= multiSearchTotalPages || isSearchLoading}
                  onClick={() => {
                    setMultiSearchPage(multiSearchTotalPages);
                    setRawMultiPageInput(String(multiSearchTotalPages));
                    contentScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-outline-variant/30 bg-surface-container-high text-on-surface-variant hover:bg-surface-bright hover:text-on-surface hover:border-outline-variant/60 active:scale-95 disabled:pointer-events-none disabled:opacity-40 transition-all cursor-pointer shadow-2xs"
                >
                  <span className="material-symbols-outlined text-[17px] leading-none">last_page</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-xs text-on-surface-variant/70 italic">
                <span>{t('latestUpdates.multiSearchNoPaginationNotice')}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </StudioLayout.Content>
  </StudioLayout.Body>

      <ChaptersDrawer
        open={chapterDrawerOpen}
        onClose={closeChapterDrawer}
        drawerHeading={drawerManga?.title || null}
        coverUrl={drawerManga?.coverUrl || ''}
        description={drawerManga?.description || ''}
        chapters={drawerChapters}
        queue={queue}
        currentMangaUrl={String(drawerManga?.mangaUrl || '').trim()}
        selectedUrls={drawerSelectedUrls}
        setSelectedUrls={setDrawerSelectedUrls}
        onToggleChapter={toggleDrawerChapter}
        onSelectAll={selectDrawerChaptersAll}
        onUnselectAll={unselectDrawerChaptersAll}
        onAddSelectedToQueue={handleDrawerAddToQueue}
        onReadChapter={
          typeof prepareDrawerMangaForRead === 'function' &&
          typeof onOpenReaderForDrawerChapter === 'function'
            ? (ch) => {
                if (!drawerManga) return;
                prepareDrawerMangaForRead(mergedDrawerMangaForApp(), drawerChapters);
                onOpenReaderForDrawerChapter(ch);
                closeChapterDrawer();
              }
            : undefined
        }
        onReadChapterOnline={
          typeof prepareDrawerMangaForRead === 'function' &&
          typeof onReadChapterOnlineForDrawerChapter === 'function' &&
          !drawerManga?.offlineOnly
            ? (ch) => {
                if (!drawerManga) return;
                prepareDrawerMangaForRead(mergedDrawerMangaForApp(), drawerChapters);
                onReadChapterOnlineForDrawerChapter(ch);
                closeChapterDrawer();
              }
            : undefined
        }
        readOnlineEnabled={Boolean(String(savePath || '').trim())}
        readChapterAllowedUrls={drawerReadChapterAllowedUrls}
        manga={drawerManga}
        onCoverChange={handleDrawerCoverChange}
        onAddCoversToQueue={handleDrawerAddCoversToQueue}
      />
    </StudioLayout>
  );
}
