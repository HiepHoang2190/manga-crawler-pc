import React from 'react';
import { useI18n } from '../../context/I18nContext';
import SectionTitle from './SectionTitle.jsx';

export const COMPRESS_QUALITY_PRESETS = [
  { value: 85, label: '85', subLabelKey: 'caesium.quality85Sub', defaultSub: 'Cân bằng', descKey: 'caesium.quality85Desc' },
  { value: 90, label: '90', subLabelKey: 'caesium.quality90Sub', defaultSub: 'Nét cao', descKey: 'caesium.quality90Desc' },
  { value: 75, label: '75', subLabelKey: 'caesium.quality75Sub', defaultSub: 'Tiết kiệm', descKey: 'caesium.quality75Desc' },
];

export const COMPRESS_RATIO_PRESETS = [
  { value: 0.8, label: '80%', subLabelKey: 'caesium.ratio80Sub', defaultSub: 'Caesium', descKey: 'caesium.ratio80Desc' },
  { value: 0.75, label: '75%', subLabelKey: 'caesium.ratio75Sub', defaultSub: 'Siêu nhẹ', descKey: 'caesium.ratio75Desc' },
  { value: 1.0, label: '100%', subLabelKey: 'caesium.ratio100Sub', defaultSub: 'Gốc', descKey: 'caesium.ratio100Desc' },
];

