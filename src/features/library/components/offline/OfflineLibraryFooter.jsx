import React from 'react';

export function OfflineLibraryFooter({
  displayRowsCount,
  cbzLoadProgress,
  cbzError,
  t,
}) {
  return (
    <div className="border-t border-outline-variant/20 bg-surface-container-low/80 backdrop-blur-md px-4 py-2.5 flex flex-col gap-2 select-none shrink-0">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <span className="inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary tabular-nums shadow-2xs">
          {t('offlineLibrary.footerCount', { n: displayRowsCount })}
        </span>
        {cbzLoadProgress && cbzLoadProgress.total > 0 ? (
          <div className="flex items-center gap-2.5 min-w-[140px] max-w-xs flex-1 justify-end">
            <span className="text-[11px] font-semibold text-primary tabular-nums">
              {cbzLoadProgress.pct ?? 0}%
            </span>
            <div className="h-1.5 flex-1 rounded-full bg-surface-container-highest overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-200"
                style={{ width: `${cbzLoadProgress.pct ?? 0}%` }}
              />
            </div>
          </div>
        ) : cbzError ? (
          <div className="flex items-center gap-1.5 rounded-full border border-error/30 bg-error/10 px-3 py-1 text-xs text-error">
            <span className="material-symbols-outlined text-sm shrink-0">error</span>
            <span className="truncate max-w-md">{cbzError}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default OfflineLibraryFooter;
