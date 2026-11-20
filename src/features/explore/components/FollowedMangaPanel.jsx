import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useI18n } from '../../../context/I18nContext';
import { StudioLayout, useStudioLayout, ResizeSplitter, EmptyState, ViewModeToggle, useAppLog } from '../../../shared';
import FollowedMangaCard from './FollowedMangaCard';
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
    storagePrefix: 'explore_followed',
    defaultLeftWidth: 260,
    minLeftWidth: 220,
    maxLeftWidth: 420,
  });

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'hasNew' | 'unread'
  const [siteFilter, setSiteFilter] = useState('');

  // Layout View Mode ('grid' | 'list')
  const [viewMode, setViewMode] = useState(() => {
    if (typeof localStorage === 'undefined') return 'grid';
    try {
      const v = localStorage.getItem('followed_manga_view_mode_v1');
      if (v === 'list' || v === 'grid') return v;
    } catch {
      /* ignore */
    }
    return 'grid';
  });

  const handleViewModeChange = useCallback((next) => {
    setViewMode(next);
    try {
      localStorage.setItem('followed_manga_view_mode_v1', next);
    } catch {
      /* ignore */
    }
  }, []);

  // Local Sync state (merged with externalSyncById)
  const [localSyncById, setLocalSyncById] = useState(() => loadStoredSync());
  const activeSyncById = useMemo(() => {
    return { ...localSyncById, ...externalSyncById };
  }, [localSyncById, externalSyncById]);

  // Checking progress state
  const [isCheckingAll, setIsCheckingAll] = useState(false);
  const [checkingProgress, setCheckingProgress] = useState(null); // { current, total, item }
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

  // Compute Stats
  const stats = useMemo(() => {
    return computeFavoritesStats({
      favorites,
      favoriteSyncById: activeSyncById,
    });
  }, [favorites, activeSyncById]);

  // Compute total pending chapters count
  const totalPendingChaptersCount = useMemo(() => {
    return favorites.reduce((sum, f) => {
      const sync = activeSyncById[f.id];
      if (!sync?.hasNew) return sum;
      return sum + (typeof sync.pendingNewCount === 'number' && sync.pendingNewCount > 0 ? sync.pendingNewCount : 1);
    }, 0);
  }, [favorites, activeSyncById]);

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
      query: searchTerm,
      statusFilter,
      siteFilter,
    });
  }, [favorites, activeSyncById, searchTerm, statusFilter, siteFilter]);

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
    async (item) => {
      if (!item || !api?.loadManga) return;
      const url = String(item.mangaUrl || '').trim();
      if (!url) return;

      const opts = {
        ...(mangaLoadOpts || {}),
        ...(item.siteId === 'mangadex' ? { mangadexLanguage: mangaLoadOpts?.mangadexLanguage } : {}),
      };

      try {
        const res = await api.loadManga(item.siteId || '', url, opts);
        if (!res?.ok) return;

        await computeAndSaveSync(item, res.chapters || []);
      } catch (err) {
        console.warn('Check single favorite failed:', err);
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

    setIsCheckingAll(true);
    setCheckingProgress({ current: 0, total: targets.length, item: null });

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      await runFavoriteCheckQueue({
        list: targets,
        checkFn: checkSingleManga,
        concurrency: 2,
        abortSignal: controller.signal,
        onProgress: (p) => setCheckingProgress(p),
      });
    } finally {
      setIsCheckingAll(false);
      setCheckingProgress(null);
      abortControllerRef.current = null;
    }
  }, [isCheckingAll, siteFilter, favorites, checkSingleManga]);

  // Stop checking
  const handleStopCheck = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsCheckingAll(false);
    setCheckingProgress(null);
  }, []);

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
          <div className="flex items-center gap-3">
            {/* Subtabs Navigation Slot */}
            {subtabsSlot}

            {/* Quick summary */}
            <span className="text-xs text-on-surface-variant/80 hidden sm:inline-block tabular-nums font-medium pl-2 border-l border-outline-variant/20">
              {t('followedManga.stats.summary', {
                total: stats.total,
                hasNew: stats.hasNewCount,
              })}
            </span>
          </div>
        }
        rightSlot={
          <div className="flex items-center gap-2">
            {queueProcessing ? (
              <button
                type="button"
                onClick={() => onStopQueue?.()}
                className="inline-flex items-center justify-center gap-1.5 h-7 px-3 rounded-lg text-xs font-semibold bg-amber-600 dark:bg-amber-500 text-white hover:opacity-95 shadow-2xs transition-all active:scale-95 cursor-pointer shrink-0"
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
                className="inline-flex items-center justify-center gap-1.5 h-7 px-3 rounded-lg text-xs font-semibold bg-primary text-on-primary hover:opacity-95 shadow-2xs transition-all active:scale-95 cursor-pointer shrink-0"
                data-tooltip={t('followedManga.actions.resumeDownload')}
                aria-label={t('followedManga.actions.resumeQueue', { count: unfinishedQueueCount })}
              >
                <span className="material-symbols-outlined text-[15px] leading-none">
                  play_arrow
                </span>
                <span>{t('followedManga.actions.resumeQueue', { count: unfinishedQueueCount })}</span>
              </button>
            ) : stats.hasNewCount > 0 ? (
              <button
                type="button"
                disabled={isEnqueuingAll || isCheckingAll}
                onClick={handleEnqueueAllNew}
                className="inline-flex items-center justify-center gap-1.5 h-7 px-3 rounded-lg text-xs font-semibold bg-emerald-600 dark:bg-emerald-500 text-white hover:opacity-95 shadow-2xs transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none cursor-pointer shrink-0"
                data-tooltip={t('followedManga.actions.enqueueAllTooltip', {
                  mangaCount: stats.hasNewCount,
                  chapterCount: totalPendingChaptersCount,
                })}
                aria-label={t('followedManga.actions.enqueueAllTooltip', {
                  mangaCount: stats.hasNewCount,
                  chapterCount: totalPendingChaptersCount,
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
                        count: stats.hasNewCount,
                      })}
                </span>
              </button>
            ) : null}

            {isCheckingAll ? (
              <button
                type="button"
                onClick={handleStopCheck}
                className="inline-flex items-center justify-center gap-1.5 h-7 px-3 rounded-lg text-xs font-semibold bg-error text-on-error hover:opacity-95 shadow-2xs transition-all active:scale-95 cursor-pointer"
                aria-label={t('followedManga.actions.stop')}
              >
                <span className="material-symbols-outlined text-[15px]">stop</span>
                <span>{t('followedManga.actions.stop')}</span>
              </button>
            ) : !queueProcessing && unfinishedQueueCount === 0 ? (
              <button
                type="button"
                onClick={handleCheckAll}
                disabled={favorites.length === 0 || isEnqueuingAll}
                className="inline-flex items-center justify-center gap-1.5 h-7 px-3.5 rounded-lg text-xs font-semibold bg-primary text-on-primary hover:opacity-95 shadow-2xs transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                aria-label={t('followedManga.actions.checkAll')}
              >
                <span className="material-symbols-outlined text-[15px]">sync</span>
                <span>{t('followedManga.actions.checkAll')}</span>
              </button>
            ) : null}

            <ViewModeToggle
              viewMode={viewMode}
              onChange={handleViewModeChange}
              size="md"
            />
          </div>
        }
      />

      {/* Mini Progress Banner when scanning is active */}
      {isCheckingAll && checkingProgress && (
        <div className="px-4 py-1.5 bg-primary/10 border-b border-primary/20 flex items-center justify-between text-xs transition-all">
          <div className="flex items-center gap-2 text-primary font-medium min-w-0 pr-4">
            <span className="material-symbols-outlined text-[16px] animate-spin shrink-0">
              sync
            </span>
            <span className="truncate">
              {t('followedManga.actions.checking', {
                title: checkingProgress.item?.title || '...',
                current: checkingProgress.current,
                total: checkingProgress.total,
              })}
            </span>
          </div>
          <div className="w-40 sm:w-56 h-1.5 rounded-full bg-surface-container-highest overflow-hidden shrink-0">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{
                width: `${Math.round((checkingProgress.current / checkingProgress.total) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}


      {/* 2-Column StudioLayout Frame */}
      <StudioLayout.Body>
        {/* Left Sidebar: Filters & Connectors */}
        <StudioLayout.LeftSidebar
          open={showLeftSidebar}
          width={leftWidth}
          onResizeStart={handleLeftResizeStart}
          className="bg-surface-container-low/50 relative border-r border-outline-variant/20 flex flex-col overflow-visible"
        >
          {/* Search Box */}
          <div className="p-3 border-b border-outline-variant/15">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-2.5 top-2 text-[18px] text-on-surface-variant/60 pointer-events-none">
                search
              </span>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t('followedManga.searchPlaceholder')}
                className="w-full h-8 pl-8 pr-3 rounded-lg text-xs bg-surface-container-highest border border-outline-variant/20 focus:outline-none focus:border-primary text-on-surface placeholder:text-on-surface-variant/50 transition-colors"
              />
            </div>
          </div>

          {/* Filter Groups & Connectors List */}
          <div className="p-3 space-y-4 flex-1 flex flex-col">
            {/* Status Filter Group */}
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/60 mb-1.5 px-1">
                {t('followedManga.filter.status')}
              </div>
              <div className="space-y-0.5 text-xs">
                {/* All */}
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    statusFilter === 'all'
                      ? 'bg-primary/15 text-primary font-semibold'
                      : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px]">menu</span>
                    <span>{t('followedManga.filter.all')}</span>
                  </span>
                  <span className="px-1.5 py-0.5 rounded-md bg-surface-container-highest text-[10px] tabular-nums font-semibold">
                    {stats.total}
                  </span>
                </button>

                {/* Has New */}
                <button
                  type="button"
                  onClick={() => setStatusFilter('hasNew')}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    statusFilter === 'hasNew'
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold'
                      : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                    <span>{t('followedManga.filter.hasNew')}</span>
                  </span>
                  <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold text-[10px] tabular-nums">
                    {stats.hasNewCount}
                  </span>
                </button>

                {/* Unread */}
                <button
                  type="button"
                  onClick={() => setStatusFilter('unread')}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    statusFilter === 'unread'
                      ? 'bg-primary/15 text-primary font-semibold'
                      : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px]">auto_stories</span>
                    <span>{t('followedManga.filter.unread')}</span>
                  </span>
                </button>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-outline-variant/15 -mx-1" />

            {/* Web Sources Filter Group */}
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/60 mb-1.5 px-1">
                {t('followedManga.filter.bySource')}
              </div>
              <div className="space-y-0.5 text-xs">
                {/* All Sources */}
                <button
                  type="button"
                  onClick={() => setSiteFilter('')}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    siteFilter === ''
                      ? 'bg-primary/15 text-primary font-semibold'
                      : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                    <span>{t('followedManga.filter.allSources')}</span>
                  </span>
                  <span className="px-1.5 py-0.5 rounded-md bg-surface-container-highest text-[10px] tabular-nums font-semibold opacity-75">
                    {stats.total}
                  </span>
                </button>

                {/* Breakdown by connector */}
                {stats.siteBreakdown.map((s) => {
                  const label = siteMap.labels.get(s.siteId) || s.siteId;
                  const icon = siteMap.icons.get(s.siteId);
                  const isSelected = siteFilter === s.siteId;
                  return (
                    <button
                      key={s.siteId}
                      type="button"
                      onClick={() => setSiteFilter(s.siteId)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-primary/15 text-primary font-semibold'
                          : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                      }`}
                    >
                      <span className="flex items-center gap-1.5 truncate pr-2">
                        {icon ? (
                          <img src={icon} alt="" className="w-3.5 h-3.5 rounded shrink-0" />
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full bg-outline-variant shrink-0" />
                        )}
                        <span className="truncate">{label}</span>
                      </span>
                      <span className="flex items-center gap-1 shrink-0">
                        {s.hasNewCount > 0 && (
                          <span className="px-1 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold tabular-nums">
                            +{s.hasNewCount}
                          </span>
                        )}
                        <span className="text-[10px] tabular-nums opacity-75">{s.count}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Stats Card — Quick summary at bottom */}
            {stats.total > 0 && (
              <div className="mt-auto pt-2">
                <div className="rounded-xl border border-primary/15 bg-primary/5 p-2.5">
                  <div className="text-[10px] font-bold text-primary mb-2 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[13px]">bar_chart</span>
                    {t('followedManga.stats.overviewTitle') || 'Tổng quan'}
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                    <span className="text-on-surface-variant">{t('followedManga.stats.total') || 'Đang theo dõi'}</span>
                    <span className="font-bold text-on-surface text-right tabular-nums">{stats.total}</span>
                    <span className="text-on-surface-variant">{t('followedManga.stats.hasNew') || 'Có chương mới'}</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 text-right tabular-nums">{stats.hasNewCount}</span>
                    {totalPendingChaptersCount > 0 && (
                      <>
                        <span className="text-on-surface-variant">{t('followedManga.stats.pendingChapters') || 'Chờ tải'}</span>
                        <span className="font-bold text-amber-600 dark:text-amber-400 text-right tabular-nums">{totalPendingChaptersCount} ch.</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Standard Resize Splitter */}
          <ResizeSplitter
            variant="overlay"
            side="right"
            onPointerDown={handleLeftResizeStart}
            data-tooltip="Kéo để thay đổi độ rộng sidebar"
          />
        </StudioLayout.LeftSidebar>

        {/* Central Content: Cards Grid */}
        <StudioLayout.Content className="overflow-y-auto custom-scrollbar p-4 sm:p-6 bg-surface">
          {favorites.length === 0 ? (
            <EmptyState
              icon="bookmarks"
              title={t('followedManga.empty.title')}
              description={t('followedManga.empty.description')}
            />
          ) : filteredList.length === 0 ? (
            <EmptyState
              icon="search_off"
              title={t('followedManga.empty.noMatchTitle')}
              description={t('followedManga.empty.noMatchDescription')}
            />
          ) : viewMode === 'list' ? (
            <ul className="flex flex-col gap-2">
              {filteredList.map((item) => {
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
                                    ? t('followedManga.badge.newChapters', { count: pendingNewCount })
                                    : t('followedManga.filter.hasNew')}
                                </span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] text-on-surface-variant/70">
                                <span className="material-symbols-outlined text-[13px] text-emerald-500 leading-none">check</span>
                                <span>{t('followedManga.badge.upToDate')}</span>
                              </span>
                            )}
                            <span>•</span>
                            <span className="tabular-nums">{remoteCount} chapters</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* List action buttons */}
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
                              className={`h-8 w-8 shrink-0 rounded-lg transition-all flex items-center justify-center cursor-pointer shadow-2xs disabled:opacity-50 ${
                                hasNew
                                  ? 'border border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25'
                                  : 'border border-outline-variant/20 bg-surface-container-highest hover:bg-surface-bright text-on-surface-variant hover:text-on-surface'
                              }`}
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

                          <button
                            type="button"
                            disabled={isChecking}
                            onClick={() => handleRecheckSingle(item)}
                            className="h-8 w-8 shrink-0 rounded-lg border border-outline-variant/20 bg-surface-container-highest hover:bg-surface-bright text-on-surface-variant flex items-center justify-center transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none cursor-pointer shadow-2xs"
                            data-tooltip={t('followedManga.actions.recheckSingle')}
                            aria-label={t('followedManga.actions.recheckSingle')}
                          >
                            <span
                              className={`material-symbols-outlined text-[15px] leading-none ${
                                isChecking ? 'animate-spin text-primary' : ''
                              }`}
                            >
                              refresh
                            </span>
                          </button>
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
              {filteredList.map((item) => (
                <FollowedMangaCard
                  key={item.id}
                  item={item}
                  sync={activeSyncById[item.id]}
                  siteLabel={siteMap.labels.get(item.siteId) || item.siteId}
                  siteIcon={siteMap.icons.get(item.siteId)}
                  isChecking={singleCheckingId === item.id}
                  isLoading={loadingMangaId === item.id}
                  isEnqueuing={enqueuingMangaId === item.id}
                  downloadState={getDownloadState(item)}
                  onStartQueue={onStartQueue}
                  onStopQueue={onStopQueue}
                  onOpenManga={handleOpenManga}
                  onReadNow={handleReadNow}
                  onEnqueueNew={handleEnqueueNew}
                  onRecheck={handleRecheckSingle}
                  onRemove={handleRemove}
                />
              ))}
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
