import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useI18n } from '../../context/I18nContext';
import { useAppLog, ResizeSplitter, StudioLayout, useStudioLayout } from '../../shared';
import { isHomePrimaryTabBusy } from './homePrimaryTabBusy';
import { useAuth } from '../../auth';
import { useSettings } from '../settings';
import { useConnectorList } from '../../platform/connectors';
import { useDownload, QueuePanel, Sidebar } from '../download';
import { useReader, ChaptersDrawer } from '../reader';
import {
  useLibrary,
  FavoritesTab,
  HistoryTab,
  OfflineLibraryTab,
} from '../library';
import {
  useExport,
  KindleJobBanner,
} from '../export';
import { HelpGuideModal } from '../help';
import { loadPanelUi, savePanelUi } from '../../utils/panelUiPrefs';
import HomeToolsDropdown from './HomeToolsDropdown';
import {
  loadHomeTabOrder,
  saveHomeTabOrder,
  loadHomeTabHiddenIds,
  saveHomeTabHiddenIds,
  loadHomePinnedTabCount,
  saveHomePinnedTabCount,
  sortTabsByOrder,
} from '../../utils/homeTabOrderPrefs.mjs';

const TABS = [
  { id: 'queue', icon: 'queue_play_next' },
  { id: 'history', icon: 'history' },
  { id: 'offlineRead', icon: 'auto_stories' },
];

function visibleTabsForUser(_isGuestUser) {
  return TABS;
}

const MAIN_SIDEBAR_WIDTH_KEY = 'mangaMainSidebarWidthPx';
const MAIN_SIDEBAR_WIDTH_MIN = 320;
const MAIN_SIDEBAR_VISIBLE_KEY = 'mangaMainSidebarVisible';

function getDefaultSidebarWidth() {
  if (typeof window === 'undefined') return 400;
  return Math.round(window.innerWidth / 3);
}

function clampMainSidebarWidth(px, innerWidth) {
  const w = typeof innerWidth === 'number' ? innerWidth : 1200;
  const max = Math.min(1200, Math.max(MAIN_SIDEBAR_WIDTH_MIN + 200, w - 340));
  return Math.max(MAIN_SIDEBAR_WIDTH_MIN, Math.min(max, Math.round(px)));
}

function loadMainSidebarWidth() {
  if (typeof window === 'undefined') return getDefaultSidebarWidth();
  try {
    const n = Number(localStorage.getItem(MAIN_SIDEBAR_WIDTH_KEY));
    if (Number.isFinite(n)) return clampMainSidebarWidth(n, window.innerWidth);
  } catch {
    /* ignore */
  }
  return clampMainSidebarWidth(getDefaultSidebarWidth(), window.innerWidth);
}

function loadMainSidebarVisible() {
  if (typeof window === 'undefined') return true;
  try {
    return localStorage.getItem(MAIN_SIDEBAR_VISIBLE_KEY) !== 'false';
  } catch {
    /* ignore */
  }
  return true;
}

