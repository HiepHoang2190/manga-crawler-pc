import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import TitleBar from './TitleBar.jsx';
import MenuBar, { VIEWS } from './MenuBar.jsx';
import ConsolePanel from './ConsolePanel.jsx';
import StatusBar from './StatusBar.jsx';
import ZoomHudToast from './ZoomHudToast.jsx';
import CommandPaletteModal from './CommandPaletteModal.jsx';
import { formatShortcutHint, getVisibleOrderedViews, isEditableEventTarget } from './commandPaletteUtils.mjs';
import {
  DEFAULT_ZOOM_FACTOR,
  clampZoomFactor,
  stepZoomFactor,
  detectAppZoomShortcut,
} from './zoomUtils.mjs';
import {
  computeQueueTaskbarProgress,
  summarizeQueueCompletion,
  shouldNotifyQueueCompletion,
} from './downloadProgressUtils.mjs';
import { countUnreadErrorsSince } from './consoleLogUtils.mjs';
import { useTheme } from '../../context/ThemeContext';
import { useSettings, SettingsPanel, UpdateBadge, AppUpdateModal } from '../settings';
import { useConnectorList } from '../../platform/connectors';
import { useShellNav } from './ShellNavProvider.jsx';
import { GlobalTooltip, TabErrorBoundary, useAppLog } from '../../shared';
import {
  useDownload,
  QueueRestoreModal,
  QUEUE_SNAPSHOT_KEY,
  snapshotStats,
  dedupeChaptersByNumber,
} from '../download';
import { useReader } from '../reader';
import {
  useLibrary,
  FavoriteUpdateBell,
} from '../library';
import { useExport } from '../export';
import { useAuth, AuthRequiredView, GuestCreditBadge, FreeUserTokenExhaustedModal } from '../../auth';
import HomeWorkspace from '../home';
import { ExtrasInstallModal } from '../extras';
import {
  FREE_USER_TOKEN_MAX,
} from '../../utils/authSession';
import { useI18n } from '../../context/I18nContext';
import { scheduleAutoBackup } from '../../utils/autoBackup';
import DashboardPanel, {
  getContinueReading,
  getNewChapterFavorites,
  getQueueStatus,
  getRecentDownloadsForDashboard,
  getLibraryStats,
  getKpiTiles,
  getDownloadsPerDay,
  getConnectorBreakdown,
  getMangaChapterRankingFromFavorites,
  getMangaChapterRankingFromLocal,
  getMangaStorageRanking,
  prettifyUrlForTitle,
  prettifyChapterTitle,
} from '../dashboard';
import { getRecentDownloads } from '../../utils/recentDownloadsLog';
import { addUsageSeconds, getUsagePerDay, getUsageTodaySeconds } from '../../utils/usageLog';
import {
  loadHiddenSavePaths,
  filterVisibleLocalMangaItems,
  clearHiddenSavePaths,
  HIDDEN_SAVE_PATHS_KEY,
} from '../../utils/offlineLibraryHiddenPaths';

const ExplorePanel = lazy(() => import('../explore'));
const PluginManagementPanel = lazy(() => import('../plugins'));
const SiteCheckerPanel = lazy(() => import('../site-checker'));
const MangaTranslateTab = lazy(() => import('../translate').then((m) => ({ default: m.MangaTranslateTab })));
const WorkflowStudio = lazy(() => import('../workflow').then((m) => ({ default: m.WorkflowStudio })));
const EbookStudio = lazy(() => import('../ebook-studio').then((m) => ({ default: m.EbookStudio })));
const ToolsStudio = lazy(() => import('../tools-studio').then((m) => ({ default: m.ToolsStudio })));
const DonatePanel = lazy(() => import('../donate'));
const HelpGuideModal = lazy(() => import('../help').then((m) => ({ default: m.HelpGuideModal })));

function TabLoadingFallback({ label }) {
  return (
    <div className="flex flex-1 min-h-0 items-center justify-center bg-surface text-on-surface-variant p-6 select-none">
      <div className="inline-flex items-center gap-2.5 rounded-2xl border border-outline-variant/20 bg-surface-container-high/80 px-4 py-2.5 text-xs font-medium shadow-sm">
        <span className="material-symbols-outlined text-[18px] text-primary animate-spin">
          progress_activity
        </span>
        <span>{label}</span>
      </div>
    </div>
  );
}

const LOG_FOOTER_VISIBLE_KEY = 'mangaLogFooterVisible';

function loadLogFooterVisible() {
  if (typeof window === 'undefined') return true;
  try {
    if (localStorage.getItem(LOG_FOOTER_VISIBLE_KEY) === 'false') return false;
  } catch {
    /* ignore */
  }
  return true;
}

const LOG_PANEL_HEIGHT_KEY = 'mangaLogPanelHeightPx';
const LOG_PANEL_HEIGHT_DEFAULT = 128;
const LOG_PANEL_H_MIN = 96;
const LOG_PANEL_H_MAX = 560;

function clampLogPanelHeight(px, innerHeight) {
  const h = typeof innerHeight === 'number' ? innerHeight : 800;
  const max = Math.min(LOG_PANEL_H_MAX, Math.max(LOG_PANEL_H_MIN + 80, h - 240));
  return Math.max(LOG_PANEL_H_MIN, Math.min(max, Math.round(px)));
}

function loadLogPanelHeight() {
  if (typeof window === 'undefined') return LOG_PANEL_HEIGHT_DEFAULT;
  try {
    const n = Number(localStorage.getItem(LOG_PANEL_HEIGHT_KEY));
    if (Number.isFinite(n)) return clampLogPanelHeight(n, window.innerHeight);
  } catch {
    /* ignore */
  }
  return LOG_PANEL_HEIGHT_DEFAULT;
}

