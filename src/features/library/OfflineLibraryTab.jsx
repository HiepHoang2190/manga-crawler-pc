import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../context/I18nContext';
import {
  SendToKindleModal,
  getKindleJob,
  subscribeKindleJob,
  consumeOpenKindleModalRequest,
} from '../export';
import { loadPanelUi, savePanelUi } from '../../utils/panelUiPrefs';
import { QueueCoverThumb } from '../download';
import { SearchableSelect, EmptyState, StudioTable } from '../../shared';
import {
  loadHiddenSavePaths,
  saveHiddenSavePaths,
  clearHiddenSavePaths,
  isInsideDirectory,
  unhidePathsForDirectory,
} from '../../utils/offlineLibraryHiddenPaths';
import { isFavoriteTabBadgeUnread } from './favoriteTabBadge';

const KINDLE_ELIGIBLE_SOURCES = new Set(['save', 'extra', 'recentExtracted']);
function isKindleEligible(row) {
  return KINDLE_ELIGIBLE_SOURCES.has(String(row?.source || ''));
}

const EXTRA_PATHS_KEY = 'offlineLibraryExtraPaths_v1';

const OFFLINE_SORT_CYCLE = ['titleAsc', 'titleDesc'];

const SORT_LABEL_KEYS = {
  titleAsc: 'favorites.sort.titleAsc',
  titleDesc: 'favorites.sort.titleDesc',
};

const FAV_MS_ICON_20 =
  "material-symbols-outlined leading-none shrink-0 block text-[20px] [font-variation-settings:'FILL'_0,'wght'_400,'GRAD'_0,'opsz'_24]";
const FAV_MS_ICON_18 =
  "material-symbols-outlined leading-none shrink-0 block text-[18px] [font-variation-settings:'FILL'_0,'wght'_400,'GRAD'_0,'opsz'_24]";

function normalizeExtraEntry(x) {
  if (!x || typeof x.path !== 'string' || !x.path.trim()) return null;
  const path = x.path.trim();
  const kind = x.kind === 'cbz' ? 'cbz' : 'manga';
  return { path, kind };
}

function loadExtraPaths() {
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

function saveExtraPaths(list) {
  try {
    const normalized = list.map(normalizeExtraEntry).filter(Boolean);
    localStorage.setItem(EXTRA_PATHS_KEY, JSON.stringify(normalized));
  } catch {
    /* */
  }
}

function FavoriteNotifyBell({ active, onToggle, titleOn, titleOff, compact = false }) {
  const iconClass = compact ? FAV_MS_ICON_18 : FAV_MS_ICON_20;
  const box = compact ? 'h-9 w-9' : 'w-10 h-10';
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle?.();
      }}
      className={`inline-flex items-center justify-center ${box} shrink-0 rounded-full border shadow-lg transition-[filter] cursor-pointer ${active
          ? 'bg-primary/25 text-primary border-primary/40 ring-1 ring-primary/30'
          : 'bg-surface-container-high/95 text-on-surface-variant border-outline-variant/30'
        } hover:brightness-110`}
      data-tooltip={active ? titleOn : titleOff}
      aria-label={active ? titleOn : titleOff}
      aria-pressed={active}
    >
      <span
        className={iconClass}
        style={
          active
            ? { fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }
            : undefined
        }
      >
        notifications
      </span>
    </button>
  );
}

function OfflineChapterMeta({
  chapterCount,
  sync,
  t,
  lineVariant = 'chapters',
  onEnqueuePending,
}) {
  const pending =
    sync?.hasNew && typeof sync.remoteCount === 'number' ? sync.remoteCount : 0;
  return (
    <div className="flex flex-col items-start gap-1 min-w-0">
      <div className="text-xs text-outline tabular-nums flex items-center gap-1.5 flex-wrap">
        <span>
          {lineVariant === 'archiveFiles'
            ? t('offlineLibrary.archiveFilesLine', { count: chapterCount ?? 0 })
            : lineVariant === 'cbzFiles'
              ? t('offlineLibrary.cbzFilesLine', { count: chapterCount ?? 0 })
              : t('favorites.chaptersLine', { count: chapterCount ?? 0 })}
        </span>
        {sync?.error ? (
          <span className="text-error text-[10px] shrink-0" data-tooltip={sync.error}>
            {t('favorites.syncFailedShort')}
          </span>
        ) : null}
      </div>
      {pending > 0 ? (
        typeof onEnqueuePending === 'function' ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEnqueuePending();
            }}
            className="inline-flex items-center gap-1 text-[11px] font-medium leading-none text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 active:scale-95 transition-all cursor-pointer border border-amber-500/25 rounded-md px-1.5 py-0.5 shadow-2xs"
            data-tooltip={t('favorites.enqueuePendingTooltip', { n: pending })}
            aria-label={t('favorites.enqueuePendingTooltip', { n: pending })}
          >
            <span className="material-symbols-outlined text-[12px] leading-none">download</span>
            <span className="tabular-nums font-semibold">{t('favorites.newChaptersPending', { n: pending })}</span>
          </button>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium leading-none text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/25 rounded-md px-1.5 py-0.5 tabular-nums">
            <span className="material-symbols-outlined text-[12px] leading-none">download</span>
            <span className="tabular-nums font-semibold">{t('favorites.newChaptersPending', { n: pending })}</span>
          </span>
        )
      ) : null}
    </div>
  );
}

function isExtractedTempRow(row) {
  if (!row) return false;
  if (row.source === 'recentExtracted') return true;
  if (row.releaseOnRemove && row.extractPath) return true;
  const p = String(row.extractPath || row.absolutePath || '').trim();
  return p.includes('manga-crawler-cbz');
}