export default function HomeWorkspace({
  onOpenWorkflow,
  onOpenEbookStudio,
  onOpenToolsStudio,
  onOpenDownloadSettings,
} = {}) {
  const { t } = useI18n();
  const { appendLog } = useAppLog();
  const { isSignedIn } = useAuth();
  const {
    savePath,
    setSavePath,
    threads,
    handleBrowse,
    setThreadsClamped,
    chapterFolder,
    duplicateScanRecursive,
  } = useSettings();
  const { connectorList } = useConnectorList();
  const {
    queue,
    queueSelectedIds,
    setQueueSelectedIds,
    manga,
    chapters,
    site,
    setSite,
    sourceUrl,
    setSourceUrl,
    selectedUrls,
    setSelectedChapterUrls,
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
    clearDownloadHistory,
    removeDownloadHistoryEntry,
    queueTabFocusNonce,
    focusQueueTab,
    enqueueChapters,
    enqueueHistoryRows,
    removeQueueGroup,
    removeQueueChapter,
    skipQueueChapter,
    retryQueueChapter,
    reorderQueueChapter,
    clearCompletedFromQueue,
    clearCompletedChaptersInGroup,
    setQueueGroupsPaused,
    toggleGroupDownloadOrder,
    retryFailedChapters,
    reorderQueue,
  } = useDownload();
  const {
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
    downloadedCountForReaderCbz,
    favoriteSyncById,
    fetchAllFavoritesBusy,
    bellReadRemoteById,
    readChapterAllowedUrls,
    enqueueFavoritePendingChapters,
  } = useLibrary();
  const { setCbzExportDrawerOpen, setpdfExportOpen } = useExport();

  const {
    showLeftSidebar,
    toggleLeftSidebar,
    leftWidth,
    handleLeftResizeStart,
  } = useStudioLayout({
    storagePrefix: 'home_main',
    defaultLeftWidth: loadMainSidebarWidth(),
    minLeftWidth: 320,
    maxLeftWidth: 800,
    defaultLeftOpen: loadMainSidebarVisible(),
  });

  useEffect(() => {
    try {
      localStorage.setItem(MAIN_SIDEBAR_WIDTH_KEY, String(leftWidth));
      localStorage.setItem(MAIN_SIDEBAR_VISIBLE_KEY, showLeftSidebar ? 'true' : 'false');
    } catch {
      /* ignore */
    }
  }, [leftWidth, showLeftSidebar]);

  const [chaptersDrawerOpen, setChaptersDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(() => loadPanelUi().queueTab);
  const [helpModalTabId, setHelpModalTabId] = useState(null);
  const [tabBusyMap, setTabBusyMap] = useState({});

  const setTabBusy = useCallback((tabId, isBusy) => {
    setTabBusyMap((prev) => {
      if (Boolean(prev[tabId]) === Boolean(isBusy)) return prev;
      return { ...prev, [tabId]: Boolean(isBusy) };
    });
  }, []);

  const [tabOrder, setTabOrder] = useState(() => loadHomeTabOrder());
  const [hiddenTabIds, setHiddenTabIds] = useState(() => loadHomeTabHiddenIds());
  const [pinnedTabCount, setPinnedTabCount] = useState(() => loadHomePinnedTabCount());

  useEffect(() => {
    saveHomeTabOrder(tabOrder);
  }, [tabOrder]);

  useEffect(() => {
    saveHomeTabHiddenIds(hiddenTabIds);
  }, [hiddenTabIds]);

  useEffect(() => {
    saveHomePinnedTabCount(pinnedTabCount);
  }, [pinnedTabCount]);

  const visibleTabs = useMemo(() => {
    const userTabs = visibleTabsForUser(!isSignedIn);
    const hiddenSet = new Set(hiddenTabIds);
    const filtered = userTabs.filter((tab) => tab.id === 'queue' || !hiddenSet.has(tab.id));
    return sortTabsByOrder(filtered, tabOrder);
  }, [isSignedIn, hiddenTabIds, tabOrder]);

  const { primaryTabs, toolsTabs } = useMemo(() => {
    const primary = visibleTabs.slice(0, pinnedTabCount);
    const tools = visibleTabs.slice(pinnedTabCount);
    return { primaryTabs: primary, toolsTabs: tools };
  }, [visibleTabs, pinnedTabCount]);

  useEffect(() => {
    if (activeTab !== 'queue' && hiddenTabIds.includes(activeTab)) {
      setActiveTab('queue');
    }
  }, [hiddenTabIds, activeTab]);

  useEffect(() => {
    if (activeTab === 'favorites') {
      setActiveTab('offlineRead');
    }
  }, [activeTab]);

  useEffect(() => {
    savePanelUi({ queueTab: activeTab });
  }, [activeTab]);

  useEffect(() => {
    if (queueTabFocusNonce > 0) {
      setActiveTab('queue');
    }
  }, [queueTabFocusNonce]);

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

  const handleFetch = useCallback(() => {
    loadMangaWithParams(site, sourceUrl, { force: true });
  }, [loadMangaWithParams, site, sourceUrl]);

  const toggleChapter = (url) => {
    setSelectedChapterUrls((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedChapterUrls(new Set(chapters.map((c) => c.url)));
  };

  const unselectAll = () => {
    setSelectedChapterUrls(new Set());
  };

  const handleEnqueueAllFromHome = useCallback(() => {
    if (!manga?.title || !savePath.trim()) {
      appendLog(t('app.log.needSavePathAndManga'), 'warn');
      return;
    }
    const list = chapters;
    if (!list.length) {
      appendLog(t('app.log.fetchNoChapters', { title: manga.title || '' }), 'warn');
      return;
    }
    const mangaUrl = String(manga.mangaUrl || sourceUrl.trim()).trim();
    const { addedCount } = enqueueChapters(
      {
        mangaTitle: manga.title,
        mangaUrl,
        site: manga.siteId || site,
        coverUrl: manga.coverUrl || '',
      },
      list
    );

    if (addedCount === 0) {
      appendLog(t('app.log.chaptersAlreadyInQueue'), 'warn');
      return;
    }

    appendLog(t('app.log.addedChaptersToQueue', { count: addedCount, title: manga.title }), 'success');
    focusQueueTab();
  }, [manga, chapters, savePath, site, sourceUrl, appendLog, t, focusQueueTab, enqueueChapters]);

  const handleAddSelectedToQueue = useCallback(() => {
    if (!manga?.title || !savePath.trim()) {
      appendLog(t('app.log.needSavePathAndManga'), 'warn');
      return;
    }
    const list = chapters.filter((c) => selectedUrls.has(c.url));
    if (!list.length) {
      appendLog(t('chapterList.addToQueueNeedSelection'), 'warn');
      return;
    }
    const mangaUrl = String(manga.mangaUrl || sourceUrl.trim()).trim();
    const { addedCount } = enqueueChapters(
      {
        mangaTitle: manga.title,
        mangaUrl,
        site: manga.siteId || site,
        coverUrl: manga.coverUrl || '',
      },
      list
    );

    if (addedCount === 0) {
      appendLog(t('app.log.chaptersAlreadyInQueue'), 'warn');
      return;
    }

    appendLog(t('app.log.addedChaptersToQueue', { count: addedCount, title: manga.title }), 'success');
    focusQueueTab();
  }, [manga, chapters, selectedUrls, savePath, site, sourceUrl, appendLog, t, focusQueueTab, enqueueChapters]);

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

  const handleAddCoversToQueue = useCallback(
    (covers) => {
      void handleDownloadMangadexCovers(manga?.title, covers);
    },
    [handleDownloadMangadexCovers, manga?.title],
  );

  const handleAddToQueue = useCallback((historyRow) => {
    if (!historyRow?.mangaUrl || !historyRow?.chapterUrl) {
      appendLog(t('history.alreadyInQueue', { chapter: historyRow?.chapterTitle || '', manga: historyRow?.mangaTitle || '' }), 'warn');
      return;
    }
    const { addedCount } = enqueueHistoryRows([historyRow]);
    if (addedCount === 0) {
      appendLog(t('history.alreadyInQueue', { chapter: historyRow.chapterTitle, manga: historyRow.mangaTitle }), 'warn');
      return;
    }
    appendLog(t('history.addedToQueue', { chapter: historyRow.chapterTitle, manga: historyRow.mangaTitle }), 'success');
    focusQueueTab();
  }, [appendLog, t, focusQueueTab, enqueueHistoryRows]);

  const handleAddAllErrorsToQueue = useCallback((rows) => {
    if (!rows?.length) return;
    const { addedCount, affectedManga } = enqueueHistoryRows(rows);
    if (addedCount === 0) {
      appendLog(t('history.bulkAllAlreadyInQueue'), 'warn');
    } else {
      appendLog(t('history.bulkAddedToQueue', { count: addedCount, manga: affectedManga }), 'success');
    }
    focusQueueTab();
  }, [appendLog, t, focusQueueTab, enqueueHistoryRows]);

  const handleToggleFavoriteRow = useCallback(
    (row) => {
      if (!row) return;
      if (row.isFavorite) {
        const fid =
          row.favoriteId ||
          (row.source === 'favorite' ? row.key?.replace('fav:', '') : null);
        if (fid) {
          removeFavorite(fid);
          return;
        }
      }
      const title = String(row.mangaTitle || row.title || '').trim();
      if (!title) return;
      const url = String(row.mangaUrl || row.url || '').trim();
      const siteId = String(row.siteId || '').trim();
      const coverUrl = row.coverUrl || row.localCoverPath || '';
      const chapterCount = Number(row.chapterCount || 0);

      if (url && siteId && siteId !== 'offline' && siteId !== 'local') {
        toggleFavoriteFromLatest(
          { title, mangaUrl: url, coverUrl, chapterCount },
          siteId
        );
      } else if (url && !siteId) {
        toggleFavoriteFromLatest(
          { title, mangaUrl: url, coverUrl, chapterCount },
          'online'
        );
      } else if (row.absolutePath) {
        toggleFavoriteFromLatest(
          {
            title,
            mangaUrl: `file://${row.absolutePath}`,
            coverUrl,
            chapterCount,
          },
          'local'
        );
      } else {
        toggleFavoriteFromLatest(
          {
            title,
            mangaUrl: `local://${encodeURIComponent(title)}`,
            coverUrl,
            chapterCount,
          },
          'local'
        );
      }
    },
    [removeFavorite, toggleFavoriteFromLatest]
  );

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
    <StudioLayout>
      <StudioLayout.Toolbar
        showLeftSidebar={showLeftSidebar}
        onToggleLeftSidebar={toggleLeftSidebar}
        leftSidebarTooltip={showLeftSidebar ? t('sidebar.hidePanel') : t('sidebar.showPanel')}
        leftSlot={
          <div className="flex items-center gap-1.5 rounded-xl bg-surface-container-lowest p-1 border border-outline-variant/20 overflow-x-auto no-scrollbar">
            {primaryTabs.map((tab) => {
              const isActive = tab.id === activeTab;
              const isBusy = isHomePrimaryTabBusy(tab.id, {
                fetchAllFavoritesBusy,
                tabBusyMap,
              });
              return (
                <button
                  key={tab.id}
                  type="button"
                  data-testid={`queue-tab-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  className={`group/qtab relative flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition-all cursor-pointer select-none active:scale-95 shrink-0 ${
                    isActive
                      ? 'bg-primary text-on-primary shadow-xs'
                      : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                  }`}
                >
                  {isBusy ? (
                    <span className="relative flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[15px] leading-none text-cyan-400 animate-spin shrink-0">
                        progress_activity
                      </span>
                    </span>
                  ) : (
                    <span className="material-symbols-outlined text-[15px] leading-none shrink-0">{tab.icon}</span>
                  )}
                  <span className="whitespace-nowrap">{t(`queue.tab.${tab.id}`)}</span>
                  {isBusy && (
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping ml-0.5" />
                  )}
                </button>
              );
            })}

            {toolsTabs.length > 0 && (
              <HomeToolsDropdown
                tools={toolsTabs}
                activeTab={activeTab}
                onSelectTab={setActiveTab}
                tabBusyMap={tabBusyMap}
              />
            )}
          </div>
        }
      />

      <StudioLayout.Body>
        <StudioLayout.LeftSidebar
          open={showLeftSidebar}
          width={leftWidth}
          onResizeStart={handleLeftResizeStart}
        >
          <Sidebar
            onCollapse={toggleLeftSidebar}
            connectors={connectorList}
            sourceUrl={sourceUrl}
            setSourceUrl={setSourceUrl}
            site={site}
            setSite={setSite}
            mangadexLanguage={mangadexLanguage}
            setMangadexLanguage={setMangadexLanguage}
            comickLanguage={comickLanguage}
            setComickLanguage={setComickLanguage}
            mangaballLanguage={mangaballLanguage}
            setMangaballLanguage={setMangaballLanguage}
            savePath={savePath}
            setSavePath={setSavePath}
            loading={loading}
            fetchError={fetchError}
            onFetch={handleFetch}
            onBrowse={handleBrowse}
            onOpenDownloadSettings={onOpenDownloadSettings}
            manga={manga}
            chapters={chapters}
            isMangaFavorite={isMangaFavorite}
            onToggleFavorite={toggleFavorite}
            coverFetchSuccessTick={coverFetchSuccessTick}
            coverFetchDurationMs={coverFetchDurationMs}
            onOpenChaptersPanel={() => {
              setChaptersDrawerOpen(true);
            }}
            onEnqueueAllToQueue={handleEnqueueAllFromHome}
            onOpenCbzExport={() => {
              if (!isSignedIn) {
                appendLog(t('guestCredit.cbzLockedToast'), 'warn');
                return;
              }
              setCbzExportDrawerOpen(true);
            }}
            onOpenpdfExport={() => {
              if (!isSignedIn) {
                appendLog(t('guestCredit.cbzLockedToast'), 'warn');
                return;
              }
              setpdfExportOpen(true);
            }}
            onOpenReader={() => openReader()}
            onOpenEbookStudio={onOpenEbookStudio}
            downloadedChapterCount={downloadedCountForReaderCbz}
            threads={threads}
            setThreads={setThreadsClamped}
            showCbzExport={isSignedIn}
            guestFavoriteLocked={!isSignedIn}
            onGuestFavoriteBlocked={() => appendLog(t('guestCredit.favoritePrompt'), 'warn')}
          />
        </StudioLayout.LeftSidebar>

        <StudioLayout.Content>
          <KindleJobBanner
            onOpen={() => {
              setActiveTab('offlineRead');
            }}
          />

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {activeTab === 'history' ? (
              <HistoryTab
                chapterFolder={chapterFolder}
                onClearHistory={clearDownloadHistory}
                onRemoveHistoryEntry={removeDownloadHistoryEntry}
                onOpenChapterFolder={handleOpenChapterFolder}
                onFetchHistoryEntry={fetchMangaFromFavorite}
                onReadHistoryEntry={readFromHistory}
                onAddToQueue={handleAddToQueue}
                onAddAllErrorsToQueue={handleAddAllErrorsToQueue}
              />
            ) : activeTab === 'queue' ? (
              <QueuePanel
                queue={queue}
                queueSelectedIds={queueSelectedIds}
                setQueueSelectedIds={setQueueSelectedIds}
                onReorderQueue={reorderQueue}
                queueProcessing={queueProcessing}
                onStartQueue={startQueue}
                onStopQueue={stopQueue}
                onClearCompleted={clearCompletedFromQueue}
                onRemoveItem={removeQueueGroup}
                onRemoveChapter={removeQueueChapter}
                onSkipChapter={skipQueueChapter}
                onRetryChapter={retryQueueChapter}
                onReorderChapter={reorderQueueChapter}
                onClearCompletedInGroup={clearCompletedChaptersInGroup}
                onSetGroupsPaused={setQueueGroupsPaused}
                onToggleGroupDownloadOrder={toggleGroupDownloadOrder}
                onRetryFailedChapters={retryFailedChapters}
                downloadProgress={downloadProgress}
                activeChapterLabel={activeChapterLabel}
                onOpenMangaFolder={handleOpenMangaFolder}
                onFetchQueueGroup={fetchMangaFromFavorite}
              />
            ) : activeTab === 'offlineRead' || activeTab === 'favorites' ? (
              <OfflineLibraryTab
                savePath={savePath}
                onReadOffline={readFromOfflineLibrary}
                onFetchManga={fetchMangaFromOfflineLibrary}
                onOpenFolder={openOfflineFolderPath}
                onOpenCbzFile={() => openArchivePath()}
                onReadCbzFromPath={openArchivePath}
                cbzLoadProgress={cbzLoadProgress}
                cbzError={cbzError}
                recentExtractedCbzEntries={recentExtractedCbzEntries}
                onRemoveRecentExtractedCbzEntry={removeRecentExtractedCbzEntry}
                onOpenEbook={openEbook}
                favorites={favorites}
                onRemoveFavorite={removeFavorite}
                onFetchFavorite={fetchMangaFromFavorite}
                onReadFavorite={readFromFavorite}
                onOpenMangaFolder={handleOpenMangaFolder}
                favoriteSyncById={favoriteSyncById}
                favoriteTabBadgeReadById={bellReadRemoteById}
                fetchAllFavoritesBusy={fetchAllFavoritesBusy}
                onFetchAllFavorites={handleFetchAllFavorites}
                onToggleFavoriteNotifyWatch={toggleFavoriteNotifyWatch}
                onToggleFavorite={handleToggleFavoriteRow}
                onEnqueuePendingChapters={enqueueFavoritePendingChapters}
                connectors={connectorList}
              />
            ) : null}
          </div>

          <HelpGuideModal tabId={helpModalTabId} onClose={() => setHelpModalTabId(null)} />
        </StudioLayout.Content>
      </StudioLayout.Body>

      {chaptersDrawerOpen ? (
        <ChaptersDrawer
          open={chaptersDrawerOpen}
          onClose={() => setChaptersDrawerOpen(false)}
          coverUrl={manga?.coverUrl || ''}
          description={manga?.description || ''}
          chapters={chapters}
          queue={queue}
          currentMangaUrl={String(manga?.mangaUrl || sourceUrl || '').trim()}
          selectedUrls={selectedUrls}
          setSelectedUrls={setSelectedChapterUrls}
          onToggleChapter={toggleChapter}
          onSelectAll={selectAll}
          onUnselectAll={unselectAll}
          onAddSelectedToQueue={handleAddSelectedToQueue}
          onReadChapter={(ch) => {
            const i = chapters.findIndex((c) => c.url === ch.url);
            openReader(i >= 0 ? i : 0);
          }}
          onReadChapterOnline={manga?.offlineOnly ? undefined : (ch) => openReader(ch, { stream: true })}
          readOnlineEnabled={Boolean(savePath.trim())}
          readChapterAllowedUrls={readChapterAllowedUrls}
          manga={manga}
          onCoverChange={(cover) => {
            hydrateSession({
              manga: (prev) => ({
                ...prev,
                coverUrl: cover.url512,
                selectedCover: cover,
              }),
            });
            appendLog(
              t('mangaInfo.coverChanged', 'Đã đổi ảnh bìa') + 
              (cover.volume ? ` (Volume ${cover.volume})` : ''),
              'info'
            );
          }}
          onAddCoversToQueue={handleAddCoversToQueue}
        />
      ) : null}
    </StudioLayout>
  );
}