export default function CaesiumCompressControl({
  enabled = true,
  onEnabledChange,
  quality = 85,
  onQualityChange,
  format = 'original',
  disabled = false,
  showToggle = true,
  showRatio = true,
  ratio = 0.8,
  onRatioChange,
  ratioPresets = COMPRESS_RATIO_PRESETS,
  showManualWhenDisabled = true,
  disabledHint = null,
  callout = null,
  title,
  presets = COMPRESS_QUALITY_PRESETS,
  className = '',
}) {
  const { t } = useI18n();

  const isPng = format === 'png';
  const headingText = title ?? t('caesium.title') ?? t('imagePipeline.caesium.title') ?? 'Nén & Tối ưu dung lượng (Caesium Engine)';

  return (
    <div className={`rounded-xl border border-outline-variant/30 bg-surface-container-low/60 p-3 space-y-3 ${className}`.trim()}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="material-symbols-outlined text-primary text-[18px]">bolt</span>
          <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface truncate">
            {headingText}
          </span>
        </div>
        {showToggle && (
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={Boolean(enabled)}
              onChange={(e) => onEnabledChange?.(e.target.checked)}
              disabled={disabled}
              className="sr-only peer"
            />
            <div className="w-8 h-4 bg-outline-variant/40 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3.5 after:transition-all peer-checked:bg-primary"></div>
          </label>
        )}
      </div>

      {(enabled || !showToggle) ? (
        <div className="space-y-3 pt-1">
          {showRatio && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <SectionTitle as="span">{t('caesium.ratioLabel') || t('upscale.compress.ratioLabel') || 'Kích thước xuất (Resize)'}</SectionTitle>
                <span className="text-[11px] text-primary font-bold">{Math.round(ratio * 100)}%</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {ratioPresets.map((opt) => {
                  const isSel = Math.abs(ratio - opt.value) < 0.01;
                  const desc = t(opt.descKey) || `${opt.defaultSub} (${opt.label})`;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={disabled}
                      onClick={() => onRatioChange?.(opt.value)}
                      data-tooltip={desc}
                      className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-lg border text-xs transition-all cursor-pointer select-none ${
                        isSel
                          ? 'border-primary bg-primary/10 text-primary font-semibold shadow-xs ring-1 ring-primary/30'
                          : 'border-outline-variant/30 bg-surface-container hover:bg-surface-container-highest text-on-surface-variant'
                      }`}
                    >
                      <span className="text-xs">{opt.label}</span>
                      <span className="text-[9px] opacity-75">{t(opt.subLabelKey) || opt.defaultSub}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {isPng ? (
            <div className="rounded-lg border border-outline-variant/20 bg-surface-container-high p-2.5 text-[11px] leading-relaxed text-on-surface-variant flex items-start gap-2">
              <span className="material-symbols-outlined text-[16px] text-primary shrink-0 select-none mt-0.5">info</span>
              <span>{t('caesium.pngLosslessHint') || t('imagePipeline.output.pngLosslessHint')}</span>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <SectionTitle as="span">{t('caesium.qualityLabel') || t('imagePipeline.caesium.qualityLabel') || 'Chất lượng nén ảnh'}</SectionTitle>
                <span className="text-[11px] text-primary font-bold">{quality}</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {presets.map((opt) => {
                  const isSel = quality === opt.value;
                  const desc = t(opt.descKey) || `${opt.defaultSub} (${opt.value})`;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={disabled}
                      onClick={() => onQualityChange?.(opt.value)}
                      data-tooltip={desc}
                      className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-lg border text-xs transition-all cursor-pointer select-none ${
                        isSel
                          ? 'border-primary bg-primary/10 text-primary font-semibold shadow-xs ring-1 ring-primary/30'
                          : 'border-outline-variant/30 bg-surface-container hover:bg-surface-container-highest text-on-surface-variant'
                      }`}
                    >
                      <span className="text-xs font-semibold">{opt.label}</span>
                      <span className="text-[9px] opacity-75">{t(opt.subLabelKey) || opt.defaultSub}</span>
                    </button>
                  );
                })}
              </div>
              {!showToggle && (
                <p className="text-[10px] text-on-surface-variant/60 leading-relaxed pt-0.5">
                  {format === 'webp'
                    ? (t('caesium.webpHint') || 'Nén WebP chất lượng cao, giữ chi tiết sắc nét và dung lượng siêu nhẹ.')
                    : (t('caesium.mozjpegHint') || 'Thuật toán MozJPEG tối ưu tỷ lệ nén cao mà mắt thường không thấy suy giảm chất lượng.')}
                </p>
              )}
            </div>
          )}

          {callout && (
            callout === true ? (
              <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-2 text-[11px] leading-relaxed text-emerald-400 dark:text-emerald-300 flex items-start gap-1.5">
                <span className="material-symbols-outlined text-[15px] shrink-0 mt-0.5 text-emerald-400">check_circle</span>
                <span>{t('caesium.callout')}</span>
              </p>
            ) : typeof callout === 'string' ? (
              <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-2 text-[11px] leading-relaxed text-emerald-400 dark:text-emerald-300 flex items-start gap-1.5">
                <span className="material-symbols-outlined text-[15px] shrink-0 mt-0.5 text-emerald-400">check_circle</span>
                <span>{callout}</span>
              </p>
            ) : (
              callout
            )
          )}
        </div>
      ) : (
        disabledHint ? (
          disabledHint === true ? (
            <p className="text-[11px] text-on-surface-variant/60 leading-relaxed italic pt-1">
              {t('caesium.disabledHint')}
            </p>
          ) : typeof disabledHint === 'string' ? (
            <p className="text-[11px] text-on-surface-variant/60 leading-relaxed italic pt-1">
              {disabledHint}
            </p>
          ) : (
            disabledHint
          )
        ) : showManualWhenDisabled ? (
          <label className="block space-y-1 text-xs text-on-surface-variant pt-1">
            <div className="flex items-center justify-between">
              <span>{t('imagePipeline.output.quality', { value: quality }) || `Chất lượng: ${quality}`}</span>
              <span className="text-[10px] text-on-surface-variant/60">{t('imagePipeline.output.qualityHint') || '1 - 100'}</span>
            </div>
            <input
              type="range"
              min={1}
              max={100}
              value={quality}
              disabled={disabled}
              onChange={(e) => onQualityChange?.(Number(e.target.value))}
              className="w-full accent-primary cursor-pointer"
            />
          </label>
        ) : null
      )}
    </div>
  );
}
