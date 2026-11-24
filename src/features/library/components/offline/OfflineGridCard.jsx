import React from 'react';
import { MangaCard } from '../../../../shared';
import { QueueCoverThumb } from '../../../download';
import { OfflineChapterMeta } from './OfflineChapterMeta';
import { OfflineCardActions } from './OfflineCardActions';
import { openOfflineRow, fetchOfflineRow } from './offlineLibraryUtils';

export function OfflineGridCard({
  row,
  onFetchManga,
  onToggleFavorite,
  onReadOffline,
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
  return (
    <MangaCard
      onClick={() =>
        openOfflineRow(row, {
          onOpenPinnedCbzFolder: openPinnedCbzFolder,
          onReadArchivePath: onReadCbzFromPath,
          onReadOffline,
        })
      }
      cardClassName={
        row.isBadgeUnread
          ? 'border-amber-500/70 ring-2 ring-amber-500/35 bg-amber-500/[0.06]'
          : 'border-outline-variant/20 bg-surface-container-low hover:border-outline-variant/40 hover:bg-surface-container-high/55'
      }
      coverSlot={
        <QueueCoverThumb
          coverUrl={row.localCoverPath || row.coverUrl || ''}
          frameClassName="absolute inset-0 w-full h-full shrink-0 bg-surface-container-highest overflow-hidden border-0 flex items-center justify-center p-0 rounded-none"
          placeholderIconClassName="text-5xl"
        />
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
          <div className="pointer-events-auto" onClick={(e) => e.stopPropagation()}>
            <OfflineCardActions
              row={row}
              t={t}
              onFetchRow={(r) =>
                fetchOfflineRow(r, { onFetchManga })
              }
              onOpenFolder={onOpenFolder}
              onRemoveFromList={removeFromOfflineList}
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
            onEnqueuePending={
              typeof onEnqueuePendingChapters === 'function'
                ? () => onEnqueuePendingChapters(row)
                : undefined
            }
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
