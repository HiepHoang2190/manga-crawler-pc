import React from 'react';

const GROUP_SKELETON_ITEMS = Array.from({ length: 6 }, (_, idx) => idx);
const FILE_SKELETON_ITEMS = Array.from({ length: 8 }, (_, idx) => idx);

/**
 * Explore-style animated loading skeleton for DuplicateFinderTab during
 * duplicate scanning (group cards + unified progress) and initial file listing (file rows).
 */
export const DuplicateFinderSkeleton = React.memo(function DuplicateFinderSkeleton({
  mode = 'groups',
  statusText = '',
  progress = null,
}) {
  const total = Number(progress?.total);
  const hasValidProgress = Boolean(progress && Number.isFinite(total) && total > 0);
  const processed = hasValidProgress
    ? Math.max(0, Math.min(total, Number(progress?.processed) || 0))
    : 0;
  const pct = hasValidProgress
    ? Math.max(0, Math.min(100, Math.round((processed / total) * 100)))
    : 0;
  const currentFile = hasValidProgress && progress?.currentFile ? String(progress.currentFile) : '';

  return (
    <div
      data-testid="duplicate-finder-skeleton"
      aria-busy="true"
      aria-label={statusText || undefined}
      className="space-y-4 select-none"
    >
      <div className="space-y-2">
        <div
          role="status"
          className="flex items-center justify-between gap-2 text-xs font-medium text-on-surface-variant min-w-0"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="material-symbols-outlined text-[18px] animate-spin text-primary shrink-0 leading-none"
              aria-hidden="true"
            >
              progress_activity
            </span>
            <span className="truncate">
              {statusText}
              {currentFile ? ` — ${currentFile}` : ''}
            </span>
          </div>
          {hasValidProgress ? (
            <span className="shrink-0 font-mono tabular-nums text-on-surface-variant/85">
              {processed} / {total} ({pct}%)
            </span>
          ) : null}
        </div>

        {hasValidProgress ? (
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-container-highest">
            <div
              className="h-full bg-primary transition-[width] duration-150"
              style={{ width: `${pct}%` }}
            />
          </div>
        ) : null}
      </div>

      {mode === 'files' ? (
        <ul className="space-y-1.5">
          {FILE_SKELETON_ITEMS.map((idx) => (
            <li
              key={idx}
              className="flex items-center justify-between gap-2.5 px-3.5 py-2 rounded-xl border border-outline-variant/20 bg-surface-container-high/35 animate-pulse"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="h-3.5 w-6 shrink-0 rounded bg-surface-container-highest/70" />
                <div className="h-5 w-5 shrink-0 rounded bg-surface-container-highest" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="h-3.5 w-48 max-w-[60%] rounded bg-surface-container-highest" />
                  <div className="h-2.5 w-64 max-w-[75%] rounded bg-surface-container-highest/70" />
                </div>
              </div>
              <div className="h-3 w-24 shrink-0 rounded bg-surface-container-highest/75" />
            </li>
          ))}
        </ul>
      ) : (
        <div className="space-y-3">
          {GROUP_SKELETON_ITEMS.map((idx) => (
            <div
              key={idx}
              className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border border-outline-variant/20 bg-surface-container-high/35 animate-pulse"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="h-5 w-5 shrink-0 rounded bg-surface-container-highest" />
                <div className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 rounded-lg bg-surface-container-highest" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="h-5 w-20 rounded-md bg-surface-container-highest" />
                    <div className="h-4 w-28 rounded bg-surface-container-highest/80" />
                    <div className="hidden sm:block h-4 w-16 rounded bg-surface-container-highest/70" />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-3.5 w-44 max-w-[55%] rounded bg-surface-container-highest/85" />
                    <div className="h-3 w-20 rounded bg-surface-container-highest/65" />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="h-7 w-20 rounded-lg bg-surface-container-highest" />
                <div className="h-7 w-14 rounded-lg bg-surface-container-highest/70" />
                <div className="h-7 w-7 rounded-lg bg-surface-container-highest/70" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

export default DuplicateFinderSkeleton;
