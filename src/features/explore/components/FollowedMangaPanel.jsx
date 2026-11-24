import React, { useState, useMemo, useCallback, useRef, useEffect, useDeferredValue } from 'react';
import { useI18n } from '../../../context/I18nContext';
import {
  StudioLayout,
  useStudioLayout,
  EmptyState,
  ViewModeToggle,
  useAppLog,
  SearchableSelect,
  SectionTitle,
} from '../../../shared';
import { MemoFollowedMangaCard } from './FollowedMangaCard';
import ExploreSourceSelect, { extractConnectorHost } from './ExploreSourceSelect';
import { buildFollowedSourceOptions } from './exploreSourceUtils.mjs';
import { ChaptersDrawer } from '../../reader';
import { dedupeChaptersByNumber } from '../../download';
import {
  groupProgress,
  groupProgressPercent,
  overallQueueProgress,
  downloadProgressMatchesGroup,
} from '../../../utils/queueProgress';
import { getReaderProgressKey, getReadingProgressEntry } from '../../../utils/readingProgress';
import {
  filterFavorites,
  computeFavoritesStats,
  runFavoriteCheckQueue,
} from '../services/favoriteChecker';

const SYNC_STORAGE_KEY = 'crawler:followed-manga-sync-v1';
const SORT_STORAGE_KEY = 'mangaFollowedSortPref_v1';
const PAGE_SIZE_STORAGE_KEY = 'mangaFollowedPageSizePref_v1';
const PAGE_SIZES = [20, 50, 100];
const FOLLOWED_MANGA_PAGE_SIZE = 20;
const FOLLOWED_GRID_SKELETON_ITEMS = Array.from({ length: 12 }, (_, idx) => idx);
const FOLLOWED_LIST_SKELETON_ITEMS = Array.from({ length: 8 }, (_, idx) => idx);

