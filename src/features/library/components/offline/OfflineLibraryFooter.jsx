import React from 'react';

export function OfflineLibraryFooter({
  displayRowsCount,
  addFolder,
  onOpenCbzFile,
  cbzLoadProgress,
  loadingArchiveFilePath,
  cbzError,
  onFetchAllFavorites,
  fetchAllFavoritesBusy,
  favoritesCount,
  handleManualRefresh,
  loading,
  hasBase,
  t,
}) {
  const electronAPI = typeof window !== 'undefined' ? window.electronAPI : null;

  return (
    <div className="mt-auto bg-surface-container-high rounded-xl p-4 flex flex-col gap-3 border border-outline-variant/20 shadow-sm shrink-0">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1 min-w-0">
          <span className="text-xs text-outline font-medium">
            {t('offlineLibrary.footerCount', { n: displayRowsCount })}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={addFolder}
            disabled={!electronAPI?.selectDirectory}
            className="flex items-center gap-2 px-6 py-2 text-xs font-bold bg-primary text-on-primary rounded-md shadow-md shadow-primary/20 hover:brightness-110 transition-all cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-sm">folder_special</span>
            {t('offlineLibrary.addFolder')}
          </button>
          <button
            type="button"
            onClick={() => onOpenCbzFile?.()}
            disabled={typeof onOpenCbzFile !== 'function' || !electronAPI?.pickAndLoadArchive}
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
          {typeof onFetchAllFavorites === 'function' && favoritesCount > 0 ? (
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
            disabled={loading || !hasBase}
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
  );
}

export default OfflineLibraryFooter;

