import React, { useEffect, useState } from 'react';

/**
 * Unified grid card shell used across Explore subtabs (Latest Updates, Bulk Scan,
 * Followed Manga) and Offline Library grid view via composable slots.
 */
export default function MangaCard({
  as: Component = 'div',
  coverUrl = '',
  coverSlot = null,
  noCoverText = '',
  loading = false,
  topLeft = null,
  topRight = null,
  coverOverlay = null,
  heading = '',
  headingTooltip,
  subtitle = null,
  footer = null,
  onClick,
  disabled = false,
  cardClassName = '',
  bodyClassName = '',
  ...rest
}) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [coverUrl]);

  const isInteractive = typeof onClick === 'function' && !disabled;

  const isDescendantInteractive = (e) => {
    const interactiveTarget = e.target.closest('button, a, input, textarea, select, [role="button"]');
    return Boolean(interactiveTarget && interactiveTarget !== e.currentTarget);
  };

  const handleClick = (e) => {
    if (!isInteractive || isDescendantInteractive(e)) return;
    onClick(e);
  };

  const handleKeyDown = (e) => {
    if (!isInteractive) return;
    if (e.key === 'Enter' || e.key === ' ') {
      if (isDescendantInteractive(e)) return;
      e.preventDefault();
      onClick(e);
    }
  };

  return (
    <Component
      {...rest}
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onClick={isInteractive ? handleClick : undefined}
      onKeyDown={isInteractive ? handleKeyDown : undefined}
      className={`group relative flex min-w-0 flex-col overflow-hidden rounded-xl border transition-all hover:shadow-md select-none ${
        isInteractive
          ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
          : ''
      } ${loading ? 'ring-2 ring-primary/40' : ''} ${
        cardClassName ||
        'border-outline-variant/20 bg-surface-container-high/35 hover:border-outline-variant/40 hover:bg-surface-container-high/55'
      }`}
    >
      <div className="relative aspect-[3/4.2] bg-surface-container-highest flex items-center justify-center overflow-hidden">
        {coverSlot ?? (
          <>
            <div className="flex flex-col items-center justify-center gap-1 text-on-surface-variant/40 p-2 text-center pointer-events-none select-none">
              <span className="material-symbols-outlined text-[32px] leading-none">menu_book</span>
              {noCoverText ? (
                <span className="text-[10px] font-medium leading-tight line-clamp-1">{noCoverText}</span>
              ) : null}
            </div>
            {!imgError && coverUrl ? (
              <img
                src={coverUrl}
                alt=""
                onError={() => setImgError(true)}
                className="pointer-events-none absolute inset-0 size-full object-cover group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
              />
            ) : null}
          </>
        )}

        {loading ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
            <span className="material-symbols-outlined animate-spin text-[28px] text-white leading-none">
              progress_activity
            </span>
          </div>
        ) : null}

        {(topLeft || topRight) ? (
          <div className="pointer-events-none absolute inset-x-2 top-2 z-[2] flex items-start justify-between gap-2">
            {topLeft ? <div className="flex items-center gap-1.5 min-w-0">{topLeft}</div> : <span />}
            {topRight ? (
              <div className="flex items-center gap-1.5 shrink-0">{topRight}</div>
            ) : null}
          </div>
        ) : null}

        {coverOverlay}
      </div>

      <div className={`flex min-h-0 flex-1 flex-col gap-1 p-3 ${bodyClassName}`}>
        {heading ? (
          <p
            className="line-clamp-2 text-sm font-semibold leading-snug text-on-surface group-hover:text-primary transition-colors"
            data-tooltip={headingTooltip ?? (heading || undefined)}
          >
            {heading}
          </p>
        ) : null}

        {subtitle}

        {footer ? (
          <div className="mt-auto flex w-full items-center gap-1.5 pt-1" onClick={(e) => e.stopPropagation()}>
            {footer}
          </div>
        ) : null}
      </div>
    </Component>
  );
}

MangaCard.SourceBadge = function MangaCardSourceBadge({ label, icon = null, className = '' }) {
  return (
    <span
      className={`pointer-events-none min-w-0 truncate rounded bg-black/60 backdrop-blur-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white flex items-center gap-1 ${className}`}
    >
      {icon ? <img src={icon} alt="" className="w-3 h-3 rounded shrink-0" /> : null}
      <span className="truncate">{label}</span>
    </span>
  );
};

MangaCard.FavoriteButton = function MangaCardFavoriteButton({
  isFavorite,
  onClick,
  tooltipAdd,
  tooltipRemove,
  hideUntilHover = false,
}) {
  const label = isFavorite ? tooltipRemove : tooltipAdd;
  return (
    <button
      type="button"
      aria-pressed={Boolean(isFavorite)}
      aria-label={label}
      data-tooltip={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      className={`pointer-events-auto flex h-7 w-7 cursor-pointer items-center justify-center rounded-full shadow-md transition-all shrink-0 ${
        isFavorite
          ? 'bg-rose-500/80 text-white ring-1 ring-white/40 backdrop-blur-[2px] hover:bg-rose-500/90'
          : `border border-white/25 bg-black/40 text-white/95 shadow-black/10 backdrop-blur-sm hover:bg-black/55 ${
              hideUntilHover ? 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100' : ''
            }`
      }`}
    >
      <span
        className="material-symbols-outlined block text-[15px] leading-none"
        style={
          isFavorite
            ? { fontVariationSettings: "'FILL' 1, 'wght' 300, 'GRAD' 0, 'opsz' 20" }
            : { fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 20" }
        }
      >
        {isFavorite ? 'favorite' : 'favorite_border'}
      </span>
    </button>
  );
};

MangaCard.ChapterButton = function MangaCardChapterButton({
  label,
  loading = false,
  loadingLabel = '',
  disabled = false,
  tooltip,
  onClick,
  testId,
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      disabled={disabled}
      data-tooltip={tooltip}
      aria-label={loading ? loadingLabel || label : label}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      className="flex-1 min-w-0 h-8 px-2.5 rounded-lg bg-primary text-on-primary hover:opacity-90 text-xs font-semibold transition-all flex items-center justify-center disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer shadow-2xs"
    >
      {loading ? (
        <span className="inline-flex items-center justify-center gap-1">
          <span className="material-symbols-outlined animate-spin text-[14px] leading-none">
            progress_activity
          </span>
          <span className="truncate">{loadingLabel || label}</span>
        </span>
      ) : (
        <span className="truncate whitespace-nowrap">{label}</span>
      )}
    </button>
  );
};

MangaCard.QueueButton = function MangaCardQueueButton({
  loading = false,
  disabled = false,
  tooltip,
  onClick,
  testId,
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      disabled={disabled}
      data-tooltip={tooltip}
      aria-label={tooltip}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      className="h-8 w-8 shrink-0 rounded-lg border border-primary/30 bg-primary/12 text-primary hover:bg-primary/20 transition-colors flex items-center justify-center disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer shadow-2xs"
    >
      {loading ? (
        <span className="material-symbols-outlined animate-spin text-[15px] leading-none">
          progress_activity
        </span>
      ) : (
        <span className="material-symbols-outlined text-[17px] leading-none">playlist_add</span>
      )}
    </button>
  );
};
