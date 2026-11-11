import React from 'react';
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
    <div
      className={`group relative bg-surface-container-low rounded-xl overflow-hidden flex flex-col transition-all hover:shadow-2xl hover:shadow-black/40 border ${
        row.isBadgeUnread
          ? 'border-amber-500/70 ring-2 ring-amber-500/35 bg-amber-500/[0.06]'
          : 'border-outline-variant/10'
      }`}
    >
      <div className="aspect-[3/4.2] relative overflow-hidden bg-surface-container-highest">
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
        {hasUrl ? (
          <div
            className={`pointer-events-none absolute top-2.5 ${
              row.isBadgeUnread ? 'left-6.5' : 'left-2.5'
            } z-[2] opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 backdrop-blur-xs text-white/95 rounded-full p-1.5 flex items-center justify-center shadow-md ring-1 ring-white/20`}
            data-tooltip={t('offlineLibrary.clickCoverToFetch')}
          >
            <span className="material-symbols-outlined text-[15px] leading-none">
              cloud_download
            </span>
          </div>
        ) : null}
        {typeof onToggleFavorite === 'function' ? (
          <button
            type="button"
            aria-pressed={Boolean(row.isFavorite)}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(row);
            }}
            className={`absolute top-2.5 right-2.5 z-[2] flex h-7 w-7 cursor-pointer items-center justify-center rounded-full shadow-md transition-all ${
              row.isFavorite
                ? 'bg-rose-500/90 text-white ring-1 ring-white/40 backdrop-blur-xs hover:bg-rose-600'
                : 'bg-black/50 text-white/90 ring-1 ring-white/20 backdrop-blur-xs hover:bg-black/70 hover:text-rose-400 opacity-0 group-hover:opacity-100'
            }`}
            data-tooltip={
              row.isFavorite
                ? t('mangaInfo.favoriteRemove')
                : t('mangaInfo.favoriteAdd')
            }
            aria-label={
              row.isFavorite
                ? t('mangaInfo.favoriteRemove')
                : t('mangaInfo.favoriteAdd')
            }
          >
            <span
              className="material-symbols-outlined block text-[15px] leading-none"
              style={
                row.isFavorite
                  ? { fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 20" }
                  : { fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20" }
              }
            >
              {row.isFavorite ? 'favorite' : 'favorite_border'}
            </span>
          </button>
        ) : null}
        <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100 flex items-end justify-center p-4">
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
      </div>
      <div className="p-4 space-y-1">
        <h4 className="font-bold text-on-surface truncate group-hover:text-primary transition-colors">
          {row.mangaTitle}
        </h4>
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
            className="text-[10px] text-on-surface-variant/90 truncate pt-0.5 pr-10"
            data-tooltip={row.absolutePath}
          >
            {row.absolutePath}
          </p>
        ) : null}
        {row.sourceFile ? (
          <p
            className="text-[10px] text-on-surface-variant/80 truncate pr-10"
            data-tooltip={row.sourceFile}
          >
            {t('offlineLibrary.lastExtractedSourceFile')}: {row.sourceFile}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default OfflineGridCard;

