import React, { useState } from 'react';
import { useI18n } from '../../../context/I18nContext';

export default function FollowedMangaCard({
  item,
  sync = null,
  siteLabel = '',
  siteIcon = null,
  isChecking = false,
  isLoading = false,
  isEnqueuing = false,
  downloadState = null,
  onStartQueue = null,
  onStopQueue = null,
  onOpenManga = null,
  onReadNow = null,
  onEnqueueNew = null,
  onRecheck = null,
  onRemove = null,
}) {
  const { t } = useI18n();
  const [imgError, setImgError] = useState(false);

  if (!item) return null;

  const hasNew = Boolean(sync?.hasNew);
  const pendingNewCount = typeof sync?.pendingNewCount === 'number' ? sync.pendingNewCount : 0;
  const remoteCount = typeof sync?.remoteCount === 'number' ? sync.remoteCount : item.chapterCount || 0;

  const handleCardClick = (e) => {
    if (e.target.closest('button') || e.target.closest('a')) return;
    if (typeof onOpenManga === 'function') {
      onOpenManga(item);
    }
  };

  return (
    <div
      onClick={handleCardClick}
      className={`flex min-w-0 flex-col overflow-hidden rounded-xl border transition-all select-none cursor-pointer group ${
        downloadState?.isCurrentDownloading
          ? 'border-primary/60 bg-primary/8 shadow-sm ring-1 ring-primary/25'
          : downloadState
          ? 'border-primary/30 bg-primary/4'
          : hasNew
          ? 'border-emerald-500/40 hover:border-emerald-500/60 bg-surface-container-high/40 hover:bg-surface-container-high/60'
          : 'border-outline-variant/20 hover:border-outline-variant/40 bg-surface-container-high/35 hover:bg-surface-container-high/55'
      }`}
    >
      {/* Cover Image Container (matching LatestUpdatesPanel aspect-[3/4.2]) */}
      <div className="relative aspect-[3/4.2] bg-surface-container-highest flex items-center justify-center overflow-hidden">
        <div className="flex flex-col items-center justify-center gap-1 text-on-surface-variant/40 p-2 text-center pointer-events-none select-none">
          <span className="material-symbols-outlined text-[32px] leading-none">auto_stories</span>
        </div>
        {!imgError && item.coverUrl ? (
          <img
            src={item.coverUrl}
            alt={item.title || 'Cover'}
            onError={() => setImgError(true)}
            className="absolute inset-0 size-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
            decoding="async"
          />
        ) : null}

        {/* Floating Top-Left: Web Source Badge */}
        <span className="pointer-events-none absolute left-2 top-2 z-[1] max-w-[calc(100%-5rem)] truncate rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white flex items-center gap-1">
          {siteIcon && <img src={siteIcon} alt="" className="w-3 h-3 rounded shrink-0" />}
          <span className="truncate">{siteLabel || item.siteId || 'Unknown'}</span>
        </span>

        {/* Floating Top-Right: New Badge & Heart Bookmark Actions */}
        <div className="absolute right-2 top-2 z-[1] flex items-center gap-1.5">
          {hasNew && (
            <span className="pointer-events-none px-1.5 py-0.5 rounded bg-emerald-500 text-[10px] font-bold text-white shadow-xs flex items-center gap-1 animate-pulse">
              <span className="w-1 h-1 rounded-full bg-white" />
              <span>{t('followedManga.badge.new')}</span>
            </span>
          )}

          {/* Remove / Heart bookmark button (matching LatestUpdatesPanel style) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove?.(item.id);
            }}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full shadow-md bg-rose-500/80 text-white ring-1 ring-white/40 backdrop-blur-[2px] hover:bg-rose-500/90 transition-all shrink-0"
            data-tooltip={t('followedManga.actions.removeFavorite')}
            aria-label={t('followedManga.actions.removeFavorite')}
          >
            <span
              className="material-symbols-outlined block text-[15px] leading-none"
              style={{ fontVariationSettings: "'FILL' 1, 'wght' 300, 'GRAD' 0, 'opsz' 20" }}
            >
              favorite
            </span>
          </button>
        </div>
      </div>

      {/* Manga Information & Actions */}
      <div className="flex min-h-0 flex-1 flex-col gap-1 p-3">
        {/* Title (2 lines clamp) */}
        <p
          onClick={() => onOpenManga?.(item)}
          className="line-clamp-2 text-sm font-semibold leading-snug text-on-surface group-hover:text-primary transition-colors cursor-pointer"
          data-tooltip={item.title}
        >
          {item.title || 'Untitled'}
        </p>

        {/* Status Line / Download Progress */}
        {downloadState ? (
          <div
            className="flex flex-col gap-1 text-xs"
            data-tooltip={
              downloadState.isCurrentDownloading && downloadState.activePage
                ? `${t('followedManga.progress.downloading', {
                    done: downloadState.done,
                    total: downloadState.total,
                  })} • ${t('followedManga.progress.pageDetail', {
                    current: downloadState.activePage.current,
                    total: downloadState.activePage.total,
                  })}`
                : undefined
            }
          >
            <div className="flex items-center justify-between text-xs text-primary font-medium">
              <span className="inline-flex items-center gap-1 truncate">
                <span
                  className={`material-symbols-outlined text-[13px] leading-none shrink-0 ${
                    downloadState.isCurrentDownloading ? 'animate-spin' : ''
                  }`}
                >
                  {downloadState.isCurrentDownloading ? 'sync' : 'hourglass_top'}
                </span>
                <span className="truncate">
                  {downloadState.isCurrentDownloading
                    ? t('followedManga.progress.downloading', {
                        done: downloadState.done,
                        total: downloadState.total,
                      })
                    : t('followedManga.progress.waiting', {
                        done: downloadState.done,
                        total: downloadState.total,
                      })}
                </span>
              </span>
              <span className="text-[11px] tabular-nums shrink-0 ml-1 font-semibold">
                {downloadState.percent}%
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-surface-container-highest overflow-hidden border border-outline-variant/10">
              <div
                className="h-full bg-primary transition-[width] duration-200 ease-out"
                style={{ width: `${downloadState.percent}%` }}
              />
            </div>
          </div>
        ) : hasNew ? (
          <div
            className="flex items-center text-xs text-on-surface-variant truncate"
            data-tooltip={pendingNewCount > 0 ? t('followedManga.badge.newChapters', { count: pendingNewCount }) : undefined}
          >
            <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400 truncate">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span className="truncate">
                {pendingNewCount > 0
                  ? `+${pendingNewCount} chap mới`
                  : t('followedManga.filter.hasNew')}
              </span>
            </span>
            <span className="text-[11px] text-on-surface-variant/60 tabular-nums shrink-0 ml-1">
              • {remoteCount} chap
            </span>
          </div>
        ) : (
          <div className="flex items-center text-xs text-on-surface-variant">
            <span className="inline-flex items-center gap-1 text-[11px] text-on-surface-variant/70 truncate">
              <span className="material-symbols-outlined text-[13px] text-emerald-500 leading-none shrink-0">check</span>
              <span className="truncate">{remoteCount > 0 ? `${remoteCount} chap` : t('followedManga.badge.upToDate')}</span>
            </span>
          </div>
        )}

        {/* Card Action Controls (Single row matching LatestUpdatesPanel) */}
        <div className="mt-auto flex w-full items-center gap-1.5 pt-1">
          <button
            type="button"
            disabled={isLoading}
            onClick={(e) => {
              e.stopPropagation();
              onOpenManga?.(item);
            }}
            className="flex-1 min-w-0 h-8 rounded-lg bg-primary text-on-primary hover:opacity-90 text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs whitespace-nowrap px-2 disabled:opacity-50"
            aria-label={t('followedManga.actions.viewChapters')}
          >
            {isLoading ? (
              <span className="inline-flex items-center justify-center gap-1.5">
                <span className="material-symbols-outlined animate-spin text-[14px] leading-none">
                  progress_activity
                </span>
                <span className="truncate">{t('latestUpdates.loading')}</span>
              </span>
            ) : (
              <>
                <span className="material-symbols-outlined text-[15px] leading-none shrink-0">
                  format_list_bulleted
                </span>
                <span className="truncate whitespace-nowrap">
                  {t('followedManga.actions.viewChapters')}
                </span>
              </>
            )}
          </button>

          {downloadState ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (downloadState.isCurrentDownloading) {
                  onStopQueue?.();
                } else {
                  onStartQueue?.({ unpauseAll: true });
                }
              }}
              className="h-8 w-8 shrink-0 rounded-lg border border-outline-variant/20 bg-surface-container-highest hover:bg-surface-bright text-on-surface transition-all flex items-center justify-center cursor-pointer shadow-2xs"
              data-tooltip={
                downloadState.isCurrentDownloading
                  ? t('followedManga.actions.pauseDownload')
                  : t('followedManga.actions.resumeDownload')
              }
              aria-label={
                downloadState.isCurrentDownloading
                  ? t('followedManga.actions.pauseDownload')
                  : t('followedManga.actions.resumeDownload')
              }
            >
              <span className="material-symbols-outlined text-[16px] leading-none">
                {downloadState.isCurrentDownloading ? 'pause' : 'play_arrow'}
              </span>
            </button>
          ) : typeof onEnqueueNew === 'function' ? (
            <button
              type="button"
              disabled={isEnqueuing}
              onClick={(e) => {
                e.stopPropagation();
                onEnqueueNew(item, sync);
              }}
              className="h-8 w-8 shrink-0 rounded-lg bg-primary text-on-primary hover:opacity-90 transition-all flex items-center justify-center disabled:pointer-events-none disabled:opacity-45 cursor-pointer shadow-2xs"
              data-tooltip={
                hasNew && pendingNewCount > 0
                  ? t('followedManga.actions.enqueueNew', { count: pendingNewCount })
                  : t('latestUpdates.addToQueue')
              }
              aria-label={
                hasNew && pendingNewCount > 0
                  ? t('followedManga.actions.enqueueNew', { count: pendingNewCount })
                  : t('latestUpdates.addToQueue')
              }
            >
              <span
                className={`material-symbols-outlined text-[17px] leading-none ${
                  isEnqueuing ? 'animate-spin' : ''
                }`}
              >
                {isEnqueuing ? 'progress_activity' : 'playlist_add'}
              </span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
