import React from 'react';
import { FavoriteNotifyBell } from './FavoriteNotifyBell';
import {
  isKindleEligible,
  isExtractedTempRow,
  hasRowFetchUrl,
  canOpenOfflineRowFolder,
  openOfflineRowFolder,
  FAV_MS_ICON_18,
} from './offlineLibraryUtils';

const ROW_ACTION_BTN =
  'inline-flex items-center justify-center h-8 w-8 rounded-lg border border-outline-variant/20 bg-surface-container-highest shrink-0 transition-colors cursor-pointer';

export function OfflineListActions({
  row,
  t,
  onFetchRow,
  onOpenFolder,
  onRemoveFromList,
  onSendToKindle,
  onToggleNotifyWatch,
  onToggleFavorite,
}) {
  const canOpenFolder = canOpenOfflineRowFolder(row, { onOpenFolder });
  const hasFetchUrl = hasRowFetchUrl(row);

  return (
    <div className="inline-flex items-center justify-end gap-1.5 flex-nowrap">
      {hasFetchUrl && typeof onFetchRow === 'function' ? (
        <button
          type="button"
          data-testid="offline-row-fetch-btn"
          onClick={(e) => {
            e.stopPropagation();
            onFetchRow(row);
          }}
          className={`${ROW_ACTION_BTN} text-primary hover:border-primary/40 hover:bg-primary/10`}
          data-tooltip={t('offlineLibrary.fetchToQueueTooltip')}
          aria-label={t('offlineLibrary.fetchToQueueTooltip')}
        >
          <span className={FAV_MS_ICON_18}>sync</span>
        </button>
      ) : null}

      {typeof onToggleFavorite === 'function' ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(row);
          }}
          className={`inline-flex items-center justify-center h-8 w-8 shrink-0 rounded-lg border transition-colors cursor-pointer ${
            row.isFavorite
              ? 'bg-rose-500/15 text-rose-500 border-rose-500/35 hover:bg-rose-500 hover:text-white'
              : 'bg-surface-container-highest text-on-surface-variant border-outline-variant/20 hover:text-rose-500 hover:border-rose-500/35 hover:bg-rose-500/10'
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
          onClick={(e) => {
            e.stopPropagation();
            onSendToKindle(row);
          }}
          className={`${ROW_ACTION_BTN} text-primary hover:border-primary/40 hover:bg-primary/10`}
          data-tooltip={t('sendToKindle.menuButton')}
          aria-label={t('sendToKindle.menuButton')}
        >
          <span className={FAV_MS_ICON_18}>send_to_mobile</span>
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
          className={`${ROW_ACTION_BTN} text-primary hover:border-primary/40 hover:bg-primary/10 disabled:pointer-events-none disabled:opacity-35`}
          aria-label={
            canOpenFolder
              ? t('favorites.openFolderTitle')
              : t('offlineLibrary.folderNotDownloadedTooltip')
          }
        >
          <span className={FAV_MS_ICON_18}>folder_open</span>
        </button>
      </span>

      {typeof onRemoveFromList === 'function' ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemoveFromList(row);
          }}
          className={`${ROW_ACTION_BTN} text-error hover:border-error/30 hover:bg-error/10 hover:text-error`}
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
          <span className={FAV_MS_ICON_18}>delete</span>
        </button>
      ) : null}
    </div>
  );
}

export default OfflineListActions;
