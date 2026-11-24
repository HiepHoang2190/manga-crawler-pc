import React, { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../../context/I18nContext';
import {
  SendToKindleModal,
  getKindleJob,
  subscribeKindleJob,
  consumeOpenKindleModalRequest,
} from '../export';
import { QueueCoverThumb } from '../download';
import {
  EmptyState,
  StudioTable,
  StudioPrimaryActionSlot,
  StudioRightToolbarSlot,
  ViewModeToggle,
} from '../../shared';
import {
  OfflineChapterMeta,
  OfflineListActions,
  OfflineLibraryToolbar,
  OfflineLibraryFooter,
  OfflineCbzFolderModal,
  OfflineGridCard,
  useOfflineLibraryData,
  SORT_LABEL_KEYS,
} from './components/offline';

// Contract references for libraryPublicApi: supports onToggleFavorite with favorite_border, mangaInfo.favoriteAdd, mangaInfo.favoriteRemove
export { FavoriteNotifyBell, OfflineCardActions, OfflineListActions } from './components/offline';

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

  const {
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
  } = useOfflineLibraryData({
    savePath,
    favorites,
    favoriteSyncById,
    favoriteTabBadgeReadById,
    recentExtractedCbzEntries,
    onRemoveRecentExtractedCbzEntry,
    onRemoveFavorite,
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

  const electronAPI = typeof window !== 'undefined' ? window.electronAPI : null;
  const sortTooltip = t('offlineLibrary.sortHint', {
    mode: t(SORT_LABEL_KEYS[sortMode] || SORT_LABEL_KEYS.titleAsc),
  });

  return (
    <div className="flex-1 flex flex-col bg-surface overflow-hidden min-h-0">
      <StudioPrimaryActionSlot>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={addFolder}
            disabled={!electronAPI?.selectDirectory}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-semibold text-on-primary shadow-2xs hover:opacity-95 active:scale-95 transition-all cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed shrink-0 whitespace-nowrap"
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
          {typeof onFetchAllFavorites === 'function' && favorites.length > 0 ? (
            <button
              type="button"
              onClick={() => onFetchAllFavorites()}
              disabled={fetchAllFavoritesBusy}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-outline-variant/25 bg-surface-container-highest px-3 text-xs font-medium text-on-surface hover:border-primary/40 hover:text-primary transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed shrink-0 whitespace-nowrap"
            >
              <span className={`material-symbols-outlined text-[16px] leading-none ${fetchAllFavoritesBusy ? 'animate-spin' : ''}`}>
                {fetchAllFavoritesBusy ? 'progress_activity' : 'sync'}
              </span>
              <span>
                {fetchAllFavoritesBusy
                  ? t('offlineLibrary.checkAllUpdatesBusy')
                  : t('offlineLibrary.checkAllUpdates')}
              </span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => handleManualRefresh()}
            disabled={loading || !base}
            data-tooltip={t('offlineLibrary.refreshTooltip') || t('offlineLibrary.refresh')}
            aria-label={t('offlineLibrary.refreshTooltip') || t('offlineLibrary.refresh')}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-outline-variant/25 bg-surface-container-highest text-on-surface-variant hover:text-primary hover:border-primary/40 transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
          >
            <span className={`material-symbols-outlined text-[17px] leading-none ${loading ? 'animate-spin' : ''}`}>
              refresh
            </span>
          </button>
        </div>
      </StudioPrimaryActionSlot>

      <StudioRightToolbarSlot>
        <div className="flex items-center gap-2 shrink-0">
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
          <ViewModeToggle
            viewMode={viewMode}
            onChange={setViewMode}
            size="md"
          />
        </div>
      </StudioRightToolbarSlot>

      <div className="flex-1 flex flex-col px-6 pt-4 pb-4 gap-4 sm:px-8 overflow-hidden min-h-0">
        {/* Filter Bar */}
        <OfflineLibraryToolbar
          query={query}
          setQuery={setQuery}
          sourceFilter={sourceFilter}
          setSourceFilter={setSourceFilter}
          t={t}
        />

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

        {/* Main Content: Grid View or List Table View */}
        {viewMode === 'grid' ? (
          <div
            className={`min-h-0 min-w-0 flex-1 overflow-auto custom-scrollbar rounded-xl border border-outline-variant/20 bg-surface shadow-sm ${
              sortedFiltered.length > 0 ? 'p-5' : 'flex items-center justify-center'
            }`}
          >
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
                  <OfflineGridCard
                    key={row.key}
                    row={row}
                    onFetchManga={onFetchManga}
                    onFetchFavorite={onFetchFavorite}
                    onToggleFavorite={onToggleFavorite}
                    onReadOffline={onReadOffline}
                    onReadFavorite={onReadFavorite}
                    onOpenFolder={onOpenFolder}
                    removeFromOfflineList={removeFromOfflineList}
                    openPinnedCbzFolder={openPinnedCbzFolder}
                    onReadCbzFromPath={onReadCbzFromPath}
                    setKindleRow={setKindleRow}
                    onToggleFavoriteNotifyWatch={onToggleFavoriteNotifyWatch}
                    onEnqueuePendingChapters={onEnqueuePendingChapters}
                    resolveSourceLabel={resolveSourceLabel}
                    t={t}
                  />
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
                headerClassName:
                  'w-36 min-w-0 p-3 font-bold text-xs uppercase tracking-wider text-on-surface-variant border-none whitespace-nowrap',
              },
              {
                key: 'chapters',
                width: 'w-32',
                header: t('favorites.col.chapters'),
                headerClassName:
                  'w-32 min-w-0 p-3 font-bold text-xs uppercase tracking-wider text-on-surface-variant border-none whitespace-nowrap',
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
                  <span className="line-clamp-2">{row.mangaTitle}</span>
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
      </div>

      {/* Bottom Slim Footer */}
      <OfflineLibraryFooter
        displayRowsCount={displayRows.length}
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
