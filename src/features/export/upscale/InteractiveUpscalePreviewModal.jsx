import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../../context/I18nContext';

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return null;
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * InteractiveUpscalePreviewModal
 * Theme Studio Lightbox (Mẫu 1) - Seamless theme token integration (Light/Dark/12 Themes),
 * Space-key peek comparison, segmented toggle pill, zoom toggle, and comparison specifications footer.
 */
export default function InteractiveUpscalePreviewModal({
  isOpen,
  onClose,
  items = [],
  currentIndex = 0,
  onNavigate,
  scale = 2,
  modelLabel = '',
  engineInfo = null,
  api,
}) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [originalUrl, setOriginalUrl] = useState(null);
  const [upscaledUrl, setUpscaledUrl] = useState(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [isHoldingSpace, setIsHoldingSpace] = useState(false);
  const [isZoom100, setIsZoom100] = useState(false);
  const [dims, setDims] = useState({ origW: null, origH: null, upW: null, upH: null });

  const curItem = items[currentIndex] || null;

  // Load preview data URLs for both input and output
  useEffect(() => {
    if (!isOpen || !curItem) return;
    let active = true;
    setLoading(true);
    setShowOriginal(false);
    setIsHoldingSpace(false);
    setIsZoom100(false);
    setOriginalUrl(null);
    setUpscaledUrl(null);
    setDims({ origW: null, origH: null, upW: null, upH: null });

    const read = api?.readImagePreview || api?.duplicateReadPreview;
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

  // Pre-measure original image dimensions
  useEffect(() => {
    if (!originalUrl || typeof window === 'undefined') return;
    let active = true;
    const img = new window.Image();
    img.onload = () => {
      if (active) {
        setDims((prev) => ({
          ...prev,
          origW: img.naturalWidth,
          origH: img.naturalHeight,
        }));
      }
    };
    img.src = originalUrl;
    return () => {
      active = false;
    };
  }, [originalUrl]);

  // Pre-measure upscaled image dimensions
  useEffect(() => {
    if (!upscaledUrl || typeof window === 'undefined') return;
    let active = true;
    const img = new window.Image();
    img.onload = () => {
      if (active) {
        setDims((prev) => ({
          ...prev,
          upW: img.naturalWidth,
          upH: img.naturalHeight,
        }));
      }
    };
    img.src = upscaledUrl;
    return () => {
      active = false;
    };
  }, [upscaledUrl]);

  // Keyboard navigation & hold Space for original
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

      if (e.key === 'Escape') {
        onClose?.();
      } else if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        if (upscaledUrl) {
          setIsHoldingSpace(true);
        }
      } else if (e.key === 'ArrowLeft') {
        if (currentIndex > 0 && onNavigate) {
          onNavigate(currentIndex - 1);
        }
      } else if (e.key === 'ArrowRight') {
        if (currentIndex < items.length - 1 && onNavigate) {
          onNavigate(currentIndex + 1);
        }
      } else if (e.key === 'z' || e.key === 'Z') {
        setIsZoom100((prev) => !prev);
      }
    };

    const handleKeyUp = (e) => {
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        setIsHoldingSpace(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isOpen, currentIndex, items.length, upscaledUrl, onNavigate, onClose]);

  if (!isOpen || !curItem || typeof document === 'undefined') return null;

  // Active view calculation:
  // If user holds Space, temporarily show original; otherwise show state determined by segmented button
  const isDisplayingOriginal = !upscaledUrl || isHoldingSpace || showOriginal;
  const currentDisplayUrl = isDisplayingOriginal ? originalUrl : (upscaledUrl || originalUrl);

  // Resolution calculations
  const origW = dims.origW;
  const origH = dims.origH;
  const upW = dims.upW || (origW ? origW * scale : null);
  const upH = dims.upH || (origH ? origH * scale : null);

  const origResText = origW && origH ? `${origW}×${origH}` : null;
  const upResText = upW && upH ? `${upW}×${upH}` : null;
  const scalePercent = scale * 100;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('upscale.previewTitle')}
      className="fixed inset-0 z-[9990] flex flex-col justify-between bg-surface/95 backdrop-blur-md text-on-surface select-none overflow-hidden animate-in fade-in-0 duration-150"
      onClick={onClose}
    >
      {/* ─── Top Toolbar (Theme Studio Lightbox) ─── */}
      <div
        className="relative shrink-0 grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 sm:px-6 h-12 bg-surface-container-low/75 border-b border-outline-variant/20 backdrop-blur-md shadow-xs z-20"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left: Prev / Next Navigation & Filename */}
        <div className="justify-self-start flex items-center gap-2.5 min-w-0 max-w-full">
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              disabled={currentIndex <= 0}
              onClick={() => onNavigate?.(currentIndex - 1)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              data-tooltip={`${t('upscale.prevImage')} (←)`}
              aria-label={`${t('upscale.prevImage')} (←)`}
            >
              <span className="material-symbols-outlined text-[18px]">chevron_left</span>
            </button>
            <button
              type="button"
              disabled={currentIndex >= items.length - 1}
              onClick={() => onNavigate?.(currentIndex + 1)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              data-tooltip={`${t('upscale.nextImage')} (→)`}
              aria-label={`${t('upscale.nextImage')} (→)`}
            >
              <span className="material-symbols-outlined text-[18px]">chevron_right</span>
            </button>
          </div>

          <p
            className="truncate font-mono text-xs sm:text-sm font-bold text-on-surface max-w-[180px] sm:max-w-xs"
            data-tooltip={curItem.relativePath || curItem.fileName}
          >
            {curItem.relativePath || curItem.fileName}
          </p>

          <span className="font-mono text-[11px] text-on-surface-variant/70 px-2 py-0.5 rounded-md bg-surface-container-high/60 border border-outline-variant/20 shrink-0">
            {currentIndex + 1} / {items.length}
          </span>
        </div>

        {/* Center: Segmented Toggle Pill (The Star Comparison Feature) */}
        <div className="justify-self-center flex items-center justify-center">
          {upscaledUrl ? (
            <div
              className="flex items-center p-1 rounded-xl bg-surface-container-highest border border-outline-variant/30 text-xs font-semibold shadow-xs select-none"
              data-tooltip={t('upscale.previewHoldSpace')}
            >
              <button
                type="button"
                onClick={() => setShowOriginal(true)}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                  isDisplayingOriginal
                    ? 'bg-surface text-amber-600 dark:text-amber-400 font-bold shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isDisplayingOriginal ? 'bg-amber-500 animate-pulse' : 'bg-transparent'}`} />
                <span>{t('upscale.previewOriginal')}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowOriginal(false)}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                  !isDisplayingOriginal
                    ? 'bg-primary text-on-primary font-bold shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${!isDisplayingOriginal ? 'bg-emerald-300' : 'bg-transparent'}`} />
                <span>{scale}x Upscale</span>
                <kbd className="hidden sm:inline-block px-1 py-0.2 rounded bg-black/20 text-[9px] font-mono ml-0.5">
                  Space
                </kbd>
              </button>
            </div>
          ) : (
            <div className="rounded-xl px-3.5 py-1 text-xs font-mono font-semibold border border-outline-variant/25 bg-surface-container-high/60 text-on-surface-variant flex items-center gap-2 select-none shadow-xs">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              <span>{t('upscale.previewOriginal')} (Chưa upscale)</span>
            </div>
          )}
        </div>

        {/* Right: Zoom Toggle & Close Button */}
        <div className="justify-self-end flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsZoom100((prev) => !prev)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer active:scale-95 ${
              isZoom100
                ? 'bg-primary/15 border-primary/40 text-primary'
                : 'border-outline-variant/30 bg-surface-container-high/60 hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface'
            }`}
            data-tooltip="Chuyển chế độ xem vừa khung / 100% (Phím Z)"
            aria-label="Toggle zoom 100%"
          >
            <span className="material-symbols-outlined text-[16px] leading-none">
              {isZoom100 ? 'fit_screen' : 'zoom_in'}
            </span>
            <span className="font-mono">{isZoom100 ? 'Fit' : '100%'}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 px-3 py-1.5 text-xs font-bold transition-all cursor-pointer active:scale-95"
            data-tooltip={`${t('upscale.close')} (Esc)`}
            aria-label={`${t('upscale.close')} (Esc)`}
          >
            <span className="material-symbols-outlined text-[16px] leading-none">close</span>
            <span>{t('upscale.close')}</span>
          </button>
        </div>
      </div>

      {/* ─── Center: Image Canvas Viewport ─── */}
      <div
        className={`relative flex flex-1 items-center justify-center min-h-0 w-full p-4 select-none ${
          isZoom100 ? 'overflow-auto custom-scrollbar' : 'overflow-hidden'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <div className="flex flex-col items-center gap-2 text-on-surface-variant">
            <span className="material-symbols-outlined text-[36px] animate-spin text-primary">progress_activity</span>
            <span className="text-xs font-medium">{t('upscale.fileProgress')}...</span>
          </div>
        ) : currentDisplayUrl ? (
          <div
            className={`relative inline-flex items-center justify-center rounded-2xl shadow-2xl border border-outline-variant/20 bg-surface-container-low transition-all ${
              isZoom100 ? 'max-h-none max-w-none' : 'max-h-[74vh] max-w-[92vw]'
            } ${
              isDisplayingOriginal
                ? 'ring-2 ring-amber-500/40'
                : 'ring-2 ring-primary/40'
            }`}
          >
            <img
              src={currentDisplayUrl}
              alt={curItem.fileName}
              draggable={false}
              className={`select-none pointer-events-none rounded-2xl ${
                isZoom100
                  ? 'max-w-none w-auto h-auto'
                  : 'max-h-[74vh] w-auto max-w-full object-contain'
              }`}
            />

            {/* Corner Badge */}
            <div className="absolute top-3 left-3 z-10">
              <span
                className={`rounded-lg px-2.5 py-1 text-xs font-mono font-bold shadow-md border backdrop-blur-md flex items-center gap-1.5 ${
                  isDisplayingOriginal
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-300'
                    : 'bg-primary/15 border-primary/40 text-primary'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isDisplayingOriginal ? 'bg-amber-500' : 'bg-primary'
                  }`}
                />
                <span>
                  {isDisplayingOriginal
                    ? `${t('upscale.previewOriginal')}${origResText ? ` (${origResText})` : ''}`
                    : `${scale}x Upscale${upResText ? ` (${upResText})` : ''}`}
                </span>
              </span>
            </div>

            {/* Floating Space Key Help Pill (Only when upscaled) */}
            {upscaledUrl && !isZoom100 && (
              <div className="absolute bottom-3 inset-x-auto px-3 py-1 rounded-full bg-surface-container-highest/85 border border-outline-variant/25 text-on-surface-variant font-mono text-[11px] shadow-lg backdrop-blur-md flex items-center gap-1.5 pointer-events-none opacity-85">
                <span className="material-symbols-outlined text-[14px] text-primary">keyboard</span>
                <span>Giữ</span>
                <kbd className="px-1.5 py-0.2 rounded bg-surface border border-outline-variant/30 text-on-surface font-bold text-[10px]">
                  Space
                </kbd>
                <span>để soi nhanh ảnh gốc</span>
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-on-surface-variant flex flex-col items-center gap-2">
            <span className="material-symbols-outlined text-[36px] text-error">broken_image</span>
            <span>{t('upscale.failed')}</span>
          </div>
        )}
      </div>

      {/* ─── Bottom Comparison Specs Footer ─── */}
      <div
        className="relative shrink-0 flex items-center justify-between px-4 sm:px-6 h-11 bg-surface-container-low/75 border-t border-outline-variant/20 backdrop-blur-md shadow-xs z-20 text-xs font-mono text-on-surface-variant"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left: Resolution & File Size Specs */}
        <div className="flex items-center gap-3 sm:gap-4 truncate min-w-0">
          {origResText && upResText ? (
            <div className="flex items-center gap-1.5 truncate">
              <span className="text-on-surface-variant/70 hidden sm:inline">Độ phân giải:</span>
              <span className="text-on-surface-variant">{origResText}</span>
              <span className="text-primary font-bold">➔</span>
              <span className="text-on-surface font-bold">{upResText}</span>
              <span className="text-primary font-bold hidden xs:inline">
                (+{scalePercent}%)
              </span>
            </div>
          ) : (
            <span className="text-on-surface-variant truncate font-sans">
              {curItem.relativePath || curItem.fileName}
            </span>
          )}

          {curItem.outputSize && (
            <span className="hidden md:inline text-on-surface-variant/60">
              • Dung lượng: <strong className="text-on-surface">{formatBytes(curItem.outputSize)}</strong>
            </span>
          )}
        </div>

        {/* Center: Model / Duration */}
        <div className="flex items-center gap-3 shrink-0">
          {(modelLabel || engineInfo?.label) && (
            <span className="hidden lg:flex items-center gap-1.5 text-on-surface-variant px-2.5 py-0.5 rounded-md bg-surface-container-high/50 border border-outline-variant/15 text-[11px]">
              <span className="material-symbols-outlined text-[13px] text-primary">auto_awesome</span>
              <span>{modelLabel || engineInfo?.label}</span>
            </span>
          )}

          {curItem.duration ? (
            <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 text-[11px]">
              <span className="material-symbols-outlined text-[14px]">bolt</span>
              <span>{curItem.duration.toFixed(2)}s</span>
            </span>
          ) : null}
        </div>

        {/* Right: Keyboard Shortcuts Reminder */}
        <div className="flex items-center gap-1.5 text-on-surface-variant/70 shrink-0 text-[11px]">
          <span className="hidden sm:inline">Phím tắt:</span>
          <kbd className="px-1.5 py-0.5 rounded bg-surface-container-high border border-outline-variant/20 text-on-surface">←</kbd>
          <kbd className="px-1.5 py-0.5 rounded bg-surface-container-high border border-outline-variant/20 text-on-surface">→</kbd>
          <kbd className="px-1.5 py-0.5 rounded bg-surface-container-high border border-outline-variant/20 text-on-surface">Space</kbd>
          <kbd className="px-1.5 py-0.5 rounded bg-surface-container-high border border-outline-variant/20 text-on-surface">Esc</kbd>
        </div>
      </div>
    </div>,
    document.body
  );
}
