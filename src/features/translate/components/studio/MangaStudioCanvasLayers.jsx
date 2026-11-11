import React from 'react';
import { useI18n } from '../../../../context/I18nContext';
import {
  computeOptimalTextBox,
  calculateOptimalFontSize,
} from './mangaStudioCanvasRender';

/**
 * MangaStudioCanvasLayers — Khung Render toàn bộ Text & Bubble Layers trên Manga Canvas
 * Xử lý:
 * - Speech Bubble Hit Area & Mask Background (`fillBackground`)
 * - Khung Text Box chuẩn Koharu (Viền hồng, Top Pin chốt tay nắm, Typography styling, Text shadow stroke)
 * - 8 Handles co giãn (4 góc + 4 cạnh)
 * - Badges chỉ số layer (`#1`, `#2`), cảnh báo chữ sót tiếng Nhật (`⚠️`) và kích thước `(W×H)`
 */
export function MangaStudioCanvasLayers({
  layers = [],
  zoom = 100,
  selectedLayerId,
  activeTool = 'select',
  isSpacePressed = false,
  isTranslating = false,
  isLayerResidual = () => false,
  handleMouseDownOnLayer,
  handleDoubleClickOnLayer,
  handleMouseDownOnHandle,
}) {
  const { t } = useI18n();
  const scale = zoom / 100;

  return (
    <>
      {layers.map((layer, layerIdx) => {
        if (!layer.visible) return null;
        const isSelected = layer.id === selectedLayerId;

        // 1. Tọa độ Bong bóng thoại (Outer Speech Bubble)
        const rawBubbleBbox = Array.isArray(layer.bbox) && layer.bbox.length === 4
          ? layer.bbox
          : [0, 0, 100, 100];
        const [bx, by, bw, bh] = rawBubbleBbox;

        // 2. Tọa độ Khung chat text (Inner Text Box)
        const rawTextBbox = computeOptimalTextBox(
          rawBubbleBbox,
          layer.textBbox,
          layer.hasBubble !== false,
          layer.isCustomTextBox
        );
        const [tx, ty, tw, th] = rawTextBbox;

        // Bo góc mềm mại cho Bong bóng thoại theo hình dáng oval
        const isOvalBubble = layer.hasBubble !== false && (layer.type === 'dialogue' || !layer.type);
        const bubbleRadius = isOvalBubble
          ? Math.round(Math.min(bw, bh) * 0.45 * scale)
          : Math.round(Math.min(bw, bh) * 0.12 * scale);

        // Tự động tính toán font size vừa vặn bên trong khung chat text (tw, th)
        let computedFontSize = 14;
        if (layer.fontSize === 'auto' || !layer.fontSize) {
          computedFontSize = calculateOptimalFontSize(
            layer.text,
            tw,
            th,
            layer.fontFamily,
            layer.fontWeight,
            layer.textTransform || 'uppercase',
            false // Text box is rectangular
          );
        } else {
          computedFontSize = Number(layer.fontSize) || 14;
        }

        const maskInset = Math.max(2, Math.round(Math.min(bw, bh) * 0.035));

        return (
          <React.Fragment key={layer.id}>
            {/* === VÙNG BONG BÓNG THOẠI (SPEECH BUBBLE HIT AREA & MASK) === */}
            <div
              onMouseDown={(e) => handleMouseDownOnLayer?.(e, layer, 'bubble')}
              style={{
                position: 'absolute',
                left: `${bx * scale}px`,
                top: `${by * scale}px`,
                width: `${bw * scale}px`,
                height: `${bh * scale}px`,
                zIndex: isSelected ? 15 : 5,
                borderRadius: `${bubbleRadius}px`,
                pointerEvents: (activeTool === 'hand' || isSpacePressed) ? 'none' : 'auto',
              }}
              className="cursor-move select-none"
            >
              {/* Speech Bubble Mask (CHỈ hiển thị khi user bật fillBackground tường minh cho layer này) */}
              {layer.fillBackground === true && (
                <div
                  style={{
                    position: 'absolute',
                    inset: `${maskInset * scale}px`,
                    backgroundColor: layer.backgroundColor || '#ffffff',
                    opacity: layer.backgroundOpacity ?? 0.98,
                    borderRadius: `${Math.max(2, bubbleRadius - Math.round(maskInset * scale))}px`,
                    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                    pointerEvents: 'none',
                  }}
                />
              )}
            </div>

            {/* === KHUNG CHAT TEXT (TEXT BOX) CHUẨN KOHARU: DUY NHẤT VIỀN HỒNG + CHỐT PIN + 8 NÚT RESIZE === */}
            <div
              onMouseDown={(e) => handleMouseDownOnLayer?.(e, layer, 'textBox')}
              onDoubleClick={(e) => handleDoubleClickOnLayer?.(e, layer)}
              style={{
                position: 'absolute',
                left: `${tx * scale}px`,
                top: `${ty * scale}px`,
                width: `${tw * scale}px`,
                height: `${th * scale}px`,
                zIndex: isSelected ? 35 : 15,
                pointerEvents: (activeTool === 'hand' || isSpacePressed) ? 'none' : 'auto',
              }}
              className={`group/text cursor-move select-none transition-all ${isSelected
                ? 'border-2 border-pink-500 bg-pink-500/[0.04]'
                : isLayerResidual(layer)
                  ? 'border border-dashed border-amber-500/70 bg-amber-500/5'
                  : 'border border-transparent hover:border-pink-400/40'
                }`}
            >
              {/* Badge chỉ số khung thoại trên UI */}
              <div
                className={`absolute -top-5 left-0 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold pointer-events-none transition-opacity flex items-center gap-1 shadow-xs whitespace-nowrap ${isLayerResidual(layer)
                  ? 'bg-amber-600 text-white opacity-100 z-50 ring-1 ring-amber-400/50'
                  : isSelected
                    ? 'bg-pink-600 text-white opacity-100 z-50'
                    : 'bg-zinc-800/85 text-zinc-100 opacity-0 group-hover/text:opacity-100'
                  }`}
              >
                <span>#{layerIdx + 1}</span>
                {isLayerResidual(layer) && (
                  <span className="text-[8px] font-sans font-bold">{t('translate.studio.residualWarningTag')}</span>
                )}
                {isSelected && !isLayerResidual(layer) && (
                  <span className="text-[8px] opacity-80">({tw}×{th})</span>
                )}
              </div>

              {/* Chốt tay nắm (Top Handle Pin) chuẩn Koharu vươn lên ở đỉnh */}
              {isSelected && (
                <div className="absolute -top-5.5 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-auto z-50">
                  {/* Núm vuông tay nắm chốt */}
                  <div
                    onMouseDown={(e) => handleMouseDownOnLayer?.(e, layer, 'top-pin')}
                    className="w-2.5 h-2.5 bg-pink-500 border border-white rounded-[1px] shadow-xs cursor-grab active:cursor-grabbing hover:scale-125 transition-transform"
                    data-tooltip={t('translate.studio.bubbleHandleDragTitle')}
                  />
                  {/* Thanh dọc kết nối từ chốt xuống khung */}
                  <div className="w-0.5 h-3 bg-pink-500 pointer-events-none" />
                </div>
              )}

              {/* Text Typography Content */}
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  height: '100%',
                  opacity: layer.opacity ?? 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent:
                    layer.align === 'left'
                      ? 'flex-start'
                      : layer.align === 'right'
                        ? 'flex-end'
                        : 'center',
                  textAlign: layer.align || 'center',
                  fontFamily: layer.fontFamily,
                  fontSize: `${computedFontSize * scale}px`,
                  fontWeight: layer.fontWeight || '700',
                  fontStyle: layer.fontStyle || 'normal',
                  color: layer.color || '#000000',
                  lineHeight: 1.2,
                  letterSpacing: '0.02em',
                  textTransform: layer.textTransform || 'uppercase',
                  padding: `${Math.max(1, Math.round(th * 0.03 * scale))}px ${Math.max(1, Math.round(tw * 0.03 * scale))}px`,
                  wordBreak: 'break-word',
                  overflowWrap: 'break-word',
                  whiteSpace: 'pre-wrap',
                  overflow: 'hidden',
                  pointerEvents: 'none',
                  userSelect: 'none',
                  textShadow:
                    layer.strokeWidth > 0
                      ? `-${layer.strokeWidth * scale}px -${layer.strokeWidth * scale}px 0 ${layer.strokeColor || '#ffffff'}, ` +
                      `${layer.strokeWidth * scale}px -${layer.strokeWidth * scale}px 0 ${layer.strokeColor || '#ffffff'}, ` +
                      `-${layer.strokeWidth * scale}px ${layer.strokeWidth * scale}px 0 ${layer.strokeColor || '#ffffff'}, ` +
                      `${layer.strokeWidth * scale}px ${layer.strokeWidth * scale}px 0 ${layer.strokeColor || '#ffffff'}`
                      : 'none',
                }}
              >
                {layer.text ? (
                  layer.text
                ) : isTranslating ? (
                  <span className="text-[10px] text-pink-500 font-mono animate-pulse flex items-center justify-center gap-1.5 opacity-85 select-none">
                    <span className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-ping shrink-0" />
                    <span>{t('translate.studio.scanningStatus')}</span>
                  </span>
                ) : (
                  <span className="opacity-30 italic text-xs">{t('translate.studio.emptyStatus')}</span>
                )}
              </div>

              {/* 8 Resize Handles viền hồng quanh Khung chat text chuẩn Koharu */}
              {isSelected && (
                <>
                  {/* 4 Handles ở 4 góc */}
                  <div
                    onMouseDown={(e) => handleMouseDownOnHandle?.(e, layer, 'nw', 'textBox')}
                    className="absolute -left-1.5 -top-1.5 w-2.5 h-2.5 bg-white border-2 border-pink-500 rounded-[1px] cursor-nwse-resize z-40 shadow-xs hover:scale-125 transition-transform"
                    data-tooltip={t('translate.studio.handleNw')}
                  />
                  <div
                    onMouseDown={(e) => handleMouseDownOnHandle?.(e, layer, 'ne', 'textBox')}
                    className="absolute -right-1.5 -top-1.5 w-2.5 h-2.5 bg-white border-2 border-pink-500 rounded-[1px] cursor-nesw-resize z-40 shadow-xs hover:scale-125 transition-transform"
                    data-tooltip={t('translate.studio.handleNe')}
                  />
                  <div
                    onMouseDown={(e) => handleMouseDownOnHandle?.(e, layer, 'se', 'textBox')}
                    className="absolute -right-1.5 -bottom-1.5 w-2.5 h-2.5 bg-white border-2 border-pink-500 rounded-[1px] cursor-nwse-resize z-40 shadow-xs hover:scale-125 transition-transform"
                    data-tooltip={t('translate.studio.handleSe')}
                  />
                  <div
                    onMouseDown={(e) => handleMouseDownOnHandle?.(e, layer, 'sw', 'textBox')}
                    className="absolute -left-1.5 -bottom-1.5 w-2.5 h-2.5 bg-white border-2 border-pink-500 rounded-[1px] cursor-nesw-resize z-40 shadow-xs hover:scale-125 transition-transform"
                    data-tooltip={t('translate.studio.handleSw')}
                  />

                  {/* 4 Handles ở giữa các cạnh */}
                  <div
                    onMouseDown={(e) => handleMouseDownOnHandle?.(e, layer, 'n', 'textBox')}
                    className="absolute left-1/2 -translate-x-1/2 -top-1.5 w-2.5 h-2 bg-white border border-pink-500 rounded-[1px] cursor-ns-resize z-40 shadow-xs hover:scale-125 transition-transform"
                    data-tooltip={t('translate.studio.handleN')}
                  />
                  <div
                    onMouseDown={(e) => handleMouseDownOnHandle?.(e, layer, 's', 'textBox')}
                    className="absolute left-1/2 -translate-x-1/2 -bottom-1.5 w-2.5 h-2 bg-white border border-pink-500 rounded-[1px] cursor-ns-resize z-40 shadow-xs hover:scale-125 transition-transform"
                    data-tooltip={t('translate.studio.handleS')}
                  />
                  <div
                    onMouseDown={(e) => handleMouseDownOnHandle?.(e, layer, 'w', 'textBox')}
                    className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-2 h-2.5 bg-white border border-pink-500 rounded-[1px] cursor-ew-resize z-40 shadow-xs hover:scale-125 transition-transform"
                    data-tooltip={t('translate.studio.handleW')}
                  />
                  <div
                    onMouseDown={(e) => handleMouseDownOnHandle?.(e, layer, 'e', 'textBox')}
                    className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-2 h-2.5 bg-white border border-pink-500 rounded-[1px] cursor-ew-resize z-40 shadow-xs hover:scale-125 transition-transform"
                    data-tooltip={t('translate.studio.handleE')}
                  />
                </>
              )}
            </div>
          </React.Fragment>
        );
      })}
    </>
  );
}

