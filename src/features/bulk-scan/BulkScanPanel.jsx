import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../context/I18nContext';
import { EmptyState, FetchErrorState, SearchableSelect, SectionTitle, StudioLayout, useStudioLayout, ViewModeToggle } from '../../shared';
import { ChaptersDrawer } from '../reader';
import { dedupeChaptersByNumber } from '../download';
import ExploreSourceSelect from '../explore/components/ExploreSourceSelect.jsx';
import {
  buildSessionAfterScan,
  filterBulkScanItems,
  loadBulkScanSessionsAsync,
  loadBulkScanSiteId,
  persistBulkScanSiteId,
  saveBulkScanSessionAsync,
} from './bulkScanSessionPrefs.mjs';
import { loadPanelUi, savePanelUi } from '../../utils/panelUiPrefs';

const PAGE_SIZES = [20, 50, 100];
const SCAN_MAX_PAGES_OPTIONS = ['all', 10, 20, 50, 100];
const BULK_DRAWER_CACHE_TTL_MS = 30 * 60 * 1000;
const BULK_DRAWER_CACHE_MAX_ENTRIES = 48;
const BULK_GRID_SKELETON_ITEMS = Array.from({ length: 12 }, (_, idx) => idx);
const BULK_LIST_SKELETON_ITEMS = Array.from({ length: 8 }, (_, idx) => idx);

