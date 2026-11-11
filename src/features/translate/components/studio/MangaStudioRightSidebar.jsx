import React from 'react';
import { useI18n } from '../../../../context/I18nContext';
import { SearchableSelect } from '../../../../shared';
import TranslateSettingsPanel from '../../TranslateSettingsPanel';
import {
  QUICK_COLORS,
  FONT_STYLE_OPTIONS,
  TEXT_DIRECTION_OPTIONS,
  resolveFontOptionValue,
} from './mangaStudioConstants';

/**
 * MangaStudioRightSidebar — Cột Inspector thuộc tính & Quản lý Layers bên phải
 * Gồm 2 Tabs:
 * 1. Tab 'properties' (Type Inspector + Layers List):
 *    - Type Inspector (Koharu Style): Font, Color, Size, Weight, Style, Alignment, Direction, Border Stroke, Textarea
 *    - Layers List: Text Group (mở rộng/thu gọn, toggle all visibility), cảnh báo Residual 1-Click retry, danh sách Layers chi tiết, System Layers (Cleanup, Artwork)
 * 2. Tab 'settings': Bảng điều khiển cấu hình Translation Pipeline (TranslateSettingsPanel)
 */
export function MangaStudioRightSidebar({
  activeRightTab = 'properties',
  selectedLayer,
  updateSelectedLayer,
  fontOptions = [],
  handleFontChange,
  showColorPicker,
  setShowColorPicker,
  fontSizeOptions = [],
  fontWeightOptions = [],
  showStrokeColorPicker,
  setShowStrokeColorPicker,
  layers = [],
  isTextGroupCollapsed,
  setIsTextGroupCollapsed,
  toggleAllTextLayersVisibility,
  residualLayers = [],
  handleRetryResidualBubbles,
  isTranslating = false,
  isRetryingResidual = false,
  selectedLayerId,
  setSelectedLayerId,
  expandedLayerId,
  toggleLayerCollapse,
  isLayerResidual = () => false,
  retryingSingleLayerId,
  handleRetrySingleLayerInComparison,
  activePageIndex = 0,
  toggleLayerVisibility,
  deleteLayer,
  layerTextareaRef,
  showCleanupLayer,
  setShowCleanupLayer,
  settings,
  handleUpdateSetting,
  detectedEngines,
  localEngines,
}) {
  const { t } = useI18n();

  return (
    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
      {activeRightTab === 'properties' ? (
        <div className="divide-y divide-outline-variant/15">
          {/* ── Section A: Type Inspector (Koharu Style) ── */}
          <div className="p-3.5 space-y-2.5">
            {/* Header: T Type */}
            <div className="flex items-center gap-2 pb-2 border-b border-outline-variant/15">
              <span className="text-[#db6177] font-serif font-bold text-sm select-none">T</span>
              <span className="text-xs font-semibold text-on-surface select-none">Type</span>
            </div>

            {/* Row 1: FONT & COLOR */}
            <div>
              <div className="flex items-center justify-between text-[10px] font-bold tracking-wider text-on-surface-variant mb-1 select-none">
                <span>FONT</span>
                <span>COLOR</span>
              </div>
              <div className="flex items-center gap-2">
                {/* Font Select */}
                <SearchableSelect
                  value={resolveFontOptionValue(selectedLayer?.fontFamily)}
                  onChange={handleFontChange}
                  options={fontOptions}
                  placeholder={t('translate.studio.fontWildWords') || 'CC Wild Words'}
                  className="flex-1 min-w-0"
                  size="sm"
                />

                {/* Color Swatch Square */}
                <div className="relative">
                  <button
                    type="button"
                    disabled={!selectedLayer}
                    onClick={() => setShowColorPicker(!showColorPicker)}
                    className="w-8 h-8 rounded-lg border border-outline-variant/30 bg-surface-container-lowest flex items-center justify-center cursor-pointer hover:border-[#db6177] active:scale-95 transition-all disabled:opacity-50"
                    data-tooltip={t('translate.studio.chooseTextColor')}
                    aria-label={t('translate.studio.chooseTextColor')}
                  >
                    <span
                      className="w-4.5 h-4.5 rounded-full border border-black/15 shadow-inner"
                      style={{ backgroundColor: selectedLayer?.color || '#000000' }}
                    />
                  </button>
                  {showColorPicker && (
                    <div className="absolute right-0 top-full mt-2 p-2 bg-surface-container-lowest border border-outline-variant/30 rounded-2xl shadow-xl z-50 flex flex-col gap-2 min-w-[140px]">
                      <div className="flex items-center gap-1 justify-center">
                        {QUICK_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => {
                              updateSelectedLayer?.({ color: c });
                              setShowColorPicker?.(false);
                            }}
                            style={{ backgroundColor: c }}
                            className="w-4 h-4 rounded-full border border-outline-variant/30 hover:scale-110 transition-transform cursor-pointer"
                          />
                        ))}
                      </div>
                      <input
                        type="color"
                        value={selectedLayer?.color || '#000000'}
                        onChange={(e) => updateSelectedLayer?.({ color: e.target.value })}
                        className="w-full h-7 cursor-pointer rounded"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Row 2: SIZE, WEIGHT, STYLE (Equal 3 columns) */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] font-bold tracking-wider text-on-surface-variant block mb-1 select-none">SIZE</label>
                <SearchableSelect
                  value={String(selectedLayer?.fontSize || 'auto')}
                  disabled={!selectedLayer}
                  onChange={(val) => updateSelectedLayer?.({ fontSize: val })}
                  options={fontSizeOptions}
                  className="w-full min-w-0"
                  size="sm"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold tracking-wider text-on-surface-variant block mb-1 select-none">WEIGHT</label>
                <SearchableSelect
                  value={String(selectedLayer?.fontWeight || '400')}
                  disabled={!selectedLayer}
                  onChange={(val) => updateSelectedLayer?.({ fontWeight: val })}
                  options={fontWeightOptions}
                  className="w-full min-w-0"
                  size="sm"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold tracking-wider text-on-surface-variant block mb-1 select-none">STYLE</label>
                <SearchableSelect
                  value={selectedLayer?.fontStyle || 'normal'}
                  disabled={!selectedLayer}
                  onChange={(val) => updateSelectedLayer?.({ fontStyle: val })}
                  options={FONT_STYLE_OPTIONS}
                  className="w-full min-w-0"
                  size="sm"
                />
              </div>
            </div>

            {/* Row 3: ALIGNMENT & DIRECTION (Equal 2 columns 50/50) */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-bold tracking-wider text-on-surface-variant block mb-1 select-none">ALIGNMENT</label>
                <div className="h-8 flex items-center rounded-lg border border-outline-variant/30 bg-surface-container-lowest p-0.5">
                  {[
                    { id: 'left', icon: 'format_align_left' },
                    { id: 'center', icon: 'format_align_center' },
                    { id: 'right', icon: 'format_align_right' },
                  ].map((btn) => {
                    const isActive = (selectedLayer?.align || 'center') === btn.id;
                    return (
                      <button
                        key={btn.id}
                        type="button"
                        disabled={!selectedLayer}
                        onClick={() => updateSelectedLayer?.({ align: btn.id })}
                        className={`flex-1 h-full rounded-md flex items-center justify-center transition-all cursor-pointer disabled:opacity-50 ${isActive
                          ? 'bg-[#db6177] text-white shadow-xs font-bold'
                          : 'text-on-surface-variant hover:text-on-surface'
                          }`}
                      >
                        <span className="material-symbols-outlined text-[16px]">{btn.icon}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold tracking-wider text-on-surface-variant block mb-1 select-none">DIRECTION</label>
                <SearchableSelect
                  value={selectedLayer?.direction || 'auto'}
                  disabled={!selectedLayer}
                  onChange={(val) => updateSelectedLayer?.({ direction: val })}
                  options={TEXT_DIRECTION_OPTIONS}
                  className="w-full min-w-0"
                  size="sm"
                />
              </div>
            </div>

            {/* Row 4: BORDER & WIDTH (Equal 2 columns 50/50 matching Row 3) */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-bold tracking-wider text-on-surface-variant block mb-1 select-none">BORDER</label>
                <div className="h-8 flex items-center justify-between rounded-lg border border-outline-variant/30 bg-surface-container-lowest px-2 transition-colors">
                  <button
                    type="button"
                    disabled={!selectedLayer}
                    onClick={() => {
                      if (!selectedLayer) return;
                      const cur = selectedLayer.strokeWidth || 0;
                      updateSelectedLayer?.({ strokeWidth: cur > 0 ? 0 : 1.5 });
                    }}
                    className={`flex items-center gap-1.5 text-xs font-semibold cursor-pointer disabled:opacity-50 transition-colors ${(selectedLayer?.strokeWidth || 0) > 0 ? 'text-[#db6177]' : 'text-on-surface-variant hover:text-on-surface'}`}
                    data-tooltip={t('translate.studio.toggleStroke')}
                  >
                    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <line x1="8.5" y1="15.5" x2="15.5" y2="8.5" />
                    </svg>
                    <span className="text-[11px] select-none font-medium">
                      {(selectedLayer?.strokeWidth || 0) > 0 ? t('translate.studio.strokeOn', 'Bật') : t('translate.studio.strokeOff', 'Tắt')}
                    </span>
                  </button>

                  {/* Stroke Color Swatch */}
                  <div className="relative shrink-0 flex items-center">
                    <button
                      type="button"
                      disabled={!selectedLayer || (selectedLayer?.strokeWidth || 0) <= 0}
                      onClick={() => setShowStrokeColorPicker(!showStrokeColorPicker)}
                      className="w-5 h-5 rounded-full border border-outline-variant/40 flex items-center justify-center cursor-pointer hover:scale-110 active:scale-95 transition-all disabled:opacity-30 disabled:pointer-events-none shadow-2xs"
                      data-tooltip={t('translate.studio.chooseStrokeColor', 'Chọn màu viền chữ')}
                    >
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-black/20 shadow-xs"
                        style={{ backgroundColor: selectedLayer?.strokeColor || '#ffffff' }}
                      />
                    </button>
                    {showStrokeColorPicker && (
                      <div className="absolute right-0 top-full mt-2 p-2 bg-surface-container-lowest border border-outline-variant/30 rounded-2xl shadow-xl z-50 flex flex-col gap-2 min-w-[140px]">
                        <div className="flex items-center gap-1 justify-center">
                          {['#ffffff', '#000000', '#facc15', '#ef4444', '#3b82f6'].map((c) => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => {
                                updateSelectedLayer?.({ strokeColor: c });
                                setShowStrokeColorPicker?.(false);
                              }}
                              style={{ backgroundColor: c }}
                              className="w-4 h-4 rounded-full border border-outline-variant/30 hover:scale-110 transition-transform cursor-pointer"
                            />
                          ))}
                        </div>
                        <input
                          type="color"
                          value={selectedLayer?.strokeColor || '#ffffff'}
                          onChange={(e) => updateSelectedLayer?.({ strokeColor: e.target.value })}
                          className="w-full h-7 cursor-pointer rounded"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold tracking-wider text-on-surface-variant block mb-1 select-none">WIDTH</label>
                <div className="h-8 flex items-center rounded-lg border border-outline-variant/30 bg-surface-container-lowest overflow-hidden">
                  <button
                    type="button"
                    disabled={!selectedLayer || (selectedLayer?.strokeWidth || 0) <= 0}
                    onClick={() => {
                      const cur = Number(selectedLayer?.strokeWidth ?? 1.5);
                      updateSelectedLayer?.({ strokeWidth: Math.max(0, +(cur - 0.5).toFixed(1)) });
                    }}
                    className="w-7 h-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container text-xs font-semibold cursor-pointer border-r border-outline-variant/20 disabled:opacity-40 select-none shrink-0"
                    data-tooltip="-0.5px"
                  >
                    —
                  </button>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="20"
                    value={selectedLayer?.strokeWidth ?? 1.5}
                    disabled={!selectedLayer || (selectedLayer?.strokeWidth || 0) <= 0}
                    onChange={(e) => updateSelectedLayer?.({ strokeWidth: parseFloat(e.target.value) || 0 })}
                    className="flex-1 h-full text-center text-xs font-mono text-on-surface bg-transparent focus:outline-none min-w-0 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    disabled={!selectedLayer || (selectedLayer?.strokeWidth || 0) <= 0}
                    onClick={() => {
                      const cur = Number(selectedLayer?.strokeWidth ?? 1.5);
                      updateSelectedLayer?.({ strokeWidth: +(cur + 0.5).toFixed(1) });
                    }}
                    className="w-7 h-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container text-xs font-semibold cursor-pointer border-l border-outline-variant/20 disabled:opacity-40 select-none shrink-0"
                    data-tooltip="+0.5px"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ── Section B: Layers List (Koharu Architecture) ── */}
          <div className="p-3.5 space-y-2.5">
            {/* Group Folder Row: Text Group (Unified card matching System Layers) */}
            <div
              onClick={() => setIsTextGroupCollapsed?.((prev) => !prev)}
              className="flex items-center justify-between p-2 rounded-xl border border-outline-variant/20 bg-surface-container-lowest/60 text-on-surface hover:bg-surface-container-high/60 cursor-pointer select-none transition-all group/text-group"
              data-tooltip={isTextGroupCollapsed ? 'Expand' : 'Collapse'}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className={`material-symbols-outlined text-[16px] text-on-surface-variant transition-transform duration-200 shrink-0 ${isTextGroupCollapsed ? '-rotate-90' : 'rotate-0'
                    }`}
                >
                  expand_more
                </span>
                <span className="material-symbols-outlined text-[16px] text-[#db6177] shrink-0">
                  {isTextGroupCollapsed ? 'folder' : 'folder_open'}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold leading-tight text-on-surface flex items-center gap-1.5">
                    <span>Text</span>
                    <span className="text-[10px] text-on-surface-variant font-normal">
                      ({layers.length})
                    </span>
                  </p>
                  <p className="text-[10px] text-on-surface-variant leading-tight">{t('translate.type.textGroup')}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] text-on-surface-variant font-mono">100%</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleAllTextLayersVisibility?.();
                  }}
                  className="text-on-surface-variant hover:text-on-surface p-1 rounded-md hover:bg-surface-variant/50 cursor-pointer transition-colors"
                  data-tooltip={layers.length > 0 && layers.every((l) => l.visible !== false) ? 'Hide' : 'Show'}
                >
                  <span className="material-symbols-outlined text-[16px]">
                    {layers.length > 0 && layers.some((l) => l.visible !== false) ? 'visibility' : 'visibility_off'}
                  </span>
                </button>
              </div>
            </div>

            {/* Residual Japanese Alert & 1-Click Quick Retry Button in Layer List */}
            {residualLayers.length > 0 && (
              <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 min-w-0">
                  <span className="material-symbols-outlined text-[16px] shrink-0">warning</span>
                  <span className="truncate font-semibold text-[11px]">{t('translate.type.residualWarning', { count: residualLayers.length })}</span>
                </div>
                <button
                  type="button"
                  onClick={handleRetryResidualBubbles}
                  disabled={isTranslating || isRetryingResidual}
                  className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-[11px] font-bold shadow-xs cursor-pointer flex items-center gap-1 shrink-0 disabled:opacity-50"
                  data-tooltip={t('translate.type.retryResidualTitle')}
                >
                  <span className="material-symbols-outlined text-[13px]">
                    {isRetryingResidual ? 'sync' : 'bolt'}
                  </span>
                  <span>{isRetryingResidual ? t('translate.type.retryingResidual') : t('translate.type.retryResidual')}</span>
                </button>
              </div>
            )}

            {/* List of text layers (Expanded inline card for selectedLayer, collapsed rows for others) */}
            {!isTextGroupCollapsed && (
              <div className="space-y-2 pl-3.5">
                {layers.length === 0 ? (
                  <p className="text-xs text-on-surface-variant italic py-3 text-center">
                    {t('translate.type.noBubbles')}
                  </p>
                ) : (
                  layers.map((l, i) => {
                    const isSelected = l.id === selectedLayerId;
                    const isExpanded = l.id === expandedLayerId;
                    const hasRes = isLayerResidual(l);

                    if (isExpanded) {
                      return (
                        /* Expanded Selected Layer Card */
                        <div
                          key={l.id}
                          onClick={() => setSelectedLayerId?.(l.id)}
                          className={`rounded-2xl border p-3 space-y-2.5 shadow-xs transition-all ${isSelected
                            ? 'bg-[#fff0f3] dark:bg-[#2a171c] border-[#f8d7da] dark:border-[#522b35] ring-1 ring-[#db6177]/30'
                            : 'bg-surface-container-lowest border-outline-variant/30 hover:border-outline-variant/60'
                            }`}
                        >
                          {/* Card Header: Clickable to toggle collapse */}
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleLayerCollapse?.(l.id);
                            }}
                            className="flex items-center justify-between gap-2 cursor-pointer select-none group/card-header hover:opacity-80 transition-opacity"
                            data-tooltip="Collapse"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-serif font-bold text-xs text-[#db6177]">T</span>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-on-surface truncate">
                                  {l.text || `Bubble #${i + 1}`}
                                </p>
                                <p className="text-[10px] text-on-surface-variant">Dialogue</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                disabled={retryingSingleLayerId === l.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRetrySingleLayerInComparison?.(activePageIndex, l, i);
                                }}
                                className="text-on-surface-variant hover:text-[#db6177] p-1 rounded-md hover:bg-surface-variant/50 cursor-pointer transition-colors disabled:opacity-50"
                                data-tooltip={t('translate.type.retranslateLayerTitle')}
                              >
                                <span className={`material-symbols-outlined text-[16px] ${retryingSingleLayerId === l.id ? 'animate-spin text-[#db6177]' : ''}`}>
                                  {retryingSingleLayerId === l.id ? 'sync' : 'restart_alt'}
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleLayerVisibility?.(l.id);
                                }}
                                className="text-on-surface-variant hover:text-on-surface cursor-pointer shrink-0"
                                data-tooltip="Toggle visibility"
                              >
                                <span className="material-symbols-outlined text-[16px]">
                                  {l.visible !== false ? 'visibility' : 'visibility_off'}
                                </span>
                              </button>
                            </div>
                          </div>

                          {/* OPACITY Slider & Delete Button */}
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold tracking-wider text-on-surface-variant uppercase select-none">
                              {t('translate.type.opacity')}
                            </span>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.05"
                              value={l.opacity ?? 1}
                              onChange={(e) => updateSelectedLayer?.({ opacity: parseFloat(e.target.value) })}
                              className="flex-1 h-1.5 accent-[#db6177] cursor-pointer"
                            />
                            <span className="text-[10px] font-mono text-on-surface-variant w-8 text-right select-none">
                              {Math.round((l.opacity ?? 1) * 100)}%
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteLayer?.(l.id);
                              }}
                              className="p-1 rounded text-on-surface-variant hover:text-error hover:bg-error/10 cursor-pointer transition-colors"
                              data-tooltip={t('translate.type.deleteBubble')}
                            >
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            </button>
                          </div>

                          {/* PLACEMENT Row */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold tracking-wider text-on-surface-variant uppercase select-none">
                                {t('translate.type.placement')}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateSelectedLayer?.({ fontSize: 'auto' });
                                }}
                                className="px-2 py-0.5 rounded-full bg-neutral-200/80 dark:bg-neutral-700/80 text-[10px] font-medium text-on-surface cursor-pointer hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
                                data-tooltip={t('translate.type.autoFit')}
                              >
                                {t('translate.type.autoFit')}
                              </button>
                            </div>
                            <label className="flex items-center gap-1 text-[10px] text-on-surface-variant cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={l.fillBackground === true}
                                onChange={(e) => updateSelectedLayer?.({ fillBackground: e.target.checked })}
                                className="accent-[#db6177] w-3.5 h-3.5 rounded"
                              />
                              <span>Background</span>
                            </label>
                          </div>

                          {/* SOURCE TEXT */}
                          <div>
                            <span className="text-[10px] font-bold tracking-wider text-on-surface-variant uppercase block mb-1 select-none">
                              {t('translate.type.sourceText')}
                            </span>
                            <textarea
                              rows={2}
                              value={l.sourceText || l.originalText || l.rawText || ''}
                              onChange={(e) => updateSelectedLayer?.({ sourceText: e.target.value })}
                              placeholder={t('translate.type.sourceText')}
                              className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-2 text-xs text-on-surface leading-relaxed resize-y focus:outline-none focus:border-outline-variant/60 min-h-[44px]"
                            />
                          </div>

                          {/* TRANSLATION */}
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] font-bold tracking-wider text-on-surface-variant uppercase select-none">
                                {t('translate.type.translatedText')}
                              </span>
                              <button
                                type="button"
                                disabled={retryingSingleLayerId === l.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRetrySingleLayerInComparison?.(activePageIndex, l, i);
                                }}
                                className="p-1 rounded-md text-on-surface-variant hover:text-[#db6177] hover:bg-[#db6177]/10 transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-50"
                                data-tooltip={t('translate.type.retranslateLayerTitle')}
                              >
                                <span className={`material-symbols-outlined text-[14px] ${retryingSingleLayerId === l.id ? 'animate-spin text-[#db6177]' : ''}`}>
                                  {retryingSingleLayerId === l.id ? 'sync' : 'restart_alt'}
                                </span>
                                <span className="text-[10px] font-semibold">{t('translate.type.retryResidual')}</span>
                              </button>
                            </div>
                            <textarea
                              ref={isSelected ? layerTextareaRef : undefined}
                              rows={2}
                              value={l.text || ''}
                              onChange={(e) => updateSelectedLayer?.({ text: e.target.value })}
                              placeholder={t('translate.type.translatedPlaceholder')}
                              className="w-full rounded-xl border-2 border-[#db6177] bg-surface-container-lowest p-2 text-xs text-on-surface leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-[#db6177] min-h-[48px]"
                            />
                          </div>
                        </div>
                      );
                    }

                    /* Collapsed Inactive Row */
                    return (
                      <div
                        key={l.id}
                        onClick={() => toggleLayerCollapse?.(l.id)}
                        className={`cursor-pointer flex items-center justify-between p-2 rounded-xl border transition-all ${isSelected
                          ? 'border-[#db6177]/40 bg-[#fff0f3]/70 dark:bg-[#2a171c]/70 ring-1 ring-[#db6177]/30'
                          : hasRes
                            ? 'border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10 text-on-surface'
                            : 'border-transparent hover:bg-surface-container text-on-surface'
                          }`}
                        data-tooltip={t('translate.studio.expandHeader')}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`font-semibold text-xs ${hasRes ? 'text-amber-500' : 'text-on-surface-variant'}`}>
                            {hasRes ? '⚠️' : 'T'}
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs truncate font-medium text-on-surface">
                              {l.text || `Dialogue #${i + 1}`}
                            </p>
                            <div className="flex items-center gap-1 mt-0.5">
                              <p className="text-[10px] text-on-surface-variant">
                                Dialogue
                              </p>
                              {hasRes && (
                                <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold border border-amber-500/30">
                                  {t('translate.studio.residualJapanese')}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 text-xs">
                          <span className="text-[10px] text-on-surface-variant font-mono mr-0.5">
                            {Math.round((l.opacity ?? 1) * 100)}%
                          </span>
                          <button
                            type="button"
                            disabled={retryingSingleLayerId === l.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRetrySingleLayerInComparison?.(activePageIndex, l, i);
                            }}
                            className="text-on-surface-variant hover:text-[#db6177] p-1 rounded-md hover:bg-surface-variant/50 cursor-pointer transition-colors disabled:opacity-50"
                            data-tooltip={t('translate.type.retranslateLayerTitle')}
                          >
                            <span className={`material-symbols-outlined text-[16px] ${retryingSingleLayerId === l.id ? 'animate-spin text-[#db6177]' : ''}`}>
                              {retryingSingleLayerId === l.id ? 'sync' : 'restart_alt'}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleLayerVisibility?.(l.id);
                            }}
                            className="text-on-surface-variant hover:text-on-surface cursor-pointer"
                            data-tooltip={t('translate.studio.toggleVisibility')}
                          >
                            <span className="material-symbols-outlined text-[16px]">
                              {l.visible !== false ? 'visibility' : 'visibility_off'}
                            </span>
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Fixed System Layers (Cleanup & Original artwork) */}
            <div className="pt-2 border-t border-outline-variant/20 space-y-1.5">
              {/* Cleanup Layer */}
              <div className="flex items-center justify-between p-2 rounded-xl border border-outline-variant/20 bg-surface-container-lowest/60 text-on-surface hover:bg-surface-container-high/60 transition-colors">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="w-4 shrink-0" />
                  <span className="material-symbols-outlined text-[16px] text-primary shrink-0">brush</span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold leading-tight">Cleanup</p>
                    <p className="text-[10px] text-on-surface-variant leading-tight">Cleanup</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-on-surface-variant font-mono">100%</span>
                  <button
                    type="button"
                    onClick={() => setShowCleanupLayer?.(!showCleanupLayer)}
                    className="text-on-surface-variant hover:text-on-surface p-1 rounded-md hover:bg-surface-variant/50 cursor-pointer transition-colors"
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      {showCleanupLayer ? 'visibility' : 'visibility_off'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Original artwork */}
              <div className="flex items-center justify-between p-2 rounded-xl border border-outline-variant/20 bg-surface-container-lowest/60 text-on-surface hover:bg-surface-container-high/60 transition-colors">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="w-4 shrink-0" />
                  <span className="material-symbols-outlined text-[16px] text-on-surface-variant shrink-0">image</span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold leading-tight">Original artwork</p>
                    <p className="text-[10px] text-on-surface-variant leading-tight">Image</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-on-surface-variant font-mono">100%</span>
                  <span className="material-symbols-outlined text-[15px] text-on-surface-variant p-1">lock</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ── Section B: Settings Tab (Cài đặt Translation Pipeline) ── */
        <div className="p-4 space-y-4">
          <TranslateSettingsPanel
            settings={settings}
            onUpdateSetting={handleUpdateSetting}
            localEngines={detectedEngines || localEngines}
          />
        </div>
      )}
    </div>
  );
}
