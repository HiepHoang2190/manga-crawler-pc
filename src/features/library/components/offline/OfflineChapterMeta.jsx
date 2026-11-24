import React from 'react';

export function OfflineChapterMeta({
  chapterCount,
  t,
  inline = false,
  lineVariant = 'chapters',
}) {
  return (
    <div className={inline ? 'flex items-center gap-2 flex-wrap min-w-0' : 'flex flex-col items-start gap-1 min-w-0'}>
      <div className="text-xs text-outline tabular-nums flex items-center gap-1.5 flex-wrap">
        <span>
          {lineVariant === 'archiveFiles'
            ? t('offlineLibrary.archiveFilesLine', { count: chapterCount ?? 0 })
            : lineVariant === 'cbzFiles'
              ? t('offlineLibrary.cbzFilesLine', { count: chapterCount ?? 0 })
              : t('favorites.chaptersLine', { count: chapterCount ?? 0 })}
        </span>
      </div>
    </div>
  );
}

export default OfflineChapterMeta;

