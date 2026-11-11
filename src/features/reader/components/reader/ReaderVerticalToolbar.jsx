import React from 'react';
import { useI18n } from '../../../../context/I18nContext';
import { READER_ZOOM_MAX, READER_ZOOM_MIN } from './readerStorageUtils';

export function ReaderVerticalToolbar({
  onRequestClose,
  goPrev,
  prevChapterDisabled,
  goNext,
  nextChapterDisabled,
  navInvert,
  toggleNavInvert,
  webtoonSeamless,
  toggleWebtoonSeamless,
  translateOverlayOpen,
  onOpenTranslateOverlay,
  readerZoom,
  zoomIn,
  zoomOut,
  zoomReset,
}) {
  const { t } = useI18n();

  return (
    <div className="pointer-events-none absolute inset-y-0 right-0 z-40 flex w-11 items-center justify-end pr-1 sm:w-12 sm:pr-2">
      <div
        role="toolbar"
        aria-label={t('reader.toolbarAria')}
        className="pointer-events-auto flex max-h-[min(100%,calc(100vh-8rem))] flex-col gap-0.5 overflow-y-auto rounded-xl border border-outline-variant/30 bg-surface-container-high/95 px-1 py-1.5 shadow-lg [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <button
          type="button"
          onClick={onRequestClose}
          data-tooltip={t('reader.close')}
          aria-label={t('reader.close')}
          className="shrink-0 cursor-pointer rounded-lg p-2 text-on-surface/70 transition-colors hover:bg-surface-container-high hover:text-on-surface"
        >
          <span className="material-symbols-outlined text-[22px] leading-none">close</span>
        </button>

        <span className="my-0.5 h-px w-full shrink-0 bg-outline-variant/35" aria-hidden />

        <button
          type="button"
          onClick={goPrev}
          disabled={prevChapterDisabled}
          data-tooltip={t('reader.prevChapter')}
          aria-label={t('reader.prevChapter')}
          className="shrink-0 cursor-pointer rounded-lg p-2 text-on-surface/70 transition-colors hover:bg-surface-container-high disabled:pointer-events-none disabled:opacity-30"
        >
          <span className="material-symbols-outlined text-[22px] leading-none">chevron_left</span>
        </button>

        <button
          type="button"
          onClick={goNext}
          disabled={nextChapterDisabled}
          data-tooltip={t('reader.nextChapter')}
          aria-label={t('reader.nextChapter')}
          className="shrink-0 cursor-pointer rounded-lg p-2 text-on-surface/70 transition-colors hover:bg-surface-container-high disabled:pointer-events-none disabled:opacity-30"
        >
          <span className="material-symbols-outlined text-[22px] leading-none">chevron_right</span>
        </button>

        <button
          type="button"
          onClick={toggleNavInvert}
          data-tooltip={t('reader.navInvertHint')}
          aria-label={t('reader.navInvert')}
          aria-pressed={navInvert}
          className={`shrink-0 cursor-pointer rounded-lg p-2 transition-colors hover:bg-surface-container-high ${
            navInvert
              ? 'bg-primary/15 text-primary'
              : 'text-on-surface/70 hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[22px] leading-none">swap_horiz</span>
        </button>

        <button
          type="button"
          onClick={toggleWebtoonSeamless}
          data-tooltip={t('reader.webtoonSeamlessHint')}
          aria-label={t('reader.webtoonSeamless')}
          aria-pressed={webtoonSeamless}
          className={`shrink-0 cursor-pointer rounded-lg p-2 transition-colors hover:bg-surface-container-high ${
            webtoonSeamless
              ? 'bg-primary/15 text-primary'
              : 'text-on-surface/70 hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[22px] leading-none">view_week</span>
        </button>

        <button
          type="button"
          onClick={onOpenTranslateOverlay}
          data-tooltip="Dịch trang"
          aria-label="Dịch trang"
          className={`shrink-0 cursor-pointer rounded-lg p-2 transition-colors hover:bg-surface-container-high ${
            translateOverlayOpen
              ? 'bg-primary/15 text-primary'
              : 'text-on-surface/70 hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[22px] leading-none">translate</span>
        </button>

        <span className="my-0.5 h-px w-full shrink-0 bg-outline-variant/35" aria-hidden />

        <button
          type="button"
          onClick={zoomIn}
          disabled={readerZoom >= READER_ZOOM_MAX}
          data-tooltip={t('reader.zoomIn')}
          aria-label={t('reader.zoomIn')}
          className="shrink-0 cursor-pointer rounded-lg p-1.5 text-on-surface/70 transition-colors hover:bg-surface-container-high disabled:pointer-events-none disabled:opacity-30"
        >
          <span className="material-symbols-outlined text-[20px] leading-none">zoom_in</span>
        </button>

        <span
          className="min-h-[1.25rem] shrink-0 px-0.5 text-center text-[10px] font-semibold tabular-nums leading-none text-on-surface-variant"
          aria-live="polite"
        >
          {Math.round(readerZoom * 100)}%
        </span>

        <button
          type="button"
          onClick={zoomOut}
          disabled={readerZoom <= READER_ZOOM_MIN}
          data-tooltip={t('reader.zoomOut')}
          aria-label={t('reader.zoomOut')}
          className="shrink-0 cursor-pointer rounded-lg p-1.5 text-on-surface/70 transition-colors hover:bg-surface-container-high disabled:pointer-events-none disabled:opacity-30"
        >
          <span className="material-symbols-outlined text-[20px] leading-none">zoom_out</span>
        </button>

        {Math.abs(readerZoom - 1) > 0.001 ? (
          <button
            type="button"
            onClick={zoomReset}
            data-tooltip={t('reader.zoomReset')}
            aria-label={t('reader.zoomReset')}
            className="shrink-0 cursor-pointer rounded-lg p-1.5 text-on-surface/70 transition-colors hover:bg-surface-container-high"
          >
            <span className="material-symbols-outlined text-[20px] leading-none">restart_alt</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default ReaderVerticalToolbar;

