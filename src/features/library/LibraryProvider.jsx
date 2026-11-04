import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useI18n } from '../../context/I18nContext';
import { useAppLog } from '../../shared';
import { useSettings } from '../settings';
import { useDownload } from '../download';
import { useReader } from '../reader';
import { useShellNav } from '../shell';
import {
  loadFavoriteAutoCheckEnabled,
  saveFavoriteAutoCheckEnabled,
  loadFavoriteAutoCheckIntervalMin,
  saveFavoriteAutoCheckIntervalMin,
  loadFavoriteAutoDownloadEnabled,
  saveFavoriteAutoDownloadEnabled,
  loadFavoriteAutoDownloadMode,
  saveFavoriteAutoDownloadMode,
  loadFavoriteAutoDownloadWorkflowId,
  saveFavoriteAutoDownloadWorkflowId,
} from '../../utils/appSettings';
import { loadSavedWorkflows } from '../workflow';
import { computeFavoriteNotifyAfterSync } from './favoriteNotifyState';
import {
  loadBellReadRemoteById,
  saveBellReadRemoteById,
  loadBellPanelRemovedRemoteById,
  saveBellPanelRemovedRemoteById,
} from './favoriteBellDismissed';
import { runFavoriteChapterFrontierMigration } from './favoriteBellStorage';
import {
  isFavoriteBellPanelVisible,
  isFavoriteBellUnread,
} from './favoriteTabBadge';
const LibraryContext = createContext(null);

const favoriteBellChapterFrontierMigrated = runFavoriteChapterFrontierMigration();

const FAVORITES_KEY = 'mangaFavorites';

function normalizeFavorite(f) {
  if (!f || typeof f !== 'object') return f;
  return { ...f, notifyWatch: f.notifyWatch === true };
}

function loadFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map(normalizeFavorite);
  } catch {
    return [];
  }
}

function makeFavoriteId(manga, siteFallback) {
  const url = String(manga?.mangaUrl || '').trim();
  const sid = String(manga?.siteId || siteFallback || '').trim();
  return `${sid}::${url}`;
}