function OfflineCardActions({
  row,
  t,
  onReadOffline,
  onReadFavorite,
  onOpenFolder,
  onRemoveFromList,
  onOpenPinnedCbzFolder,
  onReadArchivePath,
  onSendToKindle,
  onToggleNotifyWatch,
}) {
  const isCbzPin = row.source === 'extraCbz';
  const isRecentArchive = row.source === 'recentArchive';
  const hasFolder = Boolean(row.absolutePath);

  const handleRead = () => {
    if (isCbzPin) {
      onOpenPinnedCbzFolder?.(row.absolutePath);
    } else if (isRecentArchive) {
      onReadArchivePath?.(row.absolutePath);
    } else if (row.source === 'favorite' && !row.absolutePath) {
      if (onReadFavorite) onReadFavorite(row);
      else onReadOffline?.(row);
    } else {
      onReadOffline?.(row);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-center gap-5 sm:gap-6 w-full px-2">
      <button
        type="button"
        onClick={handleRead}
        className="inline-flex items-center justify-center w-10 h-10 shrink-0 rounded-full bg-surface-container-high/95 text-primary border border-outline-variant/30 shadow-lg hover:brightness-110 transition-[filter] cursor-pointer"
        data-tooltip={
          isCbzPin
            ? row.archiveKind === 'archive'
              ? t('offlineLibrary.openArchiveListFromPin')
              : t('offlineLibrary.openCbzListFromPin')
            : t('mangaInfo.openReader')
        }
        aria-label={
          isCbzPin
            ? row.archiveKind === 'archive'
              ? t('offlineLibrary.openArchiveListFromPin')
              : t('offlineLibrary.openCbzListFromPin')
            : t('mangaInfo.openReader')
        }
      >
        <span className={FAV_MS_ICON_20}>{isCbzPin ? 'archive' : 'auto_stories'}</span>
      </button>

      {row.isFavorite ? (
        <FavoriteNotifyBell
          active={Boolean(row.notifyWatch)}
          onToggle={() => onToggleNotifyWatch?.(row.favoriteId || row.key)}
          titleOn={t('favorites.notifyWatchOn')}
          titleOff={t('favorites.notifyWatchOff')}
        />
      ) : null}

      {typeof onSendToKindle === 'function' && isKindleEligible(row) ? (
        <button
          type="button"
          onClick={() => onSendToKindle(row)}
          className="inline-flex items-center justify-center w-10 h-10 shrink-0 rounded-full bg-surface-container-high/95 text-primary border border-outline-variant/30 shadow-lg hover:brightness-110 transition-[filter] cursor-pointer"
          data-tooltip={t('sendToKindle.menuButton')}
          aria-label={t('sendToKindle.menuButton')}
        >
          <span className={FAV_MS_ICON_20}>send_to_mobile</span>
        </button>
      ) : null}

      {hasFolder ? (
        <button
          type="button"
          onClick={() => {
            const folder_path =
              row.source === 'recentArchive'
                ? String(row.extractPath || '').trim() || row.absolutePath
                : row.absolutePath;
            onOpenFolder?.(folder_path);
          }}
          className="inline-flex items-center justify-center w-10 h-10 shrink-0 rounded-full bg-surface-container-high/95 text-primary border border-outline-variant/30 shadow-lg hover:brightness-110 transition-[filter] cursor-pointer"
          data-tooltip={t('favorites.openFolderTitle')}
        >
          <span className={FAV_MS_ICON_20}>folder_open</span>
        </button>
      ) : null}

      {typeof onRemoveFromList === 'function' ? (
        <button
          type="button"
          onClick={() => onRemoveFromList(row)}
          className="inline-flex items-center justify-center w-10 h-10 shrink-0 rounded-full bg-red-500/25 backdrop-blur-md text-red-400 hover:bg-red-500 hover:text-white transition-colors cursor-pointer"
          data-tooltip={
            row.source === 'favorite'
              ? t('mangaInfo.favoriteRemove')
              : isExtractedTempRow(row)
                ? t('offlineLibrary.removeExtractedTempTitle')
                : t('offlineLibrary.removeFromListTitle')
          }
          aria-label={
            row.source === 'favorite'
              ? t('mangaInfo.favoriteRemove')
              : isExtractedTempRow(row)
                ? t('offlineLibrary.removeExtractedTempTitle')
                : t('offlineLibrary.removeFromListTitle')
          }
        >
          <span className={FAV_MS_ICON_20}>delete</span>
        </button>
      ) : null}
    </div>
  );
}

function OfflineListActions({
  row,
  t,
  onReadOffline,
  onReadFavorite,
  onOpenFolder,
  onRemoveFromList,
  onOpenPinnedCbzFolder,
  onReadArchivePath,
  onSendToKindle,
  onToggleNotifyWatch,
  onToggleFavorite,
}) {
  const isCbzPin = row.source === 'extraCbz';
  const isRecentArchive = row.source === 'recentArchive';
  const hasFolder = Boolean(row.absolutePath);

  const handleRead = () => {
    if (isCbzPin) {
      onOpenPinnedCbzFolder?.(row.absolutePath);
    } else if (isRecentArchive) {
      onReadArchivePath?.(row.absolutePath);
    } else if (row.source === 'favorite' && !row.absolutePath) {
      if (onReadFavorite) onReadFavorite(row);
      else onReadOffline?.(row);
    } else {
      onReadOffline?.(row);
    }
  };

  return (
    <div className="inline-flex items-center justify-end gap-1.5 flex-nowrap">
      <button
        type="button"
        onClick={handleRead}
        className="inline-flex items-center justify-center w-9 h-9 shrink-0 rounded-full bg-surface-container-high text-primary border border-outline-variant/30 shadow-sm hover:brightness-110 transition-[filter] cursor-pointer"
        data-tooltip={
          isCbzPin
            ? row.archiveKind === 'archive'
              ? t('offlineLibrary.openArchiveListFromPin')
              : t('offlineLibrary.openCbzListFromPin')
            : t('mangaInfo.openReader')
        }
        aria-label={
          isCbzPin
            ? row.archiveKind === 'archive'
              ? t('offlineLibrary.openArchiveListFromPin')
              : t('offlineLibrary.openCbzListFromPin')
            : t('mangaInfo.openReader')
        }
      >
        <span className={FAV_MS_ICON_18}>{isCbzPin ? 'archive' : 'auto_stories'}</span>
      </button>

      {typeof onToggleFavorite === 'function' ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(row);
          }}
          className={`inline-flex items-center justify-center w-9 h-9 shrink-0 rounded-full border shadow-sm transition-[filter,color,background-color] cursor-pointer ${row.isFavorite
              ? 'bg-rose-500/20 text-rose-500 border-rose-500/40 ring-1 ring-rose-500/20 hover:bg-rose-500 hover:text-white'
              : 'bg-surface-container-high text-on-surface-variant border-outline-variant/30 hover:text-rose-500 hover:brightness-110'
            }`}
          data-tooltip={row.isFavorite ? t('mangaInfo.favoriteRemove') : t('mangaInfo.favoriteAdd')}
          aria-label={row.isFavorite ? t('mangaInfo.favoriteRemove') : t('mangaInfo.favoriteAdd')}
          aria-pressed={Boolean(row.isFavorite)}
        >
          <span
            className={FAV_MS_ICON_18}
            style={
              row.isFavorite
                ? { fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }
                : undefined
            }
          >
            {row.isFavorite ? 'favorite' : 'favorite_border'}
          </span>
        </button>
      ) : null}

      {row.isFavorite ? (
        <FavoriteNotifyBell
          active={Boolean(row.notifyWatch)}
          onToggle={() => onToggleNotifyWatch?.(row.favoriteId || row.key)}
          titleOn={t('favorites.notifyWatchOn')}
          titleOff={t('favorites.notifyWatchOff')}
          compact
        />
      ) : null}

      {typeof onSendToKindle === 'function' && isKindleEligible(row) ? (
        <button
          type="button"
          onClick={() => onSendToKindle(row)}
          className="inline-flex items-center justify-center w-9 h-9 shrink-0 rounded-full bg-surface-container-high text-primary border border-outline-variant/30 shadow-sm hover:brightness-110 transition-[filter] cursor-pointer"
          data-tooltip={t('sendToKindle.menuButton')}
          aria-label={t('sendToKindle.menuButton')}
        >
          <span className={FAV_MS_ICON_18}>send_to_mobile</span>
        </button>
      ) : null}

      {hasFolder ? (
        <button
          type="button"
          onClick={() => {
            const folder_path =
              row.source === 'recentArchive'
                ? String(row.extractPath || '').trim() || row.absolutePath
                : row.absolutePath;
            onOpenFolder?.(folder_path);
          }}
          className="inline-flex items-center justify-center w-9 h-9 shrink-0 rounded-full bg-surface-container-high text-primary border border-outline-variant/30 shadow-sm hover:brightness-110 transition-[filter] cursor-pointer"
          data-tooltip={t('favorites.openFolderTitle')}
        >
          <span className={FAV_MS_ICON_18}>folder_open</span>
        </button>
      ) : null}

      {typeof onRemoveFromList === 'function' ? (
        <button
          type="button"
          onClick={() => onRemoveFromList(row)}
          className="inline-flex items-center justify-center w-9 h-9 shrink-0 rounded-full bg-error/10 text-error hover:bg-error hover:text-on-error transition-colors cursor-pointer"
          data-tooltip={
            row.source === 'favorite'
              ? t('mangaInfo.favoriteRemove')
              : isExtractedTempRow(row)
                ? t('offlineLibrary.removeExtractedTempTitle')
                : t('offlineLibrary.removeFromListTitle')
          }
          aria-label={
            row.source === 'favorite'
              ? t('mangaInfo.favoriteRemove')
              : isExtractedTempRow(row)
                ? t('offlineLibrary.removeExtractedTempTitle')
                : t('offlineLibrary.removeFromListTitle')
          }
        >
          <span className={FAV_MS_ICON_18}>delete</span>
        </button>
      ) : null}
    </div>
  );
}

