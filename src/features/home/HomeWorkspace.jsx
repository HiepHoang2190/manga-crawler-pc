import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useI18n } from '../../context/I18nContext';
import {
  useAppLog,
  StudioLayout,
  StudioToolbarSlotProvider,
  useStudioLayout,
} from '../../shared';
import { isHomePrimaryTabBusy } from './homePrimaryTabBusy';
import { useAuth } from '../../auth';
import { useSettings } from '../settings';
import { useConnectorList } from '../../platform/connectors';
import { useDownload, QueuePanel, Sidebar, dedupeChaptersByNumber } from '../download';
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
    removeQueueGroups,
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
    leftWidth,
    handleLeftResizeStart,
  } = useStudioLayout({
    storagePrefix: 'home_main',
    defaultLeftWidth: loadMainSidebarWidth(),
    minLeftWidth: 320,
    maxLeftWidth: 800,
    defaultLeftOpen: true,
  });

  useEffect(() => {
    try {
      localStorage.setItem(MAIN_SIDEBAR_WIDTH_KEY, String(leftWidth));
    } catch {
      /* ignore */
    }
  }, [leftWidth]);

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

  const selectAll = (urls) => {
    if (Array.isArray(urls)) {
      setSelectedChapterUrls(new Set(urls));
    } else {
      const deduped = dedupeChaptersByNumber(chapters);
      setSelectedChapterUrls(new Set(deduped.map((c) => c.url)));
    }
  };

  const unselectAll = () => {
    setSelectedChapterUrls(new Set());
  };

  const handleEnqueueAllFromHome = useCallback(() => {
    if (!manga?.title || !savePath.trim()) {
      appendLog(t('app.log.needSavePathAndManga'), 'warn');
      return;
    }
    const list = dedupeChaptersByNumber(chapters);
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
    const filtered = chapters.filter((c) => selectedUrls.has(c.url));
    const list = dedupeChaptersByNumber(filtered);
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

  const [primaryActionEl, setPrimaryActionEl] = useState(null);
  const [rightToolbarEl, setRightToolbarEl] = useState(null);

  return (
    <StudioToolbarSlotProvider primaryEl={primaryActionEl} rightEl={rightToolbarEl}>
      <StudioLayout>
        <StudioLayout.Toolbar
          leftSlot={
            <div className="flex items-center gap-2 min-w-0 overflow-x-auto no-scrollbar">
              <div
                role="tablist"
                aria-label={t('menu.home')}
                className="inline-flex items-center gap-0.5 p-0.5 rounded-xl bg-surface-container-high/70 border border-outline-variant/25 overflow-x-auto no-scrollbar shrink-0"
              >
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
                      role="tab"
                      aria-selected={isActive}
                      data-testid={`queue-tab-${tab.id}`}
                      onClick={() => setActiveTab(tab.id)}
                      className={`group/qtab relative inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer select-none whitespace-nowrap shrink-0 ${
                        isActive
                          ? 'bg-primary text-on-primary font-semibold shadow-xs'
                          : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest/60'
                      }`}
                    >
                      {isBusy ? (
                        <span className="relative flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined text-[15px] leading-none text-cyan-400 animate-spin shrink-0">
                            progress_activity
                          </span>
                        </span>
                      ) : (
                        <span className="material-symbols-outlined text-[16px] leading-none shrink-0">{tab.icon}</span>
                      )}
                      <span className="whitespace-nowrap">{t(`queue.tab.${tab.id}`)}</span>
                      {isBusy && (
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping ml-0.5" />
                      )}
                    </button>
                  );
                })}
              </div>

              {toolsTabs.length > 0 && (
                <HomeToolsDropdown
                  tools={toolsTabs}
                  activeTab={activeTab}
                  onSelectTab={setActiveTab}
                  tabBusyMap={tabBusyMap}
                />
              )}

              <div
                ref={setPrimaryActionEl}
                data-testid="home-primary-action-slot"
                className="flex items-center gap-2 shrink-0 empty:hidden pl-2.5 border-l border-outline-variant/25 ml-1"
              />
            </div>
          }
          rightSlot={
            <div
              ref={setRightToolbarEl}
              data-testid="home-right-toolbar-slot"
              className="flex items-center gap-2 shrink-0 empty:hidden"
            />
          }
        />

      <StudioLayout.Body>
        <StudioLayout.LeftSidebar
          open={true}
          width={leftWidth}
          onResizeStart={handleLeftResizeStart}
        >
          <Sidebar
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
                onRemoveSelectedGroups={removeQueueGroups}
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
    </StudioToolbarSlotProvider>
  );
}
