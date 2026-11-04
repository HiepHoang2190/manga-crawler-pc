import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../../context/I18nContext';

/**
 * InteractiveUpscalePreviewModal
 * Full-screen modal for side-by-side or hold-space comparison between original and upscaled images.
 */
export default function InteractiveUpscalePreviewModal({
  isOpen,
  onClose,
  items = [],
  currentIndex = 0,
  onNavigate,
  api,
}) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [originalUrl, setOriginalUrl] = useState(null);
  const [upscaledUrl, setUpscaledUrl] = useState(null);
  const [showOriginal, setShowOriginal] = useState(false);

  const curItem = items[currentIndex] || null;

  // Load preview data URLs for both input and output
  useEffect(() => {
    if (!isOpen || !curItem) return;
    let active = true;
    setLoading(true);
    setShowOriginal(false);
    setOriginalUrl(null);
    setUpscaledUrl(null);

    const read = api?.readImagePreview;
    if (!read) {
      setLoading(false);
      return;
    }

    Promise.all([
      curItem.input ? read(curItem.input).catch(() => null) : null,
      curItem.output ? read(curItem.output).catch(() => null) : null,
    ])
      .then(([inRes, outRes]) => {
        if (!active) return;
        if (inRes?.ok && inRes?.dataUrl) setOriginalUrl(inRes.dataUrl);
        if (outRes?.ok && outRes?.dataUrl) setUpscaledUrl(outRes.dataUrl);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, curItem, api]);

  // Keyboard navigation & hold Space for original
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

      if (e.key === 'Escape') {
        onClose();
      } else if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        setShowOriginal(true);
      } else if (e.key === 'ArrowLeft') {
        if (currentIndex > 0 && onNavigate) {
          onNavigate(currentIndex - 1);
        }
      } else if (e.key === 'ArrowRight') {
        if (currentIndex < items.length - 1 && onNavigate) {
          onNavigate(currentIndex + 1);
        }
      }
    };

    const handleKeyUp = (e) => {
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        setShowOriginal(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isOpen, currentIndex, items.length, onNavigate, onClose]);

  if (!isOpen || !curItem || typeof document === 'undefined') return null;

  const currentDisplayUrl = showOriginal ? originalUrl : (upscaledUrl || originalUrl);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('upscale.previewTitle')}
      className="fixed inset-0 z-[9990] flex flex-col justify-between bg-black/92 backdrop-blur-md text-white select-none overflow-hidden"
      onClick={onClose}
    >
      {/* ─── Top Bar (3-column grid for clean centering) ─── */}
      <div
        className="relative shrink-0 grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-6 py-3 bg-zinc-900/95 border-b border-white/10 backdrop-blur-md shadow-lg z-20"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left: filename & path info */}
        <div className="justify-self-start min-w-0 max-w-full">
          <p className="truncate font-mono text-sm font-semibold text-white/95" data-tooltip={curItem.relativePath || curItem.fileName}>
            {curItem.relativePath || curItem.fileName}
          </p>
          <p className="truncate text-xs text-white/50 font-mono mt-0.5" data-tooltip={curItem.output || curItem.input}>
            {curItem.output || curItem.input}
          </p>
        </div>

        {/* Center: Interactive Toggle Pill */}
        <div className="justify-self-center flex items-center justify-center">
          <button
            type="button"
            onClick={() => setShowOriginal((prev) => !prev)}
            className={[
              'rounded-full px-4 py-1.5 text-xs font-bold font-mono border shadow-lg flex items-center gap-2.5 cursor-pointer transition-all hover:scale-105 active:scale-95 select-none',
              showOriginal
                ? 'bg-amber-950/90 border-amber-500/50 text-amber-300 shadow-amber-950/40 ring-1 ring-amber-500/20'
                : 'bg-emerald-950/90 border-emerald-500/50 text-emerald-400 shadow-emerald-950/40 ring-1 ring-emerald-500/20',
            ].join(' ')}
            data-tooltip={t('upscale.previewHoldSpace')}
            aria-label={showOriginal ? t('upscale.previewOriginal') : t('upscale.previewUpscaled')}
          >
            <span
              className={[
                'w-2 h-2 rounded-full shrink-0',
                showOriginal ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400',
              ].join(' ')}
            />
            <span>{showOriginal ? t('upscale.previewOriginal') : t('upscale.previewUpscaled')}</span>
            <span className="text-white/30">•</span>
            <kbd className="hidden sm:inline-block rounded bg-black/40 px-1.5 py-0.5 font-mono text-[9px] text-white/70 border border-white/10">
              Space
            </kbd>
          </button>
        </div>

        {/* Right: Close button */}
        <div className="justify-self-end flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 rounded-xl bg-red-600/90 hover:bg-red-600 text-white px-3 py-1.5 text-xs font-semibold shadow-md transition-all cursor-pointer active:scale-95"
            data-tooltip={`${t('upscale.close')} (Esc)`}
            aria-label={`${t('upscale.close')} (Esc)`}
          >
            <span className="material-symbols-outlined text-[16px] leading-none">close</span>
            <span>{t('upscale.close')}</span>
          </button>
        </div>
      </div>

      {/* ─── Center: Image Canvas ─── */}
      <div
        className="relative flex flex-1 items-center justify-center min-h-0 w-full p-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <div className="flex flex-col items-center gap-2 text-white/60">
            <span className="material-symbols-outlined text-[36px] animate-spin">progress_activity</span>
            <span className="text-xs">{t('upscale.fileProgress')}...</span>
          </div>
        ) : currentDisplayUrl ? (
          <div
            className={[
              'relative inline-flex max-h-[76vh] max-w-[90vw] items-center justify-center rounded-xl shadow-2xl bg-black/40 select-none transition-all',
              showOriginal ? 'ring-1 ring-amber-500/40' : 'ring-1 ring-emerald-500/40',
            ].join(' ')}
          >
            <img
              src={currentDisplayUrl}
              alt={curItem.fileName}
              draggable={false}
              className="max-h-[76vh] w-auto max-w-full object-contain select-none pointer-events-none rounded-lg"
            />
            {/* Corner Badge */}
            <div className="absolute top-3 left-3 z-10">
              <span
                className={`rounded-md px-2 py-1 text-[11px] font-mono font-bold shadow-md border ${
                  showOriginal
                    ? 'bg-amber-950/80 border-amber-500/50 text-amber-300'
                    : 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                }`}
              >
                {showOriginal ? t('upscale.previewOriginal') : t('upscale.previewUpscaled')}
              </span>
            </div>
          </div>
        ) : (
          <div className="text-sm text-white/50">{t('upscale.failed')}</div>
        )}
      </div>

      {/* ─── Bottom Navigation Bar ─── */}
      <div
        className="relative shrink-0 flex items-center justify-between px-6 py-3 bg-zinc-900/90 border-t border-white/10 backdrop-blur-md shadow-lg z-20"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-xs text-white/50 flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px] text-primary">touch_app</span>
          <span>{t('upscale.previewHoldSpace')}</span>
        </div>

        {/* Previous / Next pagination buttons */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={currentIndex <= 0}
            onClick={() => onNavigate?.(currentIndex - 1)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-semibold transition-colors"
            data-tooltip={`${t('upscale.prevImage')} (←)`}
            aria-label={`${t('upscale.prevImage')} (←)`}
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            <span>{t('upscale.prevImage')}</span>
          </button>

          <span className="font-mono text-xs text-white/70 px-2">
            {currentIndex + 1} / {items.length}
          </span>

          <button
            type="button"
            disabled={currentIndex >= items.length - 1}
            onClick={() => onNavigate?.(currentIndex + 1)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-semibold transition-colors"
            data-tooltip={`${t('upscale.nextImage')} (→)`}
            aria-label={`${t('upscale.nextImage')} (→)`}
          >
            <span>{t('upscale.nextImage')}</span>
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </button>
        </div>

        <div className="w-24 text-right">
          <kbd className="rounded bg-black/40 px-2 py-1 font-mono text-[10px] text-white/60 border border-white/10">
            Esc
          </kbd>
        </div>
      </div>
    </div>,
    document.body
  );
}