const BulkScanSkeleton = React.memo(function BulkScanSkeleton({
  viewMode,
  statusText,
  progressPercent = null,
}) {
  return (
    <div
      data-testid="bulk-scan-skeleton"
      aria-busy="true"
      aria-label={statusText}
      className="space-y-4 select-none"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-medium text-on-surface-variant min-w-0">
          <span className="material-symbols-outlined text-[18px] animate-spin text-primary shrink-0 leading-none">
            progress_activity
          </span>
          <span className="truncate">{statusText}</span>
        </div>
        {progressPercent !== null && (
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-32 sm:w-44 h-1.5 rounded-full bg-surface-container-highest overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300 rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-[11px] font-semibold tabular-nums text-on-surface-variant">
              {progressPercent}%
            </span>
          </div>
        )}
      </div>

      {viewMode === 'list' ? (
        <ul className="flex flex-col gap-2">
          {BULK_LIST_SKELETON_ITEMS.map((idx) => (
            <li
              key={idx}
              className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-4 rounded-xl border border-outline-variant/20 bg-surface-container-high/35 animate-pulse"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="size-4 shrink-0 rounded bg-surface-container-highest" />
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
          {BULK_GRID_SKELETON_ITEMS.map((idx) => (
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

function fingerprintMangaLoadOpts(opts) {
  if (!opts || typeof opts !== 'object') return '';
  try {
    return Object.keys(opts)
      .sort()
      .map((k) => `${k}:${JSON.stringify(opts[k])}`)
      .join('\u0002');
  } catch {
    return '';
  }
}

function connectorHost(domain) {
  try {
    return new URL(domain).hostname;
  } catch {
    return domain;
  }
}

function formatScannedWhen(scannedAt) {
  if (!scannedAt) return '';
  try {
    const d = new Date(scannedAt);
    if (Number.isNaN(d.getTime())) return String(scannedAt);
    return d.toLocaleString();
  } catch {
    return String(scannedAt);
  }
}

export default function BulkScanPanel({
  connectors = [],
  onEnqueueLoadedManga = null,
  savePath = '',
  mangaLoadOpts = {},
  subtabsSlot = null,
  queue = [],
  favorites = [],
  onToggleFavorite = null,
  prepareDrawerMangaForRead = null,
  onOpenReaderForDrawerChapter = null,
  onReadChapterOnlineForDrawerChapter = null,
  onAddQueuedFromLatest = null,
  onDownloadMangadexCovers = null,
  viewMode: propViewMode,
  onViewModeChange,
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
        .filter((c) => c && c.supportsBulkScan && c.id)
        .sort((a, b) =>
          String(a.label || a.id).localeCompare(String(b.label || b.id), undefined, {
            sensitivity: 'base',
          }),
        ),
    [connectors],
  );

  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [listFilter, setListFilter] = useState('all');
  const [scannedAt, setScannedAt] = useState('');
  const [persistWarning, setPersistWarning] = useState(false);
  const [busyList, setBusyList] = useState(false);
  const [listProgress, setListProgress] = useState(null);
  const [fetchError, setFetchError] = useState('');
  const [enqueueBusy, setEnqueueBusy] = useState(false);
  const [enqueueProgress, setEnqueueProgress] = useState(null);
  const [internalViewMode, setInternalViewMode] = useState(() => {
    const m = loadPanelUi().bulkScan?.viewMode;
    return m === 'list' ? 'list' : 'grid';
  });
  const viewMode = propViewMode !== undefined ? propViewMode : internalViewMode;

  const handleViewModeChange = useCallback(
    (mode) => {
      const next = mode === 'list' ? 'list' : 'grid';
      if (propViewMode === undefined) {
        setInternalViewMode(next);
      }
      savePanelUi({ bulkScan: { viewMode: next } });
      onViewModeChange?.(next);
    },
    [propViewMode, onViewModeChange]
  );
  const [pageSize, setPageSize] = useState(() => {
    const n = Number(loadPanelUi().bulkScan?.pageSize);
    return PAGE_SIZES.includes(n) ? n : 20;
  });
  const [maxPages, setMaxPages] = useState(() => {
    const raw = loadPanelUi().bulkScan?.maxPages;
    if (raw === 'all') return 'all';
    const n = Number(raw);
    return SCAN_MAX_PAGES_OPTIONS.includes(n) ? n : 'all';
  });
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [cancellingScan, setCancellingScan] = useState(false);
  const cancelRef = useRef(false);
  const scanCancelRef = useRef(false);
  const busyListRef = useRef(false);
  busyListRef.current = busyList;
  const selectedSiteIdRef = useRef('');

  useEffect(() => () => {
    if (busyListRef.current) {
      scanCancelRef.current = true;
      try {
        window.electronAPI?.cancelBulkScan?.({ siteId: selectedSiteIdRef.current });
      } catch {
        /* ignore */
      }
    }
  }, []);
  const contentScrollRef = useRef(null);
  const chapterCacheRef = useRef(new Map());
  /** Absolute index in `visibleItems` — shift+click range select (ChapterList pattern). */
  const lastClickedIndexRef = useRef(null);

  const [chapterDrawerOpen, setChapterDrawerOpen] = useState(false);
  const [drawerManga, setDrawerManga] = useState(null);
  const [drawerChapters, setDrawerChapters] = useState([]);
  const [drawerSelectedUrls, setDrawerSelectedUrls] = useState(() => new Set());
  const [drawerReadChapterAllowedUrls, setDrawerReadChapterAllowedUrls] = useState(null);
  const [inlineBusyKey, setInlineBusyKey] = useState('');
  const [enqueueKey, setEnqueueKey] = useState('');

  const activeConnector = useMemo(
    () => connectors.find((c) => c && c.id === selectedSiteId) || null,
    [connectors, selectedSiteId],
  );

  const mangaLoadOptsFingerprint = useMemo(
    () => fingerprintMangaLoadOpts(mangaLoadOpts),
    [mangaLoadOpts],
  );

  const favoriteLookup = useMemo(() => {
    const ids = new Set();
    const urls = new Set();
    const siteTitles = new Set();
    if (Array.isArray(favorites)) {
      for (const f of favorites) {
        if (!f) continue;
        if (f.id) ids.add(String(f.id).trim());
        if (f.url) urls.add(String(f.url).trim());
        if (f.mangaUrl) urls.add(String(f.mangaUrl).trim());
        if (f.siteId && f.title) {
          siteTitles.add(`${String(f.siteId).trim()}::${String(f.title)}`);
        }
      }
    }
    return { ids, urls, siteTitles };
  }, [favorites]);

  const isMangaFavorite = useCallback(
    (manga) => {
      if (!manga) return false;
      const url = String(manga.mangaUrl || manga.url || '').trim();
      const mid = String(manga.id || manga.mangaId || '').trim();
      const sId = String(manga.siteId || selectedSiteId || '').trim();
      const compositeId = `${sId}::${url}`;
      if (favoriteLookup.ids.has(compositeId) || (mid && favoriteLookup.ids.has(mid))) return true;
      if (url && favoriteLookup.urls.has(url)) return true;
      if (sId && manga.title && favoriteLookup.siteTitles.has(`${sId}::${manga.title}`)) return true;
      return false;
    },
    [favoriteLookup, selectedSiteId],
  );

  const handleToggleFavorite = useCallback(
    (item) => {
      if (typeof onToggleFavorite !== 'function' || !item) return;
      const mid = String(item.id || item.mangaId || `${selectedSiteId}::${item.mangaUrl}`);
      const data = {
        id: mid,
        title: item.title,
        url: item.mangaUrl,
        mangaUrl: item.mangaUrl,
        coverUrl: item.coverUrl,
        siteId: selectedSiteId,
        latestChapterLabel: item.latestChapterLabel,
      };
      onToggleFavorite(data, selectedSiteId);
    },
    [onToggleFavorite, selectedSiteId],
  );

  const drawer_chapters_urls_key = useMemo(
    () => drawerChapters.map((c) => String(c?.url || '')).join('|'),
    [drawerChapters],
  );

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

  const closeChapterDrawer = useCallback(() => {
    setChapterDrawerOpen(false);
    setDrawerManga(null);
    setDrawerChapters([]);
    setDrawerReadChapterAllowedUrls(null);
    setDrawerSelectedUrls(new Set());
  }, []);

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

  const handleDrawerAddToQueue = useCallback(() => {
    if (!drawerManga) return;
    if (typeof onAddQueuedFromLatest === 'function') {
      const result = onAddQueuedFromLatest(drawerManga, drawerChapters, drawerSelectedUrls);
      if (result && result.ok === false) return;
      closeChapterDrawer();
    } else if (typeof onEnqueueLoadedManga === 'function') {
      const chosenChapters = drawerChapters.filter((c) => drawerSelectedUrls.has(c.url));
      onEnqueueLoadedManga({
        ok: true,
        manga: drawerManga,
        chapters: chosenChapters.length ? chosenChapters : drawerChapters,
      });
      closeChapterDrawer();
    }
  }, [drawerManga, drawerChapters, drawerSelectedUrls, onAddQueuedFromLatest, onEnqueueLoadedManga, closeChapterDrawer]);

  const handleOpenChapterList = useCallback(
    async (item) => {
      const api = window.electronAPI;
      if (!api?.loadManga) {
        setFetchError(t('latestUpdates.needElectron') || 'Electron required');
        return;
      }
      const cacheKey = `${selectedSiteId}::${String(item.mangaUrl || '').trim()}::${mangaLoadOptsFingerprint}`;
      const cacheMap = chapterCacheRef.current;
      const cached = cacheMap.get(cacheKey);
      if (
        cached &&
        Date.now() - cached.savedAt <= BULK_DRAWER_CACHE_TTL_MS &&
        cached.manga?.title &&
        Array.isArray(cached.chapters) &&
        cached.chapters.length > 0
      ) {
        cacheMap.delete(cacheKey);
        cacheMap.set(cacheKey, cached);
        setDrawerManga(cached.manga);
        setDrawerChapters(cached.chapters);
        setDrawerSelectedUrls(new Set());
        setFetchError('');
        setChapterDrawerOpen(true);
        return;
      }

      setInlineBusyKey(item.mangaUrl);
      setFetchError('');
      try {
        const res = await api.loadManga(selectedSiteId, item.mangaUrl, mangaLoadOpts || {});
        if (!res?.ok || !res.manga?.title) {
          setFetchError(res?.error || t('latestUpdates.enqueueLoadIncomplete') || 'Load incomplete');
          return;
        }
        const chapterList = Array.isArray(res.chapters) ? res.chapters : [];
        if (!chapterList.length) {
          setFetchError(t('latestUpdates.noChaptersFetched') || 'No chapters fetched');
          return;
        }
        const mangaObj = {
          ...res.manga,
          siteId: selectedSiteId,
        };
        cacheMap.delete(cacheKey);
        cacheMap.set(cacheKey, {
          savedAt: Date.now(),
          manga: mangaObj,
          chapters: chapterList,
        });
        while (cacheMap.size > BULK_DRAWER_CACHE_MAX_ENTRIES) {
          const firstKey = cacheMap.keys().next().value;
          cacheMap.delete(firstKey);
        }
        setDrawerManga(mangaObj);
        setDrawerChapters(chapterList);
        setDrawerSelectedUrls(new Set());
        setChapterDrawerOpen(true);
      } catch (e) {
        setFetchError(String(e?.message || e || t('latestUpdates.fetchFailed')));
      } finally {
        setInlineBusyKey('');
      }
    },
    [selectedSiteId, mangaLoadOpts, mangaLoadOptsFingerprint, t],
  );

  const handleEnqueueSingle = useCallback(
    async (item) => {
      const api = window.electronAPI;
      if (!api?.loadManga || typeof onEnqueueLoadedManga !== 'function') {
        setFetchError(t('bulkScan.needElectron'));
        return;
      }
      if (!String(savePath || '').trim()) {
        setFetchError(t('app.log.needSavePathShort'));
        return;
      }
      setEnqueueKey(item.mangaUrl);
      setFetchError('');
      try {
        const loadResult = await api.loadManga(selectedSiteId, item.mangaUrl, mangaLoadOpts || {});
        const chapterList = Array.isArray(loadResult?.chapters) ? loadResult.chapters : [];
        if (!loadResult?.ok || !chapterList.length) {
          setFetchError(loadResult?.error || t('latestUpdates.noChaptersFetched') || 'No chapters fetched');
          return;
        }
        const ent = await Promise.resolve(onEnqueueLoadedManga(loadResult));
        if (ent && ent.ok === false) {
          setFetchError(ent?.error || t('latestUpdates.enqueueFailed') || 'Enqueue failed');
        }
      } catch (e) {
        setFetchError(String(e?.message || e || t('latestUpdates.enqueueFailed') || 'Enqueue failed'));
      } finally {
        setEnqueueKey('');
      }
    },
    [selectedSiteId, mangaLoadOpts, onEnqueueLoadedManga, savePath, t],
  );

  const hydrateSite = useCallback(async (siteId) => {
    const id = String(siteId || '').trim();
    if (!id) return;
    const all = await loadBulkScanSessionsAsync();
    const session = all[id] || {};
    const list = Array.isArray(session.items) ? session.items : [];
    setItems(list);
    setSelected(new Set(Array.isArray(session.selectedUrls) ? session.selectedUrls : []));
    setScannedAt(session.scannedAt || '');
    setFetchError('');
    setListFilter('all');
  }, []);

  // Pick site when bulk-scan connectors are available. Do NOT clear items when
  // supported is briefly empty (FALLBACK list used to omit supportsBulkScan).
  useEffect(() => {
    const ids = supported.map((c) => c.id);
    if (!ids.length) return;
    setSelectedSiteId((prev) => {
      if (prev && ids.includes(prev)) return prev;
      const next = loadBulkScanSiteId(ids);
      if (next) persistBulkScanSiteId(next);
      return next;
    });
  }, [supported]);

  // Restore per-site session whenever the active site is set (mount / site change).
  useEffect(() => {
    if (!selectedSiteId) return;
    let cancelled = false;
    (async () => {
      await hydrateSite(selectedSiteId);
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedSiteId, hydrateSite]);

  selectedSiteIdRef.current = selectedSiteId;

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.subscribeBulkScanProgress) return undefined;
    const unsub = api.subscribeBulkScanProgress((p) => {
      if (!p || scanCancelRef.current || p.siteId !== selectedSiteIdRef.current) return;
      if (typeof p.page === 'number') setListProgress(p);
    });
    return () => unsub?.();
  }, []);

  const selectOptions = useMemo(
    () =>
      supported.map((c) => ({
        value: c.id,
        label: c.domain
          ? `${c.label || c.id} (${connectorHost(c.domain)})`
          : String(c.label || c.id),
        icon: c.icon,
      })),
    [supported],
  );

  const handleSiteChange = useCallback((nextId) => {
    const id = String(nextId || '').trim();
    if (!id) return;
    persistBulkScanSiteId(id);
    setSelectedSiteId(id);
  }, []);

  const persistSelection = useCallback(
    (nextSelected) => {
      if (!selectedSiteId) return;
      const session = {
        items,
        selectedUrls: [...nextSelected],
        scannedAt: scannedAt || new Date().toISOString(),
      };
      void (async () => {
        // Skip empty in-memory overwrite if file/local already has a list.
        if (!items.length) {
          const existing = (await loadBulkScanSessionsAsync())[selectedSiteId];
          if (Array.isArray(existing?.items) && existing.items.length) return;
        }
        const ok = await saveBulkScanSessionAsync(selectedSiteId, session);
        if (!ok) setPersistWarning(true);
      })();
    },
    [selectedSiteId, items, scannedAt],
  );

  const selectedCount = selected.size;
  const allSelected = items.length > 0 && selectedCount === items.length;
  const someSelected = selectedCount > 0 && !allSelected;

  const visibleItems = useMemo(() => {
    let list = filterBulkScanItems(items, selected, listFilter);
    if (deferredSearchQuery.trim()) {
      const q = deferredSearchQuery.trim().toLowerCase();
      list = list.filter((item) => (item.title || '').toLowerCase().includes(q));
    }
    return list;
  }, [items, selected, listFilter, deferredSearchQuery]);

  const totalPages = Math.max(1, Math.ceil(visibleItems.length / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const sliceStart = (safePage - 1) * pageSize;
  const pageItems = useMemo(
    () => visibleItems.slice(sliceStart, sliceStart + pageSize),
    [visibleItems, sliceStart, pageSize],
  );
  const fromRow = visibleItems.length ? sliceStart + 1 : 0;
  const toRow = Math.min(sliceStart + pageSize, visibleItems.length);

  const [rawPageInput, setRawPageInput] = useState(() => String(safePage));
  useEffect(() => {
    setRawPageInput(String(safePage));
  }, [safePage]);

  const goToPage = useCallback(
    (nextPage) => {
      const clamped = Math.min(totalPages, Math.max(1, nextPage));
      setPage(clamped);
      setRawPageInput(String(clamped));
      contentScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [totalPages],
  );

  const handleResetFilters = useCallback(() => {
    setListFilter('all');
    setSearchQuery('');
    setPage(1);
    setRawPageInput('1');
  }, []);

  const handleDirectPageSubmit = useCallback(
    (e) => {
      e.preventDefault();
      const num = parseInt(rawPageInput, 10);
      if (!Number.isNaN(num) && num >= 1 && num <= totalPages) {
        goToPage(num);
      } else {
        setRawPageInput(String(safePage));
      }
    },
    [rawPageInput, totalPages, safePage, goToPage]
  );

  const controlsBusy = busyList || enqueueBusy;

  useEffect(() => {
    savePanelUi({ bulkScan: { viewMode, pageSize, maxPages } });
  }, [viewMode, pageSize, maxPages]);

  useEffect(() => {
    setPage(1);
    setRawPageInput('1');
  }, [selectedSiteId, listFilter, items, pageSize, searchQuery]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  useEffect(() => {
    lastClickedIndexRef.current = null;
  }, [selectedSiteId, listFilter, items, page]);

  const stopScan = useCallback(() => {
    if (!busyListRef.current || scanCancelRef.current) return;
    scanCancelRef.current = true;
    setCancellingScan(true);
    try {
      void window.electronAPI?.cancelBulkScan?.({ siteId: selectedSiteIdRef.current });
    } catch {
      /* ignore */
    }
  }, []);

  const runLoad = useCallback(async () => {
    const api = window.electronAPI;
    if (!api?.fetchBulkScan) {
      setFetchError(t('bulkScan.needElectron'));
      return;
    }
    if (!selectedSiteId) {
      setFetchError(t('bulkScan.pickSource'));
      return;
    }
    const prevSelectedUrls = [...selected];
    const prevHadItems = items.length > 0;
    scanCancelRef.current = false;
    setCancellingScan(false);
    setBusyList(true);
    setFetchError('');
    setListProgress(null);
    try {
      const res = await api.fetchBulkScan({
        siteId: selectedSiteId,
        maxPages,
        ...(mangaLoadOpts?.mangadexLanguage
          ? { mangadexLanguage: mangaLoadOpts.mangadexLanguage }
          : {}),
        ...(mangaLoadOpts?.comickLanguage
          ? { comickLanguage: mangaLoadOpts.comickLanguage }
          : {}),
        ...(mangaLoadOpts?.mangaballLanguage
          ? { mangaballLanguage: mangaLoadOpts.mangaballLanguage }
          : {}),
        ...(mangaLoadOpts?.minotruyenListingCategory
          ? { minotruyenListingCategory: mangaLoadOpts.minotruyenListingCategory }
          : {}),
      });
      if (res?.aborted || scanCancelRef.current) {
        const partialList = Array.isArray(res?.items) ? res.items : [];
        if (partialList.length > 0) {
          const partialSession = buildSessionAfterScan({ prevSelectedUrls, items: partialList });
          setItems(partialSession.items);
          setSelected(new Set(partialSession.selectedUrls));
          setScannedAt(partialSession.scannedAt);
          const saved = await saveBulkScanSessionAsync(selectedSiteId, partialSession);
          if (!saved) setPersistWarning(true);
        }
        return;
      }
      if (!res?.ok) {
        // Keep previous in-memory session; only surface the error.
        setFetchError(res?.error || t('bulkScan.fetchFailed'));
        return;
      }
      const list = Array.isArray(res.items) ? res.items : [];
      // Empty ok must not wipe a prior non-empty session (memory or disk).
      if (!list.length && prevHadItems) {
        setFetchError(t('bulkScan.empty'));
        return;
      }
      const session = buildSessionAfterScan({ prevSelectedUrls, items: list });
      setItems(session.items);
      setSelected(new Set(session.selectedUrls));
      setScannedAt(session.scannedAt);
      const saved = await saveBulkScanSessionAsync(selectedSiteId, session);
      if (!saved) setPersistWarning(true);
      if (!list.length) {
        setFetchError(t('bulkScan.empty'));
      } else if (res.error) {
        setFetchError(t('bulkScan.partialWarning'));
      }
    } catch (e) {
      if (scanCancelRef.current || e?.name === 'AbortError') {
        return;
      }
      // Same non-destructive policy as !res?.ok — keep items/selected/scannedAt.
      setFetchError(String(e?.message || e || t('bulkScan.fetchFailed')));
    } finally {
      setBusyList(false);
      setCancellingScan(false);
      setListProgress(null);
      scanCancelRef.current = false;
    }
  }, [t, selectedSiteId, selected, items, maxPages, mangaLoadOpts]);

  const checkAll = useCallback(() => {
    const next = new Set(items.map((i) => i.mangaUrl));
    setSelected(next);
    persistSelection(next);
  }, [items, persistSelection]);

  const uncheckAll = useCallback(() => {
    const next = new Set();
    setSelected(next);
    persistSelection(next);
  }, [persistSelection]);

  const toggleSelectAll = useCallback(() => {
    if (allSelected) uncheckAll();
    else checkAll();
  }, [allSelected, checkAll, uncheckAll]);

  const applyRowSelection = useCallback(
    (e, item, pageIndex) => {
      if (controlsBusy) return;
      const absIndex = sliceStart + pageIndex;
      if (e.shiftKey && lastClickedIndexRef.current !== null) {
        const from = Math.min(lastClickedIndexRef.current, absIndex);
        const to = Math.max(lastClickedIndexRef.current, absIndex);
        const urls = visibleItems.slice(from, to + 1).map((row) => row.mangaUrl);
        const next = new Set(urls);
        setSelected(next);
        persistSelection(next);
      } else {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(item.mangaUrl)) next.delete(item.mangaUrl);
          else next.add(item.mangaUrl);
          persistSelection(next);
          return next;
        });
      }
      lastClickedIndexRef.current = absIndex;
    },
    [controlsBusy, visibleItems, persistSelection, sliceStart],
  );

  const stopEnqueue = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const runEnqueue = useCallback(async () => {
    const api = window.electronAPI;
    if (!api?.loadManga || typeof onEnqueueLoadedManga !== 'function') {
      setFetchError(t('bulkScan.needElectron'));
      return;
    }
    if (!selectedSiteId) {
      setFetchError(t('bulkScan.pickSource'));
      return;
    }
    if (!String(savePath || '').trim()) {
      setFetchError(t('app.log.needSavePathShort'));
      return;
    }
    const chosen = items.filter((i) => selected.has(i.mangaUrl));
    if (!chosen.length) {
      setFetchError(t('bulkScan.needSelection'));
      return;
    }

    cancelRef.current = false;
    setEnqueueBusy(true);
    setFetchError('');
    try {
      for (let i = 0; i < chosen.length; i += 1) {
        if (cancelRef.current) break;
        const row = chosen[i];
        setEnqueueProgress({
          current: i + 1,
          total: chosen.length,
          title: row.title || row.mangaUrl,
        });
        try {
          const loadResult = await api.loadManga(selectedSiteId, row.mangaUrl, mangaLoadOpts || {});
          if (cancelRef.current) break;
          await Promise.resolve(onEnqueueLoadedManga(loadResult));
        } catch (e) {
          console.warn('[bulkScan] enqueue item failed', e);
        }
      }
    } finally {
      setEnqueueBusy(false);
      setEnqueueProgress(null);
      cancelRef.current = false;
    }
  }, [items, selected, onEnqueueLoadedManga, savePath, selectedSiteId, mangaLoadOpts, t]);

  const listStatus = useMemo(() => {
    if (busyList && cancellingScan) return t('bulkScan.stopping');
    if (busyList && listProgress) {
      if (typeof listProgress.itemsCount === 'number' && listProgress.itemsCount > 0) {
        return t('bulkScan.loadingPageWithCount', {
          page: listProgress.page,
          total: listProgress.totalPages,
          count: listProgress.itemsCount,
        });
      }
      return t('bulkScan.loadingPage', {
        page: listProgress.page,
        total: listProgress.totalPages,
      });
    }
    if (busyList) return t('bulkScan.loading');
    if (enqueueBusy && enqueueProgress) {
      return t('bulkScan.enqueueProgress', enqueueProgress);
    }
    return '';
  }, [busyList, cancellingScan, listProgress, enqueueBusy, enqueueProgress, t]);

  const cookieHint =
    selectedSiteId === 'comicvn'
      ? t('bulkScan.cookieHintComicvn')
      : activeConnector?.requiresCookie
        ? t('bulkScan.cookieHintGeneric', { site: activeConnector.label || selectedSiteId })
        : null;

  const restoredHint =
    scannedAt && items.length && !busyList
      ? t('bulkScan.restoredHint', { when: formatScannedWhen(scannedAt) })
      : '';

  const pageSizeOptions = useMemo(
    () => PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) })),
    [],
  );

  const maxPagesOptions = useMemo(
    () =>
      SCAN_MAX_PAGES_OPTIONS.map((opt) =>
        opt === 'all'
          ? {
              value: 'all',
              label: t('bulkScan.maxPagesAll'),
              materialIcon: 'all_inclusive',
            }
          : {
              value: String(opt),
              label: t('bulkScan.maxPagesOption', { count: opt }),
              materialIcon: 'layers',
            },
      ),
    [t],
  );

  const masterIcon = allSelected
    ? 'check_box'
    : someSelected
      ? 'indeterminate_check_box'
      : 'check_box_outline_blank';

  const activeProgressPercent = useMemo(() => {
    if (busyList && listProgress && listProgress.totalPages > 0) {
      return Math.min(100, Math.round(((listProgress.page || 0) / listProgress.totalPages) * 100));
    }
    if (enqueueBusy && enqueueProgress && enqueueProgress.total > 0) {
      return Math.min(100, Math.round(((enqueueProgress.current || 0) / enqueueProgress.total) * 100));
    }
    return null;
  }, [busyList, listProgress, enqueueBusy, enqueueProgress]);

  return (
    <StudioLayout className="w-full h-full">
      <StudioLayout.Toolbar
        showLeftSidebar={showLeftSidebar}
        onToggleLeftSidebar={toggleLeftSidebar}
        leftSidebarTooltip={showLeftSidebar ? t('sidebar.hidePanel') : t('sidebar.showPanel')}
        leftSlot={
          <div className="flex items-center gap-2 min-w-0 overflow-x-auto no-scrollbar">
            {subtabsSlot}
            <div
              data-testid="explore-primary-action-slot"
              className={`flex items-center gap-2 shrink-0 empty:hidden ${
                subtabsSlot ? 'pl-2.5 border-l border-outline-variant/25 ml-1' : ''
              }`}
            >
              {busyList ? (
                <button
                  type="button"
                  className="h-8 px-3.5 rounded-lg text-xs font-semibold bg-error/15 text-error hover:bg-error/25 border border-error/30 inline-flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0"
                  disabled={cancellingScan}
                  onClick={stopScan}
                  data-tooltip={cancellingScan ? t('bulkScan.stopping') : t('bulkScan.stopScan')}
                  aria-label={cancellingScan ? t('bulkScan.stopping') : t('bulkScan.stopScan')}
                >
                  <span className="material-symbols-outlined text-[15px] leading-none">stop_circle</span>
                  <span>{cancellingScan ? t('bulkScan.stopping') : t('bulkScan.stopScan')}</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="h-8 px-3.5 rounded-lg text-xs font-semibold bg-primary text-on-primary hover:opacity-95 shadow-2xs inline-flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none cursor-pointer shrink-0"
                  disabled={controlsBusy || !selectedSiteId}
                  onClick={() => void runLoad()}
                  data-tooltip={items.length > 0 ? t('bulkScan.rescanSource') : t('bulkScan.scanSource')}
                  aria-label={items.length > 0 ? t('bulkScan.rescanSource') : t('bulkScan.scanSource')}
                >
                  <span className="material-symbols-outlined text-[15px] leading-none">sync</span>
                  <span>{items.length > 0 ? t('bulkScan.rescanSource') : t('bulkScan.scanSource')}</span>
                </button>
              )}

              {items.length > 0 ? (
                <button
                  type="button"
                  className="h-8 px-3 rounded-lg text-xs font-semibold bg-emerald-600 dark:bg-emerald-500 text-white hover:opacity-95 shadow-2xs inline-flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
                  disabled={!selectedCount || controlsBusy || !selectedSiteId}
                  onClick={() => void runEnqueue()}
                  data-tooltip={
                    enqueueBusy
                      ? t('bulkScan.enqueueBusy')
                      : selectedCount > 0
                        ? t('bulkScan.enqueueSelectedCount', { count: selectedCount })
                        : t('bulkScan.enqueueSelected')
                  }
                  aria-label={
                    enqueueBusy
                      ? t('bulkScan.enqueueBusy')
                      : selectedCount > 0
                        ? t('bulkScan.enqueueSelectedCount', { count: selectedCount })
                        : t('bulkScan.enqueueSelected')
                  }
                >
                  <span className="material-symbols-outlined text-[15px] leading-none">playlist_add</span>
                  <span>
                    {enqueueBusy
                      ? t('bulkScan.enqueueBusy')
                      : selectedCount > 0
                        ? t('bulkScan.enqueueSelectedCount', { count: selectedCount })
                        : t('bulkScan.enqueueSelected')}
                  </span>
                </button>
              ) : null}

              {enqueueBusy ? (
                <button
                  type="button"
                  className="h-8 px-3 rounded-lg text-xs font-semibold bg-error/15 text-error hover:bg-error/25 border border-error/30 inline-flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
                  onClick={stopEnqueue}
                  data-tooltip={t('bulkScan.stop')}
                  aria-label={t('bulkScan.stop')}
                >
                  <span className="material-symbols-outlined text-[15px] leading-none">cancel</span>
                  <span>{t('bulkScan.stop')}</span>
                </button>
              ) : null}
            </div>
          </div>
        }
        rightSlot={
          <div className="flex items-center gap-2">
            <ViewModeToggle
              viewMode={viewMode}
              onChange={handleViewModeChange}
              size="md"
              disabled={controlsBusy || items.length === 0}
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
          <div className="p-3.5 space-y-4 flex flex-col flex-1 min-h-0">
            {/* 1. Nguồn (Source Picker) */}
            <ExploreSourceSelect
              mode="picker"
              options={selectOptions}
              value={selectedSiteId}
              onChange={handleSiteChange}
              disabled={controlsBusy}
            />

            {/* 1b. Độ sâu quét (Scan Depth) */}
            <div>
              <SectionTitle className="mb-1.5 px-0.5">
                {t('bulkScan.maxPagesLabel')}
              </SectionTitle>
              <SearchableSelect
                options={maxPagesOptions}
                value={String(maxPages)}
                onChange={(val) => {
                  if (val === 'all') {
                    setMaxPages('all');
                    return;
                  }
                  const n = Number(val);
                  if (SCAN_MAX_PAGES_OPTIONS.includes(n)) setMaxPages(n);
                }}
                disabled={controlsBusy}
                ariaLabel={t('bulkScan.maxPagesLabel')}
                className="w-full"
              />
            </div>

            {cookieHint ? (
              <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
                <span className="material-symbols-outlined text-[16px] shrink-0 mt-0.5">vpn_key</span>
                <span className="leading-snug">{cookieHint}</span>
              </div>
            ) : null}

            {/* 2. Trạng thái (Mẫu 2: Vertical 3-row list — zero truncation, tabular counts) */}
            {items.length > 0 && (
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5 px-0.5">
                  <SectionTitle as="span">
                    {t('bulkScan.statusFilter')}
                  </SectionTitle>
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    disabled={controlsBusy}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold text-primary hover:bg-primary/10 transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
                  >
                    <span className="material-symbols-outlined text-[14px] leading-none">{masterIcon}</span>
                    <span>{allSelected ? t('bulkScan.uncheckAll') : t('bulkScan.checkAll')}</span>
                  </button>
                </div>
                <div
                  role="group"
                  aria-label={t('bulkScan.statusFilter')}
                  className="rounded-xl border border-outline-variant/20 bg-surface-container-highest/60 p-1 space-y-0.5 text-xs"
                >
                  {[
                    {
                      id: 'all',
                      label: t('bulkScan.filterAll'),
                      count: items.length,
                      dotClass: 'bg-primary',
                    },
                    {
                      id: 'selected',
                      label: t('bulkScan.filterSelected'),
                      count: selectedCount,
                      dotClass: selectedCount > 0 ? 'bg-emerald-500' : 'bg-emerald-500/40',
                    },
                    {
                      id: 'unselected',
                      label: t('bulkScan.filterUnselected'),
                      count: items.length - selectedCount,
                      dotClass: 'bg-on-surface-variant/45',
                    },
                  ].map((opt) => {
                    const isActive = listFilter === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => {
                          setListFilter(opt.id);
                          setPage(1);
                          setRawPageInput('1');
                          contentScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className={`w-full h-8 px-2.5 rounded-lg flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-primary/15 text-primary font-semibold'
                            : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high font-medium'
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${opt.dotClass}`} />
                          <span className="truncate">{opt.label}</span>
                        </span>
                        <span className="font-bold tabular-nums shrink-0">{opt.count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 3. Tìm kiếm (Search Box with Clear button) */}
            {items.length > 0 && (
              <div>
                <SectionTitle className="mb-1.5 px-0.5">
                  {t('common.search')}
                </SectionTitle>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('bulkScan.filterPlaceholder')}
                    aria-label={t('bulkScan.filterPlaceholder')}
                    className="h-10 w-full rounded-xl border border-outline-variant/25 bg-surface-container-highest px-3.5 pr-8 text-xs sm:text-sm text-on-surface placeholder:text-on-surface-variant/50 outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/30"
                    autoComplete="off"
                  />
                  {searchQuery ? (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      data-tooltip={t('bulkScan.searchClear')}
                      aria-label={t('bulkScan.searchClear')}
                      className="absolute right-2.5 text-on-surface-variant/60 hover:text-on-surface cursor-pointer p-0.5 rounded"
                    >
                      <span className="material-symbols-outlined text-[16px] leading-none">close</span>
                    </button>
                  ) : null}
                </div>
              </div>
            )}

            {/* Alerts & Warnings */}
            {persistWarning ? (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-100 flex items-start gap-2">
                <span className="material-symbols-outlined text-[16px] shrink-0 mt-0.5">warning</span>
                <span className="leading-snug">{t('bulkScan.persistWarning')}</span>
              </div>
            ) : null}

            {items.length > 0 && fetchError ? (
              <div className="rounded-xl border border-error/40 bg-error/10 p-2.5 text-xs text-error flex items-start gap-2">
                <span className="material-symbols-outlined text-[16px] shrink-0 mt-0.5">error</span>
                <span className="leading-snug">{fetchError}</span>
              </div>
            ) : null}

            {/* Thẻ thống kê tổng quan (Stats Card) matching FollowedMangaPanel style */}
            {items.length > 0 && (
              <div className="mt-auto pt-2">
                <div className="rounded-xl border border-primary/15 bg-primary/5 p-2.5">
                  <div className="text-[10px] font-bold text-primary mb-2 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[13px]">bar_chart</span>
                    <span>{t('bulkScan.stats.overviewTitle')}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                    <span className="text-on-surface-variant">{t('bulkScan.stats.total')}</span>
                    <span className="font-bold text-on-surface text-right tabular-nums">{items.length}</span>
                    <span className="text-on-surface-variant">{t('bulkScan.stats.selected')}</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 text-right tabular-nums">{selectedCount}</span>
                    {items.length - selectedCount > 0 && (
                      <>
                        <span className="text-on-surface-variant">{t('bulkScan.stats.unselected')}</span>
                        <span className="font-bold text-on-surface-variant/80 text-right tabular-nums">{items.length - selectedCount}</span>
                      </>
                    )}
                  </div>

                  {(scannedAt || t('bulkScan.shiftTip')) && (
                    <div className="mt-2.5 pt-2 border-t border-primary/10 space-y-1.5 text-[10px] text-on-surface-variant/75 leading-relaxed">
                      {(restoredHint || listStatus) && (
                        <div className="flex items-start gap-1.5">
                          <span className="w-4 h-4 flex items-center justify-center shrink-0 text-primary/70">
                            <span className="material-symbols-outlined text-[13px] leading-none">schedule</span>
                          </span>
                          <span className="flex-1 min-w-0 leading-snug pt-0.5">{restoredHint || listStatus}</span>
                        </div>
                      )}
                      <div className="flex items-start gap-1.5">
                        <span className="w-4 h-4 flex items-center justify-center shrink-0 text-primary/70">
                          <span className="material-symbols-outlined text-[13px] leading-none">touch_app</span>
                        </span>
                        <span className="flex-1 min-w-0 leading-snug pt-0.5">{t('bulkScan.shiftTip')}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </StudioLayout.LeftSidebar>

        <StudioLayout.Content>
          {!busyList && enqueueBusy && items.length > 0 && (
            <div
              role="status"
              className="px-4 py-1.5 bg-primary/10 border-b border-primary/20 flex items-center justify-between gap-3 text-xs shrink-0"
            >
              <div className="flex items-center gap-2 text-primary font-medium min-w-0">
                <span className="material-symbols-outlined text-[16px] animate-spin shrink-0 leading-none">
                  playlist_add
                </span>
                <span className="truncate">
                  {listStatus || t('bulkScan.enqueueBusy')}
                </span>
              </div>
              {activeProgressPercent !== null && (
                <div className="flex items-center gap-2 shrink-0">
                  <div className="w-36 sm:w-48 h-1.5 rounded-full bg-surface-container-highest overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300 rounded-full"
                      style={{ width: `${activeProgressPercent}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-semibold tabular-nums text-primary">
                    {activeProgressPercent}%
                  </span>
                </div>
              )}
            </div>
          )}

          {busyList ? (
            <div className="custom-scrollbar flex-1 min-h-0 overflow-auto p-4 sm:p-6">
              <BulkScanSkeleton
                viewMode={viewMode}
                statusText={listStatus || t('bulkScan.loading')}
                progressPercent={activeProgressPercent}
              />
            </div>
          ) : items.length === 0 && fetchError ? (
            <div className="custom-scrollbar flex-1 min-h-0 overflow-auto p-4 sm:p-6 flex">
              <FetchErrorState
                message={fetchError}
                sourceLabel={activeConnector?.label || selectedSiteId || ''}
                requiresVpn={Boolean(activeConnector?.requiresVpn)}
                suggestsVpn={Boolean(activeConnector?.suggestsVpn)}
                onRetry={() => void runLoad()}
              />
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon="document_scanner"
              {...{ title: t('bulkScan.emptyTitle') }}
              description={t('bulkScan.emptySubtitle')}
            />
          ) : visibleItems.length === 0 ? (
            <EmptyState
              icon="search_off"
              {...{ title: t('bulkScan.emptyFilteredTitle') }}
              description={t('bulkScan.emptyFilteredHint')}
              action={
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold border border-outline-variant/25 bg-surface-container-high text-on-surface hover:bg-surface-bright transition-all active:scale-95 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[15px]">filter_alt_off</span>
                  <span>{t('bulkScan.resetFilters')}</span>
                </button>
              }
            />
          ) : (
            <div className="flex h-full w-full flex-col min-h-0 overflow-hidden">
              <div ref={contentScrollRef} className="custom-scrollbar flex-1 min-h-0 overflow-auto p-4 sm:p-6">
                {viewMode === 'grid' ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                    {pageItems.map((item, index) => {
                      const checked = selected.has(item.mangaUrl);
                      const isFavorite = isMangaFavorite(item);
                      const openBusy = inlineBusyKey === item.mangaUrl;
                      const enqBusy = enqueueKey === item.mangaUrl;
                      const inlineBusy = Boolean(inlineBusyKey || enqueueKey);
                      return (
                        <div
                          key={item.mangaUrl}
                          data-testid="bulk-scan-card"
                          role="button"
                          tabIndex={0}
                          className={`group relative flex cursor-pointer select-none flex-col overflow-hidden rounded-xl border transition-all ${
                            checked
                              ? 'border-primary/50 bg-primary/5 ring-2 ring-primary/25 shadow-xs'
                              : 'border-outline-variant/20 bg-surface-container-high/35 hover:border-outline-variant/40 hover:bg-surface-container-high/55 hover:shadow-md'
                          } ${controlsBusy ? 'pointer-events-none opacity-60' : ''}`}
                          onClick={(e) => applyRowSelection(e, item, index)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              applyRowSelection(e, item, index);
                            }
                          }}
                        >
                          {/* Standard Aspect Ratio Cover [3/4.2] */}
                          <div className="relative aspect-[3/4.2] bg-surface-container-highest flex items-center justify-center overflow-hidden">
                            <div className="flex flex-col items-center justify-center gap-1 text-on-surface-variant/40 p-2 text-center pointer-events-none select-none">
                              <span className="material-symbols-outlined text-[32px] leading-none">menu_book</span>
                              <span className="text-[10px] font-medium leading-tight line-clamp-1">{t('latestUpdates.noCover')}</span>
                            </div>
                            {item.coverUrl ? (
                              <img
                                src={item.coverUrl}
                                alt=""
                                className="pointer-events-none absolute inset-0 size-full object-cover group-hover:scale-105 transition-transform duration-300"
                                loading="lazy"
                                decoding="async"
                                referrerPolicy="no-referrer"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                            ) : null}

                            {/* Top-Left: Modern Checkbox + Source Badge */}
                            <div
                              className="absolute left-2 top-2 z-[2] flex items-center gap-1.5 max-w-[calc(100%-3rem)]"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                data-testid="bulk-scan-checkbox"
                                className="sr-only"
                                checked={checked}
                                disabled={controlsBusy}
                                onChange={(e) => applyRowSelection(e, item, index)}
                              />
                              <button
                                type="button"
                                data-testid="bulk-scan-card-checkbox"
                                onClick={(e) => applyRowSelection(e, item, index)}
                                disabled={controlsBusy}
                                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-all cursor-pointer shadow-md backdrop-blur-sm ${
                                  checked
                                    ? 'border-primary bg-primary text-on-primary ring-1 ring-white/30'
                                    : 'border-white/30 bg-black/50 text-white/90 hover:bg-black/70 hover:text-white'
                                }`}
                                aria-label={checked ? t('bulkScan.unselectItem') : t('bulkScan.selectItem')}
                                data-tooltip={checked ? t('bulkScan.unselectItem') : t('bulkScan.selectItem')}
                              >
                                <span className="material-symbols-outlined text-[16px] leading-none font-bold">
                                  {checked ? 'check' : ''}
                                </span>
                              </button>
                              <span className="pointer-events-none truncate rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white flex items-center gap-1 backdrop-blur-sm shadow-md">
                                {activeConnector?.icon ? (
                                  <img src={activeConnector.icon} alt="" className="w-3 h-3 rounded shrink-0" />
                                ) : null}
                                <span className="truncate">{activeConnector?.label || selectedSiteId}</span>
                              </span>
                            </div>

                            {/* Top-Right: Bookmark Heart */}
                            {typeof onToggleFavorite === 'function' ? (
                              <button
                                type="button"
                                aria-pressed={isFavorite}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleFavorite(item);
                                }}
                                className={`absolute right-2 top-2 z-[2] flex h-7 w-7 cursor-pointer items-center justify-center rounded-full shadow-md transition-all ${
                                  isFavorite
                                    ? 'bg-rose-500/80 text-white ring-1 ring-white/40 backdrop-blur-[2px] hover:bg-rose-500/90'
                                    : 'border border-white/25 bg-black/40 text-white/95 shadow-black/10 backdrop-blur-sm hover:bg-black/50'
                                }`}
                                data-tooltip={
                                  isFavorite
                                    ? t('mangaInfo.favoriteRemove')
                                    : t('mangaInfo.favoriteAdd')
                                }
                                aria-label={
                                  isFavorite
                                    ? t('mangaInfo.favoriteRemove')
                                    : t('mangaInfo.favoriteAdd')
                                }
                              >
                                <span
                                  className="material-symbols-outlined block text-[15px] leading-none"
                                  style={
                                    isFavorite
                                      ? { fontVariationSettings: "'FILL' 1, 'wght' 300, 'GRAD' 0, 'opsz' 20" }
                                      : { fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 20" }
                                  }
                                >
                                  {isFavorite ? 'favorite' : 'favorite_border'}
                                </span>
                              </button>
                            ) : null}
                          </div>

                          {/* Card Body */}
                          <div className="flex min-h-0 flex-1 flex-col gap-1 p-3">
                            <p
                              className="line-clamp-2 text-sm font-semibold leading-snug text-on-surface group-hover:text-primary transition-colors cursor-pointer"
                              data-tooltip={item.title}
                            >
                              {item.title}
                            </p>
                            {item.latestChapterLabel ? (
                              <p className="text-xs text-on-surface-variant truncate">
                                {item.latestChapterLabel}
                              </p>
                            ) : null}

                            <div
                              className="mt-auto flex w-full items-center gap-1.5 pt-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                disabled={openBusy || inlineBusy}
                                onClick={() => handleOpenChapterList(item)}
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
                                    <span className="truncate whitespace-nowrap">
                                      {t('latestUpdates.openChapterList')}
                                    </span>
                                  </>
                                )}
                              </button>
                              <button
                                type="button"
                                disabled={enqBusy || inlineBusy}
                                data-tooltip={t('latestUpdates.addToQueue')}
                                aria-label={t('latestUpdates.addToQueue')}
                                onClick={() => handleEnqueueSingle(item)}
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
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {pageItems.map((item, index) => {
                      const checked = selected.has(item.mangaUrl);
                      const isFavorite = isMangaFavorite(item);
                      const openBusy = inlineBusyKey === item.mangaUrl;
                      const enqBusy = enqueueKey === item.mangaUrl;
                      const inlineBusy = Boolean(inlineBusyKey || enqueueKey);
                      const host = item.mangaUrl ? connectorHost(item.mangaUrl) : '';
                      return (
                        <li
                          key={item.mangaUrl}
                          className={`group flex cursor-pointer select-none items-center justify-between gap-3 px-3 py-2.5 sm:px-4 rounded-xl border transition-all ${
                            checked
                              ? 'border-primary/40 bg-primary/8 ring-1 ring-primary/20 shadow-xs'
                              : 'border-outline-variant/20 bg-surface-container-high/35 hover:border-outline-variant/40 hover:bg-surface-container-high/55'
                          } ${controlsBusy ? 'pointer-events-none opacity-60' : ''}`}
                          onClick={(e) => applyRowSelection(e, item, index)}
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <input
                              type="checkbox"
                              className="size-4 shrink-0 accent-primary cursor-pointer"
                              checked={checked}
                              disabled={controlsBusy}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                e.stopPropagation();
                                applyRowSelection(e, item, index);
                              }}
                            />
                            <div className="relative h-14 w-10 sm:h-16 sm:w-11 shrink-0 overflow-hidden rounded-lg bg-surface-container-highest border border-outline-variant/15 flex items-center justify-center shadow-xs">
                              <span className="material-symbols-outlined text-[20px] text-on-surface-variant/40 leading-none select-none">
                                menu_book
                              </span>
                              {item.coverUrl ? (
                                <img
                                  src={item.coverUrl}
                                  alt=""
                                  className="pointer-events-none absolute inset-0 size-full object-cover"
                                  loading="lazy"
                                  decoding="async"
                                  referrerPolicy="no-referrer"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                  }}
                                />
                              ) : null}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-0.5">
                                <h4
                                  className="truncate text-sm font-semibold text-on-surface group-hover:text-primary transition-colors"
                                  data-tooltip={item.title}
                                >
                                  {item.title}
                                </h4>
                                {activeConnector?.label || host ? (
                                  <span className="text-[10px] font-semibold uppercase tracking-wide text-primary bg-primary/10 px-2 py-0.5 rounded shrink-0">
                                    {activeConnector?.label || host}
                                  </span>
                                ) : null}
                              </div>
                              {item.latestChapterLabel ? (
                                <p className="text-xs text-on-surface-variant truncate">
                                  {item.latestChapterLabel}
                                </p>
                              ) : host ? (
                                <span className="truncate text-on-surface-variant/60 font-mono text-[11px]">
                                  {host}
                                </span>
                              ) : null}
                            </div>
                          </div>

                          {/* Action buttons matching unified list standard */}
                          <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              disabled={openBusy || inlineBusy}
                              onClick={() => handleOpenChapterList(item)}
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
                              disabled={enqBusy || inlineBusy}
                              data-tooltip={t('latestUpdates.addToQueue')}
                              aria-label={t('latestUpdates.addToQueue')}
                              onClick={() => handleEnqueueSingle(item)}
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
                                aria-pressed={isFavorite}
                                onClick={() => handleToggleFavorite(item)}
                                className={`h-8 w-8 shrink-0 rounded-lg border transition-all flex items-center justify-center cursor-pointer shadow-2xs ${
                                  isFavorite
                                    ? 'border-rose-500/30 bg-rose-500/15 text-rose-500 hover:bg-rose-500/25'
                                    : 'border-outline-variant/20 bg-surface-container-highest hover:bg-surface-bright text-on-surface-variant hover:text-rose-500'
                                }`}
                                data-tooltip={
                                  isFavorite
                                    ? t('mangaInfo.favoriteRemove')
                                    : t('mangaInfo.favoriteAdd')
                                }
                                aria-label={
                                  isFavorite
                                    ? t('mangaInfo.favoriteRemove')
                                    : t('mangaInfo.favoriteAdd')
                                }
                              >
                                <span
                                  className="material-symbols-outlined block text-[15px] leading-none"
                                  style={
                                    isFavorite
                                      ? { fontVariationSettings: "'FILL' 1, 'wght' 300, 'GRAD' 0, 'opsz' 20" }
                                      : { fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 20" }
                                  }
                                >
                                  {isFavorite ? 'favorite' : 'favorite_border'}
                                </span>
                              </button>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Bottom In-Memory Pagination Bar */}
              <div
                className="shrink-0 border-t border-outline-variant/20 bg-surface-container-low/80 backdrop-blur-md px-4 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 select-none"
                role="region"
                aria-label={t('bulkScan.paginationAria')}
              >
                {/* Left: Summary & page badge */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary tabular-nums shadow-2xs">
                    <span className="material-symbols-outlined text-[15px]">document_scanner</span>
                    <span>
                      {t('bulkScan.pageStatus', {
                        page: safePage,
                        total: totalPages,
                        count: visibleItems.length,
                      })}
                      {selectedCount > 0 ? ` • ${selectedCount} ${t('bulkScan.selectedUnit') || 'đã chọn'}` : ''}
                    </span>
                  </span>
                </div>

                {/* Right: Page Navigation Controls & PageSize Selector */}
                <div className="flex items-center gap-2 text-xs text-on-surface-variant sm:ml-auto flex-wrap">
                  <SearchableSelect
                    value={String(pageSize)}
                    onChange={(v) => {
                      setPageSize(Number(v));
                      setPage(1);
                    }}
                    options={pageSizeOptions}
                    placeholder=""
                    size="sm"
                    className="w-[4.5rem]"
                    disabled={controlsBusy}
                    data-tooltip={t('bulkScan.pageSize')}
                    aria-label={t('bulkScan.pageSize')}
                  />

                  {totalPages > 1 && (
                    <div className="flex items-center gap-1">
                      {/* First page button */}
                      <button
                        type="button"
                        onClick={() => goToPage(1)}
                        disabled={safePage <= 1 || controlsBusy}
                        data-tooltip={t('latestUpdates.firstPage')}
                        aria-label={t('latestUpdates.firstPage')}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-outline-variant/30 bg-surface-container-high text-on-surface-variant hover:bg-surface-bright hover:text-on-surface hover:border-outline-variant/60 active:scale-95 disabled:pointer-events-none disabled:opacity-40 transition-all cursor-pointer shadow-2xs"
                      >
                        <span className="material-symbols-outlined text-[17px] leading-none">first_page</span>
                      </button>

                      {/* Prev page button */}
                      <button
                        type="button"
                        onClick={() => goToPage(safePage - 1)}
                        disabled={safePage <= 1 || controlsBusy}
                        aria-label={t('latestUpdates.prevPage')}
                        className="inline-flex h-8 px-2.5 shrink-0 items-center gap-1 rounded-xl border border-outline-variant/30 bg-surface-container-high text-on-surface-variant hover:bg-surface-bright hover:text-on-surface hover:border-outline-variant/60 active:scale-95 disabled:pointer-events-none disabled:opacity-40 transition-all cursor-pointer shadow-2xs font-medium"
                      >
                        <span className="material-symbols-outlined text-[16px] leading-none">chevron_left</span>
                        <span className="max-sm:hidden">{t('latestUpdates.prevPage')}</span>
                      </button>

                      {/* Jump to page form */}
                      <form onSubmit={handleDirectPageSubmit} className="flex min-w-0 items-center gap-1.5 px-1">
                        <input
                          type="number"
                          min={1}
                          max={totalPages}
                          inputMode="numeric"
                          value={rawPageInput}
                          onChange={(e) => setRawPageInput(e.target.value)}
                          onBlur={() => setRawPageInput(String(safePage))}
                          disabled={controlsBusy}
                          className="h-8 w-12 shrink-0 rounded-xl border border-outline-variant/30 bg-surface-container-highest px-1.5 text-center text-xs font-semibold font-mono text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all disabled:opacity-40 shadow-inner"
                          aria-label={t('latestUpdates.pageInputAria', { total: totalPages })}
                        />
                        <span className="text-on-surface-variant/70 font-medium">/</span>
                        <span className="tabular-nums font-semibold text-on-surface-variant min-w-[1.5rem] text-center">
                          {totalPages}
                        </span>
                      </form>

                      {/* Next page button */}
                      <button
                        type="button"
                        onClick={() => goToPage(safePage + 1)}
                        disabled={safePage >= totalPages || controlsBusy}
                        aria-label={t('latestUpdates.nextPage')}
                        className="inline-flex h-8 px-2.5 shrink-0 items-center gap-1 rounded-xl border border-outline-variant/30 bg-surface-container-high text-on-surface-variant hover:bg-surface-bright hover:text-on-surface hover:border-outline-variant/60 active:scale-95 disabled:pointer-events-none disabled:opacity-40 transition-all cursor-pointer shadow-2xs font-medium"
                      >
                        <span className="max-sm:hidden">{t('latestUpdates.nextPage')}</span>
                        <span className="material-symbols-outlined text-[16px] leading-none">chevron_right</span>
                      </button>

                      {/* Last page button */}
                      <button
                        type="button"
                        onClick={() => goToPage(totalPages)}
                        disabled={safePage >= totalPages || controlsBusy}
                        data-tooltip={t('latestUpdates.lastPage')}
                        aria-label={t('latestUpdates.lastPage')}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-outline-variant/30 bg-surface-container-high text-on-surface-variant hover:bg-surface-bright hover:text-on-surface hover:border-outline-variant/60 active:scale-95 disabled:pointer-events-none disabled:opacity-40 transition-all cursor-pointer shadow-2xs"
                      >
                        <span className="material-symbols-outlined text-[17px] leading-none">last_page</span>
                      </button>
                    </div>
                  )}
                </div>
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
                prepareDrawerMangaForRead(drawerManga, drawerChapters);
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
                prepareDrawerMangaForRead(drawerManga, drawerChapters);
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
