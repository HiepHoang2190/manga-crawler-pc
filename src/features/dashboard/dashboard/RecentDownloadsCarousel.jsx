import { useEffect, useRef } from 'react';
import { useI18n } from '../../../context/I18nContext';
import { QueueCoverThumb } from '../../download';
import { computeHorizontalWheelDelta } from '../dashboardPrefs.mjs';

export default function RecentDownloadsCarousel({
  items,
  totalMangas = 0,
  totalChapters = 0,
  onSelectChapter,
  onEmptyAction,
}) {
  const { t } = useI18n();
  const cardRef = useRef(null);
  const scrollRef = useRef(null);
  const hasItems = Array.isArray(items) && items.length > 0;

  useEffect(() => {
    const cardEl = cardRef.current;
    const scrollerEl = scrollRef.current;
    if (!hasItems || !cardEl || !scrollerEl) return undefined;

    const handleWheel = (e) => {
      const { handled, delta } = computeHorizontalWheelDelta({
        deltaX: e.deltaX,
        deltaY: e.deltaY,
        deltaMode: e.deltaMode,
        ctrlKey: e.ctrlKey,
        scrollWidth: scrollerEl.scrollWidth,
        clientWidth: scrollerEl.clientWidth,
      });
      if (!handled) return;
      e.preventDefault();
      scrollerEl.scrollLeft += delta;
    };

    cardEl.addEventListener('wheel', handleWheel, { passive: false });
    return () => cardEl.removeEventListener('wheel', handleWheel);
  }, [hasItems]);

  if (!hasItems) {
    return (
      <section className="h-full rounded-2xl border border-outline-variant/20 bg-surface-container-low/50 dark:bg-surface-container-low/25 p-5 flex flex-col items-center justify-center text-center gap-3 min-h-[168px]">
        <div className="w-11 h-11 rounded-xl border border-outline-variant/20 bg-surface-container-high flex items-center justify-center text-on-surface-variant/65">
          <span className="material-symbols-outlined text-[24px]">history</span>
        </div>
        <div className="space-y-1 max-w-xs">
          <header className="text-sm font-bold text-on-surface">
            {t('dashboard.recentDownloads.title')}
          </header>
          <p className="text-xs text-on-surface-variant leading-relaxed">
            {t('dashboard.recentDownloads.empty')}
          </p>
        </div>
        {onEmptyAction ? (
          <button
            type="button"
            onClick={onEmptyAction}
            className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg border border-outline-variant/20 bg-surface-container-high text-on-surface text-xs font-semibold hover:bg-surface-bright transition-all active:scale-95 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[15px] leading-none text-primary">
              download
            </span>
            <span>{t('dashboard.recentDownloads.emptyCta')}</span>
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <section
      ref={cardRef}
      className="h-full rounded-2xl border border-outline-variant/20 bg-surface-container-low/50 dark:bg-surface-container-low/25 p-4 sm:p-5 flex flex-col gap-3"
    >
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-on-surface">
          <span className="material-symbols-outlined text-[17px] text-primary leading-none">
            history
          </span>
          <span>{t('dashboard.recentDownloads.title')}</span>
        </span>
        <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary tabular-nums">
          {t('dashboard.recentDownloads.summary', { mangas: totalMangas, chapters: totalChapters })}
        </span>
      </header>

      <div
        ref={scrollRef}
        className="flex items-stretch gap-3 overflow-x-auto custom-scrollbar pb-1"
      >
        {items.map((it) => {
          const itemKey = `${it.mangaId}::${it.chapterUrl}`;

          return (
            <button
              key={itemKey}
              type="button"
              onClick={() => onSelectChapter?.(it)}
              className="group shrink-0 cursor-pointer w-24 flex flex-col gap-1.5 text-left"
              data-tooltip={`${it.mangaTitle} — ${it.chapterTitle}`}
              aria-label={`${it.mangaTitle} — ${it.chapterTitle}`}
            >
              <QueueCoverThumb
                coverUrl={it.coverUrl}
                frameClassName="aspect-[3/4] w-full rounded-xl overflow-hidden border border-outline-variant/20 bg-surface-container-high flex items-center justify-center shadow-2xs"
                placeholderIconClassName="text-[24px]"
              />
              <div className="min-w-0 w-full space-y-0.5">
                <div className="text-xs font-semibold text-on-surface truncate group-hover:text-primary transition-colors">
                  {it.mangaTitle}
                </div>
                <div className="text-[11px] text-on-surface-variant truncate">
                  {it.chapterTitle}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
