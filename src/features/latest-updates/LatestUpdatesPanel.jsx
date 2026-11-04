import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SearchableSelect, StudioLayout, useStudioLayout } from '../../shared';
import { ChaptersDrawer } from '../reader';
import { useI18n } from '../../context/I18nContext';
import { latestListingItemChapterActionsEnabled } from './latestListingChapterActions.js';

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
}) {
  const { t } = useI18n();
  const {
    showLeftSidebar,
    toggleLeftSidebar,
    leftWidth,
    handleLeftResizeStart,
  } = useStudioLayout({
    storagePrefix: 'latest_updates',
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

  // Kiểm tra xem manga có trong favorites không
  const isMangaFavorite = useCallback((manga, siteId) => {
    if (!manga?.mangaUrl || !siteId) return false;
    const id = makeFavoriteId(manga, siteId);
    return favorites.some((f) => f.id === id);
  }, [favorites, makeFavoriteId]);

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

  const [page, setPage] = useState(1);
  const [raw_page_input, setRawPageInput] = useState('1');
  const [rows, setRows] = useState([]);
  const [listingTotalPages, setListingTotalPages] = useState(1);
  const [fetchError, setFetchError] = useState('');
  const [busyList, setBusyList] = useState(false);
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
  const [viewMode, setViewMode] = useState(() => loadLayoutPref());
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
  /** Rows where loadManga returned zero chapters — disable list + queue actions. */
  const [noChapterRowKeys, setNoChapterRowKeys] = useState(() => new Set());

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

  const setViewModePersist = useCallback((mode) => {
    const next = mode === 'list' ? 'list' : 'grid';
    setViewMode(next);
    saveLayoutPref(next);
  }, []);

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

  const isSearchActive = Boolean(String(appliedSearch || '').trim());
  const isMultiSourceSearch = isSearchActive && searchAllSources;

  const selectedSupportsSearch = useMemo(() => {
    if (!selectedSiteId) return false;
    if (selectedDescriptor && typeof selectedDescriptor.supportsLatestUpdatesSearch === 'boolean') {
      return selectedDescriptor.supportsLatestUpdatesSearch;
    }
    return searchCapableSiteIds.includes(selectedSiteId);
  }, [selectedDescriptor, selectedSiteId, searchCapableSiteIds]);

  const activeFetchSiteIds = useMemo(() => {
    if (isMultiSourceSearch && searchCapableSiteIds.length) {
      return dropMoeFamilySearchTwins(searchCapableSiteIds);
    }
    return selectedSiteId ? [selectedSiteId] : [];
  }, [isMultiSourceSearch, searchCapableSiteIds, selectedSiteId]);

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

  const handleSearchAllSourcesChange = useCallback((nextAll) => {
    const enabled = Boolean(nextAll);
    setSearchAllSources(enabled);
    persistSearchAllSourcesPref(enabled);
  }, []);

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
    const scope = searchAllSources ? 'all' : 'one';
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
    searchAllSources,
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

  /** `pageNum` tường minh để Prev/Next không dùng state `page` bị stale. */
  const runFetchForPage = useCallback(
    async (pageNum) => {
      const api = window.electronAPI;
      const p = clampLatestListingPage(pageNum);
      if (!api?.fetchLatestUpdates) {
        setFetchError(t('latestUpdates.needElectron'));
        return;
      }
      if (!activeFetchSiteIds.length) {
        setFetchError(t('latestUpdates.pickSource'));
        return;
      }
      setBusyList(true);
      setFetchError('');
      try {
        const res = await api.fetchLatestUpdates({
          siteIds: activeFetchSiteIds,
          page: p,
          ...effectiveMangaLoadOpts,
          latestUpdatesSearch:
            isSearchActive && (isMultiSourceSearch || selectedSupportsSearch) ? appliedSearch : '',
        });
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
        setListingTotalPages(
          isMultiSourceSearch ? 1 : clampLatestListingTotalPages(maxPg),
        );
        setPage(p);
        setRows(merged);
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
      } catch (e) {
        setFetchError(String(e?.message || e || t('latestUpdates.fetchFailed')));
        setRows([]);
        setListingTotalPages(1);
      } finally {
        setBusyList(false);
      }
    },
    [activeFetchSiteIds, supported, effectiveMangaLoadOpts, t, appliedSearch, isSearchActive, isMultiSourceSearch, selectedSupportsSearch],
  );

  const pagination_search_locked =
    isSearchActive &&
    (isMultiSourceSearch || !LATEST_SEARCH_PAGINATED_SITE_IDS.has(selectedSiteId));

  const go_first_page = useCallback(() => {
    setPage(1);
    setRawPageInput('1');
    void runFetchForPage(1);
  }, [runFetchForPage]);

  const go_last_page = useCallback(() => {
    const last_num = clampLatestListingPage(listingTotalPages);
    setPage(last_num);
    setRawPageInput(String(last_num));
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
      void runFetchForPage(clamped_page);
    }
  }, [raw_page_input, listingTotalPages, page, runFetchForPage]);

  const handleManualRefresh = useCallback(() => {
    setPage(1);
    setRawPageInput('1');
    void runFetchForPage(1);
  }, [runFetchForPage]);

  /** Đổi nguồn, từ khóa tìm, hoặc ngôn ngữ MangaDex (ô trong tab) → tải trang 1. */
  useEffect(() => {
    if (!selectedSiteId) return;
    void runFetchForPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- latestListFetchTriggerKey
  }, [latestListFetchTriggerKey]);

  const handleApplyLatestSearch = useCallback(() => {
    const trimmed = String(searchDraft || '').trim();
    setAppliedSearch(trimmed);
    setPage(1);
    setRawPageInput('1');
  }, [searchDraft]);

  const handleClearLatestSearch = useCallback(() => {
    setSearchDraft('');
    setAppliedSearch('');
    setPage(1);
  }, []);

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
    setDrawerSelectedUrls(new Set(drawerChapters.map((ch) => String(ch?.url || '').trim()).filter(Boolean)));
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
        <div className="grid grid-cols-2 w-full min-w-0 rounded-xl border border-outline-variant/30 p-1 bg-surface-container-high/40 gap-1">
          <button
            type="button"
            aria-pressed={!searchAllSources}
            onClick={() => handleSearchAllSourcesChange(false)}
            className={`min-h-9 w-full rounded-lg px-2 text-xs font-medium transition-all flex items-center justify-center text-center cursor-pointer select-none ${
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
            className={`min-h-9 w-full rounded-lg px-2 text-xs font-medium transition-all flex items-center justify-center text-center cursor-pointer select-none ${
              searchAllSources
                ? 'bg-primary/20 text-primary font-semibold shadow-2xs'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest/60'
            }`}
          >
            <span className="truncate">{t('latestUpdates.searchScopeAll')}</span>
          </button>
        </div>
      </div>
    ) : null;

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
        leftSlot={
          <div className="flex items-center gap-2 min-w-0">
            {subtabsSlot}
            {hasLatestUpdatesSearch ? (
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="relative flex items-center min-w-[14rem] max-w-sm">
                  <span className="material-symbols-outlined absolute left-2.5 text-[17px] text-on-surface-variant/60 pointer-events-none">
                    search
                  </span>
                  <input
                    type="text"
                    value={searchDraft}
                    onChange={(e) => setSearchDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleApplyLatestSearch();
                      }
                    }}
                    placeholder={latestSearchFieldLabels.placeholder}
                    aria-label={latestSearchFieldLabels.ariaLabel}
                    className="h-8 w-full rounded-lg bg-surface-container-high/60 pl-8 pr-7 text-xs text-on-surface outline-none border border-outline-variant/25 focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
                    autoComplete="off"
                  />
                  {searchDraft ? (
                    <button
                      type="button"
                      onClick={handleClearLatestSearch}
                      className="absolute right-2 text-on-surface-variant/60 hover:text-on-surface cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[15px]">close</span>
                    </button>
                  ) : null}
                </div>
                <button
                  type="button"
                  disabled={busyList}
                  onClick={handleApplyLatestSearch}
                  className="h-8 px-2.5 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:opacity-90 disabled:opacity-40 cursor-pointer flex items-center gap-1 shrink-0"
                >
                  <span>{t('latestUpdates.searchSubmit')}</span>
                </button>
              </div>
            ) : null}
          </div>
        }
        rightSlot={
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-outline-variant/20 p-0.5 bg-surface-container-high/40">
              <button
                type="button"
                onClick={() => setViewModePersist('grid')}
                data-tooltip={t('favorites.viewGrid')}
                aria-pressed={viewMode === 'grid'}
                className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors cursor-pointer ${
                  viewMode === 'grid' ? 'bg-primary/20 text-primary font-bold' : 'text-on-surface-variant hover:bg-surface-bright'
                }`}
              >
                <span className="material-symbols-outlined text-[16px] leading-none">grid_view</span>
              </button>
              <button
                type="button"
                onClick={() => setViewModePersist('list')}
                data-tooltip={t('favorites.viewList')}
                aria-pressed={viewMode === 'list'}
                className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors cursor-pointer ${
                  viewMode === 'list' ? 'bg-primary/20 text-primary font-bold' : 'text-on-surface-variant hover:bg-surface-bright'
                }`}
              >
                <span className="material-symbols-outlined text-[16px] leading-none">view_list</span>
              </button>
            </div>

            <div className="flex items-center gap-1 text-xs text-on-surface-variant">
              <span className="tabular-nums px-1 max-sm:hidden">
                {t('latestUpdates.pageOf', { page, total: listingTotalPages })}
              </span>
              <button
                type="button"
                data-tooltip={t('latestUpdates.firstPage')}
                aria-label={t('latestUpdates.firstPage')}
                disabled={page <= 1 || busyList || !selectedSiteId || pagination_search_locked}
                onClick={go_first_page}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-outline-variant/30 bg-surface-container-high text-on-surface-variant hover:bg-surface-bright disabled:pointer-events-none disabled:opacity-40 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px] leading-none">first_page</span>
              </button>
              <button
                type="button"
                disabled={page <= 1 || busyList || pagination_search_locked}
                onClick={() => {
                  const next = Math.max(1, page - 1);
                  setPage(next);
                  void runFetchForPage(next);
                }}
                className="h-7 shrink-0 rounded-md border border-outline-variant/30 bg-surface-container-high px-2 text-xs hover:bg-surface-bright disabled:opacity-40 cursor-pointer"
              >
                {t('latestUpdates.prevPage')}
              </button>
              <form
                className="flex min-w-0 items-center gap-1"
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
                  className="h-7 w-11 shrink-0 rounded-md border border-outline-variant/30 bg-surface px-1 text-center text-xs font-mono text-on-surface outline-none focus:border-primary/50 disabled:opacity-40"
                />
              </form>
              <button
                type="button"
                disabled={busyList || page >= listingTotalPages || pagination_search_locked}
                onClick={() => {
                  const next = Math.min(listingTotalPages, page + 1);
                  setPage(next);
                  void runFetchForPage(next);
                }}
                className="h-7 shrink-0 rounded-md border border-outline-variant/30 bg-surface-container-high px-2 text-xs hover:bg-surface-bright disabled:opacity-40 cursor-pointer"
              >
                {t('latestUpdates.nextPage')}
              </button>
              <button
                type="button"
                data-tooltip={t('latestUpdates.lastPage')}
                aria-label={t('latestUpdates.lastPage')}
                disabled={
                  busyList || !selectedSiteId || page >= listingTotalPages || pagination_search_locked
                }
                onClick={go_last_page}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-outline-variant/30 bg-surface-container-high text-on-surface-variant hover:bg-surface-bright disabled:pointer-events-none disabled:opacity-40 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px] leading-none">last_page</span>
              </button>
            </div>

            <button
              type="button"
              disabled={busyList || !selectedSiteId}
              onClick={handleManualRefresh}
              className="h-7.5 shrink-0 rounded-lg bg-primary px-3 text-xs font-semibold text-on-primary transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
            >
              <span className={`material-symbols-outlined text-[15px] leading-none ${busyList ? 'animate-spin' : ''}`}>
                refresh
              </span>
              <span>{busyList ? t('latestUpdates.loading') : t('latestUpdates.refresh')}</span>
            </button>

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
                className={`relative inline-flex h-7.5 w-7.5 items-center justify-center rounded-lg border border-outline-variant/30 transition-colors cursor-pointer ${
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
          </div>
        }
      />

      <StudioLayout.Body>
        <StudioLayout.LeftSidebar
          open={showLeftSidebar}
          width={leftWidth}
          onResizeStart={handleLeftResizeStart}
        >
          <div className="p-3.5 space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant shrink-0">
                {t('latestUpdates.sources')}
              </label>
              <SearchableSelect
                value={selectedSiteId}
                onChange={handleSiteChange}
                options={selectOptions}
                placeholder={t('sidebar.siteSelectPlaceholder')}
                showPlaceholderOption={false}
                className="w-full min-w-0"
              />
            </div>

            {selectedSiteId === 'mangadex' && (
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

            {selectedSiteId === 'minotruyen' && (
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

            {selectedSiteId === 'cuutruyen' && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-100 leading-relaxed">
                {t('latestUpdates.cuutruyenVpnNotice')}
              </div>
            )}

            {selectedDescriptor && (
              <div className="rounded-xl border border-outline-variant/15 bg-surface-container-low/50 p-3 space-y-1 text-xs text-on-surface-variant">
                <div className="flex items-center justify-between font-semibold text-on-surface">
                  <span className="truncate">{selectedDescriptor.label || selectedSiteId}</span>
                  {selectedDescriptor.domain && (
                    <span className="text-[10px] font-normal text-on-surface-variant/70 shrink-0 ml-1">
                      {connectorHost(selectedDescriptor.domain)}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-on-surface-variant/80">
                  {t('latestUpdates.pageOf', { page, total: listingTotalPages })}
                </div>
              </div>
            )}
          </div>
        </StudioLayout.LeftSidebar>

        <StudioLayout.Content>
          <div className="custom-scrollbar flex-1 min-h-0 overflow-auto px-4 py-4 sm:px-6 sm:py-5">
            <div className="w-full min-w-0">
          {fetchError ? (
            <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-100">
              {fetchError}
            </div>
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

          {rows.length > 0 ? (
            viewMode === 'grid' ? (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                {rows.map((row) => {
                  const k = `${row.siteId}::${row.mangaUrl}`;
                  const enqBusy = enqueueKey === k;
                  const openBusy = inlineChapterBusyKey === k;
                  const otherBusy =
                    (enqueueKey !== '' && enqueueKey !== k) ||
                    (inlineChapterBusyKey !== '' && inlineChapterBusyKey !== k);
                  const chapter_actions_enabled = rowChapterActionsEnabled(row);
                  const chapter_actions_disabled_title = chapter_actions_enabled
                    ? undefined
                    : t('latestUpdates.chapterActionsDisabledTitle');
                  const enqueueDisabled = otherBusy || enqBusy || !chapter_actions_enabled;
                  const pickEnabled = typeof onAddQueuedFromLatest === 'function';
                  const chapterListDisabled =
                    otherBusy || enqBusy || openBusy || !pickEnabled || !chapter_actions_enabled;
                  return (
                    <li
                      key={k}
                      className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-outline-variant/20 bg-surface-container-high/35 transition-colors hover:border-outline-variant/40 hover:bg-surface-container-high/55"
                    >
                      <div className="relative aspect-[3/4.2] bg-surface-container-highest">
                        {row.coverUrl ? (
                          <img
                            src={row.coverUrl}
                            alt=""
                            className="absolute inset-0 size-full object-cover"
                            loading="lazy"
                            decoding="async"
                          />
                        ) : null}
                        <span className="pointer-events-none absolute left-2 top-2 z-[1] max-w-[calc(100%-1rem)] truncate rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                          {row.siteLabel}
                        </span>
                        {typeof onToggleFavorite === 'function' ? (
                          <button
                            type="button"
                            aria-pressed={isMangaFavorite(row, row.siteId)}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleFavorite(row, row.siteId);
                            }}
                            className={`absolute right-2 top-2 z-[1] flex h-7 w-7 cursor-pointer items-center justify-center rounded-full shadow-md transition-all ${
                              isMangaFavorite(row, row.siteId)
                                ? 'bg-rose-500/80 text-white ring-1 ring-white/40 backdrop-blur-[2px] hover:bg-rose-500/90'
                                : 'border border-white/25 bg-black/40 text-white/95 shadow-black/10 backdrop-blur-sm hover:bg-black/50'
                            }`}
                            data-tooltip={
                              isMangaFavorite(row, row.siteId)
                                ? t('mangaInfo.favoriteRemove')
                                : t('mangaInfo.favoriteAdd')
                            }
                          >
                            <span
                              className="material-symbols-outlined block text-[15px] leading-none"
                              style={
                                isMangaFavorite(row, row.siteId)
                                  ? { fontVariationSettings: "'FILL' 1, 'wght' 300, 'GRAD' 0, 'opsz' 20" }
                                  : { fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 20" }
                              }
                            >
                              {isMangaFavorite(row, row.siteId) ? 'favorite' : 'favorite_border'}
                            </span>
                          </button>
                        ) : null}
                      </div>
                      <div className="flex min-h-0 flex-1 flex-col gap-1 p-3">
                        <p className="line-clamp-2 text-sm font-semibold leading-snug text-on-surface" data-tooltip={row.title}>
                          {row.title}
                        </p>
                        {row.latestChapterLabel ? (
                          <p className="text-xs text-on-surface-variant">{row.latestChapterLabel}</p>
                        ) : null}
                        <div className="mt-auto flex w-full flex-col gap-2">
                          {pickEnabled ? (
                            <button
                              type="button"
                              disabled={chapterListDisabled}
                              data-tooltip={chapter_actions_disabled_title}
                              onClick={() => handleOpenChapterListButton(row.siteId, row)}
                              className="w-full rounded-lg bg-secondary-container py-2 text-xs font-semibold text-on-secondary-container shadow-sm transition-[opacity,box-shadow] hover:opacity-90 hover:shadow-md disabled:pointer-events-none disabled:opacity-45 sm:text-sm"
                            >
                              {openBusy ? (
                                <span className="inline-flex items-center justify-center gap-1.5">
                                  <span className="material-symbols-outlined animate-spin text-[16px] leading-none">
                                    progress_activity
                                  </span>
                                  {t('latestUpdates.loading')}
                                </span>
                              ) : (
                                t('latestUpdates.openChapterList')
                              )}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            disabled={enqueueDisabled}
                            data-tooltip={chapter_actions_disabled_title}
                            onClick={() => handleEnqueue(row.siteId, row)}
                            className="w-full rounded-lg bg-primary py-2 text-xs font-medium text-on-primary hover:opacity-90 disabled:pointer-events-none disabled:opacity-50 sm:text-sm"
                          >
                            {enqBusy ? t('latestUpdates.enqueueBusy') : t('latestUpdates.addToQueue')}
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <ul className="flex flex-col gap-2 sm:gap-3">
                {rows.map((row) => {
                  const k = `${row.siteId}::${row.mangaUrl}`;
                  const enqBusy = enqueueKey === k;
                  const openBusy = inlineChapterBusyKey === k;
                  const otherBusy =
                    (enqueueKey !== '' && enqueueKey !== k) ||
                    (inlineChapterBusyKey !== '' && inlineChapterBusyKey !== k);
                  const chapter_actions_enabled = rowChapterActionsEnabled(row);
                  const chapter_actions_disabled_title = chapter_actions_enabled
                    ? undefined
                    : t('latestUpdates.chapterActionsDisabledTitle');
                  const enqueueDisabled = otherBusy || enqBusy || !chapter_actions_enabled;
                  const pickEnabled = typeof onAddQueuedFromLatest === 'function';
                  const chapterListDisabled =
                    otherBusy || enqBusy || openBusy || !pickEnabled || !chapter_actions_enabled;
                  return (
                    <li
                      key={k}
                      className="flex flex-col gap-3 rounded-xl border border-outline-variant/20 bg-surface-container-high/35 p-3 sm:flex-row sm:items-center sm:gap-4"
                    >
                      <div className="flex min-w-0 gap-3 sm:flex-1 sm:items-center">
                      <div className="relative shrink-0 overflow-hidden rounded-md bg-surface-container-highest">
                        <div className="size-[4.5rem] shrink-0 sm:size-24">
                          {row.coverUrl ? (
                            <img
                              src={row.coverUrl}
                              alt=""
                              className="size-full object-cover"
                              loading="lazy"
                              decoding="async"
                            />
                          ) : null}
                        </div>
                        {typeof onToggleFavorite === 'function' ? (
                          <button
                            type="button"
                            aria-pressed={isMangaFavorite(row, row.siteId)}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleFavorite(row, row.siteId);
                            }}
                            className={`absolute right-1 top-1 z-[1] flex h-6 w-6 cursor-pointer items-center justify-center rounded-full shadow-md transition-all sm:h-7 sm:w-7 ${
                              isMangaFavorite(row, row.siteId)
                                ? 'bg-rose-500/80 text-white ring-1 ring-white/40 backdrop-blur-[2px] hover:bg-rose-500/90'
                                : 'border border-white/25 bg-black/40 text-white/95 shadow-black/10 backdrop-blur-sm hover:bg-black/50'
                            }`}
                            data-tooltip={
                              isMangaFavorite(row, row.siteId)
                                ? t('mangaInfo.favoriteRemove')
                                : t('mangaInfo.favoriteAdd')
                            }
                          >
                            <span
                              className="material-symbols-outlined block text-[13px] leading-none sm:text-[15px]"
                              style={
                                isMangaFavorite(row, row.siteId)
                                  ? { fontVariationSettings: "'FILL' 1, 'wght' 300, 'GRAD' 0, 'opsz' 20" }
                                  : { fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 20" }
                              }
                            >
                              {isMangaFavorite(row, row.siteId) ? 'favorite' : 'favorite_border'}
                            </span>
                          </button>
                        ) : null}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">
                          {row.siteLabel}
                        </span>
                        <p className="line-clamp-2 text-sm font-semibold text-on-surface sm:text-base" data-tooltip={row.title}>
                          {row.title}
                        </p>
                        {row.latestChapterLabel ? (
                          <p className="text-xs text-on-surface-variant">{row.latestChapterLabel}</p>
                        ) : null}
                      </div>
                      </div>
                      <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:justify-center">
                        {pickEnabled ? (
                          <button
                            type="button"
                            disabled={chapterListDisabled}
                            data-tooltip={chapter_actions_disabled_title}
                            onClick={() => handleOpenChapterListButton(row.siteId, row)}
                            className="h-10 w-full rounded-lg bg-secondary-container px-3 text-sm font-semibold text-on-secondary-container shadow-sm transition-[opacity,box-shadow] hover:opacity-90 hover:shadow-md disabled:pointer-events-none disabled:opacity-45 sm:h-9 sm:min-w-[7.5rem] sm:w-auto"
                          >
                            {openBusy ? (
                              <span className="inline-flex items-center justify-center gap-1.5">
                                <span className="material-symbols-outlined animate-spin text-[17px] leading-none">
                                  progress_activity
                                </span>
                                {t('latestUpdates.loading')}
                              </span>
                            ) : (
                              t('latestUpdates.openChapterList')
                            )}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={enqueueDisabled}
                          data-tooltip={chapter_actions_disabled_title}
                          onClick={() => handleEnqueue(row.siteId, row)}
                          className="h-10 w-full rounded-lg bg-primary px-3 text-sm font-medium text-on-primary hover:opacity-90 disabled:pointer-events-none disabled:opacity-50 sm:h-9 sm:min-w-[7.5rem] sm:w-auto"
                        >
                          {enqBusy ? t('latestUpdates.enqueueBusy') : t('latestUpdates.addToQueue')}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )
          ) : !busyList && !fetchError ? (
            <p className="py-10 text-center text-sm text-on-surface-variant">{t('latestUpdates.hintBelow')}</p>
          ) : null}
        </div>
      </div>
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
