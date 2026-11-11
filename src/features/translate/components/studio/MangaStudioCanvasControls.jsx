import React from 'react';
import { useI18n } from '../../../../context/I18nContext';

/**
 * MangaStudioCanvasControls — Cụm công cụ nổi & điều khiển Viewport trên Canvas
 * Gồm 3 khối giao diện:
 * 1. Residual Banner (Đỉnh): Cảnh báo chữ sót tiếng Nhật + Nút Retry 1-Click
 * 2. Floating Tool Palette (Trái): Bộ công cụ chọn nhanh (Select, Text, Hand pan)
 * 3. Bottom Zoom Bar (Đáy): Thanh trượt Zoom, thông số W×H, nút 100% và nút Fit màn hình
 */

export function MangaStudioResidualBanner({
  isTranslating = false,
  residualLayers = [],
  handleRetryResidualBubbles,
  isRetryingResidual = false,
}) {
  const { t } = useI18n();

  if (isTranslating || residualLayers.length === 0) {
    return null;
  }

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 animate-slideDown select-none max-w-xl w-full px-4">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl bg-amber-950/90 text-amber-200 border border-amber-500/40 shadow-2xl backdrop-blur-md">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="material-symbols-outlined text-[20px] text-amber-400 shrink-0">
            warning
          </span>
          <div className="min-w-0 text-xs">
            <p className="font-bold text-amber-300 truncate">
              {t('translate.studio.residualBannerTitle', { count: residualLayers.length })}
            </p>
            <p className="text-[11px] text-amber-200/80 truncate">
              {t('translate.studio.residualBannerDesc')}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleRetryResidualBubbles}
          disabled={isRetryingResidual}
          className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs shadow-md transition-all cursor-pointer flex items-center gap-1 shrink-0 disabled:opacity-50"
          data-tooltip={t('translate.studio.retryResidualsTitle')}
        >
          <span className="material-symbols-outlined text-[14px]">
            {isRetryingResidual ? 'sync' : 'bolt'}
          </span>
          <span>
            {isRetryingResidual
              ? t('translate.studio.retryingLabel')
              : t('translate.studio.retryResidualsBtn', { count: residualLayers.length })}
          </span>
        </button>
      </div>
    </div>
  );
}

export function MangaStudioToolPalette({
  activeTool = 'select',
  setActiveTool,
  handleAddTextLayer,
}) {
  const { t } = useI18n();

  const tools = [
    { id: 'select', icon: 'near_me', label: t('translate.studio.toolSelect') },
    { id: 'text', icon: 'title', label: t('translate.studio.toolText'), action: handleAddTextLayer },
    { id: 'hand', icon: 'pan_tool', label: t('translate.studio.toolHand') },
  ];

  return (
    <div className="absolute left-4 top-4 z-30 flex flex-col gap-1 p-1 bg-surface-container-lowest/95 border border-outline-variant/30 rounded-2xl shadow-xl backdrop-blur-md">
      {tools.map((tool) => {
        const isActive = activeTool === tool.id;
        return (
          <button
            key={tool.id}
            type="button"
            onClick={() => {
              if (tool.action) tool.action();
              else setActiveTool?.(tool.id);
            }}
            data-tooltip={tool.label}
            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all cursor-pointer ${isActive
              ? 'bg-primary/15 text-primary font-bold shadow-2xs border border-primary/30'
              : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
              }`}
          >
            <span className="material-symbols-outlined text-[17px]">{tool.icon}</span>
          </button>
        );
      })}
    </div>
  );
}

export function MangaStudioZoomBar({
  zoom = 100,
  handleZoomChange,
  containerW = 0,
  containerH = 0,
  handleResetZoom,
  handleFitToScreen,
}) {
  const { t } = useI18n();

  return (
    <div className="px-4 py-2 border-t border-outline-variant/20 bg-surface-container-lowest/90 backdrop-blur-md flex items-center justify-between text-xs text-on-surface-variant select-none">
      {/* Left: Zoom Slider */}
      <div className="flex items-center gap-2">
        <span
          className="material-symbols-outlined text-[15px] cursor-pointer hover:text-on-surface"
          onClick={() => handleZoomChange?.(zoom - 10)}
        >
          remove
        </span>
        <input
          type="range"
          min="25"
          max="300"
          step="5"
          value={zoom}
          onChange={(e) => handleZoomChange?.(Number(e.target.value))}
          className="w-24 sm:w-28 accent-rose-500 cursor-pointer h-1 bg-surface-container-high rounded-lg"
        />
        <span
          className="material-symbols-outlined text-[15px] cursor-pointer hover:text-on-surface"
          onClick={() => handleZoomChange?.(zoom + 10)}
        >
          add
        </span>
        <span className="font-mono font-semibold text-on-surface w-11 text-left">
          {zoom}%
        </span>
      </div>

      {/* Canvas Dimensions & Fit */}
      <div className="flex items-center gap-2 font-mono">
        <span className="text-on-surface-variant/70 mr-1">
          {containerW} × {containerH} px
        </span>
        <button
          type="button"
          onClick={handleResetZoom}
          className="px-2.5 py-1 rounded-lg border border-outline-variant/30 bg-surface-container hover:bg-surface-container-high hover:border-primary text-xs font-sans font-medium text-on-surface hover:text-primary transition-colors cursor-pointer shadow-2xs"
          data-tooltip={t('translate.studio.resetZoom100')}
        >
          100%
        </button>
        <button
          type="button"
          onClick={() => handleFitToScreen?.()}
          className="px-2.5 py-1 rounded-lg border border-outline-variant/30 bg-surface-container hover:bg-surface-container-high hover:border-primary text-xs font-sans font-medium text-on-surface hover:text-primary transition-colors cursor-pointer shadow-2xs"
          data-tooltip={t('translate.studio.fitScreen')}
        >
          Fit
        </button>
      </div>
    </div>
  );
}

