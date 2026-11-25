import { useI18n } from '../../../context/I18nContext';
import { QueueCoverThumb } from '../../download';

export default function ContinueReadingCard({
  data,
  onOpen,
  onEmptyAction,
  loading = false,
  compact = false,
}) {
  const { t } = useI18n();

  if (!data) {
    return (
      <article
        className={`rounded-2xl border border-outline-variant/20 bg-surface-container-low/50 dark:bg-surface-container-low/25 flex flex-col items-center justify-center text-center gap-2.5 ${
          compact ? 'p-4' : 'h-full p-5 min-h-[168px]'
        }`}
      >
        <div
          className={`rounded-xl border border-outline-variant/20 bg-surface-container-high flex items-center justify-center text-on-surface-variant/65 ${
            compact ? 'w-9 h-9' : 'w-11 h-11'
          }`}
        >
          <span className={`material-symbols-outlined ${compact ? 'text-[20px]' : 'text-[24px]'}`}>
            auto_stories
          </span>
        </div>
        <div className="space-y-1 max-w-xs">
          <header className="text-xs sm:text-sm font-bold text-on-surface">
            {t('dashboard.continueReading.title')}
          </header>
          <p className="text-xs text-on-surface-variant leading-relaxed">
            {t('dashboard.continueReading.empty')}
          </p>
        </div>
        {onEmptyAction ? (
          <button
            type="button"
            onClick={onEmptyAction}
            className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:opacity-95 transition-all active:scale-95 cursor-pointer shadow-2xs"
          >
            <span className="material-symbols-outlined text-[15px] leading-none">
              collections_bookmark
            </span>
            <span>{t('dashboard.continueReading.emptyCta')}</span>
          </button>
        ) : null}
      </article>
    );
  }

  const percent = Math.max(0, Math.min(100, Math.round((Number(data.percent) || 0) * 100)));

  return (
    <article
      className={`rounded-2xl border border-primary/25 bg-primary/5 flex items-stretch justify-between ${
        compact ? 'p-3.5 gap-3' : 'h-full p-4 sm:p-5 gap-4 min-h-[168px]'
      }`}
    >
      <QueueCoverThumb
        coverUrl={data.coverUrl}
        frameClassName={
          compact
            ? 'h-24 w-16 rounded-xl bg-surface-container-high border border-outline-variant/20 flex items-center justify-center overflow-hidden shadow-xs shrink-0 self-center'
            : 'h-32 w-24 rounded-xl bg-surface-container-high border border-outline-variant/20 flex items-center justify-center overflow-hidden shadow-xs shrink-0 self-center'
        }
        placeholderIconClassName={compact ? 'text-[22px]' : 'text-[28px]'}
      />

      <div className="flex flex-col justify-between gap-2 min-w-0 flex-1">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center justify-between gap-1.5 min-w-0">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-primary truncate">
              <span className="material-symbols-outlined text-[13px] leading-none shrink-0">
                menu_book
              </span>
              <span className="truncate">{t('dashboard.continueReading.title')}</span>
            </span>
            {!compact && data.connectorName ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-surface-container-highest text-on-surface-variant border border-outline-variant/20 truncate max-w-[120px] shrink-0">
                {data.connectorName}
              </span>
            ) : null}
          </div>

          <h3 className={`font-bold text-on-surface truncate ${compact ? 'text-xs sm:text-sm' : 'text-sm sm:text-base'}`}>
            {data.mangaTitle}
          </h3>
          <p className={`text-on-surface-variant truncate ${compact ? 'text-xs' : 'text-xs sm:text-sm'}`}>
            {data.chapterTitle}
          </p>
          {compact && data.connectorName ? (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-surface-container-highest text-on-surface-variant border border-outline-variant/20 truncate max-w-full">
              {data.connectorName}
            </span>
          ) : null}
        </div>

        <div className="space-y-2">
          {percent > 0 ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-surface-container-highest overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${percent}%` }}
                  aria-label={`${percent}%`}
                />
              </div>
              <span className="text-[11px] font-bold tabular-nums text-primary shrink-0">
                {percent}%
              </span>
            </div>
          ) : null}

          <button
            type="button"
            onClick={onOpen}
            disabled={loading}
            className={`inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:opacity-95 transition-all active:scale-95 disabled:opacity-60 disabled:pointer-events-none cursor-pointer shadow-2xs ${
              compact ? 'w-full' : ''
            }`}
          >
            <span
              className={`material-symbols-outlined text-[16px] leading-none ${
                loading ? 'animate-spin' : ''
              }`}
            >
              {loading ? 'progress_activity' : 'play_arrow'}
            </span>
            <span>
              {loading
                ? t('dashboard.continueReading.opening')
                : t('dashboard.continueReading.resumeCta')}
            </span>
          </button>
        </div>
      </div>
    </article>
  );
}
