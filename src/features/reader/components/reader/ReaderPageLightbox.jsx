import React, { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../../../../context/I18nContext';
import { clampLbScale, LIGHTBOX_SCALE_STEP } from './readerStorageUtils';

export function ReaderPageLightbox({
  imageUrl,
  busy,
  fileIndex,
  pageCount,
  onClose,
  onPrev,
  onNext,
}) {
  const { t } = useI18n();
  const [scale, setScale] = useState(1);
  const [zoomCursor, setZoomCursor] = useState('zoom-in');

  useEffect(() => {
    setScale(1);
    setZoomCursor('zoom-in');
  }, [fileIndex]);

  useEffect(() => {
    const h = (e) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowLeft' && !busy) {
        onPrev();
        return;
      }
      if (e.key === 'ArrowRight' && !busy) {
        onNext();
        return;
      }
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [onClose, onPrev, onNext, busy]);

  const handleImgClick = useCallback((e) => {
    e.stopPropagation();
    setScale((s) => clampLbScale(s + LIGHTBOX_SCALE_STEP));
    setZoomCursor('zoom-in');
  }, []);

  const handleImgContext = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setScale((s) => clampLbScale(s - LIGHTBOX_SCALE_STEP));
    setZoomCursor('zoom-out');
  }, []);

  const hasPrev = fileIndex > 0 && !busy;
  const hasNext = fileIndex < pageCount - 1 && !busy;

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[9999] flex items-center justify-center bg-black/80"
      onClick={onClose}
      role="presentation"
    >
      {/* Page indicator */}
      <span className="fixed top-3 left-1/2 z-[10002] -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-[11px] font-medium tabular-nums text-white/80 backdrop-blur-md select-none">
        {t('reader.pageOf', { current: fileIndex + 1, total: pageCount })}
        {Math.abs(scale - 1) > 0.01 ? ` · ${Math.round(scale * 100)}%` : ''}
      </span>

      {/* Prev button */}
      {hasPrev ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPrev();
          }}
          aria-label={t('reader.previewPrev')}
          className="fixed left-2 top-1/2 z-[10001] -translate-y-1/2 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white/70 backdrop-blur-md transition-colors duration-150 hover:bg-white/25 hover:text-white sm:left-3 sm:h-11 sm:w-11"
        >
          <span className="material-symbols-outlined text-[26px] leading-none">chevron_left</span>
        </button>
      ) : null}

      {/* Next button */}
      {hasNext ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNext();
          }}
          aria-label={t('reader.previewNext')}
          className="fixed right-2 top-1/2 z-[10001] -translate-y-1/2 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white/70 backdrop-blur-md transition-colors duration-150 hover:bg-white/25 hover:text-white sm:right-3 sm:h-11 sm:w-11"
        >
          <span className="material-symbols-outlined text-[26px] leading-none">chevron_right</span>
        </button>
      ) : null}

      {/* Image container */}
      <div
        className={`relative max-h-[96vh] max-w-[96vw] ${scale > 1.001 ? 'overflow-auto' : 'overflow-hidden'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative inline-block select-none" style={{ zoom: scale }}>
          <img
            src={imageUrl}
            alt=""
            className="max-h-[95.5vh] max-w-[95.5vw] object-contain"
            style={{ cursor: zoomCursor }}
            draggable={false}
            onClick={handleImgClick}
            onContextMenu={handleImgContext}
          />
          {busy ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
              <span className="material-symbols-outlined animate-spin text-4xl text-white">
                progress_activity
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default ReaderPageLightbox;

