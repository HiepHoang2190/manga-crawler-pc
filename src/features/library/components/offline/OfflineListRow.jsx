import React from 'react';
import { QueueCoverThumb } from '../../../download';
import { OfflineChapterMeta } from './OfflineChapterMeta';
import { OfflineListActions } from './OfflineListActions';

/**
 * List-mode card row for Offline Library matching FollowedMangaPanel / Explore list view parity.
 */
export function OfflineListRow({
  row,
  onOpenRow,
  onFetchRow,
  onOpenFolder,
  onRemoveFromList,
  onSendToKindle,
  onToggleFavorite,
  resolveSourceLabel,
  t,
}) {
  const lineVariant =
    row.source === 'extraCbz'
      ? row.archiveKind === 'archive'
        ? 'archiveFiles'
        : 'cbzFiles'
      : 'chapters';

  return (
    <li
      onClick={() => onOpenRow?.(row)}
      className="group flex cursor-pointer select-none items-center justify-between gap-3 px-3 py-2.5 sm:px-4 rounded-xl border transition-all bg-surface-container-high/35 border-outline-variant/20 hover:border-outline-variant/40 hover:bg-surface-container-high/55"
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="relative h-14 w-10 sm:h-16 sm:w-11 shrink-0 overflow-hidden rounded-lg bg-surface-container-highest border border-outline-variant/15 flex items-center justify-center shadow-xs">
          <QueueCoverThumb
            coverUrl={row.localCoverPath || row.coverUrl || ''}
            frameClassName="absolute inset-0 size-full border-0 bg-transparent rounded-none flex items-center justify-center p-0"
            placeholderIconClassName="text-[20px]"
          />
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 min-w-0">
            <h4
              className="text-sm font-semibold text-on-surface truncate group-hover:text-primary transition-colors"
              data-tooltip={row.mangaTitle}
            >
              {row.mangaTitle}
            </h4>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-primary bg-primary/10 px-2 py-0.5 rounded shrink-0">
              {resolveSourceLabel(row)}
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs text-on-surface-variant flex-wrap min-w-0">
            <OfflineChapterMeta
              chapterCount={row.chapterCount}
              t={t}
              inline
              lineVariant={lineVariant}
            />
          </div>
        </div>
      </div>

      <div
        className="flex items-center gap-1.5 shrink-0"
        data-testid="offline-list-row-actions"
        onClick={(e) => e.stopPropagation()}
      >
        <OfflineListActions
          row={row}
          t={t}
          onFetchRow={onFetchRow}
          onOpenFolder={onOpenFolder}
          onRemoveFromList={onRemoveFromList}
          onSendToKindle={onSendToKindle}
          onToggleFavorite={onToggleFavorite}
        />
      </div>
    </li>
  );
}

export default OfflineListRow;
