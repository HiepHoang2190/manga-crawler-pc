import React from 'react';
import { MangaCard } from '../../../../shared';
import { QueueCoverThumb } from '../../../download';
import { OfflineChapterMeta } from './OfflineChapterMeta';
import { OfflineCardActions } from './OfflineCardActions';

export function OfflineGridCard({
  row,
  onFetchManga,
  onFetchFavorite,
  onToggleFavorite,
  onReadOffline,
  onReadFavorite,
  onOpenFolder,
  removeFromOfflineList,
  openPinnedCbzFolder,
  onReadCbzFromPath,
  setKindleRow,
  onToggleFavoriteNotifyWatch,
  onEnqueuePendingChapters,
  resolveSourceLabel,
  t,
}) {
  const hasUrl = Boolean((row.mangaUrl || row.url) && String(row.mangaUrl || row.url).trim());

  return (
    <MangaCard
      cardClassName={
        row.isBadgeUnread
          ? 'border-amber-500/70 ring-2 ring-amber-500/35 bg-amber-500/[0.06]'
          : 'border-outline-variant/20 bg-surface-container-low hover:border-outline-variant/40 hover:bg-surface-container-high/55'
      }
      coverSlot={
        <QueueCoverThumb
          coverUrl={row.localCoverPath || row.coverUrl || ''}
          onFetch={
            hasUrl
              ? () => {
                  if (row.source === 'favorite' && onFetchFavorite) {
                    onFetchFavorite(row);
                  } else {
                    onFetchManga?.(row);
                  }
                }
              : undefined
          }
          fetchTitle={hasUrl ? t('offlineLibrary.clickCoverToFetch') : undefined}
          frameClassName="absolute inset-0 w-full h-full shrink-0 bg-surface-container-highest overflow-hidden border-0 flex items-center justify-center p-0 rounded-none"
          placeholderIconClassName="text-5xl"
        />
      }
      topLeft={
        hasUrl ? (
          <div
            className="pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity bg-black/60 backdrop-blur-xs text-white/95 rounded-full p-1.5 flex items-center justify-center shadow-md ring-1 ring-white/20"
            data-tooltip={t('offlineLibrary.clickCoverToFetch')}
          >
            <span className="material-symbols-outlined text-[15px] leading-none">
              cloud_download
            </span>
          </div>
        ) : null
      }
      topRight={
        typeof onToggleFavorite === 'function' ? (
          <MangaCard.FavoriteButton
            isFavorite={Boolean(row.isFavorite)}
            hideUntilHover
            onClick={() => onToggleFavorite(row)}
            tooltipAdd={t('mangaInfo.favoriteAdd')}
            tooltipRemove={t('mangaInfo.favoriteRemove')}
          />
        ) : null
      }
      coverOverlay={
        <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 flex items-end justify-center p-4">
          <div className="pointer-events-auto">
            <OfflineCardActions
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
            />
          </div>
        </div>
      }
      heading={row.mangaTitle}
      subtitle={
        <div className="space-y-1">
          <p
            className="text-[10px] font-semibold uppercase tracking-wide text-primary/90 truncate"
            data-tooltip={resolveSourceLabel(row)}
          >
            {resolveSourceLabel(row)}
          </p>
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
          {row.absolutePath ? (
            <p
              className="text-[10px] text-on-surface-variant/90 truncate pt-0.5"
              data-tooltip={row.absolutePath}
            >
              {row.absolutePath}
            </p>
          ) : null}
          {row.sourceFile ? (
            <p
              className="text-[10px] text-on-surface-variant/80 truncate"
              data-tooltip={row.sourceFile}
            >
              {t('offlineLibrary.lastExtractedSourceFile')}: {row.sourceFile}
            </p>
          ) : null}
        </div>
      }
    />
  );
}

export default OfflineGridCard;
