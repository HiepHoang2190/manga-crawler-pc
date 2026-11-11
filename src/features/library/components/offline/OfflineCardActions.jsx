import React from 'react';
import { FavoriteNotifyBell } from './FavoriteNotifyBell';
import { isKindleEligible, isExtractedTempRow, FAV_MS_ICON_20 } from './offlineLibraryUtils';

export function OfflineCardActions({
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

export default OfflineCardActions;