export default function OfflineLibraryTab({
  savePath,
  onReadOffline,
  onFetchManga,
  onOpenFolder,
  onOpenCbzFile,
  onReadCbzFromPath,
  cbzLoadProgress,
  cbzError,
  recentExtractedCbzEntries = [],
  onRemoveRecentExtractedCbzEntry,
  onOpenEbook,
  // Favorites props
  favorites = [],
  onToggleFavorite,
  onRemoveFavorite,
  onFetchFavorite,
  onReadFavorite,
  onOpenMangaFolder,
  favoriteSyncById = {},
  favoriteTabBadgeReadById = {},
  fetchAllFavoritesBusy = false,
  onFetchAllFavorites,
  onToggleFavoriteNotifyWatch,
  onEnqueuePendingChapters,
  connectors = [],
}) {
  const { t } = useI18n();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notification, setNotification] = useState(null);
  const [cbzFolderFiles, setCbzFolderFiles] = useState([]);
  const [cbzFolderPath, setCbzFolderPath] = useState('');
  const [cbzFolderModalOpen, setCbzFolderModalOpen] = useState(false);
  const [detectingPath, setDetectingPath] = useState(null);
  const [loadingArchiveFilePath, setLoadingArchiveFilePath] = useState(null);
  const [extraPaths, setExtraPaths] = useState(() => loadExtraPaths());

  // Tự động xóa trạng thái file đang load khi tiến trình giải nén hoàn tất hoặc có lỗi
  useEffect(() => {
    if (!cbzLoadProgress) {
      setLoadingArchiveFilePath(null);
    }
  }, [cbzLoadProgress]);
  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [viewMode, setViewMode] = useState(() => loadPanelUi().offlineRead.viewMode);
  const [sortMode, setSortMode] = useState(() => loadPanelUi().offlineRead.sortMode);
  const [kindleRow, setKindleRow] = useState(null);
  const isPickingRef = useRef(false);

  // Tự động ẩn thông báo lỗi sau 10 giây nếu người dùng không thao tác
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => {
      setError('');
    }, 10000);
    return () => clearTimeout(timer);
  }, [error]);

  // Tự động ẩn thông báo thành công / thông tin sau 6 giây
  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => {
      setNotification(null);
    }, 6000);
    return () => clearTimeout(timer);
  }, [notification]);

  // Re-open Send to Kindle modal when banner requests it (after tab switch / remount).
  useEffect(() => {
    const openFromStore = () => {
      const s = getKindleJob();
      if (!s.openModalRequested || !s.row) return;
      consumeOpenKindleModalRequest();
      setKindleRow({
        mangaTitle: s.row.mangaTitle,
        absolutePath: s.row.absolutePath,
      });
    };
    openFromStore();
    return subscribeKindleJob(openFromStore);
  }, []);

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

  // Tự động làm mới khi Queue hoàn thành tải một chapter/bộ truyện
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
              /* ignore ebook cleanup errors here */
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
    [extraPaths, removeExtra, refresh, onRemoveRecentExtractedCbzEntry, t, recentExtractedCbzEntries]
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

  const openPinnedCbzFolder = useCallback(
    async (absolutePath) => {
      const api = window.electronAPI;
      if (!api?.listArchivesInDirectory) return;
      const p = String(absolutePath || '').trim();
      if (!p) return;
      setError('');
      try {
        const r = await api.listArchivesInDirectory(p);
        if (!r?.ok) {
          setCbzFolderFiles([]);
          setCbzFolderPath('');
          setCbzFolderModalOpen(false);
          setError(r?.error || t('offlineLibrary.cbzFolderScanFailed'));
          return;
        }
        setCbzFolderPath(p);
        setCbzFolderFiles(Array.isArray(r.files) ? r.files : []);
        setCbzFolderModalOpen(true);
      } catch (e) {
        setCbzFolderFiles([]);
        setCbzFolderPath('');
        setCbzFolderModalOpen(false);
        setError(String(e?.message || e));
      }
    },
    [t]
  );

  const closeCbzFolderModal = useCallback(() => {
    setCbzFolderModalOpen(false);
    setCbzFolderPath('');
    setCbzFolderFiles([]);
    setLoadingArchiveFilePath(null);
    setDetectingPath(null);
  }, []);

  useEffect(() => {
    if (!cbzFolderModalOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') closeCbzFolderModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cbzFolderModalOpen, closeCbzFolderModal]);

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

  const viewToggleBtn = (mode, icon, labelKey) => {
    const active = viewMode === mode;
    return (
      <button
        type="button"
        aria-pressed={active}
        onClick={() => setViewMode(mode)}
        className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors cursor-pointer ${active
            ? 'border-primary/40 bg-primary/15 text-primary font-bold shadow-xs'
            : 'border-outline-variant/25 bg-surface-container-highest text-on-surface-variant hover:text-on-surface hover:border-outline-variant/50'
          }`}
        data-tooltip={t(labelKey)}
      >
        <span className="material-symbols-outlined text-[20px] leading-none">{icon}</span>
      </button>
    );
  };

  return (
    <div className="flex-1 flex flex-col bg-surface overflow-hidden min-h-0">
      <div className="flex-1 flex flex-col px-6 pt-4 pb-6 gap-4 sm:px-8 overflow-hidden min-h-0">
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 shrink-0">
            {viewToggleBtn('grid', 'grid_view', 'favorites.viewGrid')}
            {viewToggleBtn('list', 'view_list', 'favorites.viewList')}
            <div className="h-6 w-px shrink-0 bg-outline-variant/30 mx-0.5 self-center" aria-hidden />
            <button
              type="button"
              onClick={cycleSort}
              className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors cursor-pointer ${sortMode !== 'titleAsc'
                  ? 'border-primary/40 bg-primary/15 text-primary font-bold shadow-xs'
                  : 'border-outline-variant/25 bg-surface-container-highest text-on-surface-variant hover:text-on-surface hover:border-outline-variant/50'
                }`}
              data-tooltip={t('offlineLibrary.sortHint', {
                mode: t(SORT_LABEL_KEYS[sortMode] || SORT_LABEL_KEYS.titleAsc),
              })}
            >
              <span className="material-symbols-outlined text-[20px] leading-none">sort_by_alpha</span>
            </button>
          </div>

          <div className="flex-1 flex h-11 items-center bg-surface-container-highest rounded-lg px-3 sm:px-4 max-w-xl border border-outline-variant/10 min-w-[200px]">
            <span className="material-symbols-outlined text-outline mr-2 sm:mr-3 shrink-0 text-[20px] leading-none">
              filter_list
            </span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('offlineLibrary.searchPlaceholder')}
              className="min-h-0 h-8 bg-transparent border-none text-sm leading-normal focus:ring-0 p-0 w-full text-on-surface outline-none placeholder:text-outline"
            />
          </div>
          <div className="shrink-0">
            <SearchableSelect
              value={sourceFilter}
              onChange={setSourceFilter}
              options={[
                { value: 'all', label: t('offlineLibrary.filterSourceAll') },
                { value: 'favorites', label: t('offlineLibrary.filterSourceFavorites'), icon: 'favorite' },
                { value: 'save', label: t('offlineLibrary.filterSourceSave'), icon: 'download' },
                { value: 'extra', label: t('offlineLibrary.filterSourceExtra'), icon: 'folder' },
                { value: 'archives', label: t('offlineLibrary.filterSourceArchives'), icon: 'archive' },
              ]}
              placeholder={t('offlineLibrary.filterSourceAll')}
              className="min-w-[11.5rem]"
            />
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-error/30 bg-error/10 px-3.5 py-2.5 text-xs text-error shrink-0 flex items-center justify-between gap-3 shadow-xs animate-in fade-in duration-200">
            <div className="flex items-center gap-2 min-w-0">
              <span className="material-symbols-outlined text-[18px] shrink-0 text-error">error</span>
              <span className="break-words font-medium">{error}</span>
            </div>
            <button
              type="button"
              onClick={() => setError('')}
              className="shrink-0 p-1 rounded-md hover:bg-error/20 text-error transition-colors cursor-pointer"
              title={t('offlineLibrary.dismissError')}
              aria-label={t('offlineLibrary.dismissError')}
            >
              <span className="material-symbols-outlined text-base leading-none">close</span>
            </button>
          </div>
        ) : null}

        {notification ? (
          <div
            className={`rounded-xl border px-3.5 py-2.5 text-xs shrink-0 flex items-center justify-between gap-3 shadow-xs animate-in fade-in duration-200 ${notification.type === 'info'
                ? 'border-sky-500/30 bg-sky-500/10 text-sky-400'
                : 'border-primary/30 bg-primary/10 text-primary'
              }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="material-symbols-outlined text-[18px] shrink-0">
                {notification.type === 'info' ? 'info' : 'check_circle'}
              </span>
              <span className="break-words font-medium">{notification.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setNotification(null)}
              className="shrink-0 p-1 rounded-md hover:opacity-75 transition-opacity cursor-pointer"
              title={t('offlineLibrary.dismissError')}
              aria-label={t('offlineLibrary.dismissError')}
            >
              <span className="material-symbols-outlined text-base leading-none">close</span>
            </button>
          </div>
        ) : null}

        {viewMode === 'grid' ? (
          <div className={`min-h-0 min-w-0 flex-1 overflow-auto custom-scrollbar rounded-xl border border-outline-variant/20 bg-surface shadow-sm ${sortedFiltered.length > 0 ? 'p-5' : 'flex items-center justify-center'}`}>
            {loading && displayRows.length === 0 ? (
              <p className="text-sm text-on-surface-variant text-center py-12">{t('offlineLibrary.loading')}</p>
            ) : sortedFiltered.length === 0 ? (
              <EmptyState
                icon={displayRows.length === 0 ? 'local_library' : 'search_off'}
                title={displayRows.length === 0 ? t('offlineLibrary.empty') : t('favorites.noResults')}
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6 pb-2">
                {sortedFiltered.map((row) => (
                  <div
                    key={row.key}
                    className={`group relative bg-surface-container-low rounded-xl overflow-hidden flex flex-col transition-all hover:shadow-2xl hover:shadow-black/40 border ${row.isBadgeUnread
                        ? 'border-amber-500/70 ring-2 ring-amber-500/35 bg-amber-500/[0.06]'
                        : 'border-outline-variant/10'
                      }`}
                  >
                    <div className="aspect-[3/4.2] relative overflow-hidden bg-surface-container-highest">
                      <QueueCoverThumb
                        coverUrl={row.localCoverPath || row.coverUrl || ''}
                        onFetch={
                          Boolean((row.mangaUrl || row.url) && String(row.mangaUrl || row.url).trim())
                            ? () => {
                              if (row.source === 'favorite' && onFetchFavorite) {
                                onFetchFavorite(row);
                              } else {
                                onFetchManga?.(row);
                              }
                            }
                            : undefined
                        }
                        fetchTitle={
                          Boolean((row.mangaUrl || row.url) && String(row.mangaUrl || row.url).trim())
                            ? t('offlineLibrary.clickCoverToFetch')
                            : undefined
                        }
                        frameClassName="absolute inset-0 w-full h-full shrink-0 bg-surface-container-highest overflow-hidden border-0 flex items-center justify-center p-0 rounded-none"
                        placeholderIconClassName="text-5xl"
                      />
                      {Boolean((row.mangaUrl || row.url) && String(row.mangaUrl || row.url).trim()) ? (
                        <div
                          className={`pointer-events-none absolute top-2.5 ${row.isBadgeUnread ? 'left-6.5' : 'left-2.5'
                            } z-[2] opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 backdrop-blur-xs text-white/95 rounded-full p-1.5 flex items-center justify-center shadow-md ring-1 ring-white/20`}
                          title={t('offlineLibrary.clickCoverToFetch')}
                        >
                          <span className="material-symbols-outlined text-[15px] leading-none">
                            cloud_download
                          </span>
                        </div>
                      ) : null}
                      {typeof onToggleFavorite === 'function' ? (
                        <button
                          type="button"
                          aria-pressed={Boolean(row.isFavorite)}
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleFavorite(row);
                          }}
                          className={`absolute top-2.5 right-2.5 z-[2] flex h-7 w-7 cursor-pointer items-center justify-center rounded-full shadow-md transition-all ${row.isFavorite
                              ? 'bg-rose-500/90 text-white ring-1 ring-white/40 backdrop-blur-xs hover:bg-rose-600'
                              : 'bg-black/50 text-white/90 ring-1 ring-white/20 backdrop-blur-xs hover:bg-black/70 hover:text-rose-400 opacity-0 group-hover:opacity-100'
                            }`}
                          data-tooltip={
                            row.isFavorite
                              ? t('mangaInfo.favoriteRemove')
                              : t('mangaInfo.favoriteAdd')
                          }
                          aria-label={
                            row.isFavorite
                              ? t('mangaInfo.favoriteRemove')
                              : t('mangaInfo.favoriteAdd')
                          }
                        >
                          <span
                            className="material-symbols-outlined block text-[15px] leading-none"
                            style={
                              row.isFavorite
                                ? { fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 20" }
                                : { fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20" }
                            }
                          >
                            {row.isFavorite ? 'favorite' : 'favorite_border'}
                          </span>
                        </button>
                      ) : null}
                      <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100 flex items-end justify-center p-4">
                        <div className="pointer-events-auto">
                          <OfflineCardActions
                            row={row}
                            t={t}
                            onReadOffline={onReadOffline}
                            onReadFavorite={onReadFavorite}
                            onOpenFolder={onOpenFolder}
                            onRemoveFromList={removeFromOfflineList}
                            onOpenPinnedCbzFolder={openPinnedCbzFolder}
                            onReadArchivePath={onReadCbzFromPath}
                            onSendToKindle={setKindleRow}
                            onToggleNotifyWatch={onToggleFavoriteNotifyWatch}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="p-4 space-y-1">
                      <h4 className="font-bold text-on-surface truncate group-hover:text-primary transition-colors">
                        {row.mangaTitle}
                      </h4>
                      <p
                        className="text-[10px] font-semibold uppercase tracking-wide text-primary/90 truncate"
                        data-tooltip={resolveSourceLabel(row)}
                      >
                        {resolveSourceLabel(row)}
                      </p>
                      <OfflineChapterMeta
                        chapterCount={row.chapterCount}
                        sync={row.sync}
                        t={t}
                        lineVariant={
                          row.source === 'extraCbz'
                            ? row.archiveKind === 'archive'
                              ? 'archiveFiles'
                              : 'cbzFiles'
                            : 'chapters'
                        }
                        onEnqueuePending={() => onEnqueuePendingChapters?.(row)}
                      />
                      {row.absolutePath ? (
                        <p
                          className="text-[10px] text-on-surface-variant/90 truncate pt-0.5 pr-10"
                          data-tooltip={row.absolutePath}
                        >
                          {row.absolutePath}
                        </p>
                      ) : null}
                      {row.sourceFile ? (
                        <p
                          className="text-[10px] text-on-surface-variant/80 truncate pr-10"
                          data-tooltip={row.sourceFile}
                        >
                          {t('offlineLibrary.lastExtractedSourceFile')}: {row.sourceFile}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <StudioTable
            columns={[
              { key: 'cover', width: 'w-14', header: '', ariaLabel: t('favorites.col.cover') },
              { key: 'manga', header: t('favorites.col.manga') },
              {
                key: 'source',
                width: 'w-36',
                header: t('offlineLibrary.col.source'),
                headerClassName: 'w-36 min-w-0 p-3 font-bold text-xs uppercase tracking-wider text-on-surface-variant border-none whitespace-nowrap',
              },
              {
                key: 'chapters',
                width: 'w-32',
                header: t('favorites.col.chapters'),
                headerClassName: 'w-32 min-w-0 p-3 font-bold text-xs uppercase tracking-wider text-on-surface-variant border-none whitespace-nowrap',
              },
              {
                key: 'actions',
                width: 'w-56',
                align: 'right',
                header: '',
                ariaLabel: t('favorites.col.actionsAria'),
                headerClassName: 'w-56 p-3 pr-4 sm:pr-5 border-none text-right',
              },
            ]}
            data={sortedFiltered}
            keyExtractor={(row) => row.key}
            loading={loading && displayRows.length === 0}
            loadingText={t('offlineLibrary.loading')}
            emptyState={
              <EmptyState
                icon={displayRows.length === 0 ? 'local_library' : 'search_off'}
                title={displayRows.length === 0 ? t('offlineLibrary.empty') : t('favorites.noResults')}
              />
            }
            renderRow={(row) => (
              <>
                <td className="p-2 sm:p-3 align-middle w-14">
                  <QueueCoverThumb
                    coverUrl={row.localCoverPath || row.coverUrl || ''}
                    onFetch={
                      Boolean((row.mangaUrl || row.url) && String(row.mangaUrl || row.url).trim())
                        ? () => {
                          if (row.source === 'favorite' && onFetchFavorite) {
                            onFetchFavorite(row);
                          } else {
                            onFetchManga?.(row);
                          }
                        }
                        : undefined
                    }
                    fetchTitle={
                      Boolean((row.mangaUrl || row.url) && String(row.mangaUrl || row.url).trim())
                        ? t('offlineLibrary.clickCoverToFetch')
                        : undefined
                    }
                    frameClassName="w-10 h-13 shrink-0 rounded overflow-hidden bg-surface-container-highest border border-outline-variant/20 flex items-center justify-center"
                  />
                </td>
                <td className="min-w-0 overflow-hidden p-2 sm:p-3 align-middle font-medium text-on-surface">
                  <span className="line-clamp-2">
                    {row.mangaTitle}
                  </span>
                  {row.absolutePath ? (
                    <span
                      className="block text-[10px] text-on-surface-variant truncate mt-1 max-w-full"
                      data-tooltip={row.absolutePath}
                    >
                      {row.absolutePath}
                    </span>
                  ) : null}
                  {row.sourceFile ? (
                    <span
                      className="block text-[10px] text-on-surface-variant/80 truncate mt-0.5 max-w-full"
                      data-tooltip={row.sourceFile}
                    >
                      {t('offlineLibrary.lastExtractedSourceFile')}: {row.sourceFile}
                    </span>
                  ) : null}
                </td>
                <td
                  className="w-36 min-w-0 overflow-hidden p-2 sm:p-3 align-middle text-on-surface-variant text-xs truncate"
                  data-tooltip={resolveSourceLabel(row)}
                >
                  {resolveSourceLabel(row)}
                </td>
                <td className="w-32 min-w-0 overflow-hidden p-2 sm:p-3 align-middle text-sm whitespace-nowrap">
                  <OfflineChapterMeta
                    chapterCount={row.chapterCount}
                    sync={row.sync}
                    t={t}
                    lineVariant={
                      row.source === 'extraCbz'
                        ? row.archiveKind === 'archive'
                          ? 'archiveFiles'
                          : 'cbzFiles'
                        : 'chapters'
                    }
                    onEnqueuePending={() => onEnqueuePendingChapters?.(row)}
                  />
                </td>
                <td className="w-56 p-2 sm:p-3 pr-4 sm:pr-5 align-middle text-right">
                  <OfflineListActions
                    row={row}
                    t={t}
                    onReadOffline={onReadOffline}
                    onReadFavorite={onReadFavorite}
                    onOpenFolder={onOpenFolder}
                    onRemoveFromList={removeFromOfflineList}
                    onOpenPinnedCbzFolder={openPinnedCbzFolder}
                    onReadArchivePath={onReadCbzFromPath}
                    onSendToKindle={setKindleRow}
                    onToggleNotifyWatch={onToggleFavoriteNotifyWatch}
                    onToggleFavorite={onToggleFavorite}
                  />
                </td>
              </>
            )}
          />
        )}

        <div className="mt-auto bg-surface-container-high rounded-xl p-4 flex flex-col gap-3 border border-outline-variant/20 shadow-sm shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-xs text-outline font-medium">
                {t('offlineLibrary.footerCount', { n: displayRows.length })}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={addFolder}
                disabled={!window.electronAPI?.selectDirectory}
                className="flex items-center gap-2 px-6 py-2 text-xs font-bold bg-primary text-on-primary rounded-md shadow-md shadow-primary/20 hover:brightness-110 transition-all cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-sm">folder_special</span>
                {t('offlineLibrary.addFolder')}
              </button>
              <button
                type="button"
                onClick={() => onOpenCbzFile?.()}
                disabled={typeof onOpenCbzFile !== 'function' || !window.electronAPI?.pickAndLoadArchive}
                data-tooltip={t('offlineLibrary.openFileTitle')}
                className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold bg-tertiary-container text-on-tertiary-container rounded-md border border-white/15 shadow-md shadow-tertiary-container/35 hover:brightness-110 dark:shadow-black/40 transition-all cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {cbzLoadProgress && (!cbzLoadProgress.filePath || cbzLoadProgress.source === 'pickFile') && !loadingArchiveFilePath ? (
                  <>
                    <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                    {cbzLoadProgress.total > 0 ? `${cbzLoadProgress.pct ?? 0}%` : '…'}
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-sm">archive</span>
                    {t('offlineLibrary.openFile')}
                  </>
                )}
              </button>
              {typeof onFetchAllFavorites === 'function' && favorites.length > 0 ? (
                <button
                  type="button"
                  onClick={() => onFetchAllFavorites()}
                  disabled={fetchAllFavoritesBusy}
                  className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-surface-container-highest text-primary border border-outline-variant/25 rounded-md hover:bg-surface-bright transition-all cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  <span className={`material-symbols-outlined text-sm ${fetchAllFavoritesBusy ? 'animate-spin' : ''}`}>
                    {fetchAllFavoritesBusy ? 'progress_activity' : 'sync'}
                  </span>
                  {fetchAllFavoritesBusy
                    ? t('offlineLibrary.checkAllUpdatesBusy')
                    : t('offlineLibrary.checkAllUpdates')}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => handleManualRefresh()}
                disabled={loading || !base}
                data-tooltip={t('offlineLibrary.refreshTooltip') || t('offlineLibrary.refresh')}
                aria-label={t('offlineLibrary.refreshTooltip') || t('offlineLibrary.refresh')}
                className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-surface-container-highest text-primary border border-outline-variant/25 rounded-md hover:bg-surface-bright transition-all cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
              >
                <span className={`material-symbols-outlined text-sm ${loading ? 'animate-spin' : ''}`}>
                  refresh
                </span>
                {t('offlineLibrary.refresh')}
              </button>
            </div>
          </div>
          {cbzLoadProgress && cbzLoadProgress.total > 0 ? (
            <div className="h-1.5 w-full rounded-full bg-surface-container-highest overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-200"
                style={{ width: `${cbzLoadProgress.pct ?? 0}%` }}
              />
            </div>
          ) : cbzError ? (
            <div className="flex items-start gap-1.5 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">
              <span className="material-symbols-outlined text-sm shrink-0 mt-px">error</span>
              <span>{cbzError}</span>
            </div>
          ) : null}
        </div>
      </div>

      <SendToKindleModal
        open={!!kindleRow}
        row={kindleRow}
        onClose={() => setKindleRow(null)}
      />

      {cbzFolderModalOpen ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/55 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cbz-folder-modal-title"
          onClick={closeCbzFolderModal}
        >
          <div
            className="w-full max-w-lg max-h-[min(85vh,520px)] min-h-0 flex flex-col rounded-xl border border-outline-variant/20 bg-surface-container-high shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-2 border-b border-outline-variant/15 shrink-0">
              <div className="min-w-0 pr-2">
                <h2 id="cbz-folder-modal-title" className="text-base font-bold text-on-surface">
                  {cbzFolderFiles.some((f) => f.format !== 'CBZ')
                    ? t('offlineLibrary.archiveFolderModalTitle')
                    : t('offlineLibrary.cbzFolderModalTitle')}
                </h2>
                <p className="text-[11px] text-on-surface-variant mt-1 break-all line-clamp-3" data-tooltip={cbzFolderPath}>
                  {cbzFolderPath}
                </p>
              </div>
              <button
                type="button"
                onClick={closeCbzFolderModal}
                className="shrink-0 rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-low transition-colors cursor-pointer"
                aria-label={t('offlineLibrary.cbzFolderModalClose')}
              >
                <span className="material-symbols-outlined text-[22px] leading-none">close</span>
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-3 py-2">
              {cbzFolderFiles.length > 0 ? (
                <ul className="divide-y divide-outline-variant/10 rounded-lg border border-outline-variant/15 bg-surface-container-highest/50">
                  {cbzFolderFiles.map((f) => (
                    <li
                      key={f.absolutePath}
                      className="flex min-w-0 items-center justify-between gap-2 px-3 py-2.5 text-xs"
                    >
                      <span className="min-w-0 flex items-center gap-1.5 truncate text-on-surface" data-tooltip={f.name}>
                        <span className="truncate">{f.name}</span>
                        {f.format ? (
                          <span className="shrink-0 text-xs px-1 py-0.5 rounded bg-blue-500/20 text-blue-400 font-mono">{f.format}</span>
                        ) : null}
                      </span>
                      {(() => {
                        const ext = f.name?.split('.').pop()?.toLowerCase();
                        const isEbook = ext === 'epub' || ext === 'pdf';
                        const isDetecting = detectingPath === f.absolutePath;
                        const isThisLoading =
                          loadingArchiveFilePath === f.absolutePath ||
                          (cbzLoadProgress?.filePath && cbzLoadProgress.filePath === f.absolutePath);
                        return (
                          <button
                            type="button"
                            onClick={async () => {
                              if (!isEbook) {
                                setLoadingArchiveFilePath(f.absolutePath);
                                onReadCbzFromPath?.(f.absolutePath);
                                return;
                              }
                              const api = window.electronAPI;
                              if (!api?.detectEbookContentType) {
                                setLoadingArchiveFilePath(f.absolutePath);
                                onReadCbzFromPath?.(f.absolutePath);
                                return;
                              }
                              setDetectingPath(f.absolutePath);
                              setError('');
                              try {
                                const result = await api.detectEbookContentType(f.absolutePath);
                                if (!result?.ok) {
                                  setError(result?.error || t('offlineLibrary.cbzFolderScanFailed'));
                                } else if (result.contentType === 'text') {
                                  onOpenEbook?.(f.absolutePath);
                                } else {
                                  setLoadingArchiveFilePath(f.absolutePath);
                                  onReadCbzFromPath?.(f.absolutePath);
                                }
                              } catch (e) {
                                setError(String(e?.message || e));
                              } finally {
                                setDetectingPath(null);
                              }
                            }}
                            disabled={isDetecting || !!cbzLoadProgress || (!isEbook && typeof onReadCbzFromPath !== 'function')}
                            className={`shrink-0 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed ${isThisLoading
                                ? 'bg-primary text-on-primary shadow-xs'
                                : 'bg-primary/15 text-primary hover:bg-primary/25 disabled:opacity-40'
                              }`}
                          >
                            {isDetecting || isThisLoading ? (
                              <span className="material-symbols-outlined text-[13px] leading-none animate-spin">progress_activity</span>
                            ) : null}
                            {isThisLoading && cbzLoadProgress && cbzLoadProgress.total > 0
                              ? `${cbzLoadProgress.pct ?? 0}%`
                              : t('offlineLibrary.readThisCbz')}
                          </button>
                        );
                      })()}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-on-surface-variant px-1 py-2">{t('offlineLibrary.cbzFolderEmpty')}</p>
              )}
            </div>
            <div className="flex justify-end px-4 py-3 border-t border-outline-variant/15 shrink-0 bg-surface-container-high">
              <button
                type="button"
                onClick={closeCbzFolderModal}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-on-primary shadow-md hover:brightness-110 transition-[filter] cursor-pointer"
              >
                {t('offlineLibrary.cbzFolderModalClose')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
