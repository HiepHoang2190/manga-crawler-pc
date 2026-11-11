import React from 'react';
import { useI18n } from '../../../../context/I18nContext';

export function ReaderPageBottomNav({
  chaptersCount,
  goPrev,
  prevChapterDisabled,
  goNext,
  nextChapterDisabled,
  visiblePageIndex,
  totalPages,
  jumpPageDraft,
  setJumpPageDraft,
  handleJumpToPage,
}) {
  const { t } = useI18n();

  if (totalPages <= 0) return null;

  return (
    <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 z-35 flex max-w-[calc(100%-2rem)] items-center justify-center">
      <div
        role="region"
        aria-label={t('reader.pageBarToggleAria')}
        className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-outline-variant/25 bg-surface-container-high/85 px-2.5 py-1.5 shadow-2xl backdrop-blur-xl opacity-80 transition-all duration-200 hover:border-primary/40 hover:bg-surface-container-high/95 hover:opacity-100 hover:shadow-primary/10 focus-within:border-primary/40 focus-within:bg-surface-container-high/95 focus-within:opacity-100 sm:gap-2 sm:px-3"
      >
        {chaptersCount > 1 ? (
          <>
            <button
              type="button"
              onClick={goPrev}
              disabled={prevChapterDisabled}
              data-tooltip={t('reader.prevChapter')}
              aria-label={t('reader.prevChapter')}
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-on-surface-variant transition-all hover:scale-105 hover:bg-primary/15 hover:text-primary active:scale-95 disabled:pointer-events-none disabled:opacity-25"
            >
              <span className="material-symbols-outlined text-[20px] leading-none">
                arrow_back_ios_new
              </span>
            </button>
            <span className="h-4 w-px shrink-0 bg-outline-variant/25" aria-hidden />
          </>
        ) : null}

        <div className="flex items-center gap-1.5 px-1 sm:gap-2">
          <span className="select-none text-xs font-semibold tabular-nums text-on-surface whitespace-nowrap">
            {t('reader.pageOf', {
              current: visiblePageIndex + 1,
              total: totalPages,
            })}
          </span>
          <span className="hidden h-3.5 w-px shrink-0 bg-outline-variant/20 sm:inline-block" aria-hidden />
          <label className="flex items-center gap-1">
            <span className="sr-only">{t('reader.jumpPageAria')}</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={totalPages}
              value={jumpPageDraft}
              onChange={(e) => setJumpPageDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleJumpToPage();
                }
              }}
              placeholder={t('reader.jumpPagePlaceholder')}
              aria-label={t('reader.jumpPageAria')}
              className="h-7 w-12 rounded-lg border border-outline-variant/25 bg-surface-container-highest/60 px-1 text-center text-xs tabular-nums text-on-surface outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/40 [appearance:textfield] sm:w-14 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <button
              type="button"
              onClick={handleJumpToPage}
              data-tooltip={t('reader.jumpPage')}
              aria-label={t('reader.jumpPage')}
              className="h-7 cursor-pointer rounded-lg bg-primary/20 px-2.5 text-xs font-semibold text-primary whitespace-nowrap transition-all hover:bg-primary hover:text-on-primary active:scale-95"
            >
              {t('reader.jumpPage')}
            </button>
          </label>
        </div>

        {chaptersCount > 1 ? (
          <>
            <span className="h-4 w-px shrink-0 bg-outline-variant/25" aria-hidden />
            <button
              type="button"
              onClick={goNext}
              disabled={nextChapterDisabled}
              data-tooltip={t('reader.nextChapter')}
              aria-label={t('reader.nextChapter')}
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-on-surface-variant transition-all hover:scale-105 hover:bg-primary/15 hover:text-primary active:scale-95 disabled:pointer-events-none disabled:opacity-25"
            >
              <span className="material-symbols-outlined text-[20px] leading-none">
                arrow_forward_ios
              </span>
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default ReaderPageBottomNav;

