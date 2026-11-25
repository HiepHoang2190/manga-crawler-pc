import { useEffect, useState } from 'react';
import { useI18n } from '../../../context/I18nContext';

export default function ContinueReadingCard({ data, onOpen, onEmptyAction }) {
  const { t } = useI18n();
  const [coverError, setCoverError] = useState(false);

  useEffect(() => {
    setCoverError(false);
  }, [data?.coverUrl]);

  if (!data) {
    return (
      <article className="h-full rounded-2xl border border-outline-variant/20 bg-surface-container-low/50 dark:bg-surface-container-low/25 p-5 flex flex-col items-center justify-center text-center gap-3 min-h-[168px]">
        <div className="w-11 h-11 rounded-xl border border-outline-variant/20 bg-surface-container-high flex items-center justify-center text-on-surface-variant/65">
          <span className="material-symbols-outlined text-[24px]">auto_stories</span>
        </div>
        <div className="space-y-1 max-w-xs">
          <header className="text-sm font-bold text-on-surface">
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
    <article className="h-full rounded-2xl border border-primary/25 bg-primary/5 p-4 sm:p-5 flex gap-4 items-stretch justify-between min-h-[168px]">
      {data.coverUrl && !coverError ? (
        <img
          src={data.coverUrl}
          alt={data.mangaTitle || ''}
          onError={() => setCoverError(true)}
          className="h-32 w-24 rounded-xl object-cover border border-outline-variant/20 shadow-xs shrink-0 self-center"
        />
      ) : (
        <div className="h-32 w-24 rounded-xl bg-surface-container-high border border-outline-variant/20 flex items-center justify-center text-on-surface-variant/50 shrink-0 self-center">
          <span className="material-symbols-outlined text-[28px]">menu_book</span>
        </div>
      )}

      <div className="flex flex-col justify-between gap-2.5 min-w-0 flex-1">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-primary">
              <span className="material-symbols-outlined text-[14px] leading-none">
                menu_book
              </span>
              <span>{t('dashboard.continueReading.title')}</span>
            </span>
            {data.connectorName ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-surface-container-highest text-on-surface-variant border border-outline-variant/20 truncate max-w-[120px] shrink-0">
                {data.connectorName}
              </span>
            ) : null}
          </div>

          <h3 className="text-sm sm:text-base font-bold text-on-surface truncate">
            {data.mangaTitle}
          </h3>
          <p className="text-xs sm:text-sm text-on-surface-variant truncate">{data.chapterTitle}</p>
        </div>

        <div className="space-y-2.5">
          <div className="flex items-center gap-2.5">
            <div className="flex-1 h-2 rounded-full bg-surface-container-highest overflow-hidden">
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

          <button
            type="button"
            onClick={onOpen}
            className="inline-flex items-center justify-center gap-1.5 h-8 px-3.5 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:opacity-95 transition-all active:scale-95 cursor-pointer shadow-2xs"
          >
            <span className="material-symbols-outlined text-[16px] leading-none">play_arrow</span>
            <span>{t('dashboard.continueReading.resumeCta')}</span>
          </button>
        </div>
      </div>
    </article>
  );
}
