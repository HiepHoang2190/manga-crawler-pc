import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../context/I18nContext';
import { SectionTitle } from '../../shared';
import { formatShortcutHint } from './commandPaletteUtils.mjs';
import {
  MIN_ZOOM_FACTOR,
  MAX_ZOOM_FACTOR,
  ZOOM_QUICK_PRESETS,
  clampZoomFactor,
  formatZoomPercent,
  isDefaultZoom,
} from './zoomUtils.mjs';

export default function ZoomControlBadge({
  zoomFactor = 1.0,
  onZoomIn,
  onZoomOut,
  onSetZoomFactor,
  onResetZoom,
  className = '',
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState({});
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const resetBtnRef = useRef(null);

  const clamped = clampZoomFactor(zoomFactor);
  const isDefault = isDefaultZoom(clamped);
  const percentText = formatZoomPercent(clamped);

  const zoomInShortcut = formatShortcutHint('+');
  const zoomOutShortcut = formatShortcutHint('-');
  const zoomResetShortcut = formatShortcutHint('0');

  const updatePopoverPosition = useCallback(() => {
    if (!triggerRef.current || typeof window === 'undefined') return;
    const rect = triggerRef.current.getBoundingClientRect();
    const width = 236;
    const rightOffset = Math.max(8, window.innerWidth - rect.right);
    const maxRight = Math.max(8, window.innerWidth - width - 8);
    setPopoverStyle({
      position: 'fixed',
      bottom: Math.max(40, window.innerHeight - rect.top + 8),
      right: Math.min(rightOffset, maxRight),
      width,
      zIndex: 220,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePopoverPosition();
  }, [open, clamped, updatePopoverPosition]);

  useEffect(() => {
    if (!open) return undefined;
    popoverRef.current?.focus();

    const handlePointerDown = (e) => {
      if (triggerRef.current?.contains(e.target)) return;
      if (popoverRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const handleWindowBlur = () => {
      setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', updatePopoverPosition);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', updatePopoverPosition);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [open, updatePopoverPosition]);

  const tooltipText = isDefault
    ? t('statusBar.zoomTooltipDefault', { percent: percentText })
    : t('statusBar.zoomTooltipActive', { percent: percentText });

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-testid="status-zoom-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={tooltipText}
        data-tooltip={open ? undefined : tooltipText}
        onClick={() => setOpen((v) => !v)}
        onDoubleClick={() => {
          setOpen(false);
          if (!isDefault) onResetZoom?.();
        }}
        className={`h-6 px-2.5 rounded-full border text-[11px] font-mono font-semibold normal-case inline-flex items-center gap-1 transition-colors cursor-pointer select-none shadow-2xs shrink-0 ${
          !isDefault
            ? 'border-primary/35 bg-primary/12 text-primary hover:bg-primary/20'
            : open
            ? 'border-primary/40 bg-surface-container-high text-on-surface'
            : 'border-outline-variant/20 bg-surface-container-high/70 hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface'
        } ${className}`.trim()}
      >
        <span className="material-symbols-outlined !text-[13px] leading-none opacity-85">
          {clamped > 1.005 ? 'zoom_in' : clamped < 0.995 ? 'zoom_out' : 'search'}
        </span>
        <span className="tabular-nums leading-none">{percentText}</span>
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            tabIndex={-1}
            role="dialog"
            aria-label={t('statusBar.zoomTitle')}
            data-testid="status-zoom-popover"
            style={popoverStyle}
            className="rounded-2xl border border-outline-variant/25 bg-surface-container-high/95 p-3 shadow-2xl backdrop-blur-md space-y-3 select-none outline-none"
          >
            <div className="flex items-center justify-between gap-2">
              <SectionTitle as="span">{t('statusBar.zoomTitle')}</SectionTitle>
              <span className="rounded-md bg-surface-container-highest px-1.5 py-0.5 font-mono text-[11px] font-bold text-primary tabular-nums">
                {percentText}
              </span>
            </div>

            {/* Stepper row (-  %  +) */}
            <div className="flex items-center justify-between gap-2 rounded-xl border border-outline-variant/20 bg-surface-container-lowest/70 p-1.5">
              <button
                type="button"
                onClick={() => onZoomOut?.()}
                disabled={clamped <= MIN_ZOOM_FACTOR + 0.005}
                data-tooltip={t('statusBar.zoomOut', { shortcut: zoomOutShortcut })}
                aria-label={t('statusBar.zoomOut', { shortcut: zoomOutShortcut })}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-outline-variant/20 bg-surface-container-highest text-on-surface-variant hover:border-primary/40 hover:text-primary transition-all active:scale-95 cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
              >
                <span className="material-symbols-outlined text-[18px] leading-none">remove</span>
              </button>

              <span className="font-mono text-sm font-bold text-on-surface tabular-nums">
                {percentText}
              </span>

              <button
                type="button"
                onClick={() => onZoomIn?.()}
                disabled={clamped >= MAX_ZOOM_FACTOR - 0.005}
                data-tooltip={t('statusBar.zoomIn', { shortcut: zoomInShortcut })}
                aria-label={t('statusBar.zoomIn', { shortcut: zoomInShortcut })}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-outline-variant/20 bg-surface-container-highest text-on-surface-variant hover:border-primary/40 hover:text-primary transition-all active:scale-95 cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
              >
                <span className="material-symbols-outlined text-[18px] leading-none">add</span>
              </button>
            </div>

            {/* Quick presets */}
            <div className="grid grid-cols-3 gap-1.5">
              {ZOOM_QUICK_PRESETS.map((preset) => {
                const isSelected = Math.abs(clamped - preset) < 0.005;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => onSetZoomFactor?.(preset)}
                    aria-pressed={isSelected}
                    className={`h-7 rounded-lg border text-xs font-mono font-semibold transition-colors cursor-pointer ${
                      isSelected
                        ? 'border-primary/40 bg-primary/15 text-primary'
                        : 'border-outline-variant/20 bg-surface-container-highest/50 text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface'
                    }`}
                  >
                    {formatZoomPercent(preset)}
                  </button>
                );
              })}
            </div>

            {/* 1-click Reset 100% */}
            <button
              ref={resetBtnRef}
              type="button"
              disabled={isDefault}
              onClick={() => {
                if (document.activeElement === resetBtnRef.current) {
                  popoverRef.current?.focus();
                }
                onResetZoom?.();
              }}
              aria-label={t('statusBar.zoomResetTooltip', { shortcut: zoomResetShortcut })}
              className="w-full h-8 px-3 rounded-xl border border-outline-variant/25 bg-surface-container-highest/70 hover:bg-surface-container-highest hover:border-primary/40 text-xs font-semibold text-on-surface flex items-center justify-between transition-all active:scale-[0.98] cursor-pointer disabled:opacity-45 disabled:pointer-events-none"
            >
              <span className="inline-flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] leading-none text-primary">
                  restart_alt
                </span>
                <span>{t('statusBar.zoomReset')}</span>
              </span>
              <kbd className="rounded bg-surface-container-low px-1.5 py-0.5 font-mono text-[10px] font-medium text-on-surface-variant border border-outline-variant/20">
                {zoomResetShortcut}
              </kbd>
            </button>
          </div>,
          document.body
        )}
    </>
  );
}
