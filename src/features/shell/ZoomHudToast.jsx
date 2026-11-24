import { useI18n } from '../../context/I18nContext';
import { formatShortcutHint } from './commandPaletteUtils.mjs';
import { clampZoomFactor, formatZoomPercent, isDefaultZoom } from './zoomUtils.mjs';

export default function ZoomHudToast({
  visible = false,
  zoomFactor = 1.0,
  onResetZoom,
  onMouseEnter,
  onMouseLeave,
}) {
  const { t } = useI18n();
  if (!visible) return null;

  const clamped = clampZoomFactor(zoomFactor);
  const isDefault = isDefaultZoom(clamped);
  const percentText = formatZoomPercent(clamped);
  const resetTooltip = t('statusBar.zoomResetTooltip', { shortcut: formatShortcutHint('0') });

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="zoom-hud-toast"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="fixed bottom-11 left-1/2 -translate-x-1/2 z-[9990] flex items-center gap-2 rounded-full border border-outline-variant/30 bg-surface-container-high/95 px-3 py-1.5 shadow-2xl backdrop-blur-md select-none"
    >
      <span className="material-symbols-outlined text-[16px] leading-none text-primary">
        {clamped > 1.005 ? 'zoom_in' : clamped < 0.995 ? 'zoom_out' : 'search'}
      </span>
      <span className="font-mono text-xs font-bold text-on-surface tabular-nums">
        {percentText}
      </span>
      {!isDefault && typeof onResetZoom === 'function' ? (
        <button
          type="button"
          onClick={onResetZoom}
          data-tooltip={resetTooltip}
          aria-label={resetTooltip}
          className="ml-0.5 inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary/25 transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-[13px] leading-none">restart_alt</span>
          <span>100%</span>
        </button>
      ) : null}
    </div>
  );
}