const FollowedMangaSkeleton = React.memo(function FollowedMangaSkeleton({
  viewMode,
  statusText,
  progressPercent = null,
}) {
  return (
    <div
      data-testid="followed-manga-skeleton"
      aria-busy="true"
      aria-label={statusText}
      className="space-y-4 select-none"
    >
      <div
        role="status"
        data-testid="followed-manga-check-progress"
        className="flex flex-wrap items-center justify-between gap-3"
      >
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
          {FOLLOWED_LIST_SKELETON_ITEMS.map((idx) => (
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
          {FOLLOWED_GRID_SKELETON_ITEMS.map((idx) => (
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

function loadStoredSync() {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(SYNC_STORAGE_KEY);
    if (raw) return JSON.parse(raw) || {};
  } catch {
    /* ignore */
  }
  return {};
}

function saveStoredSync(data) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

export default function FollowedMangaPanel({
  connectors = [],
  favorites = [],
  favoriteSyncById: externalSyncById = {},
  onToggleFavorite = null,
  onEnqueuePendingChapters = null,
  savePath = '',
  mangaLoadOpts = {},
  prepareDrawerMangaForRead = null,
  onOpenReaderForDrawerChapter = null,
  onReadChapterOnlineForDrawerChapter = null,
  subtabsSlot = null,
  queue = [],
  queueProcessing = false,
  downloadProgress = null,
  onStartQueue = null,
  onStopQueue = null,
  onAddQueuedFromLatest = null,
  onDownloadMangadexCovers = null,
  viewMode: propViewMode,
  onViewModeChange,
}) {
  const { t } = useI18n();
  const { appendLog } = useAppLog();
  const api = typeof window !== 'undefined' ? window.electronAPI : null;

  // StudioLayout integration
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

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'hasNew'
  const [siteFilter, setSiteFilter] = useState('');

  const handleResetFilters = useCallback(() => {
    setSearchTerm('');
    setStatusFilter('all');
    setSiteFilter('');
    setPage(1);
    setRawPageInput('1');
  }, []);

  // Sort State with Persistent Storage
  const [sortBy, setSortBy] = useState(() => {
    if (typeof localStorage === 'undefined') return 'recentlyAdded';
    try {
      const saved = localStorage.getItem(SORT_STORAGE_KEY);
      if (saved && ['recentlyAdded', 'hasNewFirst', 'titleAsc'].includes(saved)) {
        return saved;
      }
    } catch {
      /* ignore */
    }
    return 'recentlyAdded';
  });

  // Client-Side Pagination State
  const [page, setPage] = useState(1);
  const [rawPageInput, setRawPageInput] = useState('1');
  const contentScrollRef = useRef(null);

  const handleSortChange = useCallback((nextSort) => {
    setSortBy(nextSort);
    setPage(1);
    setRawPageInput('1');
    try {
      localStorage.setItem(SORT_STORAGE_KEY, nextSort);
    } catch {
      /* ignore */
    }
  }, []);

  // Layout View Mode ('grid' | 'list')
  const [internalViewMode, setInternalViewMode] = useState(() => {
    if (typeof localStorage === 'undefined') return 'grid';
    try {
      const v = localStorage.getItem('followed_manga_view_mode_v1');
      if (v === 'list' || v === 'grid') return v;
    } catch {
      /* ignore */
    }
    return 'grid';
  });
  const viewMode = propViewMode !== undefined ? propViewMode : internalViewMode;

  const handleViewModeChange = useCallback(
    (next) => {
      const nextMode = next === 'list' ? 'list' : 'grid';
      if (propViewMode === undefined) {
        setInternalViewMode(nextMode);
      }
      try {
        localStorage.setItem('followed_manga_view_mode_v1', nextMode);
      } catch {
        /* ignore */
      }
      onViewModeChange?.(nextMode);
    },
    [propViewMode, onViewModeChange]
  );

  // Local Sync state (merged with externalSyncById)
  const [localSyncById, setLocalSyncById] = useState(() => loadStoredSync());
  const activeSyncById = useMemo(() => {
    return { ...localSyncById, ...externalSyncById };
  }, [localSyncById, externalSyncById]);

  // Checking progress state
  const [isCheckingAll, setIsCheckingAll] = useState(false);
  const [isStoppingCheck, setIsStoppingCheck] = useState(false);
  const [checkingProgress, setCheckingProgress] = useState(null); // { current, completed, total, item }
  const [singleCheckingId, setSingleCheckingId] = useState(null);
  const abortControllerRef = useRef(null);

  // Chapter drawer & manga read state
  const [chapterDrawerOpen, setChapterDrawerOpen] = useState(false);
  const [drawerManga, setDrawerManga] = useState(null);
  const [drawerChapters, setDrawerChapters] = useState([]);
  const [drawerSelectedUrls, setDrawerSelectedUrls] = useState(() => new Set());
  const [drawerReadChapterAllowedUrls, setDrawerReadChapterAllowedUrls] = useState(null);
  const [loadingMangaId, setLoadingMangaId] = useState(null);
  const [enqueuingMangaId, setEnqueuingMangaId] = useState(null);
  const [isEnqueuingAll, setIsEnqueuingAll] = useState(false);
  const chapterCacheRef = useRef(new Map());

  // Clean up running check queue on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Compute Connector Maps
  const siteMap = useMemo(() => {
    const labels = new Map();
    const icons = new Map();
    connectors.forEach((c) => {
      if (c?.id) {
        labels.set(c.id, c.label || c.id);
        if (c.icon) icons.set(c.id, c.icon);
      }
    });
    return { labels, icons };
  }, [connectors]);

  // Compute Global Stats (across all favorites, used for source dropdown options)
  const stats = useMemo(() => {
    return computeFavoritesStats({
      favorites,
      favoriteSyncById: activeSyncById,
    });
  }, [favorites, activeSyncById]);

  // Compute Active Stats (scoped to currently selected siteFilter)
  const activeStats = useMemo(() => {
    if (!siteFilter) {
      return {
        total: stats.total,
        hasNewCount: stats.hasNewCount,
      };
    }
    const currentSite = stats.siteBreakdown.find((s) => s.siteId === siteFilter);
    return {
      total: currentSite?.count || 0,
      hasNewCount: currentSite?.hasNewCount || 0,
    };
  }, [siteFilter, stats]);

  // Compute active pending chapters count (scoped to siteFilter)
  const activePendingChaptersCount = useMemo(() => {
    const targets = siteFilter
      ? favorites.filter((f) => String(f.siteId || '') === siteFilter)
      : favorites;
    return targets.reduce((sum, f) => {
      const sync = activeSyncById[f.id];
      if (!sync?.hasNew) return sum;
      return sum + (typeof sync.pendingNewCount === 'number' && sync.pendingNewCount > 0 ? sync.pendingNewCount : 1);
    }, 0);
  }, [favorites, activeSyncById, siteFilter]);

  // Map queue items to manga URL and Title for O(1) matching
  const queueGroupByMangaKey = useMemo(() => {
    const map = new Map();
    if (!Array.isArray(queue)) return map;
    for (const g of queue) {
      if (g.mangaUrl) map.set(`url::${String(g.mangaUrl).trim()}`, g);
      if (g.mangaTitle) map.set(`title::${String(g.mangaTitle).trim().toLowerCase()}`, g);
    }
    return map;
  }, [queue]);

  const getDownloadState = useCallback(
    (item) => {
      if (!item) return null;
      let g = null;
      const urlKey = item.mangaUrl ? `url::${String(item.mangaUrl).trim()}` : '';
      const titleKey = item.title ? `title::${String(item.title).trim().toLowerCase()}` : '';
      if (urlKey && queueGroupByMangaKey.has(urlKey)) {
        g = queueGroupByMangaKey.get(urlKey);
      } else if (titleKey && queueGroupByMangaKey.has(titleKey)) {
        g = queueGroupByMangaKey.get(titleKey);
      }
      if (!g || !Array.isArray(g.chapters) || g.chapters.length === 0) return null;
      const p = groupProgress(g);
      if (p.allDone) return null;
      const isCurrentDownloading = Boolean(
        queueProcessing && (p.hasDl || downloadProgressMatchesGroup(g, downloadProgress))
      );
      const percent = groupProgressPercent(g, p, downloadProgress);
      const activePage =
        isCurrentDownloading && downloadProgress && downloadProgress.total > 0
          ? { current: downloadProgress.current, total: downloadProgress.total }
          : null;
      return {
        group: g,
        done: p.done,
        total: p.total,
        percent,
        isCurrentDownloading,
        activePage,
      };
    },
    [queueGroupByMangaKey, queueProcessing, downloadProgress]
  );

  // Overall queue progress
  const overall = useMemo(() => {
    return overallQueueProgress(queue, downloadProgress);
  }, [queue, downloadProgress]);

  // Unfinished chapters count in queue
  const unfinishedQueueCount = useMemo(() => {
    if (!Array.isArray(queue)) return 0;
    return queue.reduce((sum, g) => {
      const p = groupProgress(g);
      return sum + Math.max(0, p.total - p.done);
    }, 0);
  }, [queue]);

  // Filtered List
  const filteredList = useMemo(() => {
    return filterFavorites({
      favorites,
      favoriteSyncById: activeSyncById,
      query: deferredSearchTerm,
      statusFilter,
      siteFilter,
    });
  }, [favorites, activeSyncById, deferredSearchTerm, statusFilter, siteFilter]);

  // Sorted List
  const sortedFavorites = useMemo(() => {
    const list = [...filteredList];
    if (sortBy === 'titleAsc') {
      list.sort((a, b) =>
        String(a?.title || '').localeCompare(String(b?.title || ''), undefined, { sensitivity: 'base' })
      );
    } else if (sortBy === 'recentlyAdded') {
      list.sort((a, b) => {
        const timeA = a?.followedAt || a?.updatedAt || a?.createdAt || 0;
        const timeB = b?.followedAt || b?.updatedAt || b?.createdAt || 0;
        return timeB - timeA;
      });
    } else {
      // 'hasNewFirst' (default): prioritize items with new chapters, then alphabetical
      list.sort((a, b) => {
        const syncA = activeSyncById[a.id];
        const syncB = activeSyncById[b.id];
        const hasNewA = syncA?.hasNew ? 1 : 0;
        const hasNewB = syncB?.hasNew ? 1 : 0;
        if (hasNewB !== hasNewA) return hasNewB - hasNewA;
        return String(a?.title || '').localeCompare(String(b?.title || ''), undefined, { sensitivity: 'base' });
      });
    }
    return list;
  }, [filteredList, sortBy, activeSyncById]);

  const [pageSize, setPageSize] = useState(() => {
    if (typeof localStorage === 'undefined') return FOLLOWED_MANGA_PAGE_SIZE;
    try {
      const stored = Number(localStorage.getItem(PAGE_SIZE_STORAGE_KEY));
      return PAGE_SIZES.includes(stored) ? stored : FOLLOWED_MANGA_PAGE_SIZE;
    } catch {
      return FOLLOWED_MANGA_PAGE_SIZE;
    }
  });

  const pageSizeOptions = useMemo(
    () => PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) })),
    [],
  );

  const handlePageSizeChange = useCallback((val) => {
    const next = Number(val);
    if (PAGE_SIZES.includes(next)) {
      setPageSize(next);
      setPage(1);
      setRawPageInput('1');
      try {
        localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(next));
      } catch {
        /* ignore */
      }
    }
  }, []);

  // Total pages based on pageSize
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(sortedFavorites.length / pageSize)),
    [sortedFavorites.length, pageSize]
  );

  // Clamp page if totalPages shrinks
  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
      setRawPageInput(String(totalPages));
    }
  }, [page, totalPages]);

  // In-memory sliced items for current page
  const displayedFavorites = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedFavorites.slice(start, start + pageSize);
  }, [sortedFavorites, page, pageSize]);

  const fromRow = sortedFavorites.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const toRow = Math.min(page * pageSize, sortedFavorites.length);

  // Jump page submit
  const handlePageJumpSubmit = useCallback(() => {
    const raw = String(rawPageInput || '').trim();
    const parsed = parseInt(raw, 10);
    if (!Number.isFinite(parsed)) {
      setRawPageInput(String(page));
      return;
    }
    const clamped = Math.min(totalPages, Math.max(1, parsed));
    setPage(clamped);
    setRawPageInput(String(clamped));
    contentScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [rawPageInput, page, totalPages]);

  // Dropdown options for Web Sources (unified with LatestUpdates & BulkScan, scoped to connectors with bookmarks)
  const siteOptions = useMemo(
    () =>
      buildFollowedSourceOptions({
        connectors,
        siteBreakdown: stats.siteBreakdown,
        siteMap,
        allSourcesLabel: t('followedManga.filter.allSources'),
        extractHost: extractConnectorHost,
      }),
    [connectors, stats.siteBreakdown, siteMap, t],
  );

  // Dropdown options for Sorting
  const sortOptions = useMemo(
    () => [
      { value: 'recentlyAdded', label: t('followedManga.sort.recentlyAdded'), icon: 'schedule' },
      { value: 'hasNewFirst', label: t('followedManga.sort.hasNewFirst'), icon: 'update' },
      { value: 'titleAsc', label: t('followedManga.sort.titleAsc'), icon: 'sort_by_alpha' },
    ],
    [t]
  );

  // Helper to compute chapter frontier sync against local downloads and save state
  const computeAndSaveSync = useCallback(
    async (item, chapterList) => {
      if (!item || !Array.isArray(chapterList)) return null;
      let hasNew = false;
      let pendingNewCount = 0;
      let remoteCount = chapterList.length;
      let localCount = 0;
      let pendingChapters = [];

      if (api?.computeFavoriteChapterSync && savePath) {
        try {
          const frontier = await api.computeFavoriteChapterSync(
            savePath,
            item.title,
            chapterList
          );
          if (frontier && frontier.ok) {
            pendingNewCount = Number(frontier.pendingNewCount) || 0;
            hasNew = Boolean(frontier.hasNew);
            localCount = Number(frontier.localCount) || 0;
            if (Array.isArray(frontier.pendingChapters)) {
              pendingChapters = frontier.pendingChapters;
            }
          }
        } catch {
          /* ignore frontier error */
        }
      } else {
        // Fallback comparison with stored chapterCount
        hasNew = remoteCount > (item.chapterCount || 0);
        pendingNewCount = Math.max(0, remoteCount - (item.chapterCount || 0));
        if (hasNew && pendingNewCount > 0) {
          pendingChapters = chapterList.slice(0, pendingNewCount);
        }
      }

      const syncEntry = {
        hasNew,
        pendingNewCount,
        remoteCount,
        localCount,
        pendingChapters,
        checkedAt: Date.now(),
      };

      setLocalSyncById((prev) => {
        const next = { ...prev, [item.id]: syncEntry };
        saveStoredSync(next);
        return next;
      });

      return syncEntry;
    },
    [api, savePath]
  );

  // Check single manga
  const checkSingleManga = useCallback(
    async (item, signal) => {
      if (!item || !api?.loadManga || signal?.aborted) return;
      const url = String(item.mangaUrl || '').trim();
      if (!url) return;

      const opts = {
        ...(mangaLoadOpts || {}),
        ...(item.siteId === 'mangadex' ? { mangadexLanguage: mangaLoadOpts?.mangadexLanguage } : {}),
      };

      try {
        const res = await api.loadManga(item.siteId || '', url, opts);
        if (signal?.aborted || !res?.ok) return;

        await computeAndSaveSync(item, res.chapters || []);
      } catch (err) {
        if (!signal?.aborted) {
          console.warn('Check single favorite failed:', err);
        }
      }
    },
    [api, mangaLoadOpts, computeAndSaveSync]
  );

  // Trigger Check All (in current filter/site scope)
  const handleCheckAll = useCallback(async () => {
    if (isCheckingAll) return;
    const targets = siteFilter
      ? favorites.filter((f) => String(f.siteId || '') === siteFilter)
      : favorites;

    if (!targets.length) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsStoppingCheck(false);
    setIsCheckingAll(true);
    setCheckingProgress({ current: 0, completed: 0, total: targets.length, item: null });

    try {
      await runFavoriteCheckQueue({
        list: targets,
        checkFn: checkSingleManga,
        concurrency: 2,
        abortSignal: controller.signal,
        onProgress: (p) => {
          if (!controller.signal.aborted) setCheckingProgress(p);
        },
      });
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        setIsCheckingAll(false);
        setIsStoppingCheck(false);
        setCheckingProgress(null);
      }
    }
  }, [isCheckingAll, siteFilter, favorites, checkSingleManga]);

  // Stop checking
  const handleStopCheck = useCallback(() => {
    setIsStoppingCheck(true);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    } else {
      setIsCheckingAll(false);
      setIsStoppingCheck(false);
      setCheckingProgress(null);
    }
  }, []);

  const checkingProgressPercent = useMemo(() => {
    if (!isCheckingAll || !checkingProgress || !checkingProgress.total) return 0;
    const done =
      typeof checkingProgress.completed === 'number'
        ? checkingProgress.completed
        : checkingProgress.current || 0;
    return Math.min(100, Math.max(0, Math.round((done / checkingProgress.total) * 100)));
  }, [isCheckingAll, checkingProgress]);

  // Handle recheck single
  const handleRecheckSingle = useCallback(
    async (item) => {
      setSingleCheckingId(item.id);
      try {
        await checkSingleManga(item);
      } finally {
        setSingleCheckingId(null);
      }
    },
    [checkSingleManga]
  );

  // Drawer & Reading Handlers
  const drawerQueueDownloadSig = useMemo(() => {
    const mu = String(drawerManga?.mangaUrl || '').trim();
    if (!mu || !Array.isArray(queue)) return '';
    const g = queue.find((x) => String(x.mangaUrl || '').trim() === mu);
    if (!g?.chapters?.length) return '';
    return g.chapters.map((c) => `${String(c.chapterUrl)}:${String(c.status)}`).join('\n');
  }, [queue, drawerManga?.mangaUrl]);

  useEffect(() => {
    if (!chapterDrawerOpen || !drawerManga?.title || !drawerChapters.length) {
      setDrawerReadChapterAllowedUrls(null);
      return undefined;
    }
    const base = String(savePath || '').trim();
    const manga_title = String(drawerManga.title || '').trim();
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
  }, [chapterDrawerOpen, drawerManga?.title, drawerChapters, savePath, api, drawerQueueDownloadSig]);

  const closeChapterDrawer = useCallback(() => {
    setChapterDrawerOpen(false);
  }, []);

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
    const result = onAddQueuedFromLatest(drawerManga, drawerChapters, drawerSelectedUrls);
    if (result && result.ok === false) return;
    setChapterDrawerOpen(false);
  }, [drawerManga, drawerChapters, drawerSelectedUrls, onAddQueuedFromLatest]);

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

  const fetchMangaChapters = useCallback(
    async (item) => {
      if (!item || !api?.loadManga) return { manga: null, chapters: [] };
      const siteId = String(item.siteId || '').trim();
      const mangaUrl = String(item.mangaUrl || '').trim();
      if (!mangaUrl) return { manga: null, chapters: [] };

      const cacheKey = `${siteId}::${mangaUrl}`;
      const cached = chapterCacheRef.current.get(cacheKey);
      if (
        cached &&
        Date.now() - cached.savedAt <= 30 * 60 * 1000 &&
        cached.manga &&
        Array.isArray(cached.chapters) &&
        cached.chapters.length > 0
      ) {
        return { manga: cached.manga, chapters: cached.chapters };
      }

      const effectiveOpts = {
        ...(mangaLoadOpts || {}),
        ...(siteId === 'mangadex' ? { mangadexLanguage: mangaLoadOpts?.mangadexLanguage } : {}),
      };

      const res = await api.loadManga(siteId, mangaUrl, effectiveOpts);
      if (!res?.ok || !res?.manga) {
        return { manga: null, chapters: [] };
      }

      const chapterList = Array.isArray(res.chapters) ? res.chapters : [];
      const mangaObj = {
        ...res.manga,
        siteId,
        mangaUrl,
        title: res.manga.title || item.title,
        coverUrl: res.manga.coverUrl || item.coverUrl,
      };

      chapterCacheRef.current.set(cacheKey, {
        savedAt: Date.now(),
        manga: mangaObj,
        chapters: chapterList,
      });

      return { manga: mangaObj, chapters: chapterList };
    },
    [api, mangaLoadOpts]
  );

  // Handle open manga in drawer
  const handleOpenManga = useCallback(
    async (item) => {
      if (!item) return;
      setLoadingMangaId(item.id);
      try {
        const { manga, chapters } = await fetchMangaChapters(item);
        if (manga && Array.isArray(chapters) && chapters.length > 0) {
          // Sync new chapters status so download icon immediately appears if new chapters exist
          void computeAndSaveSync(item, chapters);

          setDrawerManga(manga);
          setDrawerChapters(chapters);
          setDrawerSelectedUrls(new Set());
          setChapterDrawerOpen(true);
        } else {
          appendLog(
            t('followedManga.error.cannotLoadChapters', { title: item.title || 'Untitled' }),
            'warn'
          );
        }
      } catch (err) {
        console.warn('Failed to load manga for drawer:', err);
        appendLog(
          t('followedManga.error.cannotLoadChapters', { title: item.title || 'Untitled' }),
          'warn'
        );
      } finally {
        setLoadingMangaId((curr) => (curr === item.id ? null : curr));
      }
    },
    [fetchMangaChapters, computeAndSaveSync, appendLog, t]
  );

  // Handle Read Now
  const handleReadNow = useCallback(
    async (item, sync) => {
      if (!item) return;
      setLoadingMangaId(item.id);
      try {
        const { manga, chapters } = await fetchMangaChapters(item);
        if (manga && Array.isArray(chapters) && chapters.length > 0) {
          if (typeof prepareDrawerMangaForRead === 'function') {
            prepareDrawerMangaForRead(manga, chapters);
          }

          let targetChapter = null;
          const pendingList = Array.isArray(sync?.pendingChapters) ? sync.pendingChapters : [];
          if (pendingList.length > 0) {
            const firstPendingUrl = typeof pendingList[0] === 'string' ? pendingList[0] : pendingList[0]?.url;
            if (firstPendingUrl) {
              targetChapter = chapters.find((c) => String(c?.url || '') === String(firstPendingUrl));
            }
          }

          if (!targetChapter) {
            const progressKey = getReaderProgressKey(manga, item.siteId, item.mangaUrl, savePath);
            const progressEntry = getReadingProgressEntry(progressKey);
            if (progressEntry?.chapterUrl) {
              targetChapter = chapters.find((c) => String(c?.url || '') === String(progressEntry.chapterUrl));
            }
          }

          if (!targetChapter) {
            targetChapter = chapters[0];
          }

          if (targetChapter) {
            if (typeof onReadChapterOnlineForDrawerChapter === 'function' && !manga?.offlineOnly) {
              onReadChapterOnlineForDrawerChapter(targetChapter);
              return;
            } else if (typeof onOpenReaderForDrawerChapter === 'function') {
              onOpenReaderForDrawerChapter(targetChapter);
              return;
            }
          }

          setDrawerManga(manga);
          setDrawerChapters(chapters);
          setDrawerSelectedUrls(new Set());
          setChapterDrawerOpen(true);
        }
      } catch (err) {
        console.error('Read now failed:', err);
      } finally {
        setLoadingMangaId((curr) => (curr === item.id ? null : curr));
      }
    },
    [
      fetchMangaChapters,
      prepareDrawerMangaForRead,
      onReadChapterOnlineForDrawerChapter,
      onOpenReaderForDrawerChapter,
      savePath,
    ]
  );

  // Handle Enqueue New Chapters
  const handleEnqueueNew = useCallback(
    async (item, sync) => {
      if (!item) return;
      setEnqueuingMangaId(item.id);
      try {
        if (typeof onEnqueuePendingChapters === 'function') {
          await onEnqueuePendingChapters({ ...item, sync });
        }
        setLocalSyncById((prev) => {
          const next = {
            ...prev,
            [item.id]: {
              ...(prev[item.id] || sync || {}),
              hasNew: false,
              pendingNewCount: 0,
              pendingChapters: [],
            },
          };
          saveStoredSync(next);
          return next;
        });
      } catch (err) {
        console.error('Enqueue pending chapters failed:', err);
      } finally {
        setEnqueuingMangaId((curr) => (curr === item.id ? null : curr));
      }
    },
    [onEnqueuePendingChapters]
  );

  // Handle Enqueue All New Chapters
  const handleEnqueueAllNew = useCallback(async () => {
    if (isEnqueuingAll || isCheckingAll) return;
    const targets = (siteFilter
      ? favorites.filter((f) => String(f.siteId || '') === siteFilter)
      : favorites
    ).filter((f) => Boolean(activeSyncById[f.id]?.hasNew));

    if (!targets.length) return;

    setIsEnqueuingAll(true);
    let enqueuedMangaCount = 0;
    try {
      for (const target of targets) {
        await handleEnqueueNew(target, activeSyncById[target.id]);
        enqueuedMangaCount++;
      }
      if (enqueuedMangaCount > 0) {
        appendLog(
          t('followedManga.actions.enqueuedAllSuccess', {
            mangaCount: enqueuedMangaCount,
          }),
          'success'
        );
      }
    } catch (err) {
      console.error('Enqueue all new failed:', err);
    } finally {
      setIsEnqueuingAll(false);
    }
  }, [isEnqueuingAll, isCheckingAll, siteFilter, favorites, activeSyncById, handleEnqueueNew, appendLog, t]);

  // Handle Remove Favorite
  const handleRemove = useCallback(
    (id) => {
      const target = favorites.find((f) => f.id === id);
      if (target && typeof onToggleFavorite === 'function') {
        onToggleFavorite(target, target.siteId);
      }
      setLocalSyncById((prev) => {
        if (!prev || !prev[id]) return prev;
        const next = { ...prev };
        delete next[id];
        saveStoredSync(next);
        return next;
      });
    },
    [favorites, onToggleFavorite]
  );

  return (
    <StudioLayout>
      {/* Top Toolbar */}
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
              {isCheckingAll ? (
                <button
                  type="button"
                  onClick={handleStopCheck}
                  disabled={isStoppingCheck}
                  className="inline-flex items-center justify-center gap-1.5 h-8 px-3.5 rounded-lg text-xs font-semibold bg-error/15 text-error hover:bg-error/25 border border-error/30 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0"
                  data-tooltip={isStoppingCheck ? t('followedManga.actions.stopping') : t('followedManga.actions.stopCheck')}
                  aria-label={isStoppingCheck ? t('followedManga.actions.stopping') : t('followedManga.actions.stopCheck')}
                >
                  <span className="material-symbols-outlined text-[15px] leading-none">stop_circle</span>
                  <span>{isStoppingCheck ? t('followedManga.actions.stopping') : t('followedManga.actions.stopCheck')}</span>
                </button>
              ) : !queueProcessing && unfinishedQueueCount === 0 ? (
                <button
                  type="button"
                  onClick={handleCheckAll}
                  disabled={favorites.length === 0 || isEnqueuingAll}
                  className="inline-flex items-center justify-center gap-1.5 h-8 px-3.5 rounded-lg text-xs font-semibold bg-primary text-on-primary hover:opacity-95 shadow-2xs transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none cursor-pointer shrink-0"
                  data-tooltip={t('followedManga.actions.checkAll')}
                  aria-label={t('followedManga.actions.checkAll')}
                >
                  <span className="material-symbols-outlined text-[15px] leading-none">sync</span>
                  <span>{t('followedManga.actions.checkAll')}</span>
                </button>
              ) : null}

              {queueProcessing ? (
                <button
                  type="button"
                  onClick={() => onStopQueue?.()}
                  className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold bg-amber-600 dark:bg-amber-500 text-white hover:opacity-95 shadow-2xs transition-all active:scale-95 cursor-pointer shrink-0"
                  data-tooltip={t('followedManga.actions.pauseDownload')}
                  aria-label={t('followedManga.actions.pauseQueue', { percent: overall.percent })}
                >
                  <span className="material-symbols-outlined text-[15px] leading-none">
                    pause
                  </span>
                  <span>{t('followedManga.actions.pauseQueue', { percent: overall.percent })}</span>
                </button>
              ) : unfinishedQueueCount > 0 ? (
                <button
                  type="button"
                  onClick={() => onStartQueue?.({ unpauseAll: true })}
                  className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold bg-primary text-on-primary hover:opacity-95 shadow-2xs transition-all active:scale-95 cursor-pointer shrink-0"
                  data-tooltip={t('followedManga.actions.resumeDownload')}
                  aria-label={t('followedManga.actions.resumeQueue', { count: unfinishedQueueCount })}
                >
                  <span className="material-symbols-outlined text-[15px] leading-none">
                    play_arrow
                  </span>
                  <span>{t('followedManga.actions.resumeQueue', { count: unfinishedQueueCount })}</span>
                </button>
              ) : activeStats.hasNewCount > 0 ? (
                <button
                  type="button"
                  disabled={isEnqueuingAll || isCheckingAll}
                  onClick={handleEnqueueAllNew}
                  className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold bg-emerald-600 dark:bg-emerald-500 text-white hover:opacity-95 shadow-2xs transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none cursor-pointer shrink-0"
                  data-tooltip={t('followedManga.actions.enqueueAllTooltip', {
                    mangaCount: activeStats.hasNewCount,
                    chapterCount: activePendingChaptersCount,
                  })}
                  aria-label={t('followedManga.actions.enqueueAllTooltip', {
                    mangaCount: activeStats.hasNewCount,
                    chapterCount: activePendingChaptersCount,
                  })}
                >
                  <span
                    className={`material-symbols-outlined text-[15px] leading-none ${
                      isEnqueuingAll ? 'animate-spin' : ''
                    }`}
                  >
                    {isEnqueuingAll ? 'progress_activity' : 'playlist_add'}
                  </span>
                  <span>
                    {isEnqueuingAll
                      ? t('followedManga.actions.enqueuingAll')
                      : t('followedManga.actions.enqueueAll', {
                          count: activeStats.hasNewCount,
                        })}
                  </span>
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
            />
          </div>
        }
      />

      {/* 2-Column StudioLayout Frame */}
      <StudioLayout.Body>
        {/* Left Sidebar: Filters & Connectors */}
        <StudioLayout.LeftSidebar
          open={showLeftSidebar}
          width={leftWidth}
          onResizeStart={handleLeftResizeStart}
        >
          <div className="p-3.5 space-y-4 flex flex-col flex-1 min-h-0">
            {/* 1. Nguồn (Source dropdown) */}
            <ExploreSourceSelect
              mode="filter"
              options={siteOptions}
              value={siteFilter}
              onChange={(val) => {
                setSiteFilter(val);
                setPage(1);
                setRawPageInput('1');
              }}
            />

            {/* 2. Trạng thái (Mẫu 2: Vertical 2-row list matching BulkScanPanel) */}
            <div>
              <SectionTitle className="mb-1.5 px-0.5">
                {t('followedManga.filter.status')}
              </SectionTitle>
              <div
                role="group"
                aria-label={t('followedManga.filter.status')}
                className="rounded-xl border border-outline-variant/20 bg-surface-container-highest/60 p-1 space-y-0.5 text-xs"
              >
                {[
                  {
                    id: 'all',
                    label: t('followedManga.filter.all'),
                    count: activeStats.total,
                    dotClass: 'bg-primary',
                  },
                  {
                    id: 'hasNew',
                    label: t('followedManga.filter.hasNew'),
                    count: activeStats.hasNewCount,
                    dotClass: activeStats.hasNewCount > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-emerald-500/40',
                  },
                ].map((opt) => {
                  const isActive = statusFilter === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      aria-pressed={isActive}
                      aria-label={`${opt.label} (${opt.count})`}
                      onClick={() => {
                        setStatusFilter(opt.id);
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

            {/* 3. Sắp xếp (Sorting dropdown) */}
            <div>
              <SectionTitle className="mb-1.5 px-0.5">
                {t('followedManga.sort.title')}
              </SectionTitle>
              <SearchableSelect
                value={sortBy}
                onChange={handleSortChange}
                options={sortOptions}
                className="w-full"
                showPlaceholderOption={false}
              />
            </div>

            {/* 4. Tìm kiếm (Search Box with Clear button) */}
            <div>
              <SectionTitle className="mb-1.5 px-0.5">
                {t('followedManga.searchTitle')}
              </SectionTitle>
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setPage(1);
                    setRawPageInput('1');
                  }}
                  placeholder={t('followedManga.searchPlaceholder')}
                  aria-label={t('followedManga.searchPlaceholder')}
                  className="h-10 w-full rounded-xl border border-outline-variant/25 bg-surface-container-highest px-3.5 pr-8 text-xs sm:text-sm text-on-surface placeholder:text-on-surface-variant/50 outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/30"
                  autoComplete="off"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTerm('');
                      setPage(1);
                      setRawPageInput('1');
                    }}
                    data-tooltip={t('followedManga.searchClear')}
                    aria-label={t('followedManga.searchClear')}
                    className="absolute right-2.5 text-on-surface-variant/60 hover:text-on-surface cursor-pointer p-0.5 rounded"
                  >
                    <span className="material-symbols-outlined text-[15px] leading-none">close</span>
                  </button>
                )}
              </div>
            </div>

            {/* 5. Thẻ thống kê tổng quan (Stats Card) */}
            {activeStats.total > 0 && (
              <div className="mt-auto pt-2">
                <div className="rounded-xl border border-primary/15 bg-primary/5 p-2.5">
                  <div className="text-[10px] font-bold text-primary mb-2 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[13px]">bar_chart</span>
                    <span>{t('followedManga.stats.overviewTitle')}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                    <span className="text-on-surface-variant">{t('followedManga.stats.total')}</span>
                    <span className="font-bold text-on-surface text-right tabular-nums">{activeStats.total}</span>
                    <span className="text-on-surface-variant">{t('followedManga.stats.hasNew')}</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 text-right tabular-nums">{activeStats.hasNewCount}</span>
                    {activePendingChaptersCount > 0 && (
                      <>
                        <span className="text-on-surface-variant">{t('followedManga.stats.pendingChapters')}</span>
                        <span className="font-bold text-amber-600 dark:text-amber-400 text-right tabular-nums">
                          {t('followedManga.stats.pendingUnit', { count: activePendingChaptersCount })}
                        </span>
                      </>
                    )}
                  </div>

                  <div className="mt-2.5 pt-2 border-t border-primary/10 space-y-1.5 text-[10px] text-on-surface-variant/75 leading-relaxed">
                    <div className="flex items-start gap-1.5">
                      <span className="w-4 h-4 flex items-center justify-center shrink-0 text-primary/70">
                        <span className="material-symbols-outlined text-[13px] leading-none">touch_app</span>
                      </span>
                      <span className="flex-1 min-w-0 leading-snug pt-0.5">{t('followedManga.stats.tip')}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </StudioLayout.LeftSidebar>

        {/* Central Content: Cards Grid & List with In-Memory Pagination */}
        <StudioLayout.Content>
          <div ref={contentScrollRef} className="custom-scrollbar flex-1 min-h-0 overflow-auto p-4 sm:p-6 bg-surface">
            {isCheckingAll ? (
              <FollowedMangaSkeleton
                viewMode={viewMode}
                statusText={
                  isStoppingCheck
                    ? t('followedManga.actions.stopping')
                    : checkingProgress
                      ? t('followedManga.actions.checking', {
                          title: checkingProgress.item?.title || '...',
                          current: checkingProgress.current,
                          total: checkingProgress.total,
                        })
                      : t('followedManga.actions.checkAll')
                }
                progressPercent={checkingProgress ? checkingProgressPercent : null}
              />
            ) : favorites.length === 0 ? (
              <EmptyState
                icon="bookmarks"
                title={t('followedManga.empty.title')}
                description={t('followedManga.empty.description')}
              />
            ) : sortedFavorites.length === 0 ? (
              <EmptyState
                icon="search_off"
                title={t('followedManga.empty.noMatchTitle')}
                description={t('followedManga.empty.noMatchDescription')}
                action={
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold border border-outline-variant/25 bg-surface-container-high text-on-surface hover:bg-surface-bright transition-all active:scale-95 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[15px]">filter_alt_off</span>
                    <span>{t('followedManga.resetFilters')}</span>
                  </button>
                }
              />
            ) : viewMode === 'list' ? (
              <ul className="flex flex-col gap-2">
                {displayedFavorites.map((item) => {
                const sync = activeSyncById[item.id];
                const hasNew = Boolean(sync?.hasNew);
                const pendingNewCount = typeof sync?.pendingNewCount === 'number' ? sync.pendingNewCount : 0;
                const remoteCount = typeof sync?.remoteCount === 'number' ? sync.remoteCount : item.chapterCount || 0;
                const isChecking = singleCheckingId === item.id;
                const isLoading = loadingMangaId === item.id;
                const isEnqueuing = enqueuingMangaId === item.id;
                const siteLabel = siteMap.labels.get(item.siteId) || item.siteId;
                const siteIcon = siteMap.icons.get(item.siteId);
                const downloadState = getDownloadState(item);

                return (
                  <li
                    key={item.id}
                    onClick={() => handleOpenManga(item)}
                    className={`group flex cursor-pointer select-none items-center justify-between gap-3 px-3 py-2.5 sm:px-4 rounded-xl border transition-all ${
                      hasNew
                        ? 'bg-surface-container-high/45 border-emerald-500/40 hover:border-emerald-500/70 hover:shadow-xs'
                        : 'bg-surface-container-high/35 border-outline-variant/20 hover:border-outline-variant/40 hover:bg-surface-container-high/55'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="relative h-14 w-10 sm:h-16 sm:w-11 shrink-0 overflow-hidden rounded-lg bg-surface-container-highest border border-outline-variant/15 flex items-center justify-center shadow-xs">
                        {item.coverUrl ? (
                          <img
                            src={item.coverUrl}
                            alt=""
                            className="pointer-events-none absolute inset-0 size-full object-cover"
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <span className="material-symbols-outlined text-[20px] text-on-surface-variant/40 leading-none select-none">
                            auto_stories
                          </span>
                        )}
                        {hasNew && (
                          <span className="absolute top-0.5 left-0.5 px-1 rounded text-[8px] font-bold bg-emerald-500 text-white shadow-2xs">
                            N
                          </span>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <h4 className="text-sm font-semibold text-on-surface truncate group-hover:text-primary transition-colors" data-tooltip={item.title}>
                            {item.title}
                          </h4>
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-primary bg-primary/10 px-2 py-0.5 rounded shrink-0 flex items-center gap-1">
                            {siteIcon && <img src={siteIcon} alt="" className="w-2.5 h-2.5 rounded shrink-0" />}
                            <span>{siteLabel}</span>
                          </span>
                        </div>
                        {downloadState ? (
                          <div className="flex flex-col gap-1 mt-1 max-w-sm sm:max-w-md">
                            <div className="flex items-center gap-2 text-xs text-primary font-medium">
                              <span className="inline-flex items-center gap-1 truncate">
                                <span
                                  className={`material-symbols-outlined text-[13px] leading-none shrink-0 ${
                                    downloadState.isCurrentDownloading ? 'animate-spin' : ''
                                  }`}
                                >
                                  {downloadState.isCurrentDownloading ? 'sync' : 'hourglass_top'}
                                </span>
                                <span className="truncate">
                                  {downloadState.isCurrentDownloading
                                    ? downloadState.activePage
                                      ? `${t('followedManga.progress.downloading', {
                                          done: downloadState.done,
                                          total: downloadState.total,
                                        })} • ${t('followedManga.progress.pageDetail', {
                                          current: downloadState.activePage.current,
                                          total: downloadState.activePage.total,
                                        })}`
                                      : t('followedManga.progress.downloading', {
                                          done: downloadState.done,
                                          total: downloadState.total,
                                        })
                                    : t('followedManga.progress.waiting', {
                                        done: downloadState.done,
                                        total: downloadState.total,
                                      })}
                                </span>
                              </span>
                              <span>•</span>
                              <span className="tabular-nums font-semibold shrink-0">
                                {downloadState.percent}%
                              </span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-surface-container-highest overflow-hidden border border-outline-variant/10">
                              <div
                                className="h-full bg-primary transition-[width] duration-200 ease-out"
                                style={{ width: `${downloadState.percent}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-xs text-on-surface-variant/70">
                            {hasNew ? (
                              <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400 text-xs">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                <span>
                                  {pendingNewCount > 0
                                    ? t('followedManga.badge.newChaptersShort', { count: pendingNewCount })
                                    : t('followedManga.filter.hasNew')}
                                </span>
                                <span>•</span>
                                <span className="tabular-nums">
                                  {t('followedManga.badge.chapterCount', { count: remoteCount })}
                                </span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs text-on-surface-variant">
                                <span className="material-symbols-outlined text-[14px] text-emerald-500 leading-none">check</span>
                                <span>
                                  {remoteCount > 0
                                    ? t('followedManga.badge.chapterCount', { count: remoteCount })
                                    : t('followedManga.badge.upToDate')}
                                </span>
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* List action buttons (matching LatestUpdates & BulkScan standard) */}
                    <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={() => handleOpenManga(item)}
                        className="h-8 px-3 rounded-lg text-xs font-semibold bg-primary text-on-primary hover:opacity-90 flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-2xs whitespace-nowrap disabled:opacity-50"
                        aria-label={t('followedManga.actions.viewChapters')}
                      >
                        {isLoading ? (
                          <span className="inline-flex items-center justify-center gap-1.5">
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
                            <span className="whitespace-nowrap">{t('followedManga.actions.viewChapters')}</span>
                          </>
                        )}
                      </button>

                      {!downloadState && (
                        <>
                          {typeof onEnqueuePendingChapters === 'function' && (
                            <button
                              type="button"
                              disabled={isEnqueuing}
                              onClick={() => handleEnqueueNew(item, sync)}
                              className="h-8 w-8 shrink-0 rounded-lg bg-primary text-on-primary hover:opacity-90 transition-all flex items-center justify-center cursor-pointer shadow-2xs disabled:opacity-50"
                              data-tooltip={
                                hasNew && pendingNewCount > 0
                                  ? t('followedManga.actions.enqueueNew', { count: pendingNewCount })
                                  : t('latestUpdates.addToQueue')
                              }
                              aria-label={
                                hasNew && pendingNewCount > 0
                                  ? t('followedManga.actions.enqueueNew', { count: pendingNewCount })
                                  : t('latestUpdates.addToQueue')
                              }
                            >
                              <span
                                className={`material-symbols-outlined text-[17px] leading-none ${
                                  isEnqueuing ? 'animate-spin' : ''
                                }`}
                              >
                                {isEnqueuing ? 'progress_activity' : 'playlist_add'}
                              </span>
                            </button>
                          )}
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => handleRemove(item.id)}
                        className="h-8 w-8 shrink-0 rounded-lg border border-rose-500/30 bg-rose-500/15 text-rose-500 hover:bg-rose-500/25 flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-2xs"
                        data-tooltip={t('followedManga.actions.removeFavorite')}
                        aria-label={t('followedManga.actions.removeFavorite')}
                      >
                        <span
                          className="material-symbols-outlined text-[15px] leading-none"
                          style={{ fontVariationSettings: "'FILL' 1, 'wght' 300, 'GRAD' 0, 'opsz' 20" }}
                        >
                          favorite
                        </span>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {displayedFavorites.map((item) => (
                <MemoFollowedMangaCard
                  key={item.id}
                  item={item}
                  sync={activeSyncById[item.id]}
                  siteLabel={siteMap.labels.get(item.siteId) || item.siteId}
                  siteIcon={siteMap.icons.get(item.siteId)}
                  isLoading={loadingMangaId === item.id}
                  isEnqueuing={enqueuingMangaId === item.id}
                  downloadState={getDownloadState(item)}
                  onStartQueue={onStartQueue}
                  onStopQueue={onStopQueue}
                  onOpenManga={handleOpenManga}
                  onEnqueueNew={handleEnqueueNew}
                  onRemove={handleRemove}
                />
              ))}
            </div>
          )}
          </div>

          {/* Bottom In-Memory Pagination Bar */}
          {!isCheckingAll && favorites.length > 0 && sortedFavorites.length > 0 && (
            <div
              className="shrink-0 border-t border-outline-variant/20 bg-surface-container-low/80 backdrop-blur-md px-4 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 select-none"
              role="region"
              aria-label={t('followedManga.pagination.summary', { count: sortedFavorites.length })}
            >
              {/* Left: Summary & page range */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary tabular-nums shadow-2xs">
                  <span className="material-symbols-outlined text-[15px]">bookmarks</span>
                  <span>{t('followedManga.pagination.summary', { count: sortedFavorites.length })}</span>
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
                  data-tooltip={t('bulkScan.pageSize')}
                  aria-label={t('bulkScan.pageSize')}
                />

                {totalPages > 1 && (
                  <div className="flex items-center gap-1">
                    {/* First page button */}
                    <button
                      type="button"
                      data-tooltip={t('latestUpdates.firstPage')}
                      aria-label={t('latestUpdates.firstPage')}
                      disabled={page <= 1}
                      onClick={() => {
                        setPage(1);
                        setRawPageInput('1');
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
                      disabled={page <= 1}
                      onClick={() => {
                        const next = Math.max(1, page - 1);
                        setPage(next);
                        setRawPageInput(String(next));
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
                        handlePageJumpSubmit();
                      }}
                    >
                      <input
                        type="number"
                        min={1}
                        max={totalPages}
                        inputMode="numeric"
                        aria-label={t('latestUpdates.pageInputAria', { total: totalPages })}
                        value={rawPageInput}
                        onChange={(e) => setRawPageInput(e.target.value)}
                        className="h-8 w-12 shrink-0 rounded-xl border border-outline-variant/30 bg-surface-container-highest px-1.5 text-center text-xs font-semibold font-mono text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all disabled:opacity-40 shadow-inner"
                      />
                      <span className="text-on-surface-variant/70 font-medium">/</span>
                      <span className="tabular-nums font-semibold text-on-surface-variant min-w-[1.5rem] text-center">
                        {totalPages}
                      </span>
                    </form>

                    {/* Next page button */}
                    <button
                      type="button"
                      aria-label={t('latestUpdates.nextPage')}
                      disabled={page >= totalPages}
                      onClick={() => {
                        const next = Math.min(totalPages, page + 1);
                        setPage(next);
                        setRawPageInput(String(next));
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
                      disabled={page >= totalPages}
                      onClick={() => {
                        setPage(totalPages);
                        setRawPageInput(String(totalPages));
                        contentScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-outline-variant/30 bg-surface-container-high text-on-surface-variant hover:bg-surface-bright hover:text-on-surface hover:border-outline-variant/60 active:scale-95 disabled:pointer-events-none disabled:opacity-40 transition-all cursor-pointer shadow-2xs"
                    >
                      <span className="material-symbols-outlined text-[17px] leading-none">last_page</span>
                    </button>
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
