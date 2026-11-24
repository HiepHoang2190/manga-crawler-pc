import React from 'react';
import { FavoriteNotifyBell } from './FavoriteNotifyBell';
import { isKindleEligible, isExtractedTempRow, FAV_MS_ICON_18 } from './offlineLibraryUtils';

const ROW_ACTION_BTN =
  'inline-flex items-center justify-center h-8 w-8 rounded-lg border border-outline-variant/20 bg-surface-container-highest shrink-0 transition-colors cursor-pointer';

export function OfflineListActions({
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
        className={`${ROW_ACTION_BTN} text-primary hover:border-primary/40 hover:bg-primary/10`}
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
          onClick={() => onSendToKindle(row)}
          className={`${ROW_ACTION_BTN} text-primary hover:border-primary/40 hover:bg-primary/10`}
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
          className={`${ROW_ACTION_BTN} text-primary hover:border-primary/40 hover:bg-primary/10`}
          data-tooltip={t('favorites.openFolderTitle')}
          aria-label={t('favorites.openFolderTitle')}
        >
          <span className={FAV_MS_ICON_18}>folder_open</span>
        </button>
      ) : null}

      {typeof onRemoveFromList === 'function' ? (
        <button
          type="button"
          onClick={() => onRemoveFromList(row)}
          className={`${ROW_ACTION_BTN} text-error hover:border-error/30 hover:bg-error/10 hover:text-error`}
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

export default OfflineListActions;
