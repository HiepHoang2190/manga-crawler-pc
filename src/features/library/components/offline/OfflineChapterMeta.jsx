import React from 'react';

export function OfflineChapterMeta({
  chapterCount,
  sync,
  t,
  lineVariant = 'chapters',
  onEnqueuePending,
}) {
  const pending =
    sync?.hasNew && typeof sync.remoteCount === 'number' ? sync.remoteCount : 0;
  return (
    <div className="flex flex-col items-start gap-1 min-w-0">
      <div className="text-xs text-outline tabular-nums flex items-center gap-1.5 flex-wrap">
        <span>
          {lineVariant === 'archiveFiles'
            ? t('offlineLibrary.archiveFilesLine', { count: chapterCount ?? 0 })
            : lineVariant === 'cbzFiles'
              ? t('offlineLibrary.cbzFilesLine', { count: chapterCount ?? 0 })
              : t('favorites.chaptersLine', { count: chapterCount ?? 0 })}
        </span>
        {sync?.error ? (
          <span className="text-error text-[10px] shrink-0" data-tooltip={sync.error}>
            {t('favorites.syncFailedShort')}
          </span>
        ) : null}
      </div>
      {pending > 0 ? (
        typeof onEnqueuePending === 'function' ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEnqueuePending();
            }}
            className="inline-flex items-center gap-1 text-[11px] font-medium leading-none text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 active:scale-95 transition-all cursor-pointer border border-amber-500/25 rounded-md px-1.5 py-0.5 shadow-2xs"
            data-tooltip={t('favorites.enqueuePendingTooltip', { n: pending })}
            aria-label={t('favorites.enqueuePendingTooltip', { n: pending })}
          >
            <span className="material-symbols-outlined text-[12px] leading-none">download</span>
            <span className="tabular-nums font-semibold">
              {t('favorites.newChaptersPending', { n: pending })}
            </span>
          </button>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium leading-none text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/25 rounded-md px-1.5 py-0.5 tabular-nums">
            <span className="material-symbols-outlined text-[12px] leading-none">download</span>
            <span className="tabular-nums font-semibold">
              {t('favorites.newChaptersPending', { n: pending })}
            </span>
          </span>
        )
      ) : null}
    </div>
  );
}

export default OfflineChapterMeta;