export function LibraryProvider({ children }) {
  const { t } = useI18n();
  const { appendLog } = useAppLog();
  const { savePath } = useSettings();
  const { setMenuView } = useShellNav();
  const {
    manga,
    chapters,
    site,
    sourceUrl,
    queue,
    mangadexLanguage,
    comickLanguage,
    mangaballLanguage,
    hydrateSession,
    loadManga: loadMangaWithParams,
    enqueueChapters,
    queueProcessing,
    startQueue,
  } = useDownload();
  const { openReader, openOfflineReader, readerStreamingRead } = useReader();

  const [favoriteAutoCheckEnabled, setFavoriteAutoCheckEnabled] = useState(() => loadFavoriteAutoCheckEnabled());
  const [favoriteAutoCheckIntervalMin, setFavoriteAutoCheckIntervalMin] = useState(() =>
    loadFavoriteAutoCheckIntervalMin()
  );
  const [favoriteAutoDownloadEnabled, setFavoriteAutoDownloadEnabled] = useState(() =>
    loadFavoriteAutoDownloadEnabled()
  );
  const [favoriteAutoDownloadMode, setFavoriteAutoDownloadMode] = useState(() =>
    loadFavoriteAutoDownloadMode()
  );
  const [favoriteAutoDownloadWorkflowId, setFavoriteAutoDownloadWorkflowId] = useState(() =>
    loadFavoriteAutoDownloadWorkflowId()
  );
  const [favorites, setFavorites] = useState(() => loadFavorites());
  /** After Fetch all: compare remote vs finished chapters on disk (by id). */
  const [favoriteSyncById, setFavoriteSyncById] = useState({});
  const [bellReadRemoteById, setBellReadRemoteById] = useState(() =>
    favoriteBellChapterFrontierMigrated ? {} : loadBellReadRemoteById()
  );
  const [bellPanelRemovedRemoteById, setBellPanelRemovedRemoteById] = useState(() =>
    favoriteBellChapterFrontierMigrated ? {} : loadBellPanelRemovedRemoteById()
  );
  const [fetchAllFavoritesBusy, setFetchAllFavoritesBusy] = useState(false);
  const fetchAllFavoritesBusyRef = useRef(false);
  /** Finished chapter count on disk (download_db) — disable Read / CBZ when 0. */
  const [localDownloadedChapterCount, setLocalDownloadedChapterCount] = useState(0);
  /** Drawer "available chapters": null = loading download_db; Set = finished chapter URLs. */
  const [readChapterAllowedUrls, setReadChapterAllowedUrls] = useState(null);

  useEffect(() => {
    saveFavoriteAutoCheckEnabled(favoriteAutoCheckEnabled);
  }, [favoriteAutoCheckEnabled]);

  useEffect(() => {
    saveFavoriteAutoCheckIntervalMin(favoriteAutoCheckIntervalMin);
  }, [favoriteAutoCheckIntervalMin]);

  useEffect(() => {
    saveFavoriteAutoDownloadEnabled(favoriteAutoDownloadEnabled);
  }, [favoriteAutoDownloadEnabled]);

  useEffect(() => {
    saveFavoriteAutoDownloadMode(favoriteAutoDownloadMode);
  }, [favoriteAutoDownloadMode]);

  useEffect(() => {
    saveFavoriteAutoDownloadWorkflowId(favoriteAutoDownloadWorkflowId);
  }, [favoriteAutoDownloadWorkflowId]);

  useEffect(() => {
    fetchAllFavoritesBusyRef.current = fetchAllFavoritesBusy;
  }, [fetchAllFavoritesBusy]);

  const toggleFavorite = useCallback(() => {
    if (!manga?.title) return;
    const mangaUrl = String(manga.mangaUrl || sourceUrl || '').trim();
    if (!mangaUrl) return;
    const id = makeFavoriteId({ ...manga, mangaUrl }, site);
    setFavorites((prev) => {
      const exists = prev.some((f) => f.id === id);
      let next;
      if (exists) {
        next = prev.filter((f) => f.id !== id);
      } else {
        next = [
          {
            id,
            mangaUrl,
            siteId: manga.siteId || site,
            title: manga.title,
            coverUrl: manga.coverUrl || '',
            chapterCount: chapters.length,
            addedAt: new Date().toISOString(),
            notifyWatch: false,
          },
          ...prev,
        ].slice(0, 500);
      }
      try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      } catch {
        /* ignore quota */
      }
      return next;
    });
  }, [manga, chapters.length, site, sourceUrl]);

  const toggleFavoriteFromLatest = useCallback((mangaData, siteId) => {
    if (!mangaData?.title || !mangaData?.mangaUrl || !siteId) return;

    const mangaUrl = String(mangaData.mangaUrl).trim();
    const id = makeFavoriteId({ ...mangaData, mangaUrl }, siteId);

    setFavorites((prev) => {
      const exists = prev.some((f) => f.id === id);
      let next;
      if (exists) {
        next = prev.filter((f) => f.id !== id);
      } else {
        next = [
          {
            id,
            mangaUrl,
            siteId: siteId,
            title: mangaData.title,
            coverUrl: mangaData.coverUrl || '',
            chapterCount: 0,
            addedAt: new Date().toISOString(),
            notifyWatch: false,
          },
          ...prev,
        ].slice(0, 500);
      }
      try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      } catch {
        /* ignore quota */
      }
      return next;
    });
  }, []);

  const removeFavorite = useCallback((id) => {
    setFavorites((prev) => {
      const next = prev.filter((f) => f.id !== id);
      try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const toggleFavoriteNotifyWatch = useCallback((id) => {
    setFavorites((prev) => {
      const next = prev.map((f) =>
        f.id === id ? { ...f, notifyWatch: !f.notifyWatch } : f
      );
      try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const favoritesNotifyWatchCount = useMemo(
    () => favorites.filter((f) => f.notifyWatch).length,
    [favorites]
  );

  const favoritesWithNewChaptersList = useMemo(
    () =>
      favorites
        .filter((f) => {
          const s = favoriteSyncById[f.id];
          return isFavoriteBellPanelVisible(f.id, s, bellPanelRemovedRemoteById);
        })
        .map((f) => {
          const s = favoriteSyncById[f.id];
          return {
            ...f,
            _sync: s,
            _bellUnread: isFavoriteBellUnread(f.id, s, bellReadRemoteById),
          };
        }),
    [favorites, favoriteSyncById, bellReadRemoteById, bellPanelRemovedRemoteById]
  );

  const favoritesWithNewList = useMemo(
    () =>
      favorites
        .filter((f) => favoriteSyncById[f.id]?.hasNew)
        .map((f) => ({
          id: f.id,
          title: f.title,
          coverUrl: f.coverUrl,
          mangaUrl: f.mangaUrl,
          hasNew: true,
        })),
    [favorites, favoriteSyncById]
  );

  const markBellReadForItems = useCallback((items) => {
    if (!items?.length) return;
    setBellReadRemoteById((prev) => {
      const next = { ...prev };
      for (const it of items) {
        const s = it?._sync ?? favoriteSyncById[it?.id];
        const rh =
          typeof s?.remoteHighestChapterNumber === 'number'
            ? s.remoteHighestChapterNumber
            : null;
        if (typeof rh === 'number') next[it.id] = rh;
      }
      saveBellReadRemoteById(next);
      return next;
    });
  }, [favoriteSyncById]);

  const handleBellMarkReadOne = useCallback(
    (item) => {
      if (!item?.id) return;
      markBellReadForItems([item]);
    },
    [markBellReadForItems]
  );

  const handleBellMarkUnreadOne = useCallback((item) => {
    if (!item?.id) return;
    setBellReadRemoteById((prev) => {
      const next = { ...prev };
      delete next[item.id];
      saveBellReadRemoteById(next);
      return next;
    });
  }, []);

  const handleBellMarkAllRead = useCallback(() => {
    markBellReadForItems(favoritesWithNewChaptersList);
  }, [markBellReadForItems, favoritesWithNewChaptersList]);

  const markBellPanelRemovedForItems = useCallback((items) => {
    if (!items?.length) return;
    setBellPanelRemovedRemoteById((prev) => {
      const next = { ...prev };
      for (const it of items) {
        const s = it?._sync ?? favoriteSyncById[it?.id];
        const rh =
          typeof s?.remoteHighestChapterNumber === 'number'
            ? s.remoteHighestChapterNumber
            : null;
        if (typeof rh === 'number') next[it.id] = rh;
      }
      saveBellPanelRemovedRemoteById(next);
      return next;
    });
  }, [favoriteSyncById]);

  const handleBellRemoveOne = useCallback(
    (item) => {
      if (!item?.id) return;
      markBellPanelRemovedForItems([item]);
    },
    [markBellPanelRemovedForItems]
  );

  const handleBellRemoveAll = useCallback(() => {
    markBellPanelRemovedForItems(favoritesWithNewChaptersList);
  }, [markBellPanelRemovedForItems, favoritesWithNewChaptersList]);

  const isMangaFavorite = useMemo(() => {
    if (!manga) return false;
    const mangaUrl = String(manga.mangaUrl || sourceUrl || '').trim();
    if (!mangaUrl) return false;
    const id = makeFavoriteId({ ...manga, mangaUrl }, site);
    return favorites.some((f) => f.id === id);
  }, [manga, favorites, site, sourceUrl]);

  const queueDownloadSigForCurrentManga = useMemo(() => {
    const mu = String(manga?.mangaUrl || sourceUrl || '').trim();
    if (!mu) return '';
    const g = queue.find((x) => x.mangaUrl === mu);
    if (!g?.chapters?.length) return '';
    return g.chapters.map((c) => `${String(c.chapterUrl)}:${String(c.status)}`).join('\n');
  }, [queue, manga?.mangaUrl, sourceUrl]);

  /** Finished chapter count on disk; offline-only uses the in-memory chapter list length. */
  const downloadedCountForReaderCbz = useMemo(() => {
    if (manga?.offlineOnly) return chapters.length;
    return localDownloadedChapterCount;
  }, [manga?.offlineOnly, chapters.length, localDownloadedChapterCount]);

  useEffect(() => {
    let cancelled = false;
    const api = typeof window !== 'undefined' ? window.electronAPI : null;
    if (!api?.countLocalChapters) {
      setLocalDownloadedChapterCount(0);
      return undefined;
    }
    const base = String(savePath || '').trim();
    const mt = String(manga?.title || '').trim();
    if (!base || !mt) {
      setLocalDownloadedChapterCount(0);
      return undefined;
    }
    if (manga?.offlineOnly) {
      setLocalDownloadedChapterCount(0);
      return undefined;
    }
    (async () => {
      try {
        const r = await api.countLocalChapters(base, mt);
        if (cancelled) return;
        setLocalDownloadedChapterCount(r?.ok && typeof r.count === 'number' ? r.count : 0);
      } catch {
        if (!cancelled) setLocalDownloadedChapterCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [savePath, manga?.title, manga?.offlineOnly, queueDownloadSigForCurrentManga]);

  useEffect(() => {
    let cancelled = false;
    const api = typeof window !== 'undefined' ? window.electronAPI : null;
    if (!api?.filterChaptersWithLocalImages) {
      setReadChapterAllowedUrls(new Set());
      return undefined;
    }
    const base = String(savePath || '').trim();
    const mt = String(manga?.title || '').trim();
    if (!base || !mt || !chapters.length) {
      setReadChapterAllowedUrls(new Set());
      return undefined;
    }
    if (manga?.offlineOnly) {
      setReadChapterAllowedUrls(new Set(chapters.map((c) => String(c.url || ''))));
      return undefined;
    }
    setReadChapterAllowedUrls(null);
    (async () => {
      try {
        const r = await api.filterChaptersWithLocalImages(savePath, mt, chapters);
        if (cancelled) return;
        if (r?.ok && Array.isArray(r.chapters)) {
          setReadChapterAllowedUrls(new Set(r.chapters.map((c) => String(c.url || ''))));
        } else {
          setReadChapterAllowedUrls(new Set());
        }
      } catch {
        if (!cancelled) setReadChapterAllowedUrls(new Set());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    savePath,
    manga?.title,
    manga?.offlineOnly,
    chapters,
    queueDownloadSigForCurrentManga,
    readerStreamingRead,
  ]);

  const withOfflineCover = useCallback((mangaObj, localCoverPath) => {
    if (!mangaObj || typeof mangaObj !== 'object') return mangaObj;
    const cover_url = String(mangaObj.coverUrl || '').trim();
    if (cover_url) return mangaObj;
    const local_cover = String(localCoverPath || '').trim();
    if (!local_cover) return mangaObj;
    return { ...mangaObj, coverUrl: local_cover, localCoverPath: local_cover };
  }, []);

  const fetchMangaFromFavorite = useCallback(
    async (item) => {
      const url = String(item?.mangaUrl || '').trim();
      if (!url) return;
      const siteId = String(item?.siteId ?? item?.site ?? '').trim();
      setMenuView('home');
      await loadMangaWithParams(siteId, url, { force: true });
    },
    [loadMangaWithParams, setMenuView]
  );

  const handleBellFetchFavorite = useCallback(
    (item) => {
      if (!item) return;
      handleBellMarkReadOne(item);
      const { _sync, _bellUnread, ...fav } = item;
      fetchMangaFromFavorite(fav);
    },
    [fetchMangaFromFavorite, handleBellMarkReadOne]
  );

  const readFromFavorite = useCallback(
    async (item) => {
      const url = String(item?.mangaUrl || '').trim();
      if (!url) return;
      const siteId = String(item?.siteId ?? item?.site ?? '').trim();
      const mangaTitleHint = String(item?.title || '').trim();
      const result = await loadMangaWithParams(siteId, url, {
        force: false,
        mangaTitleHint,
      });
      if (!result?.ok) return;
      if (!result.chapters?.length) {
        appendLog(t('app.log.favoriteReadNoChapters'), 'warn');
        return;
      }
      openReader();
    },
    [loadMangaWithParams, openReader, appendLog, t]
  );

  const readFromOfflineLibrary = useCallback(
    async (item) => {
      const api = window.electronAPI;
      if (!api?.loadMangaOfflineFromDisk && !api?.loadMangaOfflineFromAbsolutePath) return;
      let res;
      if (item?.absolutePath && api?.loadMangaOfflineFromAbsolutePath) {
        res = await api.loadMangaOfflineFromAbsolutePath(item.absolutePath);
      } else if (item?.source === 'extra' || item?.source === 'recentExtracted') {
        res = await api.loadMangaOfflineFromAbsolutePath(item.absolutePath);
      } else {
        const base = String(savePath || '').trim();
        if (!base) {
          appendLog(t('offlineLibrary.needSavePath'), 'warn');
          return;
        }
        res = await api.loadMangaOfflineFromDisk(base, item.mangaTitle);
      }
      if (!res?.ok || !res.chapters?.length) {
        appendLog(res?.error || t('offlineLibrary.openFailed'), 'warn');
        return;
      }
      const offline_manga = withOfflineCover(res.manga, res.localCoverPath);
      if (typeof openOfflineReader === 'function') {
        openOfflineReader({
          manga: offline_manga,
          chapters: res.chapters,
          initialChapterIndex: 0,
        });
      } else {
        openReader();
      }
      appendLog(
        t('app.logOpenedOffline', {
          title: offline_manga?.title || '',
          count: res.chapters.length,
        }),
        'success'
      );
    },
    [savePath, appendLog, t, openReader, openOfflineReader, withOfflineCover]
  );

  const fetchMangaFromOfflineLibrary = useCallback(
    async (row) => {
      const url = String(row?.mangaUrl || '').trim();
      if (!url) return;
      const siteId = String(row?.siteId ?? '').trim();
      setMenuView('home');
      await loadMangaWithParams(siteId, url, { force: true });
    },
    [loadMangaWithParams, setMenuView]
  );

  const enqueueFavoritePendingChapters = useCallback(
    async (row) => {
      if (!row) return;
      const pendingList = row.sync?.pendingChapters;
      const title = String(row.mangaTitle || row.title || '').trim();
      const url = String(row.mangaUrl || row.url || '').trim();
      const siteId = String(row.siteId || '').trim();
      const coverUrl = row.coverUrl || row.localCoverPath || '';

      if (Array.isArray(pendingList) && pendingList.length > 0 && url && siteId) {
        const { addedCount } = enqueueChapters(
          {
            mangaTitle: title,
            mangaUrl: url,
            site: siteId,
            coverUrl,
          },
          pendingList
        );
        if (addedCount > 0) {
          appendLog(
            t('favorites.enqueuedPendingSuccess', { count: addedCount, title }),
            'success'
          );
          const targetId = row.favoriteId || row.id;
          if (targetId) {
            setFavoriteSyncById((prev) => ({
              ...prev,
              [targetId]: {
                ...prev[targetId],
                remoteCount: 0,
                hasNew: false,
                pendingChapters: [],
              },
            }));
          }
        } else {
          appendLog(t('app.log.chaptersAlreadyInQueue'), 'info');
        }
      } else {
        if (row.source === 'favorite') {
          fetchMangaFromFavorite(row);
        } else {
          fetchMangaFromOfflineLibrary(row);
        }
      }
    },
    [enqueueChapters, appendLog, t, fetchMangaFromFavorite, fetchMangaFromOfflineLibrary]
  );

  const openOfflineFolderPath = useCallback(async (absolutePath) => {
    const api = window.electronAPI;
    if (!api?.openPath) return;
    await api.openPath(String(absolutePath || '').trim());
  }, []);

  const readFromHistory = useCallback(
    async (row) => {
      const url = String(row?.mangaUrl || '').trim();
      if (!url) return;
      const siteId = String(row?.siteId ?? '').trim();
      const mangaTitleHint = String(row?.mangaTitle || '').trim();
      const result = await loadMangaWithParams(siteId, url, {
        force: false,
        mangaTitleHint,
      });
      if (!result?.ok || !result.chapters?.length) return;
      const chapterUrl = String(row?.chapterUrl || '').trim();
      let idx = 0;
      if (chapterUrl) {
        const i = result.chapters.findIndex((c) => c.url === chapterUrl);
        if (i >= 0) idx = i;
      }
      openReader(idx);
    },
    [loadMangaWithParams, openReader]
  );

  const handleFetchAllFavorites = useCallback(
    async (siteFilter = '', options = {}) => {
      const { silent = false, fromBackground = false } = options;
      const api = window.electronAPI;
      const base = savePath.trim();
      if (!api?.loadManga || !api?.computeFavoriteChapterSync) {
        if (!silent) appendLog(t('app.log.electronCheckFavorites'), 'warn');
        return;
      }
      if (!base) {
        if (!silent) appendLog(t('offlineLibrary.needSavePath'), 'warn');
        return;
      }
      if (fetchAllFavoritesBusyRef.current) {
        return;
      }
      let list;
      if (fromBackground) {
        list = favorites.filter((f) => f.notifyWatch === true);
      } else if (siteFilter) {
        list = favorites.filter((f) => String(f.siteId || '') === siteFilter);
      } else {
        list = favorites;
      }
      if (!list.length) return;

      setFetchAllFavoritesBusy(true);
      setFavoriteSyncById((prev) => {
        const next = { ...prev };
        for (const item of list) {
          delete next[item.id];
        }
        return next;
      });

      const sync = {};
      const chapterCountUpdates = {};
      const autoDownloadJobs = [];

      try {
        for (const item of list) {
          const url = String(item.mangaUrl || '').trim();
          if (!url) {
            sync[item.id] = {
              remoteCount: 0,
              localCount: 0,
              hasNew: false,
              remoteHighestChapterNumber: -1,
              error: t('favorites.syncMissingUrl'),
              checkedAt: Date.now(),
            };
            continue;
          }

          if (item.siteId === 'local' || !url.startsWith('http')) {
            sync[item.id] = {
              remoteCount: 0,
              localCount: 0,
              hasNew: false,
              remoteHighestChapterNumber: -1,
              checkedAt: Date.now(),
            };
            continue;
          }

          const loadOpts =
            item.siteId === 'mangadex'
              ? { mangadexLanguage }
              : item.siteId === 'comick'
              ? { comickLanguage }
              : item.siteId === 'mangaball'
              ? { mangaballLanguage }
              : {};
          const res = await api.loadManga(item.siteId || '', url, loadOpts);
          if (!res?.ok) {
            sync[item.id] = {
              remoteCount: 0,
              localCount: 0,
              hasNew: false,
              remoteHighestChapterNumber: -1,
              error: res?.error || t('favorites.syncFetchError'),
              checkedAt: Date.now(),
            };
            continue;
          }

          const frontierRes = await api.computeFavoriteChapterSync(
            base,
            item.title,
            res.chapters || [],
          );
          if (!frontierRes?.ok) {
            sync[item.id] = {
              remoteCount: 0,
              localCount: 0,
              hasNew: false,
              remoteHighestChapterNumber: -1,
              error: frontierRes?.error || t('favorites.syncFetchError'),
              checkedAt: Date.now(),
            };
            continue;
          }

          const pendingNewCount =
            typeof frontierRes.pendingNewCount === 'number' ? frontierRes.pendingNewCount : 0;
          const localCount =
            typeof frontierRes.localCount === 'number' ? frontierRes.localCount : 0;
          const remoteHighestChapterNumber =
            typeof frontierRes.remoteHighestChapterNumber === 'number'
              ? frontierRes.remoteHighestChapterNumber
              : -1;
          const totalRemoteCount =
            typeof frontierRes.totalRemoteCount === 'number'
              ? frontierRes.totalRemoteCount
              : (res.chapters || []).length;

          chapterCountUpdates[item.id] = totalRemoteCount;
          const pendingChapters = Array.isArray(frontierRes.pendingChapters) ? frontierRes.pendingChapters : [];
          sync[item.id] = {
            remoteCount: pendingNewCount,
            localCount,
            hasNew: pendingNewCount > 0,
            remoteHighestChapterNumber,
            pendingChapters,
            checkedAt: Date.now(),
          };

          if (favoriteAutoCheckEnabled && favoriteAutoDownloadEnabled && pendingNewCount > 0 && pendingChapters.length > 0) {
            autoDownloadJobs.push({
              item,
              url,
              newChapters: pendingChapters,
            });
          }
        }

        setFavorites((prev) => {
          const next = prev.map((f) =>
            chapterCountUpdates[f.id] != null ? { ...f, chapterCount: chapterCountUpdates[f.id] } : f
          );
          try {
            localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
          } catch {
            /* ignore */
          }
          return next;
        });

        setFavoriteSyncById((prev) => ({ ...prev, ...sync }));

        if (!fromBackground) {
          setBellReadRemoteById((prev) => {
            const next = { ...prev };
            let changed = false;
            for (const [id, row] of Object.entries(sync)) {
              if (row?.hasNew && id in next) {
                delete next[id];
                changed = true;
              }
            }
            if (changed) saveBellReadRemoteById(next);
            return changed ? next : prev;
          });
        }

        computeFavoriteNotifyAfterSync(sync, favorites, {
          manual: !fromBackground,
          fromBackground,
        });

        if (autoDownloadJobs.length > 0) {
          if (favoriteAutoDownloadMode === 'workflow') {
            const savedWorkflows = loadSavedWorkflows();
            const targetWorkflow = savedWorkflows.find((w) => w.id === favoriteAutoDownloadWorkflowId);
            if (targetWorkflow && Array.isArray(targetWorkflow.nodes) && targetWorkflow.nodes.length > 0) {
              for (const job of autoDownloadJobs) {
                const overriddenNodes = targetWorkflow.nodes.map((node) => {
                  if (node.type === 'manual_trigger') {
                    return {
                      ...node,
                      data: {
                        ...node.data,
                        defaultUrl: job.url,
                        mangaTitle: job.item.title,
                        coverUrl: job.item.coverUrl || '',
                        siteId: job.item.siteId,
                        cachedChapters: job.newChapters,
                      },
                    };
                  }
                  return node;
                });
                const runId = `fav_auto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                if (api?.workflowRun) {
                  try {
                    await api.workflowRun({
                      runId,
                      graph: { nodes: overriddenNodes, edges: targetWorkflow.edges || [] },
                    });
                    appendLog(
                      t('app.log.favoritesAutoDownloadWorkflowStarted', {
                        name: targetWorkflow.name,
                        count: job.newChapters.length,
                        title: job.item.title,
                      }),
                      'success'
                    );
                  } catch (err) {
                    appendLog(`Workflow error (${job.item.title}): ${err?.message || err}`, 'error');
                  }
                }
              }
            } else {
              for (const job of autoDownloadJobs) {
                appendLog(
                  t('app.log.favoritesAutoDownloadWorkflowNotFound', { title: job.item.title }),
                  'warn'
                );
              }
            }
          } else {
            // Mode === 'queue' (default)
            let totalAdded = 0;
            for (const job of autoDownloadJobs) {
              const { addedCount } = enqueueChapters(
                {
                  mangaTitle: job.item.title,
                  mangaUrl: job.url,
                  site: job.item.siteId,
                  coverUrl: job.item.coverUrl || '',
                },
                job.newChapters
              );
              if (addedCount > 0) {
                totalAdded += addedCount;
                appendLog(
                  t('app.log.favoritesAutoDownloadEnqueued', { count: addedCount, title: job.item.title }),
                  'success'
                );
              }
            }
            if (totalAdded > 0 && typeof startQueue === 'function') {
              setTimeout(() => {
                startQueue();
              }, 50);
            }
          }
        }

        const withNew = Object.values(sync).filter((x) => x.hasNew).length;
        if (!silent) {
          appendLog(
            withNew
              ? t('app.log.favoritesCheckedWithNew', { total: list.length, withNew })
              : t('app.log.favoritesCheckedNoNew', { total: list.length }),
            'success'
          );
        }
      } catch (e) {
        appendLog(String(e?.message || e), 'error');
      } finally {
        setFetchAllFavoritesBusy(false);
      }
    },
    [
      savePath,
      favorites,
      appendLog,
      t,
      mangadexLanguage,
      comickLanguage,
      mangaballLanguage,
      favoriteAutoCheckEnabled,
      favoriteAutoDownloadEnabled,
      favoriteAutoDownloadMode,
      favoriteAutoDownloadWorkflowId,
      enqueueChapters,
      queueProcessing,
      startQueue,
    ]
  );

  const handleFetchAllFavoritesRef = useRef(handleFetchAllFavorites);
  handleFetchAllFavoritesRef.current = handleFetchAllFavorites;

  useEffect(() => {
    if (!favoriteAutoCheckEnabled) return undefined;
    const api = window.electronAPI;
    if (!api?.loadManga || !api?.computeFavoriteChapterSync) return undefined;
    if (!savePath.trim()) return undefined;
    if (favoritesNotifyWatchCount === 0) return undefined;
    const intervalMs = Math.max(15, favoriteAutoCheckIntervalMin) * 60 * 1000;
    const id = setInterval(() => {
      handleFetchAllFavoritesRef.current?.('', { silent: true, fromBackground: true });
    }, intervalMs);
    return () => clearInterval(id);
  }, [
    favoriteAutoCheckEnabled,
    favoriteAutoCheckIntervalMin,
    savePath,
    favoritesNotifyWatchCount,
    handleFetchAllFavorites,
  ]);

  const value = useMemo(
    () => ({
      favorites,
      toggleFavorite,
      toggleFavoriteFromLatest,
      removeFavorite,
      toggleFavoriteNotifyWatch,
      isMangaFavorite,
      fetchMangaFromFavorite,
      fetchMangaFromOfflineLibrary,
      readFromFavorite,
      readFromOfflineLibrary,
      openOfflineFolderPath,
      readFromHistory,
      handleFetchAllFavorites,
      handleBellFetchFavorite,
      handleBellMarkUnreadOne,
      handleBellMarkAllRead,
      handleBellRemoveOne,
      handleBellRemoveAll,
      favoritesWithNewChaptersList,
      favoritesWithNewList,
      enqueueFavoritePendingChapters,
      downloadedCountForReaderCbz,
      favoriteSyncById,
      fetchAllFavoritesBusy,
      bellReadRemoteById,
      bellPanelRemovedRemoteById,
      favoriteAutoCheckEnabled,
      setFavoriteAutoCheckEnabled,
      favoriteAutoCheckIntervalMin,
      setFavoriteAutoCheckIntervalMin,
      favoriteAutoDownloadEnabled,
      setFavoriteAutoDownloadEnabled,
      favoriteAutoDownloadMode,
      setFavoriteAutoDownloadMode,
      favoriteAutoDownloadWorkflowId,
      setFavoriteAutoDownloadWorkflowId,
      localDownloadedChapterCount,
      readChapterAllowedUrls,
    }),
    [
      favorites,
      toggleFavorite,
      toggleFavoriteFromLatest,
      removeFavorite,
      toggleFavoriteNotifyWatch,
      isMangaFavorite,
      fetchMangaFromFavorite,
      fetchMangaFromOfflineLibrary,
      readFromFavorite,
      readFromOfflineLibrary,
      openOfflineFolderPath,
      readFromHistory,
      handleFetchAllFavorites,
      handleBellFetchFavorite,
      handleBellMarkUnreadOne,
      handleBellMarkAllRead,
      handleBellRemoveOne,
      handleBellRemoveAll,
      favoritesWithNewChaptersList,
      favoritesWithNewList,
      enqueueFavoritePendingChapters,
      downloadedCountForReaderCbz,
      favoriteSyncById,
      fetchAllFavoritesBusy,
      bellReadRemoteById,
      bellPanelRemovedRemoteById,
      favoriteAutoCheckEnabled,
      favoriteAutoCheckIntervalMin,
      favoriteAutoDownloadEnabled,
      favoriteAutoDownloadMode,
      favoriteAutoDownloadWorkflowId,
      localDownloadedChapterCount,
      readChapterAllowedUrls,
    ]
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary() {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error('useLibrary must be used within LibraryProvider');
  return ctx;
}