export default function ShellLayout() {
  const { t } = useI18n();
  const { toggleDarkMode } = useTheme();
  const { logs, appendLog, clearLogs } = useAppLog();
  const { handleAuthGateLoggedIn: finishAuthLogin, ...auth } = useAuth();
  const {
    authBootstrapped,
    authSession,
    setAuthSession,
    authInvalidReason,
    setAuthInvalidReason,
    isSignedIn,
    freeUserRemainingTokens,
    setFreeUserRemainingTokens,
    freeUserTokenExhaustedOpen,
    setFreeUserTokenExhaustedOpen,
    shouldConsumeFreeUserToken,
  } = auth;
  const {
    savePath,
    setSavePath,
    threads,
    autoRetryMax,
    setAutoRetryMax,
    duplicateScanRecursive,
    setDuplicateScanRecursive,
    chapterFolder,
    setChapterFolder,
    persistChapterFolder,
    mangadexVolumeFolderGrouping,
    setMangadexVolumeFolderGrouping,
    handleBrowse,
    setThreadsClamped,
    autoCheckUpdate,
    setAutoCheckUpdate,
    appUpdateState,
    setAppUpdateState,
    appUpdateError,
    setAppUpdateError,
    appUpdateDownloadProgress,
    setAppUpdateDownloadProgress,
    appUpdateDownloadedPath,
    setAppUpdateDownloadedPath,
    updateAvailableVersion,
    updateCheckResult,
    setUpdateCheckResult,
    scrollSettingsToUpdate,
    setScrollSettingsToUpdate,
    scrollSettingsToSection,
    setScrollSettingsToSection,
  } = useSettings();
  const { connectorList, refreshConnectorList } = useConnectorList();
  const {
    menuView,
    setMenuView,
    hiddenMenuIds,
    toggleHiddenMenu,
    menuOrder,
    handleMoveMenu,
    handleReorderMenu,
    handleResetMenuPrefs,
  } = useShellNav();
  const isExploreView =
    menuView === 'explore' || menuView === 'latestUpdates' || menuView === 'bulkScan';
  const normalizedTabKey = isExploreView ? 'explore' : menuView;
  const [visitedTabs, setVisitedTabs] = useState(
    () => new Set([normalizedTabKey]),
  );
  const hasVisitedExplore = visitedTabs.has('explore');

  useEffect(() => {
    setVisitedTabs((prev) => {
      if (prev.has(normalizedTabKey)) return prev;
      const next = new Set(prev);
      next.add(normalizedTabKey);
      return next;
    });
  }, [normalizedTabKey]);

  const tabLabelMap = useMemo(() => {
    const map = {};
    for (const v of VIEWS) {
      map[v.id] = t(v.key);
    }
    return map;
  }, [t]);
  const {
    queue,
    queueSelectedIds,
    pendingRestoreQueue,
    confirmRestoreQueue,
    dismissRestoreQueue,
    queueRef,
    queueSelectedIdsRef,
    manga,
    chapters,
    site,
    setSite,
    sourceUrl,
    setSourceUrl,
    selectedUrls,
    fetchError,
    loading,
    coverFetchSuccessTick,
    coverFetchDurationMs,
    mangadexLanguage,
    setMangadexLanguage,
    comickLanguage,
    setComickLanguage,
    mangaballLanguage,
    setMangaballLanguage,
    hydrateSession,
    loadManga: loadMangaWithParams,
    queueProcessing,
    startQueue,
    stopQueue,
    downloadProgress,
    downloadHistory,
    clearDownloadHistory,
    removeDownloadHistoryEntry,
    focusQueueTab,
    enqueueChapters,
  } = useDownload();
  const {
    readerOpen,
    cbzLoadProgress,
    cbzError,
    recentExtractedCbzEntries,
    removeRecentExtractedCbzEntry,
    openReader,
    openEbook,
    openArchivePath,
  } = useReader();
  const {
    favorites,
    favoritesNotifyWatchCount,
    toggleFavorite,
    toggleFavoriteFromLatest,
    removeFavorite,
    toggleFavoriteNotifyWatch,
    isMangaFavorite,
    fetchMangaFromFavorite,
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
    downloadedCountForReaderCbz,
    favoriteSyncById,
    enqueueFavoritePendingChapters,
    fetchAllFavoritesBusy,
    bellReadRemoteById,
    favoriteAutoCheckEnabled,
    setFavoriteAutoCheckEnabled,
    favoriteAutoCheckIntervalMin,
    setFavoriteAutoCheckIntervalMin,
    lastFavoriteAutoCheckAt,
    favoriteAutoDownloadEnabled,
    setFavoriteAutoDownloadEnabled,
    favoriteAutoDownloadMode,
    setFavoriteAutoDownloadMode,
    favoriteAutoDownloadWorkflowId,
    setFavoriteAutoDownloadWorkflowId,
    readChapterAllowedUrls,
  } = useLibrary();
  const { setCbzExportDrawerOpen, setpdfExportOpen } = useExport();

  /** Ẩn/hiện vùng footer có log + cấu hình nhanh (ConsolePanel). */
  const [logFooterVisible, setLogFooterVisible] = useState(() => loadLogFooterVisible());
  /** Chiều cao panel log (footer giữa queue và status bar). */
  const [logPanelHeightPx, setLogPanelHeightPx] = useState(() => loadLogPanelHeight());
  const logPanelHeightRef = useRef(logPanelHeightPx);
  /** Tab ID hiện tại cho contextual help modal (null = đóng). */
  const [menuHelpTabId, setMenuHelpTabId] = useState(null);
  /** Global Command Palette (⌘K / Ctrl+K) */
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  /** App Zoom level indicator & transient HUD */
  const [zoomFactor, setZoomFactorState] = useState(() => {
    try {
      return clampZoomFactor(window.electronAPI?.getZoomFactorSync?.());
    } catch {
      return DEFAULT_ZOOM_FACTOR;
    }
  });
  const zoomFactorRef = useRef(zoomFactor);
  zoomFactorRef.current = zoomFactor;
  const zoomSeqRef = useRef(0);
  const zoomHydratedRef = useRef(false);
  const [zoomHudVisible, setZoomHudVisible] = useState(false);
  const zoomHudTimerRef = useRef(null);
  const zoomHudHoveredRef = useRef(false);
  /** Unread error timestamp threshold while Console drawer is collapsed */
  const [lastSeenErrorTime, setLastSeenErrorTime] = useState(() => Date.now());
  /** Previous queueProcessing state + snapshot for desktop completion notification */
  const wasQueueProcessingRef = useRef(false);
  const queueStartSnapshotRef = useRef({ done: 0, errors: 0 });
  /** Trạng thái tab Connector đang quét kiểm tra kết nối */
  const [siteCheckerBusy, setSiteCheckerBusy] = useState(false);
  const tabBusyMap = useMemo(() => ({
    home: Boolean(queueProcessing),
    siteChecker: Boolean(siteCheckerBusy),
  }), [queueProcessing, siteCheckerBusy]);

  /** Trạng thái modal nhắc tải Gói Bổ Trợ AI & Upscale khi mở app */
  const [showStartupExtrasModal, setShowStartupExtrasModal] = useState(false);
  const startupExtrasCheckedRef = useRef(false);

  useEffect(() => {
    if (startupExtrasCheckedRef.current) return;
    startupExtrasCheckedRef.current = true;

    if (window?.electronAPI?.extrasGetStatus) {
      window.electronAPI.extrasGetStatus().then((status) => {
        if (status && !status.installed) {
          setShowStartupExtrasModal(true);
        }
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    logPanelHeightRef.current = logPanelHeightPx;
  }, [logPanelHeightPx]);

  useEffect(() => {
    const onResize = () => {
      setLogPanelHeightPx((h) => clampLogPanelHeight(h, window.innerHeight));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const toggleLogFooter = useCallback(() => {
    setLogFooterVisible((v) => {
      const next = !v;
      try {
        localStorage.setItem(LOG_FOOTER_VISIBLE_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const visibleOrderedViews = useMemo(
    () => getVisibleOrderedViews(VIEWS, hiddenMenuIds, menuOrder),
    [hiddenMenuIds, menuOrder]
  );

  const scheduleZoomHudHide = useCallback(() => {
    if (zoomHudTimerRef.current) clearTimeout(zoomHudTimerRef.current);
    zoomHudTimerRef.current = setTimeout(() => {
      zoomHudTimerRef.current = null;
      if (!zoomHudHoveredRef.current) {
        setZoomHudVisible(false);
      }
    }, 1800);
  }, []);

  const showZoomHud = useCallback(() => {
    setZoomHudVisible(true);
    scheduleZoomHudHide();
  }, [scheduleZoomHudHide]);

  useEffect(
    () => () => {
      if (zoomHudTimerRef.current) clearTimeout(zoomHudTimerRef.current);
    },
    []
  );

  const commitLocalZoom = useCallback(
    (nextFactor, showHud = true) => {
      const next = clampZoomFactor(nextFactor);
      zoomFactorRef.current = next;
      setZoomFactorState(next);
      if (showHud) showZoomHud();
      return next;
    },
    [showZoomHud]
  );

  const handleSetZoomFactor = useCallback(
    async (nextFactor, showHud = true) => {
      zoomHydratedRef.current = true;
      const seq = ++zoomSeqRef.current;
      const clamped = clampZoomFactor(nextFactor);
      commitLocalZoom(clamped, showHud);
      try {
        const res = await window.electronAPI?.setZoomFactor?.(clamped, 'ui');
        if (seq === zoomSeqRef.current && res?.ok && Number.isFinite(res.zoomFactor)) {
          commitLocalZoom(res.zoomFactor, showHud);
        }
      } catch {
        /* non-Electron fallback keeps local state */
      }
    },
    [commitLocalZoom]
  );

  const handleStepZoom = useCallback(
    async (direction, source = 'ui') => {
      zoomHydratedRef.current = true;
      const seq = ++zoomSeqRef.current;
      const optimistic = stepZoomFactor(zoomFactorRef.current, direction);
      commitLocalZoom(optimistic, true);
      try {
        const res = await window.electronAPI?.stepZoom?.(direction, source);
        if (seq === zoomSeqRef.current && res?.ok && Number.isFinite(res.zoomFactor)) {
          commitLocalZoom(res.zoomFactor, true);
        }
      } catch {
        /* non-Electron fallback keeps local state */
      }
    },
    [commitLocalZoom]
  );

  const handleZoomIn = useCallback(() => void handleStepZoom('in', 'ui'), [handleStepZoom]);
  const handleZoomOut = useCallback(() => void handleStepZoom('out', 'ui'), [handleStepZoom]);
  const handleResetZoom = useCallback(
    async (source = 'ui') => {
      zoomHydratedRef.current = true;
      zoomHudHoveredRef.current = false;
      const seq = ++zoomSeqRef.current;
      commitLocalZoom(DEFAULT_ZOOM_FACTOR, true);
      try {
        const res = await window.electronAPI?.resetZoom?.(source);
        if (seq === zoomSeqRef.current && res?.ok && Number.isFinite(res.zoomFactor)) {
          commitLocalZoom(res.zoomFactor, true);
        }
      } catch {
        /* non-Electron fallback keeps local state */
      }
    },
    [commitLocalZoom]
  );

  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.electronAPI : null;
    let mounted = true;
    const hydrateTimer = setTimeout(() => {
      zoomHydratedRef.current = true;
    }, 1500);
    if (api?.getZoomFactor) {
      api
        .getZoomFactor()
        .then((res) => {
          if (mounted && res?.ok && Number.isFinite(res.zoomFactor)) {
            zoomHydratedRef.current = true;
            commitLocalZoom(res.zoomFactor, false);
          }
        })
        .catch(() => {
          zoomHydratedRef.current = true;
        });
    } else {
      zoomHydratedRef.current = true;
    }
    const unsubscribe = api?.onZoomChanged?.((payload) => {
      if (!mounted || !Number.isFinite(payload?.zoomFactor)) return;
      zoomHydratedRef.current = true;
      zoomSeqRef.current += 1;
      const isInit = payload?.source === 'init';
      commitLocalZoom(payload.zoomFactor, !isInit);
    });
    const handleResizeForNativeZoom = () => {
      if (!zoomHydratedRef.current) return;
      const raw = api?.getZoomFactorSync?.();
      if (!Number.isFinite(raw)) return;
      const next = clampZoomFactor(raw);
      if (Math.abs(next - zoomFactorRef.current) >= 0.005) {
        zoomSeqRef.current += 1;
        commitLocalZoom(next, true);
        void api?.setZoomFactor?.(next, 'native');
      }
    };
    window.addEventListener('resize', handleResizeForNativeZoom);
    return () => {
      mounted = false;
      clearTimeout(hydrateTimer);
      unsubscribe?.();
      window.removeEventListener('resize', handleResizeForNativeZoom);
    };
  }, [commitLocalZoom]);

  useEffect(() => {
    const handleZoomKeyDown = (e) => {
      if (e.defaultPrevented) return;
      if (readerOpen) return;
      const action = detectAppZoomShortcut(e);
      if (!action) return;
      if (action === 'reset' && menuView === 'translate') return;
      e.preventDefault();
      if (action === 'in') void handleStepZoom('in', 'shortcut');
      else if (action === 'out') void handleStepZoom('out', 'shortcut');
      else if (action === 'reset') void handleResetZoom('shortcut');
    };
    window.addEventListener('keydown', handleZoomKeyDown);
    return () => window.removeEventListener('keydown', handleZoomKeyDown);
  }, [readerOpen, menuView, handleStepZoom, handleResetZoom]);

  useEffect(() => {
    if (!authBootstrapped || !isSignedIn) return undefined;
    const handleGlobalKeyDown = (e) => {
      if (e.defaultPrevented || readerOpen) return;
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      const key = String(e.key || '').toLowerCase();
      if (key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
        return;
      }
      if (key === 'j') {
        e.preventDefault();
        toggleLogFooter();
        return;
      }
      if (/^[1-9]$/.test(key) && !isEditableEventTarget(e.target)) {
        if (menuView === 'translate' && key === '1') return;
        const idx = Number(key) - 1;
        const targetTab = visibleOrderedViews[idx];
        if (targetTab) {
          e.preventDefault();
          setMenuView(targetTab.id);
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [authBootstrapped, isSignedIn, readerOpen, menuView, toggleLogFooter, visibleOrderedViews, setMenuView]);

  const commandPaletteItems = useMemo(() => {
    const tabGroupLabel = t('commandPalette.group.tabs');
    const actionGroupLabel = t('commandPalette.group.actions');
    const items = visibleOrderedViews.map((tab, index) => ({
      id: `tab:${tab.id}`,
      group: tabGroupLabel,
      label: t(tab.key),
      keywords: `${tab.id} ${t(tab.key)}`,
      icon: tab.icon,
      active: normalizedTabKey === tab.id,
      shortcut: index < 9 ? formatShortcutHint(String(index + 1)) : '',
      onSelect: () => setMenuView(tab.id),
    }));

    items.push(
      {
        id: 'action:toggle-console',
        group: actionGroupLabel,
        label: t('commandPalette.action.toggleConsole'),
        keywords: 'console log footer drawer debug',
        icon: 'terminal',
        shortcut: formatShortcutHint('j'),
        onSelect: toggleLogFooter,
      },
      {
        id: 'action:toggle-theme',
        group: actionGroupLabel,
        label: t('commandPalette.action.toggleTheme'),
        keywords: 'theme dark light mode giao dien sang toi',
        icon: 'contrast',
        onSelect: toggleDarkMode,
      },
      {
        id: 'action:open-help',
        group: actionGroupLabel,
        label: t('commandPalette.action.openHelp'),
        keywords: 'help guide huong dan tro giup',
        icon: 'help',
        onSelect: () => setMenuHelpTabId(normalizedTabKey),
      },
      {
        id: 'action:zoom-in',
        group: actionGroupLabel,
        label: t('commandPalette.action.zoomIn'),
        keywords: 'zoom in phong to scale ui',
        icon: 'zoom_in',
        shortcut: formatShortcutHint('+'),
        onSelect: handleZoomIn,
      },
      {
        id: 'action:zoom-out',
        group: actionGroupLabel,
        label: t('commandPalette.action.zoomOut'),
        keywords: 'zoom out thu nho scale ui',
        icon: 'zoom_out',
        shortcut: formatShortcutHint('-'),
        onSelect: handleZoomOut,
      },
      {
        id: 'action:zoom-reset',
        group: actionGroupLabel,
        label: t('commandPalette.action.zoomReset'),
        keywords: 'zoom reset 100% mac dinh binh thuong',
        icon: 'restart_alt',
        shortcut: formatShortcutHint('0'),
        onSelect: () => void handleResetZoom('palette'),
      },
    );

    if (queueProcessing) {
      items.push({
        id: 'action:stop-queue',
        group: actionGroupLabel,
        label: t('commandPalette.action.stopQueue'),
        keywords: 'stop queue download dung hang doi tai',
        icon: 'stop_circle',
        onSelect: stopQueue,
      });
    } else if (Array.isArray(queue) && queue.length > 0) {
      items.push({
        id: 'action:start-queue',
        group: actionGroupLabel,
        label: t('commandPalette.action.startQueue'),
        keywords: 'start queue download bat dau hang doi tai',
        icon: 'play_circle',
        onSelect: startQueue,
      });
    }

    if (Array.isArray(favorites) && favorites.length > 0) {
      const favGroupLabel = t('commandPalette.group.favorites');
      for (const fav of favorites) {
        const favTitle = String(fav?.title || '').trim();
        const favUrl = String(fav?.mangaUrl || '').trim();
        if (!favTitle || !favUrl) continue;
        const sync = favoriteSyncById?.[fav.id];
        const newCount = sync?.hasNew && typeof sync.remoteCount === 'number' ? sync.remoteCount : 0;
        items.push({
          id: `fav:${fav.id || favUrl}`,
          group: favGroupLabel,
          label: favTitle,
          keywords: `${favTitle} ${fav?.siteId || ''} ${favUrl}`,
          icon: 'bookmark',
          badge: newCount > 0 ? t('commandPalette.newChaptersBadge', { count: newCount }) : '',
          onSelect: () => {
            void fetchMangaFromFavorite(fav);
          },
        });
      }
    }

    return items;
  }, [
    visibleOrderedViews,
    normalizedTabKey,
    t,
    setMenuView,
    toggleLogFooter,
    toggleDarkMode,
    queueProcessing,
    queue,
    stopQueue,
    startQueue,
    favorites,
    favoriteSyncById,
    fetchMangaFromFavorite,
    handleZoomIn,
    handleZoomOut,
    handleResetZoom,
  ]);

  const queueProgressSummary = useMemo(
    () => computeQueueTaskbarProgress(queue, downloadProgress, queueProcessing),
    [queue, downloadProgress, queueProcessing]
  );

  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.electronAPI : null;
    if (!api?.setTaskbarProgress) return undefined;
    api.setTaskbarProgress(queueProgressSummary.ratio, queueProgressSummary.mode);
    return undefined;
  }, [queueProgressSummary.ratio, queueProgressSummary.mode]);

  useEffect(() => {
    return () => {
      window.electronAPI?.setTaskbarProgress?.(-1, 'none');
    };
  }, []);

  useEffect(() => {
    const wasRunning = wasQueueProcessingRef.current;
    const isRunning = Boolean(queueProcessing);
    wasQueueProcessingRef.current = isRunning;

    if (!wasRunning && isRunning) {
      const startSummary = summarizeQueueCompletion(queue);
      queueStartSnapshotRef.current = { done: startSummary.done, errors: startSummary.errors };
      return;
    }

    if (!wasRunning || isRunning) return;

    const api = typeof window !== 'undefined' ? window.electronAPI : null;
    if (!api?.showDesktopNotification) return;
    const summary = summarizeQueueCompletion(queue);
    const { notify, deltaDone, deltaErrors } = shouldNotifyQueueCompletion(
      queueStartSnapshotRef.current,
      summary
    );
    if (!notify) return;

    const body =
      deltaErrors > 0
        ? t('notification.downloadDoneWithErrorsBody', {
            done: deltaDone,
            errors: deltaErrors,
            manga: summary.mangaCount,
          })
        : t('notification.downloadDoneBody', {
            done: deltaDone,
            manga: summary.mangaCount,
          });
    api
      .showDesktopNotification({
        title: t('notification.downloadDoneTitle'),
        body,
      })
      .catch(() => {});
  }, [queueProcessing, queue, t]);

  useEffect(() => {
    if (!logFooterVisible) return;
    const latestLogTime = logs.length > 0 ? Number(logs[logs.length - 1]?.t || Date.now()) : Date.now();
    setLastSeenErrorTime((prev) => Math.max(prev, latestLogTime));
  }, [logFooterVisible, logs]);

  const unreadErrorCount = useMemo(
    () => (logFooterVisible ? 0 : countUnreadErrorsSince(logs, lastSeenErrorTime)),
    [logFooterVisible, logs, lastSeenErrorTime]
  );

  const handleLogFooterResizePointerDown = useCallback((e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget;
    if (typeof el.setPointerCapture === 'function') {
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    const startY = e.clientY;
    const startH = logPanelHeightRef.current;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    let lastH = startH;
    const onMove = (ev) => {
      const delta = ev.clientY - startY;
      /* Kéo thanh xuống (delta > 0) = thu panel log; kéo lên = nới — khớp cảm giác “kéo ranh giới”. */
      const next = clampLogPanelHeight(startH - delta, window.innerHeight);
      lastH = next;
      setLogPanelHeightPx(next);
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (typeof el.releasePointerCapture === 'function') {
        try {
          el.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }
      try {
        localStorage.setItem(LOG_PANEL_HEIGHT_KEY, String(lastH));
      } catch {
        /* ignore */
      }
    };
    function onUp() {
      cleanup();
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, []);

  /** Sao lưu tự động 24h (Electron): ghi đè userData/manga-clawer-auto-backup.json khi dữ liệu đổi. */
  useEffect(() => {
    if (!authBootstrapped) return undefined;
    return scheduleAutoBackup();
  }, [authBootstrapped]);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.subscribeMangaLog) return undefined;
    const unsub = api.subscribeMangaLog((data) => {
      appendLog(data?.msg, data?.level);
    });
    return () => unsub?.();
  }, [appendLog]);

  const handleAuthGateLoggedIn = useCallback(async () => {
    await finishAuthLogin();
    setMenuView('home');
  }, [finishAuthLogin, setMenuView]);

  const handleQueueRestoreConfirm = useCallback(() => {
    const hadIncompleteWork = Boolean(pendingRestoreQueue?.length);
    confirmRestoreQueue();
    if (!hadIncompleteWork) return;
    appendLog(t('app.log.queueRestored'), 'info');
    focusQueueTab();
  }, [pendingRestoreQueue, confirmRestoreQueue, appendLog, t, focusQueueTab]);

  const handleQueueRestoreDiscard = useCallback(() => {
    dismissRestoreQueue();
  }, [dismissRestoreQueue]);

  const handleOpenMangaFolder = useCallback(
    async (mangaTitle, baseSaveDirOverride) => {
      const api = window.electronAPI;
      const base = String(baseSaveDirOverride ?? savePath).trim();
      if (!base) {
        appendLog(t('offlineLibrary.needSavePath'), 'warn');
        return;
      }
      if (!api?.openMangaFolder) {
        appendLog(t('app.log.electronOpenFolder'), 'warn');
        return;
      }
      const r = await api.openMangaFolder(base, mangaTitle);
      if (!r?.ok) appendLog(r?.error || t('app.log.openFolderFailed'), 'warn');
    },
    [savePath, appendLog, t]
  );

  const handleOpenChapterFolder = useCallback(
    async (mangaTitle, chapterTitle, baseSaveDirOverride) => {
      const api = window.electronAPI;
      const base = String(baseSaveDirOverride ?? savePath).trim();
      if (!base) {
        appendLog(t('offlineLibrary.needSavePath'), 'warn');
        return;
      }
      if (!api?.openChapterFolder) {
        appendLog(t('app.log.electronOpenFolder'), 'warn');
        return;
      }
      const r = await api.openChapterFolder(base, mangaTitle, chapterTitle);
      if (!r?.ok) appendLog(r?.error || t('app.log.openFolderFailed'), 'warn');
    },
    [savePath, appendLog, t]
  );

  const readerUsageStartRef = useRef(null);
  const readerUsageIntervalRef = useRef(null);

  useEffect(() => {
    const flushReaderUsage = () => {
      const start = readerUsageStartRef.current;
      if (start == null) return;
      const elapsed = Math.floor((Date.now() - start) / 1000);
      readerUsageStartRef.current = null;
      if (elapsed > 0) {
        addUsageSeconds(elapsed);
        setDashboardTick((n) => n + 1);
      }
    };

    if (!readerOpen) {
      flushReaderUsage();
      if (readerUsageIntervalRef.current) {
        clearInterval(readerUsageIntervalRef.current);
        readerUsageIntervalRef.current = null;
      }
      return undefined;
    }

    readerUsageStartRef.current = Date.now();
    readerUsageIntervalRef.current = window.setInterval(() => {
      const s = readerUsageStartRef.current;
      if (s == null) return;
      const elapsed = Math.floor((Date.now() - s) / 1000);
      if (elapsed >= 30) {
        addUsageSeconds(elapsed);
        readerUsageStartRef.current = Date.now();
        setDashboardTick((n) => n + 1);
      }
    }, 30000);

    return () => {
      flushReaderUsage();
      if (readerUsageIntervalRef.current) {
        clearInterval(readerUsageIntervalRef.current);
        readerUsageIntervalRef.current = null;
      }
    };
  }, [readerOpen]);

  /** Đọc/Mới nhất → đồng bộ manga + chapters về Home (và refs) trước khi gọi reader/stream. */
  const prepareLatestDrawerForRead = useCallback((drawer_manga, drawer_chapters) => {
    flushSync(() => {
      const drawer_site_id = String(drawer_manga?.siteId || '').trim();
      hydrateSession({
        sourceUrl: String(drawer_manga?.mangaUrl || '').trim(),
        ...(drawer_site_id ? { site: drawer_site_id } : {}),
        manga: drawer_manga,
        chapters: Array.isArray(drawer_chapters) ? drawer_chapters : [],
        selectedUrls: new Set(),
        fetchError: '',
        chapterListNoticeKey: '',
      });
    });
  }, [hydrateSession]);

  const handleDownloadMangadexCovers = useCallback(async (mangaTitle, covers) => {
    const title = String(mangaTitle || '').trim();
    if (!title || !savePath.trim()) {
      return;
    }
    if (!Array.isArray(covers) || covers.length === 0) {
      return;
    }

    const api = window.electronAPI;
    if (!api?.downloadMangadexCovers) {
      return;
    }

    try {
      const result = await api.downloadMangadexCovers(covers, savePath, title);
      if (!result.ok) {
        return;
      }
      if (api?.openPath && result.coversFolder) {
        api.openPath(result.coversFolder);
      }
    } catch {
      // Silent fail
    }
  }, [savePath]);

  const latestMangaLoadOpts = useMemo(
    () => ({
      mangadexLanguage,
      comickLanguage,
      mangaballLanguage,
    }),
    [mangadexLanguage, comickLanguage, mangaballLanguage],
  );

  const handleEnqueueLoadedMangaFromLatest = useCallback(
    (loadResult) => {
      if (!loadResult?.ok || !loadResult.manga?.title) {
        appendLog(t('latestUpdates.enqueueLoadIncomplete'), 'warn');
        return { ok: false, error: t('latestUpdates.enqueueLoadIncomplete') };
      }
      if (!savePath.trim()) {
        appendLog(t('app.log.needSavePathShort'), 'warn');
        return { ok: false, error: t('app.log.needSavePathShort') };
      }
      const m = loadResult.manga;
      const rawList = loadResult.chapters || [];
      const list = dedupeChaptersByNumber(rawList);
      if (!list.length) {
        appendLog(t('latestUpdates.noChaptersFetched'), 'warn');
        return { ok: false, error: t('latestUpdates.noChaptersFetched') };
      }
      const mangaUrl = String(m.mangaUrl || '').trim();
      if (!mangaUrl) {
        return { ok: false, error: t('latestUpdates.enqueueLoadIncomplete') };
      }
      const { addedCount } = enqueueChapters(
        {
          mangaTitle: m.title,
          mangaUrl,
          site: m.siteId || '',
          coverUrl: m.coverUrl || '',
        },
        list
      );

      if (addedCount === 0) {
        appendLog(t('app.log.chaptersAlreadyInQueue'), 'warn');
        return { ok: false, error: t('app.log.chaptersAlreadyInQueue') };
      }

      appendLog(t('app.log.addedChaptersToQueue', { count: addedCount, title: m.title }), 'success');
      focusQueueTab();
      return { ok: true };
    },
    [savePath, appendLog, t, focusQueueTab, enqueueChapters],
  );

  const handleAddQueuedFromLatest = useCallback(
    (mangaObj, chaptersList, urlsSet) => {
      if (!mangaObj?.title || !savePath.trim()) {
        appendLog(t('app.log.needSavePathAndManga'), 'warn');
        return { ok: false };
      }
      const filtered = (Array.isArray(chaptersList) ? chaptersList : []).filter((c) =>
        urlsSet instanceof Set ? urlsSet.has(c.url) : false,
      );
      const list = dedupeChaptersByNumber(filtered);
      if (!list.length) {
        appendLog(t('chapterList.addToQueueNeedSelection'), 'warn');
        return { ok: false };
      }
      const mangaUrl = String(mangaObj.mangaUrl || '').trim();
      if (!mangaUrl) {
        appendLog(t('latestUpdates.enqueueLoadIncomplete'), 'warn');
        return { ok: false };
      }
      const { addedCount } = enqueueChapters(
        {
          mangaTitle: mangaObj.title,
          mangaUrl,
          site: mangaObj.siteId || site,
          coverUrl: mangaObj.coverUrl || '',
        },
        list
      );

      if (addedCount === 0) {
        appendLog(t('app.log.chaptersAlreadyInQueue'), 'warn');
        return { ok: false };
      }

      appendLog(t('app.log.addedChaptersToQueue', { count: addedCount, title: mangaObj.title }), 'success');
      focusQueueTab();
      return { ok: true };
    },
    [savePath, site, appendLog, t, focusQueueTab, enqueueChapters],
  );

  const [dashboardTick, setDashboardTick] = useState(0);
  const [dashboardStorageBytes, setDashboardStorageBytes] = useState(null);
  const [dashboardStorageLoading, setDashboardStorageLoading] = useState(false);
  const [dashboardCacheBytes, setDashboardCacheBytes] = useState(null);
  const [dashboardCacheLoading, setDashboardCacheLoading] = useState(false);
  const [dashboardCacheClearing, setDashboardCacheClearing] = useState(false);
  const [dashboardMangaRankings, setDashboardMangaRankings] = useState({
    chaptersLoading: false,
    byChapters: [],
    storageLoading: false,
    byStorage: [],
  });
  const storageRankingLoadRef = useRef(null);

  useEffect(() => {
    const onStorage = (e) => {
      if (!e || !e.key) return;
      if (
        e.key === 'mangaReaderProgressByManga' ||
        e.key === 'dashboardRecentDownloads' ||
        e.key === QUEUE_SNAPSHOT_KEY ||
        e.key === HIDDEN_SAVE_PATHS_KEY
      ) {
        setDashboardTick((n) => n + 1);
      }
    };
    const onDownload = () => setDashboardTick((n) => n + 1);
    const onHiddenPaths = () => setDashboardTick((n) => n + 1);
    window.addEventListener('storage', onStorage);
    window.addEventListener('crawler:download-completed', onDownload);
    window.addEventListener('crawler:hidden-save-paths-changed', onHiddenPaths);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('crawler:download-completed', onDownload);
      window.removeEventListener('crawler:hidden-save-paths-changed', onHiddenPaths);
    };
  }, []);

  useEffect(() => {
    if (menuView !== 'dashboard') return;
    const dir = String(savePath || '').trim();
    if (!dir) return;
    let cancelled = false;
    setDashboardStorageLoading(true);
    const id = setTimeout(async () => {
      try {
        const api = window.electronAPI;
        if (!api?.getFolderSize) return;
        const res = await api.getFolderSize(dir);
        if (cancelled) return;
        if (res && typeof res.bytes === 'number') {
          setDashboardStorageBytes(res.bytes);
        }
      } catch {
        // Non-fatal: KPI tile just shows the previous cached value (or '—').
      } finally {
        if (!cancelled) setDashboardStorageLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [menuView, savePath, dashboardTick]);

  useEffect(() => {
    if (menuView !== 'dashboard') return;
    let cancelled = false;
    setDashboardCacheLoading(true);
    const id = setTimeout(async () => {
      try {
        const api = window.electronAPI;
        if (!api?.getReadCacheSummary) return;
        const res = await api.getReadCacheSummary({
          hiddenAbsolutePaths: [...loadHiddenSavePaths()],
        });
        if (cancelled) return;
        if (res && res.ok && typeof res.bytes === 'number') {
          setDashboardCacheBytes(res.bytes);
        }
      } catch {
        // Non-fatal: KPI tile shows previous value or '—'.
      } finally {
        if (!cancelled) setDashboardCacheLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [menuView, dashboardTick]);

  useEffect(() => {
    if (menuView !== 'dashboard') return;
    const dir = String(savePath || '').trim();
    let cancelled = false;
    setDashboardMangaRankings((prev) => ({ ...prev, chaptersLoading: true }));

    const id = setTimeout(async () => {
      try {
        const api = window.electronAPI;
        if (!dir || !api?.listLocalMangaLibrary) {
          if (cancelled) return;
          setDashboardMangaRankings((prev) => ({
            ...prev,
            chaptersLoading: false,
            byChapters: getMangaChapterRankingFromFavorites(favorites),
          }));
          return;
        }
        const res = await api.listLocalMangaLibrary(dir);
        const items = res?.ok && Array.isArray(res.items) ? res.items : [];
        const hiddenSavePaths = loadHiddenSavePaths();
        const byChapters = getMangaChapterRankingFromLocal(items, {
          excludeAbsolutePaths: hiddenSavePaths,
        });
        if (cancelled) return;
        setDashboardMangaRankings((prev) => ({
          ...prev,
          chaptersLoading: false,
          byChapters,
        }));
      } catch {
        if (cancelled) return;
        setDashboardMangaRankings((prev) => ({
          ...prev,
          chaptersLoading: false,
          byChapters: getMangaChapterRankingFromFavorites(favorites),
        }));
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [menuView, savePath, dashboardTick, favorites]);

  const loadDashboardStorageRanking = useCallback(() => {
    if (storageRankingLoadRef.current) return storageRankingLoadRef.current;

    const dir = String(savePath || '').trim();
    setDashboardMangaRankings((prev) => ({ ...prev, storageLoading: true }));

    const promise = (async () => {
      try {
        const api = window.electronAPI;
        if (!dir || !api?.listLocalMangaLibrary) {
          setDashboardMangaRankings((prev) => ({
            ...prev,
            storageLoading: false,
            byStorage: [],
          }));
          return;
        }
        const res = await api.listLocalMangaLibrary(dir);
        const items = res?.ok && Array.isArray(res.items) ? res.items : [];
        const visibleItems = filterVisibleLocalMangaItems(items, loadHiddenSavePaths());
        const sized = await Promise.all(
          visibleItems.map(async (x) => {
            let bytes = 0;
            try {
              if (api.getFolderSize && x?.absolutePath) {
                const sz = await api.getFolderSize(x.absolutePath);
                if (sz && typeof sz.bytes === 'number') bytes = sz.bytes;
              }
            } catch {
              /* skip */
            }
            return {
              title: String(x?.mangaTitle || '').trim(),
              bytes,
            };
          }),
        );
        const byStorage = getMangaStorageRanking(
          sized.filter((x) => x.title && x.bytes > 0),
        );
        setDashboardMangaRankings((prev) => ({
          ...prev,
          storageLoading: false,
          byStorage,
        }));
      } catch {
        setDashboardMangaRankings((prev) => ({
          ...prev,
          storageLoading: false,
          byStorage: [],
        }));
      }
    })();

    storageRankingLoadRef.current = promise.finally(() => {
      storageRankingLoadRef.current = null;
    });
    return storageRankingLoadRef.current;
  }, [savePath]);

  useEffect(() => {
    storageRankingLoadRef.current = null;
    setDashboardMangaRankings((prev) => ({
      ...prev,
      storageLoading: false,
      byStorage: [],
    }));
  }, [savePath, dashboardTick]);

  const handleDashboardClearCache = useCallback(async () => {
    const api = window.electronAPI;
    if (!api?.clearReadCache) return;
    setDashboardCacheClearing(true);
    try {
      const res = await api.clearReadCache({
        hiddenAbsolutePaths: [...loadHiddenSavePaths()],
      });
      if (res?.ok) {
        clearHiddenSavePaths();
        setDashboardCacheBytes(0);
        setDashboardTick((n) => n + 1);
        appendLog(t('dashboard.cache.cleared'), 'info');
      }
    } catch {
      /* non-fatal */
    } finally {
      setDashboardCacheClearing(false);
    }
  }, [appendLog, t]);

  const dashboardData = useMemo(() => {
    const emptyKpi = {
      mangaCount: 0,
      chapterCount: 0,
      storageBytes: dashboardStorageBytes,
      downloadsToday: 0,
      usageSecondsToday: 0,
    };
    const emptyBreakdown = { items: [], others: null, total: 0 };
    try {
      const cr = getContinueReading();
      let continueReading = null;
      if (cr) {
        const f = favorites.find((x) => String(x.mangaUrl) === cr.mangaUrl);
        continueReading = {
          mangaUrl: cr.mangaUrl,
          coverUrl: f?.coverUrl || '',
          mangaTitle: f?.title || prettifyUrlForTitle(cr.mangaUrl),
          chapterTitle: prettifyChapterTitle(cr.chapterUrl),
          percent: 0,
          connectorName: cr.siteId,
        };
      }
      const nowMs = Date.now();
      const kpiBase = getKpiTiles({
          favorites,
          downloadHistory,
          storageBytes: dashboardStorageBytes,
          nowMs,
        });
      return {
        continueReading,
        favorites: getNewChapterFavorites(favoritesWithNewList, 5),
        queue: getQueueStatus(queue),
        recent: getRecentDownloadsForDashboard(getRecentDownloads(24 * 3600 * 1000), 10),
        stats: getLibraryStats(favorites, 0),
        kpi: {
          ...kpiBase,
          usageSecondsToday: getUsageTodaySeconds(nowMs),
        },
        downloadsPerDay7: getDownloadsPerDay(downloadHistory, { days: 7, nowMs }),
        downloadsPerDay30: getDownloadsPerDay(downloadHistory, { days: 30, nowMs }),
        usagePerDay7: getUsagePerDay({ days: 7, nowMs }),
        usagePerDay30: getUsagePerDay({ days: 30, nowMs }),
        connectorBreakdown: getConnectorBreakdown(favorites, { limit: 5 }),
        error: null,
      };
    } catch (err) {
      return {
        continueReading: null,
        favorites: { items: [], totalCount: 0 },
        queue: { runningCount: 0, waitingCount: 0, currentJob: null },
        recent: { items: [], totalChapters: 0, totalMangas: 0 },
        stats: { mangaCount: 0, totalChapterCount: 0, totalStorageBytes: 0, topConnectorId: null },
        kpi: emptyKpi,
        downloadsPerDay7: [],
        downloadsPerDay30: [],
        usagePerDay7: [],
        usagePerDay30: [],
        connectorBreakdown: emptyBreakdown,
        error: String(err?.message || err || 'aggregator failed'),
      };
    }
  }, [
    dashboardTick,
    favorites,
    favoritesWithNewList,
    queue,
    downloadHistory,
    dashboardStorageBytes,
  ]);

  let activeChapterLabel = '';
  if (downloadProgress?.mangaTitle && downloadProgress?.chapterTitle) {
    activeChapterLabel = `${downloadProgress.mangaTitle} — ${downloadProgress.chapterTitle}`;
  } else {
    for (const g of queue) {
      const d = g.chapters.find((c) => c.status === 'downloading');
      if (d) {
        activeChapterLabel = `${g.mangaTitle} — ${d.chapterTitle}`;
        break;
      }
    }
  }

  return (
    <div
      className="bg-surface-container-lowest text-on-surface flex h-screen min-h-0 flex-col overflow-hidden"
    >
      <header className="relative z-50 flex w-full shrink-0 flex-col bg-surface-dim">
        <TitleBar
          beforeWindowControls={
            shouldConsumeFreeUserToken && Number.isFinite(Number(freeUserRemainingTokens)) ? (
              <GuestCreditBadge
                remaining={Math.max(0, Math.floor(Number(freeUserRemainingTokens)))}
                max={FREE_USER_TOKEN_MAX}
              />
            ) : null
          }
          endSlot={
            authBootstrapped && isSignedIn ? (
              <>
                <UpdateBadge
                  remoteVersion={updateAvailableVersion}
                  onGoToSettings={() => {
                    setMenuView('settings');
                    setScrollSettingsToUpdate(true);
                  }}
                />
                <FavoriteUpdateBell
                  items={favoritesWithNewChaptersList}
                  onSelectFavorite={handleBellFetchFavorite}
                  onMarkUnreadItem={handleBellMarkUnreadOne}
                  onMarkAllRead={handleBellMarkAllRead}
                  onRemoveItem={handleBellRemoveOne}
                  onRemoveAll={handleBellRemoveAll}
                />
              </>
            ) : null
          }
        />
        {authBootstrapped && isSignedIn ? (
          <>
            <MenuBar
              activeView={menuView}
              onViewChange={setMenuView}
              hiddenMenuIds={hiddenMenuIds}
              menuOrder={menuOrder}
              tabBusyMap={tabBusyMap}
              onHelpClick={setMenuHelpTabId}
              onMoveMenu={handleMoveMenu}
              onReorderMenu={handleReorderMenu}
              onToggleHiddenMenu={toggleHiddenMenu}
              onResetMenuPrefs={handleResetMenuPrefs}
              onOpenCommandPalette={() => setCommandPaletteOpen(true)}
            />
            <div className="bg-surface-container-low h-px w-full" />
          </>
        ) : null}
      </header>

      {!authBootstrapped ? (
        <div className="flex-1 flex flex-col items-center justify-center text-on-surface-variant text-sm min-h-0">
          {t('auth.gate.checking')}
        </div>
      ) : null}

      {authBootstrapped && !isSignedIn ? (
        <AuthRequiredView blockedReason={authInvalidReason} onLoggedIn={handleAuthGateLoggedIn} />
      ) : null}

      {authBootstrapped && isSignedIn ? (
        <div className="relative z-0 flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      {authInvalidReason ? (
        <div
          role="alert"
          className="shrink-0 px-4 py-2.5 bg-error/12 border-b border-error/25 text-sm text-on-surface flex items-start justify-between gap-3 z-40"
        >
          <span className="leading-snug pt-0.5">
            {authInvalidReason === 'NOT_IN_WHITELIST'
              ? t('settings.account.sessionInvalidNotInSheet')
              : authInvalidReason === 'NOT_MEMBER'
                ? t('settings.account.sessionInvalidNotMember')
                : t('settings.account.sessionInvalidGeneric')}
          </span>
          <button
            type="button"
            onClick={() => setAuthInvalidReason(null)}
            className="shrink-0 rounded-md p-1 text-on-surface-variant hover:bg-error/10 hover:text-on-surface cursor-pointer"
            aria-label={t('settings.account.dismissAlert')}
          >
            <span className="material-symbols-outlined text-[20px] leading-none">close</span>
          </button>
        </div>
      ) : null}

      {/* Giữ nguyên phiên làm việc của Workflow Studio không bị reset khi chuyển qua lại giữa các menu */}
      {visitedTabs.has('workflow') ? (
        <div
          data-testid="tab-content-workflow"
          className={
            menuView === 'workflow'
              ? 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'
              : 'hidden'
          }
          aria-hidden={menuView !== 'workflow'}
        >
          <TabErrorBoundary tabId="workflow" tabLabel={tabLabelMap.workflow} t={t}>
            <Suspense fallback={<TabLoadingFallback label={t('errorBoundary.loadingTab')} />}>
              <WorkflowStudio />
            </Suspense>
          </TabErrorBoundary>
        </div>
      ) : null}

      {/* Giữ nguyên phiên làm việc của Dịch Manga (Studio) không bị reset khi chuyển qua lại giữa các menu */}
      {visitedTabs.has('translate') ? (
        <div
          data-testid="tab-content-translate"
          className={
            menuView === 'translate'
              ? 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'
              : 'hidden'
          }
          aria-hidden={menuView !== 'translate'}
        >
          <TabErrorBoundary tabId="translate" tabLabel={tabLabelMap.translate} t={t}>
            <Suspense fallback={<TabLoadingFallback label={t('errorBoundary.loadingTab')} />}>
              <MangaTranslateTab savePath={savePath} />
            </Suspense>
          </TabErrorBoundary>
        </div>
      ) : null}

      {/* Giữ nguyên phiên làm việc của Ebook Studio không bị reset khi chuyển qua lại giữa các menu */}
      {visitedTabs.has('ebookStudio') ? (
        <div
          data-testid="tab-content-ebookStudio"
          className={
            menuView === 'ebookStudio'
              ? 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'
              : 'hidden'
          }
          aria-hidden={menuView !== 'ebookStudio'}
        >
          <TabErrorBoundary tabId="ebookStudio" tabLabel={tabLabelMap.ebookStudio} t={t}>
            <Suspense fallback={<TabLoadingFallback label={t('errorBoundary.loadingTab')} />}>
              <EbookStudio savePath={savePath} />
            </Suspense>
          </TabErrorBoundary>
        </div>
      ) : null}

      {/* Giữ nguyên phiên làm việc của Tools Studio (Công cụ) không bị reset khi chuyển qua lại giữa các menu */}
      {visitedTabs.has('toolsStudio') ? (
        <div
          data-testid="tab-content-toolsStudio"
          className={
            menuView === 'toolsStudio'
              ? 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'
              : 'hidden'
          }
          aria-hidden={menuView !== 'toolsStudio'}
        >
          <TabErrorBoundary tabId="toolsStudio" tabLabel={tabLabelMap.toolsStudio} t={t}>
            <Suspense fallback={<TabLoadingFallback label={t('errorBoundary.loadingTab')} />}>
              <ToolsStudio savePath={savePath} />
            </Suspense>
          </TabErrorBoundary>
        </div>
      ) : null}

      {/* Giữ nguyên phiên làm việc của SiteCheckerPanel (Kiểm tra nguồn / Connector) để quét nền khi chuyển qua lại giữa các menu */}
      {visitedTabs.has('siteChecker') ? (
        <div
          data-testid="tab-content-siteChecker"
          className={
            menuView === 'siteChecker'
              ? 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'
              : 'hidden'
          }
          aria-hidden={menuView !== 'siteChecker'}
        >
          <TabErrorBoundary tabId="siteChecker" tabLabel={tabLabelMap.siteChecker} t={t}>
            <Suspense fallback={<TabLoadingFallback label={t('errorBoundary.loadingTab')} />}>
              <SiteCheckerPanel
                connectors={connectorList}
                onBusyChange={setSiteCheckerBusy}
              />
            </Suspense>
          </TabErrorBoundary>
        </div>
      ) : null}

      {/* Giữ nguyên phiên làm việc của Khám phá (ExplorePanel: Mới cập nhật & Quét hàng loạt) không bị reset khi chuyển qua lại giữa các menu */}
      {hasVisitedExplore ? (
        <div
          data-testid="tab-content-explore"
          className={
            isExploreView
              ? 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'
              : 'hidden'
          }
          aria-hidden={!isExploreView}
        >
          <TabErrorBoundary tabId="explore" tabLabel={tabLabelMap.explore} t={t}>
            <Suspense fallback={<TabLoadingFallback label={t('errorBoundary.loadingTab')} />}>
              <ExplorePanel
                initialSubtab={menuView === 'bulkScan' ? 'bulk' : (menuView === 'latestUpdates' ? 'latest' : null)}
                connectors={connectorList}
                mangaLoadOpts={latestMangaLoadOpts}
                onEnqueueLoadedManga={handleEnqueueLoadedMangaFromLatest}
                queue={queue}
                queueProcessing={queueProcessing}
                downloadProgress={downloadProgress}
                onStartQueue={startQueue}
                onStopQueue={stopQueue}
                onAddQueuedFromLatest={handleAddQueuedFromLatest}
                onDownloadMangadexCovers={handleDownloadMangadexCovers}
                savePath={savePath}
                prepareDrawerMangaForRead={prepareLatestDrawerForRead}
                onOpenReaderForDrawerChapter={(ch) => {
                  openReader(ch);
                }}
                onReadChapterOnlineForDrawerChapter={(ch) => {
                  openReader(ch, { stream: true });
                }}
                favorites={favorites}
                favoriteSyncById={favoriteSyncById}
                onEnqueuePendingChapters={enqueueFavoritePendingChapters}
                onToggleFavorite={toggleFavoriteFromLatest}
                favoriteAutoCheckEnabled={favoriteAutoCheckEnabled}
                favoriteAutoCheckIntervalMin={favoriteAutoCheckIntervalMin}
                lastFavoriteAutoCheckAt={lastFavoriteAutoCheckAt}
                onOpenFavoriteAutoCheckSettings={() => {
                  setMenuView('settings');
                  setScrollSettingsToSection('favorites');
                }}
              />
            </Suspense>
          </TabErrorBoundary>
        </div>
      ) : null}

      {/* Conditional tab content — persistent tabs have their own data-testid above */}
      <div
        data-testid={
          !['workflow', 'translate', 'ebookStudio', 'toolsStudio', 'siteChecker', 'explore', 'latestUpdates', 'bulkScan'].includes(menuView)
            ? `tab-content-${menuView}`
            : undefined
        }
        className="contents"
      >
      <TabErrorBoundary tabId={menuView} tabLabel={tabLabelMap[menuView]} t={t}>
        <Suspense fallback={<TabLoadingFallback label={t('errorBoundary.loadingTab')} />}>
      {menuView === 'dashboard' ? (
        <DashboardPanel
          data={dashboardData}
          storageLoading={dashboardStorageLoading}
          cacheBytes={dashboardCacheBytes}
          cacheLoading={dashboardCacheLoading}
          cacheClearing={dashboardCacheClearing}
          onClearCache={handleDashboardClearCache}
          savePath={savePath}
          mangaRankings={dashboardMangaRankings}
          onLoadStorageRanking={loadDashboardStorageRanking}
          connectorName={(id) => connectorList.find((c) => c.id === id)?.name || id}
          onOpenReader={(crData) => {
            const url = crData?.mangaUrl;
            if (url) setSourceUrl(url);
            setMenuView('home');
          }}
          onOpenLibrary={() => setMenuView('home')}
          onSelectRecentChapter={() => setMenuView('home')}
        />
      ) : menuView === 'home' ? (
        <HomeWorkspace
          onOpenEbookStudio={() => setMenuView('ebookStudio')}
          onOpenToolsStudio={() => setMenuView('toolsStudio')}
          onOpenDownloadSettings={() => {
            setMenuView('settings');
            setScrollSettingsToSection('downloads');
          }}
        />
      ) : menuView === 'workflow' || menuView === 'translate' ? null : menuView === 'settings' ? (
        <SettingsPanel
          savePath={savePath}
          setSavePath={setSavePath}
          onBrowse={handleBrowse}
          threads={threads}
          setThreads={setThreadsClamped}
          autoRetryMax={autoRetryMax}
          setAutoRetryMax={setAutoRetryMax}
          chapterFolder={chapterFolder}
          setChapterFolder={setChapterFolder}
          persistChapterFolder={persistChapterFolder}
          mangadexVolumeFolderGrouping={mangadexVolumeFolderGrouping}
          setMangadexVolumeFolderGrouping={setMangadexVolumeFolderGrouping}
          duplicateScanRecursive={duplicateScanRecursive}
          setDuplicateScanRecursive={setDuplicateScanRecursive}
          favoriteAutoCheckEnabled={favoriteAutoCheckEnabled}
          setFavoriteAutoCheckEnabled={setFavoriteAutoCheckEnabled}
          favoriteAutoCheckIntervalMin={favoriteAutoCheckIntervalMin}
          setFavoriteAutoCheckIntervalMin={setFavoriteAutoCheckIntervalMin}
          lastFavoriteAutoCheckAt={lastFavoriteAutoCheckAt}
          favoritesWatchedCount={favoritesNotifyWatchCount}
          favoriteAutoDownloadEnabled={favoriteAutoDownloadEnabled}
          setFavoriteAutoDownloadEnabled={setFavoriteAutoDownloadEnabled}
          favoriteAutoDownloadMode={favoriteAutoDownloadMode}
          setFavoriteAutoDownloadMode={setFavoriteAutoDownloadMode}
          favoriteAutoDownloadWorkflowId={favoriteAutoDownloadWorkflowId}
          setFavoriteAutoDownloadWorkflowId={setFavoriteAutoDownloadWorkflowId}
          onAfterLogout={() => {
            setMenuView('home');
          }}
          scrollToUpdate={scrollSettingsToUpdate}
          onScrollToUpdateDone={() => setScrollSettingsToUpdate(false)}
          scrollSettingsToSection={scrollSettingsToSection}
          setScrollSettingsToSection={setScrollSettingsToSection}
          checkResult={updateCheckResult}
          setCheckResult={setUpdateCheckResult}
          appUpdateState={appUpdateState}
          setAppUpdateState={setAppUpdateState}
          appUpdateError={appUpdateError}
          setAppUpdateError={setAppUpdateError}
          appUpdateDownloadProgress={appUpdateDownloadProgress}
          setAppUpdateDownloadProgress={setAppUpdateDownloadProgress}
          appUpdateDownloadedPath={appUpdateDownloadedPath}
          setAppUpdateDownloadedPath={setAppUpdateDownloadedPath}
          autoCheckUpdate={autoCheckUpdate}
          setAutoCheckUpdate={setAutoCheckUpdate}
          authSession={authSession}
          onAuthSessionChange={setAuthSession}
        />
      ) : menuView === 'plugins' ? (
        <PluginManagementPanel onPluginsChanged={refreshConnectorList} />
      ) : menuView === 'donate' ? (
        <DonatePanel />
      ) : null}
        </Suspense>
      </TabErrorBoundary>
      </div>

      {logFooterVisible ? (
        <>
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label={t('console.resizeFooter')}
            onPointerDown={handleLogFooterResizePointerDown}
            className="group relative z-20 flex h-2.5 shrink-0 cursor-row-resize touch-none select-none items-center justify-center border-t border-outline-variant/20 bg-surface hover:bg-primary/15 active:bg-primary/25"
          >
            <span
              className="pointer-events-none h-px w-6 rounded-full bg-outline-variant/40 group-hover:bg-primary/50"
              aria-hidden
            />
          </div>
          <ConsolePanel heightPx={logPanelHeightPx} logs={logs} onClearLogs={clearLogs} />
        </>
      ) : null}

      <StatusBar
        savePath={savePath}
        mangaTitle={manga?.title}
        unreadErrorCount={unreadErrorCount}
        logFooterVisible={logFooterVisible}
        onToggleLogFooter={toggleLogFooter}
        zoomFactor={zoomFactor}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onSetZoomFactor={(next) => void handleSetZoomFactor(next)}
        onResetZoom={() => void handleResetZoom('ui')}
      />

        </div>
      ) : null}

      {authBootstrapped && isSignedIn && pendingRestoreQueue ? (
        <QueueRestoreModal
          stats={snapshotStats(pendingRestoreQueue)}
          onRestore={handleQueueRestoreConfirm}
          onDiscard={handleQueueRestoreDiscard}
        />
      ) : null}

      <FreeUserTokenExhaustedModal
        open={freeUserTokenExhaustedOpen}
        onClose={() => setFreeUserTokenExhaustedOpen(false)}
      />

      {menuHelpTabId ? (
        <Suspense fallback={null}>
          <HelpGuideModal tabId={menuHelpTabId} onClose={() => setMenuHelpTabId(null)} />
        </Suspense>
      ) : null}

      <CommandPaletteModal
        open={commandPaletteOpen}
        items={commandPaletteItems}
        onClose={() => setCommandPaletteOpen(false)}
      />

      <AppUpdateModal />
      <ExtrasInstallModal
        isOpen={showStartupExtrasModal}
        onClose={() => setShowStartupExtrasModal(false)}
      />

      <ZoomHudToast
        visible={zoomHudVisible}
        zoomFactor={zoomFactor}
        onResetZoom={() => void handleResetZoom('hud')}
        onMouseEnter={() => {
          zoomHudHoveredRef.current = true;
          if (zoomHudTimerRef.current) {
            clearTimeout(zoomHudTimerRef.current);
            zoomHudTimerRef.current = null;
          }
        }}
        onMouseLeave={() => {
          zoomHudHoveredRef.current = false;
          scheduleZoomHudHide();
        }}
      />

      <GlobalTooltip />

    </div>
  );
}
