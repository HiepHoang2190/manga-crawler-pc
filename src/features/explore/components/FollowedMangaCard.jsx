import React from 'react';
import { useI18n } from '../../../context/I18nContext';
import { MangaCard } from '../../../shared';

export default function FollowedMangaCard({
  item,
  sync = null,
  siteLabel = '',
  siteIcon = null,
  isLoading = false,
  isEnqueuing = false,
  downloadState = null,
  onStartQueue = null,
  onStopQueue = null,
  onOpenManga = null,
  onEnqueueNew = null,
  onRemove = null,
}) {
  const { t } = useI18n();

  if (!item) return null;

  const hasNew = Boolean(sync?.hasNew);
  const pendingNewCount = typeof sync?.pendingNewCount === 'number' ? sync.pendingNewCount : 0;
  const remoteCount = typeof sync?.remoteCount === 'number' ? sync.remoteCount : item.chapterCount || 0;

  const cardToneClass = isLoading
    ? 'border-primary/50 bg-surface-container-high/55'
    : downloadState?.isCurrentDownloading
      ? 'border-primary/60 bg-primary/8 shadow-sm ring-1 ring-primary/25'
      : downloadState
        ? 'border-primary/30 bg-primary/4 hover:border-primary/50 hover:bg-primary/8'
        : hasNew
          ? 'border-emerald-500/40 hover:border-emerald-500/60 bg-surface-container-high/40 hover:bg-surface-container-high/60'
          : 'border-outline-variant/20 hover:border-outline-variant/40 bg-surface-container-high/35 hover:bg-surface-container-high/55';

  const subtitleNode = downloadState ? (
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
            ? t('followedManga.badge.newChaptersShort', { count: pendingNewCount })
            : t('followedManga.filter.hasNew')}
        </span>
      </span>
      <span className="text-[11px] text-on-surface-variant/60 tabular-nums shrink-0 ml-1">
        • {t('followedManga.badge.chapterCount', { count: remoteCount })}
      </span>
    </div>
  ) : (
    <div className="flex items-center text-xs text-on-surface-variant">
      <span className="inline-flex items-center gap-1 text-xs text-on-surface-variant truncate">
        <span className="material-symbols-outlined text-[14px] text-emerald-500 leading-none shrink-0">check</span>
        <span className="truncate">
          {remoteCount > 0
            ? t('followedManga.badge.chapterCount', { count: remoteCount })
            : t('followedManga.badge.upToDate')}
        </span>
      </span>
    </div>
  );

  return (
    <MangaCard
      coverUrl={item.coverUrl}
      noCoverText={t('latestUpdates.noCover')}
      loading={isLoading}
      disabled={isLoading || isEnqueuing}
      onClick={() => onOpenManga?.(item)}
      cardClassName={cardToneClass}
      topLeft={
        <MangaCard.SourceBadge
          label={siteLabel || item.siteId || t('favorites.siteUnknown')}
          icon={siteIcon}
        />
      }
      topRight={
        <>
          {hasNew && (
            <span className="pointer-events-none px-1.5 py-0.5 rounded bg-emerald-500 text-[10px] font-bold text-white shadow-xs flex items-center gap-1 animate-pulse">
              <span className="w-1 h-1 rounded-full bg-white" />
              <span>{t('followedManga.badge.new')}</span>
            </span>
          )}
          <MangaCard.FavoriteButton
            isFavorite
            onClick={() => onRemove?.(item.id)}
            tooltipAdd={t('followedManga.actions.removeFavorite')}
            tooltipRemove={t('followedManga.actions.removeFavorite')}
          />
        </>
      }
      heading={item.title || ''}
      subtitle={subtitleNode}
      footer={
        <>
          <MangaCard.ChapterButton
            testId="followed-card-view-chapters"
            label={t('followedManga.actions.viewChapters')}
            loading={isLoading}
            loadingLabel={t('latestUpdates.loading')}
            disabled={isLoading || isEnqueuing}
            onClick={() => onOpenManga?.(item)}
          />
          {downloadState ? (
            <button
              type="button"
              data-testid="followed-card-pause-resume"
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
            <MangaCard.QueueButton
              loading={isEnqueuing}
              disabled={isEnqueuing || isLoading}
              tooltip={
                hasNew && pendingNewCount > 0
                  ? t('followedManga.actions.enqueueNew', { count: pendingNewCount })
                  : t('latestUpdates.addToQueue')
              }
              onClick={() => onEnqueueNew(item, sync)}
            />
          ) : null}
        </>
      }
    />
  );
}

function areFollowedCardPropsEqual(prev, next) {
  if (
    prev.item !== next.item ||
    prev.sync !== next.sync ||
    prev.siteLabel !== next.siteLabel ||
    prev.siteIcon !== next.siteIcon ||
    prev.isLoading !== next.isLoading ||
    prev.isEnqueuing !== next.isEnqueuing ||
    prev.onStartQueue !== next.onStartQueue ||
    prev.onStopQueue !== next.onStopQueue ||
    prev.onOpenManga !== next.onOpenManga ||
    prev.onEnqueueNew !== next.onEnqueueNew ||
    prev.onRemove !== next.onRemove
  ) {
    return false;
  }
  const pd = prev.downloadState;
  const nd = next.downloadState;
  if (pd === nd) return true;
  if (!pd || !nd) return false;
  return (
    pd.done === nd.done &&
    pd.total === nd.total &&
    pd.percent === nd.percent &&
    pd.isCurrentDownloading === nd.isCurrentDownloading &&
    pd.activePage?.current === nd.activePage?.current &&
    pd.activePage?.total === nd.activePage?.total
  );
}

export const MemoFollowedMangaCard = React.memo(FollowedMangaCard, areFollowedCardPropsEqual);
