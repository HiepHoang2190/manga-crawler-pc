import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadPanelUi, savePanelUi } from '../../../../utils/panelUiPrefs';
import {
  loadHiddenSavePaths,
  saveHiddenSavePaths,
  clearHiddenSavePaths,
  isInsideDirectory,
  unhidePathsForDirectory,
} from '../../../../utils/offlineLibraryHiddenPaths';
import { isFavoriteTabBadgeUnread } from '../../favoriteTabBadge';
import {
  loadExtraPaths,
  saveExtraPaths,
  isExtractedTempRow,
  OFFLINE_SORT_CYCLE,
} from './offlineLibraryUtils';

export function useOfflineLibraryData({
  savePath,
  favorites = [],
  favoriteSyncById = {},
  favoriteTabBadgeReadById = {},
  recentExtractedCbzEntries = [],
  onRemoveRecentExtractedCbzEntry,
  onRemoveFavorite,
  t,
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notification, setNotification] = useState(null);
  const [extraPaths, setExtraPaths] = useState(() => loadExtraPaths());

  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [viewMode, setViewMode] = useState(() => loadPanelUi().offlineRead.viewMode);
  const [sortMode, setSortMode] = useState(() => loadPanelUi().offlineRead.sortMode);
  const isPickingRef = useRef(false);

  // Auto clear error after 10s
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => {
      setError('');
    }, 10000);
    return () => clearTimeout(timer);
  }, [error]);

  // Auto clear notification after 6s
  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => {
      setNotification(null);
    }, 6000);
    return () => clearTimeout(timer);
  }, [notification]);

  useEffect(() => {
    savePanelUi({ offlineRead: { viewMode, sortMode } });
  }, [viewMode, sortMode]);

  const base = String(savePath || '').trim();

  const refresh = useCallback(
    async (options = {}) => {
      const { isBackground = false, force = false } = options;
      const api = typeof window !== 'undefined' ? window.electronAPI : null;
      if (!api?.listLocalMangaLibrary) {
        setError(t('offlineLibrary.electronOnly'));
        setRows([]);
        return;
      }
      setLoading(true);
      if (!isBackground) {
        setError('');
      }
      try {
        if (!base) {
          setRows([]);
          if (!isBackground) {
            setError(t('offlineLibrary.needSavePath'));
          }
          setLoading(false);
          return;
        }
        const r = await api.listLocalMangaLibrary(base, { force });
        const hiddenSave = loadHiddenSavePaths();
        const fromSave = (r?.ok && Array.isArray(r.items) ? r.items : [])
          .filter((it) => !hiddenSave.has(String(it.absolutePath || '').trim()))
          .map((it) => ({
            key: `save:${it.absolutePath}`,
            source: it.archiveKind ? 'extraCbz' : 'save',
            archiveKind: it.archiveKind,
            mangaTitle: it.mangaTitle,
            chapterCount: it.chapterCount,
            hasDb: it.hasDb,
            mangaUrl: it.mangaUrl || '',
            siteId: it.siteId || '',
            absolutePath: it.absolutePath,
            localCoverPath: it.localCoverPath || '',
          }));
        const seen = new Set(fromSave.map((x) => x.absolutePath));
        const fromExtra = [];
        for (const e of extraPaths) {
          const p = String(e.path || '').trim();
          if (!p || seen.has(p)) continue;
          const kind = e.kind === 'cbz' ? 'cbz' : e.kind === 'root' ? 'root' : 'manga';
          if (kind === 'root') {
            seen.add(p);
            const rootR = await api.listLocalMangaLibrary(p, { force });
            if (rootR?.ok && Array.isArray(rootR.items)) {
              for (const it of rootR.items) {
                const cp = String(it.absolutePath || '').trim();
                if (!cp || hiddenSave.has(cp) || seen.has(cp)) continue;
                seen.add(cp);
                fromExtra.push({
                  key: `extra:${cp}`,
                  source: 'extra',
                  mangaTitle: it.mangaTitle,
                  chapterCount: it.chapterCount,
                  hasDb: it.hasDb,
                  mangaUrl: it.mangaUrl || '',
                  siteId: it.siteId || '',
                  absolutePath: cp,
                  localCoverPath: it.localCoverPath || '',
                });
              }
            }
            continue;
          }
          if (kind === 'cbz') {
            seen.add(p);
            const listR = await api.listArchivesInDirectory(p);
            const files = listR?.ok && Array.isArray(listR.files) ? listR.files : [];
            const n = files.length;
            if (n < 1) continue;
            const isPureCbz = files.every((f) => f.format === 'CBZ');
            fromExtra.push({
              key: `extraCbz:${p}`,
              source: 'extraCbz',
              archiveKind: isPureCbz ? 'cbz' : 'archive',
              mangaTitle: p.split(/[/\\]/).filter(Boolean).pop() || p,
              chapterCount: n,
              hasDb: false,
              mangaUrl: '',
              siteId: '',
              absolutePath: p,
              localCoverPath: '',
            });
            continue;
          }
          seen.add(p);
          const loadTest = await api.loadMangaOfflineFromAbsolutePath(p);
          const chapterCount =
            loadTest?.ok && loadTest.chapters?.length ? loadTest.chapters.length : 0;
          if (chapterCount < 1) {
            if (api?.listLocalMangaLibrary) {
              const rootR = await api.listLocalMangaLibrary(p, { force });
              if (rootR?.ok && Array.isArray(rootR.items) && rootR.items.length > 0) {
                for (const it of rootR.items) {
                  const cp = String(it.absolutePath || '').trim();
                  if (!cp || hiddenSave.has(cp) || seen.has(cp)) continue;
                  seen.add(cp);
                  fromExtra.push({
                    key: `extra:${cp}`,
                    source: 'extra',
                    mangaTitle: it.mangaTitle,
                    chapterCount: it.chapterCount,
                    hasDb: it.hasDb,
                    mangaUrl: it.mangaUrl || '',
                    siteId: it.siteId || '',
                    absolutePath: cp,
                    localCoverPath: it.localCoverPath || '',
                  });
                }
              }
            }
            continue;
          }
          const hasDb = Boolean(loadTest?.manga?.mangaUrl);
          fromExtra.push({
            key: `extra:${p}`,
            source: 'extra',
            mangaTitle: loadTest?.manga?.title || p.split(/[/\\]/).filter(Boolean).pop() || p,
            chapterCount,
            hasDb,
            mangaUrl: loadTest?.manga?.mangaUrl || '',
            siteId: loadTest?.manga?.siteId || '',
            absolutePath: p,
            localCoverPath: loadTest?.localCoverPath || '',
          });
        }
        setRows([...fromSave, ...fromExtra].sort((a, b) =>
          a.mangaTitle.localeCompare(b.mangaTitle, undefined, { numeric: true, sensitivity: 'base' })
        ));
      } catch (e) {
        setError(String(e?.message || e));
        setRows([]);
      } finally {
        setLoading(false);
      }
    },
    [base, extraPaths, t]
  );

  const handleManualRefresh = useCallback(async () => {
    clearHiddenSavePaths();
    await refresh({ force: true });
    setNotification({
      type: 'success',
      message: t('offlineLibrary.refreshedSuccess'),
    });
  }, [refresh, t]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto refresh on download completed
  useEffect(() => {
    let timeoutId = null;
    const onDownload = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        refresh({ isBackground: true });
      }, 2000);
    };
    window.addEventListener('crawler:download-completed', onDownload);
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      window.removeEventListener('crawler:download-completed', onDownload);
    };
  }, [refresh]);

  const removeExtra = useCallback(
    (absolutePath) => {
      const next = extraPaths.filter((e) => String(e.path) !== String(absolutePath));
      setExtraPaths(next);
      saveExtraPaths(next);
    },
    [extraPaths]
  );

  const removeFromOfflineList = useCallback(
    async (row) => {
      if (row?.source === 'favorite') {
        onRemoveFavorite?.(row.favoriteId || row.key?.replace('fav:', ''));
        return;
      }
      const p = String(row?.absolutePath || '').trim();
      if (!p) {
        if (row?.favoriteId) {
          onRemoveFavorite?.(row.favoriteId);
        }
        return;
      }
      if (row.source === 'recentExtracted' || row.source === 'recentArchive' || isExtractedTempRow(row)) {
        const api = window.electronAPI;
        const source_file = String(row?.sourceFile || '').trim();
        const related_entries = recentExtractedCbzEntries.filter((entry) => {
          const entry_source_file = String(entry?.sourceFile || '').trim();
          const entry_open_path = String(entry?.openPath || entry?.extractPath || '').trim();
          if (source_file && entry_source_file && entry_source_file === source_file) return true;
          return entry_open_path === p;
        });
        for (const entry of related_entries) {
          const temp_extract_path = String(entry?.extractPath || '').trim();
          const ebook_path = String(entry?.ebookPath || '').trim();
          if (ebook_path && api?.releaseEbook) {
            try {
              await api.releaseEbook(ebook_path);
            } catch {
              /* ignore ebook cleanup errors */
            }
          }
          if (temp_extract_path && api?.releaseCbzTempDir) {
            const r = await api.releaseCbzTempDir(temp_extract_path);
            if (!r?.ok) {
              setError(r?.error || t('offlineLibrary.openFailed'));
              return;
            }
          }
        }
        const direct_extract_path = String(row?.extractPath || '').trim();
        if (direct_extract_path && api?.releaseCbzTempDir) {
          try {
            await api.releaseCbzTempDir(direct_extract_path);
          } catch {
            /* ignore */
          }
        }
        onRemoveRecentExtractedCbzEntry?.(p, source_file);
        await refresh();
        return;
      }
      if (row.source === 'save' || !extraPaths.some((e) => String(e.path) === p)) {
        const s = loadHiddenSavePaths();
        s.add(p);
        saveHiddenSavePaths(s);
        removeExtra(p);
        await refresh();
      } else {
        removeExtra(p);
      }
    },
    [extraPaths, removeExtra, refresh, onRemoveRecentExtractedCbzEntry, t, recentExtractedCbzEntries, onRemoveFavorite]
  );

  const addFolder = useCallback(async () => {
    const api = window.electronAPI;
    if (!api?.selectDirectory || !api?.loadMangaOfflineFromAbsolutePath || !api?.listArchivesInDirectory)
      return;
    isPickingRef.current = true;
    let dir = null;
    try {
      dir = await api.selectDirectory();
    } finally {
      setTimeout(() => {
        isPickingRef.current = false;
      }, 1500);
    }
    if (!dir) return;
    setError('');
    setNotification(null);

    const folderName = String(dir).split(/[/\\]/).filter(Boolean).pop() || dir;
    const isAlreadyPinned = extraPaths.some((e) => String(e.path).trim() === String(dir).trim());
    const inSaveDir = isInsideDirectory(dir, base);

    // 1. Kiểm tra nếu là một bộ truyện đơn lẻ
    const test = await api.loadMangaOfflineFromAbsolutePath(dir);
    if (test?.ok && test.chapters?.length) {
      const unhiddenCount = unhidePathsForDirectory(dir);
      const next = [...extraPaths.filter((e) => String(e.path) !== dir), { path: dir, kind: 'manga' }];
      setExtraPaths(next);
      saveExtraPaths(next);
      const title = test.manga?.title || folderName;
      if (unhiddenCount > 0) {
        setNotification({
          type: 'success',
          message: t('offlineLibrary.mangaRestored', { title }),
        });
      } else if (inSaveDir) {
        setNotification({
          type: 'info',
          message: t('offlineLibrary.mangaAlreadyInSaveDir', { title }),
        });
      } else if (isAlreadyPinned) {
        setNotification({
          type: 'info',
          message: t('offlineLibrary.folderAlreadyPinned', { name: title }),
        });
      } else {
        setNotification({
          type: 'success',
          message: t('offlineLibrary.folderAddedManga', { title, count: test.chapters.length }),
        });
      }
      await refresh();
      return;
    }

    // 2. Kiểm tra nếu là thư mục chứa tệp nén comic (CBZ, ZIP ảnh, CBR...)
    const listR = await api.listArchivesInDirectory(dir);
    const files = listR?.ok && Array.isArray(listR.files) ? listR.files : [];
    if (files.length > 0) {
      const unhiddenCount = unhidePathsForDirectory(
        dir,
        files.map((f) => f.path || f.filePath || f.absolutePath).filter(Boolean)
      );
      const next = [...extraPaths.filter((e) => String(e.path) !== dir), { path: dir, kind: 'cbz' }];
      setExtraPaths(next);
      saveExtraPaths(next);
      if (unhiddenCount > 0) {
        setNotification({
          type: 'success',
          message: t('offlineLibrary.archiveFolderRestored', { name: folderName }),
        });
      } else if (isAlreadyPinned) {
        setNotification({
          type: 'info',
          message: t('offlineLibrary.folderAlreadyPinned', { name: folderName }),
        });
      } else {
        setNotification({
          type: 'success',
          message: t('offlineLibrary.folderAddedArchive', { name: folderName, count: files.length }),
        });
      }
      await refresh();
      return;
    }

    // 3. Kiểm tra nếu là thư mục gốc chứa nhiều truyện (Multi-Manga Root)
    if (api?.listLocalMangaLibrary) {
      const rootTest = await api.listLocalMangaLibrary(dir);
      if (rootTest?.ok && Array.isArray(rootTest.items) && rootTest.items.length > 0) {
        const itemPaths = rootTest.items.map((it) => it.absolutePath).filter(Boolean);
        const unhiddenCount = unhidePathsForDirectory(dir, itemPaths);
        const next = [...extraPaths.filter((e) => String(e.path) !== dir), { path: dir, kind: 'root' }];
        setExtraPaths(next);
        saveExtraPaths(next);
        if (unhiddenCount > 0) {
          setNotification({
            type: 'success',
            message: t('offlineLibrary.folderRestored', { name: folderName, count: unhiddenCount }),
          });
        } else if (inSaveDir) {
          setNotification({
            type: 'info',
            message: t('offlineLibrary.folderAlreadyInSaveDir', { name: folderName, count: rootTest.items.length }),
          });
        } else if (isAlreadyPinned) {
          setNotification({
            type: 'info',
            message: t('offlineLibrary.folderAlreadyPinned', { name: folderName }),
          });
        } else {
          setNotification({
            type: 'success',
            message: t('offlineLibrary.folderAddedRoot', { name: folderName, count: rootTest.items.length }),
          });
        }
        await refresh();
        return;
      }
    }

    // 4. Không tìm thấy truyện hoặc file nén hợp lệ
    setNotification(null);
    setError(t('offlineLibrary.addInvalidBoth'));
  }, [base, extraPaths, refresh, t]);

  const resolveSourceLabel = useCallback(
    (row) => {
      if (row.source === 'favorite') return t('offlineLibrary.sourceFavorite');
      if (row.source === 'extraCbz') {
        return row.archiveKind === 'archive'
          ? t('offlineLibrary.sourceArchiveFolder')
          : t('offlineLibrary.sourceCbzFolder');
      }
      if (row.source === 'recentArchive') return t('offlineLibrary.sourceExtra');
      if (row.source === 'recentExtracted') return t('offlineLibrary.sourceExtractedTemp');
      if (row.source === 'extra') return t('offlineLibrary.sourceExtra');
      if (row.hasDb) return t('offlineLibrary.sourceDownload');
      return t('offlineLibrary.sourceImages');
    },
    [t]
  );

  const displayRows = useMemo(() => {
    const list = [...rows];
    const extractedEntries = Array.isArray(recentExtractedCbzEntries)
      ? recentExtractedCbzEntries
      : [];
    for (const entry of extractedEntries) {
      const extractedPath = String(entry?.openPath || entry?.extractPath || '').trim();
      if (!extractedPath) continue;
      const existedRow = list.some(
        (r) => String(r.absolutePath || '').trim() === extractedPath
      );
      if (existedRow) continue;
      list.unshift({
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
      });
    }

    const favByUrl = new Map();
    const favById = new Map();
    const favByTitle = new Map();
    for (const f of favorites) {
      if (f?.id) favById.set(f.id, f);
      const u = String(f?.mangaUrl || f?.url || '').trim();
      if (u) favByUrl.set(u, f);
      const t = String(f?.title || '').trim().toLowerCase();
      if (t) favByTitle.set(t, f);
    }

    const matchedFavIds = new Set();

    const augmented = list.map((r) => {
      const url = String(r.mangaUrl || '').trim();
      const title = String(r.mangaTitle || '').trim().toLowerCase();
      const localUrl = r.absolutePath ? `file://${r.absolutePath}` : '';
      const localId = localUrl ? `local::${localUrl}` : '';
      const matchedFav =
        (url && favByUrl.get(url)) ||
        (localUrl && favByUrl.get(localUrl)) ||
        (localId && favById.get(localId)) ||
        (title && favByTitle.get(title));
      if (matchedFav) {
        matchedFavIds.add(matchedFav.id);
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
          isBadgeUnread: isFavoriteTabBadgeUnread(
            matchedFav.id,
            sync,
            favoriteTabBadgeReadById
          ),
        };
      }
      return {
        ...r,
        isFavorite: false,
      };
    });

    const onlineOnlyFavorites = [];
    for (const f of favorites) {
      if (!matchedFavIds.has(f.id)) {
        const sync = favoriteSyncById[f.id];
        onlineOnlyFavorites.push({
          key: `fav:${f.id}`,
          source: 'favorite',
          mangaTitle: f.title || '',
          chapterCount: f.chapterCount || 0,
          hasDb: false,
          mangaUrl: f.mangaUrl || f.url || '',
          siteId: f.siteId || '',
          absolutePath: '',
          localCoverPath: '',
          coverUrl: f.coverUrl || '',
          isFavorite: true,
          favoriteId: f.id,
          notifyWatch: f.notifyWatch,
          sync,
          isBadgeUnread: isFavoriteTabBadgeUnread(
            f.id,
            sync,
            favoriteTabBadgeReadById
          ),
        });
      }
    }

    return [...onlineOnlyFavorites, ...augmented];
  }, [rows, recentExtractedCbzEntries, favorites, favoriteSyncById, favoriteTabBadgeReadById]);

  const filtered = useMemo(() => {
    let list = displayRows;
    if (sourceFilter === 'favorites') {
      list = list.filter((r) => r.isFavorite);
    } else if (sourceFilter === 'save') {
      list = list.filter((r) => r.source === 'save');
    } else if (sourceFilter === 'extra') {
      list = list.filter(
        (r) =>
          r.source === 'extra' ||
          r.source === 'recentExtracted' ||
          r.source === 'recentArchive'
      );
    } else if (sourceFilter === 'archives') {
      list = list.filter(
        (r) =>
          r.source === 'extraCbz' ||
          r.source === 'recentArchive' ||
          r.archiveKind === 'archive' ||
          r.archiveKind === 'cbz'
      );
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          String(r.mangaTitle || '').toLowerCase().includes(q) ||
          String(r.absolutePath || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [displayRows, query, sourceFilter]);

  const sortedFiltered = useMemo(() => {
    const arr = [...filtered];
    const titleCmp = (a, b) =>
      String(a.mangaTitle || '').localeCompare(String(b.mangaTitle || ''), undefined, {
        numeric: true,
        sensitivity: 'base',
      });
    if (sortMode === 'titleDesc') {
      arr.sort((a, b) => -titleCmp(a, b));
    } else {
      arr.sort(titleCmp);
    }
    return arr;
  }, [filtered, sortMode]);

  const cycleSort = useCallback(() => {
    setSortMode((prev) => {
      const i = OFFLINE_SORT_CYCLE.indexOf(prev);
      const idx = i >= 0 ? i : 0;
      return OFFLINE_SORT_CYCLE[(idx + 1) % OFFLINE_SORT_CYCLE.length];
    });
  }, []);

  return {
    rows,
    loading,
    error,
    setError,
    notification,
    setNotification,
    extraPaths,
    query,
    setQuery,
    sourceFilter,
    setSourceFilter,
    viewMode,
    setViewMode,
    sortMode,
    cycleSort,
    base,
    refresh,
    handleManualRefresh,
    removeFromOfflineList,
    addFolder,
    resolveSourceLabel,
    displayRows,
    filtered,
    sortedFiltered,
  };
}

export default useOfflineLibraryData;

