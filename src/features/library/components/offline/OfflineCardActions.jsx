import React from 'react';
import {
  isKindleEligible,
  isExtractedTempRow,
  hasRowFetchUrl,
  canOpenOfflineRowFolder,
  openOfflineRowFolder,
  FAV_MS_ICON_20,
} from './offlineLibraryUtils';

export function OfflineCardActions({
  row,
  t,
  onFetchRow,
  onOpenFolder,
  onRemoveFromList,
  onSendToKindle,
}) {
  const canOpenFolder = canOpenOfflineRowFolder(row, { onOpenFolder });
  const hasFetchUrl = hasRowFetchUrl(row);

  return (
    <div className="flex flex-wrap items-center justify-center gap-5 sm:gap-6 w-full px-2">
      {hasFetchUrl && typeof onFetchRow === 'function' ? (
        <button
          type="button"
          data-testid="offline-row-fetch-btn"
          onClick={(e) => {
            e.stopPropagation();
            onFetchRow(row);
          }}
          className="inline-flex items-center justify-center w-10 h-10 shrink-0 rounded-full bg-surface-container-high/95 text-primary border border-outline-variant/30 shadow-lg hover:brightness-110 transition-[filter] cursor-pointer"
          data-tooltip={t('offlineLibrary.fetchToQueueTooltip')}
          aria-label={t('offlineLibrary.fetchToQueueTooltip')}
        >
          <span className={FAV_MS_ICON_20}>sync</span>
        </button>
      ) : null}

      {typeof onSendToKindle === 'function' && isKindleEligible(row) ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSendToKindle(row);
          }}
          className="inline-flex items-center justify-center w-10 h-10 shrink-0 rounded-full bg-surface-container-high/95 text-primary border border-outline-variant/30 shadow-lg hover:brightness-110 transition-[filter] cursor-pointer"
          data-tooltip={t('sendToKindle.menuButton')}
          aria-label={t('sendToKindle.menuButton')}
        >
          <span className={FAV_MS_ICON_20}>send_to_mobile</span>
        </button>
      ) : null}

      <span
        className={`inline-flex shrink-0 ${!canOpenFolder ? 'cursor-not-allowed' : ''}`}
        data-tooltip={
          canOpenFolder
            ? t('favorites.openFolderTitle')
            : t('offlineLibrary.folderNotDownloadedTooltip')
        }
      >
        <button
          type="button"
          data-testid="offline-row-open-folder-btn"
          disabled={!canOpenFolder}
          onClick={(e) => {
            e.stopPropagation();
            if (canOpenFolder) openOfflineRowFolder(row, { onOpenFolder });
          }}
          className="inline-flex items-center justify-center w-10 h-10 shrink-0 rounded-full bg-surface-container-high/95 text-primary border border-outline-variant/30 shadow-lg hover:brightness-110 transition-[filter] cursor-pointer disabled:pointer-events-none disabled:opacity-35"
          aria-label={
            canOpenFolder
              ? t('favorites.openFolderTitle')
              : t('offlineLibrary.folderNotDownloadedTooltip')
          }
        >
          <span className={FAV_MS_ICON_20}>folder_open</span>
        </button>
      </span>

      {typeof onRemoveFromList === 'function' ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemoveFromList(row);
          }}
          className="inline-flex items-center justify-center w-10 h-10 shrink-0 rounded-full bg-red-500/25 backdrop-blur-md text-red-400 hover:bg-red-500 hover:text-white transition-colors cursor-pointer"
          data-tooltip={
            isExtractedTempRow(row)
              ? t('offlineLibrary.removeExtractedTempTitle')
              : t('offlineLibrary.removeFromListTitle')
          }
          aria-label={
            isExtractedTempRow(row)
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

export default OfflineCardActions;

