import React from 'react';

const OFFLINE_GRID_SKELETON_ITEMS = Array.from({ length: 12 }, (_, idx) => idx);
const OFFLINE_LIST_SKELETON_ITEMS = Array.from({ length: 8 }, (_, idx) => idx);

/**
 * Explore-style animated loading skeleton for Offline Library during rescan,
 * favorite update check, and initial foreground loading.
 */
export const OfflineLibrarySkeleton = React.memo(function OfflineLibrarySkeleton({
  viewMode,
  statusText,
}) {
  return (
    <div
      data-testid="offline-library-skeleton"
      aria-busy="true"
      aria-label={statusText}
      className="space-y-4 select-none"
    >
      <div
        role="status"
        className="flex items-center gap-2 text-xs font-medium text-on-surface-variant min-w-0"
      >
        <span className="material-symbols-outlined text-[18px] animate-spin text-primary shrink-0 leading-none">
          progress_activity
        </span>
        <span className="truncate">{statusText}</span>
      </div>

      {viewMode === 'list' ? (
        <ul className="flex flex-col gap-2">
          {OFFLINE_LIST_SKELETON_ITEMS.map((idx) => (
            <li
              key={idx}
              className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-4 rounded-xl border border-outline-variant/20 bg-surface-container-high/35 animate-pulse"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="h-14 w-10 sm:h-16 sm:w-11 shrink-0 rounded-lg bg-surface-container-highest" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-48 max-w-[65%] rounded bg-surface-container-highest" />
                    <div className="h-4 w-16 rounded bg-surface-container-highest/80" />
                  </div>
                  <div className="h-3 w-44 max-w-[55%] rounded bg-surface-container-highest/70" />
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="h-8 w-8 rounded-lg bg-surface-container-highest" />
                <div className="h-8 w-8 rounded-lg bg-surface-container-highest/80" />
                <div className="h-8 w-8 rounded-lg bg-surface-container-highest/80" />
                <div className="h-8 w-8 rounded-lg bg-surface-container-highest/80" />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {OFFLINE_GRID_SKELETON_ITEMS.map((idx) => (
            <li
              key={idx}
              className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-outline-variant/20 bg-surface-container-high/35 animate-pulse"
            >
              <div className="aspect-[3/4.2] bg-surface-container-highest" />
              <div className="flex flex-col gap-2 p-3">
                <div className="h-3.5 w-11/12 rounded bg-surface-container-highest" />
                <div className="h-3.5 w-2/3 rounded bg-surface-container-highest/80" />
                <div className="h-3 w-1/2 rounded bg-surface-container-highest/60" />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

export default OfflineLibrarySkeleton;
