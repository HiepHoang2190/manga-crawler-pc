import React, { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../../context/I18nContext';
import {
  SendToKindleModal,
  getKindleJob,
  subscribeKindleJob,
  consumeOpenKindleModalRequest,
} from '../export';
import {
  EmptyState,
  StudioPrimaryActionSlot,
  StudioRightToolbarSlot,
  StudioLeftSidebarSlot,
  useHasLeftSidebarSlot,
  ViewModeToggle,
} from '../../shared';
import {
  OfflineListRow,
  OfflineLibraryToolbar,
  OfflineLibrarySidebar,
  OfflineLibraryFooter,
  OfflineLibrarySkeleton,
  OfflineCbzFolderModal,
  OfflineGridCard,
  useOfflineLibraryData,
  SORT_LABEL_KEYS,
  openOfflineRow,
  fetchOfflineRow,
} from './components/offline';

// Contract references for libraryPublicApi: supports onToggleFavorite with favorite_border, mangaInfo.favoriteAdd, mangaInfo.favoriteRemove
export { FavoriteNotifyBell, OfflineCardActions, OfflineListActions } from './components/offline';

export default function OfflineLibraryTab({
  savePath,
  onBrowseSavePath,
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
  // Bookmark & favorite integration
  favorites = [],
  onToggleFavorite,
}) {
  const { t } = useI18n();
  const hasLeftSidebarSlot = useHasLeftSidebarSlot();

  const {
    isForegroundLoading,
    isRescanning,
    error,
    setError,
    notification,
    setNotification,
    extraPaths,
    removeExtra,
    query,
    setQuery,
    sourceFilter,
    setSourceFilter,
    viewMode,
    setViewMode,
    sortMode,
    setSortMode,
    cycleSort,
    base,
    handleManualRefresh,
    removeFromOfflineList,
    addFolder,
    resolveSourceLabel,
    displayRows,
    stats,
    sortedFiltered,
  } = useOfflineLibraryData({
    savePath,
    favorites,
    recentExtractedCbzEntries,
    onRemoveRecentExtractedCbzEntry,
    t,
  });

  const [cbzFolderFiles, setCbzFolderFiles] = useState([]);
  const [cbzFolderPath, setCbzFolderPath] = useState('');
  const [cbzFolderModalOpen, setCbzFolderModalOpen] = useState(false);
  const [detectingPath, setDetectingPath] = useState(null);
  const [loadingArchiveFilePath, setLoadingArchiveFilePath] = useState(null);
  const [kindleRow, setKindleRow] = useState(null);

  // Tự động xóa trạng thái file đang load khi tiến trình giải nén hoàn tất hoặc có lỗi
  useEffect(() => {
    if (!cbzLoadProgress) {
      setLoadingArchiveFilePath(null);
    }
  }, [cbzLoadProgress]);

  // Re-open Send to Kindle modal when banner requests it (after tab switch / remount)
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

  const openPinnedCbzFolder = useCallback(
    async (absolutePath) => {
      const api = typeof window !== 'undefined' ? window.electronAPI : null;
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
    [t, setError]
  );

  const closeCbzFolderModal = useCallback(() => {
    setCbzFolderModalOpen(false);
    setCbzFolderPath('');
    setCbzFolderFiles([]);
    setLoadingArchiveFilePath(null);
    setDetectingPath(null);
  }, []);

  const handleOpenRow = useCallback(
    (row) => {
      openOfflineRow(row, {
        onOpenPinnedCbzFolder: openPinnedCbzFolder,
        onReadArchivePath: onReadCbzFromPath,
        onReadOffline,
      });
    },
    [openPinnedCbzFolder, onReadCbzFromPath, onReadOffline]
  );

  const handleFetchRow = useCallback(
    (row) => {
      fetchOfflineRow(row, {
        onFetchManga,
      });
    },
    [onFetchManga]
  );

  const handleResetFilters = useCallback(() => {
    setQuery('');
    setSourceFilter('');
  }, [setQuery, setSourceFilter]);

  const electronAPI = typeof window !== 'undefined' ? window.electronAPI : null;
  const sortTooltip = t('offlineLibrary.sortHint', {
    mode: t(SORT_LABEL_KEYS[sortMode] || SORT_LABEL_KEYS.titleAsc),
  });

  const libraryEmptyState = (
    <EmptyState
      icon={displayRows.length === 0 ? 'local_library' : 'search_off'}
      title={displayRows.length === 0 ? t('offlineLibrary.empty') : t('favorites.noResults')}
      action={
        displayRows.length > 0 ? (
          <button
            type="button"
            onClick={handleResetFilters}
            className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold border border-outline-variant/25 bg-surface-container-high text-on-surface hover:bg-surface-bright transition-all active:scale-95 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[15px] leading-none">filter_alt_off</span>
            <span>{t('offlineLibrary.sidebar.resetFilters')}</span>
          </button>
        ) : null
      }
    />
  );

  const showSkeleton = isForegroundLoading || isRescanning;
  const skeletonStatusText = isRescanning
    ? t('offlineLibrary.rescanningStatus')
    : t('offlineLibrary.loading');

  return (
    <div className="flex-1 flex flex-col bg-surface overflow-hidden min-h-0">
      <StudioPrimaryActionSlot>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            data-testid="offline-rescan-btn"
            onClick={() => handleManualRefresh()}
            disabled={isForegroundLoading || isRescanning || !base}
            data-tooltip={t('offlineLibrary.refreshTooltip')}
            aria-label={t('offlineLibrary.rescanLibrary')}
            className="h-8 px-3.5 shrink-0 rounded-lg bg-primary text-xs font-semibold text-on-primary transition-all hover:opacity-95 active:scale-95 disabled:pointer-events-none disabled:opacity-50 inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs whitespace-nowrap"
          >
            <span
              className={`material-symbols-outlined text-[15px] leading-none ${
                isForegroundLoading || isRescanning ? 'animate-spin' : ''
              }`}
            >
              refresh
            </span>
            <span>{t('offlineLibrary.rescanLibrary')}</span>
          </button>
          <button
            type="button"
            onClick={addFolder}
            disabled={!electronAPI?.selectDirectory}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-outline-variant/25 bg-surface-container-highest px-3 text-xs font-medium text-on-surface hover:border-outline-variant/50 transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed shrink-0 whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-[16px] leading-none">folder_special</span>
            <span>{t('offlineLibrary.addFolder')}</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenCbzFile?.()}
            disabled={typeof onOpenCbzFile !== 'function' || !electronAPI?.pickAndLoadArchive}
            data-tooltip={t('offlineLibrary.openFileTitle')}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-outline-variant/25 bg-surface-container-highest px-3 text-xs font-medium text-on-surface hover:border-outline-variant/50 transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed shrink-0 whitespace-nowrap"
          >
            {cbzLoadProgress && (!cbzLoadProgress.filePath || cbzLoadProgress.source === 'pickFile') && !loadingArchiveFilePath ? (
              <>
                <span className="material-symbols-outlined text-[16px] leading-none animate-spin">progress_activity</span>
                <span>{cbzLoadProgress.total > 0 ? `${cbzLoadProgress.pct ?? 0}%` : '…'}</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[16px] leading-none">archive</span>
                <span>{t('offlineLibrary.openFile')}</span>
              </>
            )}
          </button>
        </div>
      </StudioPrimaryActionSlot>

      <StudioRightToolbarSlot>
        <div className="flex items-center gap-2 shrink-0">
          {!hasLeftSidebarSlot ? (
            <button
              type="button"
              onClick={cycleSort}
              className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors cursor-pointer ${
                sortMode !== 'titleAsc'
                  ? 'border-primary/40 bg-primary/15 text-primary shadow-2xs'
                  : 'border-outline-variant/25 bg-surface-container-highest text-on-surface-variant hover:text-on-surface hover:border-outline-variant/50'
              }`}
              data-tooltip={sortTooltip}
              aria-label={sortTooltip}
            >
              <span className="material-symbols-outlined text-[17px] leading-none">sort_by_alpha</span>
            </button>
          ) : null}
          <ViewModeToggle
            viewMode={viewMode}
            onChange={setViewMode}
            size="md"
          />
        </div>
      </StudioRightToolbarSlot>

      <StudioLeftSidebarSlot>
        <OfflineLibrarySidebar
          query={query}
          setQuery={setQuery}
          sourceFilter={sourceFilter}
          setSourceFilter={setSourceFilter}
          sortMode={sortMode}
          setSortMode={setSortMode}
          base={base}
          extraPaths={extraPaths}
          stats={stats}
          onBrowseSavePath={onBrowseSavePath}
          onOpenFolder={onOpenFolder}
          onRemoveExtraPath={removeExtra}
          t={t}
        />
      </StudioLeftSidebarSlot>

      <div className="flex-1 flex flex-col overflow-hidden min-h-0 bg-surface">
        {!hasLeftSidebarSlot || error || notification ? (
          <div className="px-4 sm:px-6 pt-3 space-y-2.5 shrink-0">
            {!hasLeftSidebarSlot ? (
              <OfflineLibraryToolbar
                query={query}
                setQuery={setQuery}
                sourceFilter={sourceFilter}
                setSourceFilter={setSourceFilter}
                t={t}
              />
            ) : null}

            {/* Error Banner */}
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
                  data-tooltip={t('offlineLibrary.dismissError')}
                  aria-label={t('offlineLibrary.dismissError')}
                >
                  <span className="material-symbols-outlined text-base leading-none">close</span>
                </button>
              </div>
            ) : null}

            {/* Notification Banner */}
            {notification ? (
              <div
                className={`rounded-xl border px-3.5 py-2.5 text-xs shrink-0 flex items-center justify-between gap-3 shadow-xs animate-in fade-in duration-200 ${
                  notification.type === 'info'
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
                  data-tooltip={t('offlineLibrary.dismissError')}
                  aria-label={t('offlineLibrary.dismissError')}
                >
                  <span className="material-symbols-outlined text-base leading-none">close</span>
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Main Content: Unified Explore-Style List & Grid View (matching FollowedMangaPanel) */}
        <div className="custom-scrollbar flex-1 min-h-0 overflow-auto p-4 sm:p-6 bg-surface">
          {showSkeleton ? (
            <OfflineLibrarySkeleton viewMode={viewMode} statusText={skeletonStatusText} />
          ) : sortedFiltered.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              {libraryEmptyState}
            </div>
          ) : viewMode === 'list' ? (
            <ul className="flex flex-col gap-2" data-testid="offline-library-list">
              {sortedFiltered.map((row) => (
                <OfflineListRow
                  key={row.key}
                  row={row}
                  onOpenRow={handleOpenRow}
                  onFetchRow={handleFetchRow}
                  onOpenFolder={onOpenFolder}
                  onRemoveFromList={removeFromOfflineList}
                  onSendToKindle={setKindleRow}
                  onToggleFavorite={onToggleFavorite}
                  resolveSourceLabel={resolveSourceLabel}
                  t={t}
                />
              ))}
            </ul>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {sortedFiltered.map((row) => (
                <OfflineGridCard
                  key={row.key}
                  row={row}
                  onFetchManga={onFetchManga}
                  onToggleFavorite={onToggleFavorite}
                  onReadOffline={onReadOffline}
                  onOpenFolder={onOpenFolder}
                  removeFromOfflineList={removeFromOfflineList}
                  openPinnedCbzFolder={openPinnedCbzFolder}
                  onReadCbzFromPath={onReadCbzFromPath}
                  setKindleRow={setKindleRow}
                  resolveSourceLabel={resolveSourceLabel}
                  t={t}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Slim Footer */}
      <OfflineLibraryFooter
        displayRowsCount={displayRows.length}
        filteredCount={sortedFiltered.length}
        cbzLoadProgress={cbzLoadProgress}
        cbzError={cbzError}
        t={t}
      />

      {/* Send to Kindle Modal */}
      <SendToKindleModal
        open={Boolean(kindleRow)}
        row={kindleRow}
        onClose={() => setKindleRow(null)}
      />

      {/* Cbz / Archive Folder Inspection Modal */}
      <OfflineCbzFolderModal
        isOpen={cbzFolderModalOpen}
        onClose={closeCbzFolderModal}
        folderPath={cbzFolderPath}
        folderFiles={cbzFolderFiles}
        detectingPath={detectingPath}
        setDetectingPath={setDetectingPath}
        loadingArchiveFilePath={loadingArchiveFilePath}
        setLoadingArchiveFilePath={setLoadingArchiveFilePath}
        cbzLoadProgress={cbzLoadProgress}
        onReadCbzFromPath={onReadCbzFromPath}
        onOpenEbook={onOpenEbook}
        setError={setError}
        t={t}
      />
    </div>
  );
}
