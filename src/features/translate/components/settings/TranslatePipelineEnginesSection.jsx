import React from 'react';
import { useI18n } from '../../../../context/I18nContext';
import { SearchableSelect } from '../../../../shared';
import { SettingCard } from './SettingCard';

export function TranslatePipelineEnginesSection({
  safeSettings,
  save,
  isCardOpen,
  toggleCard,
  detectionModelOptions,
  ocrModelOptions,
  inpaintingModelOptions,
}) {
  const { t } = useI18n();

  return (
    <div className="space-y-3.5">
      {/* ─── Detection Card ─── */}
      <SettingCard
        isOpen={isCardOpen('detection')}
        onToggle={() => toggleCard('detection')}
        icon="frame_inspect"
        title={t('translate.settings.sec2Title')}
        subtitle={t('translate.settings.sec2Sub')}
      >
        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-semibold text-on-surface-variant block mb-1">
              {t('translate.settings.detectModelLabel')}
            </label>
            <SearchableSelect
              value={safeSettings.detectionModel || 'koharu-rf-detr'}
              onChange={(val) => save({ detectionModel: val })}
              options={detectionModelOptions}
              placeholder={t('translate.settings.detectModelLabel')}
              className="w-full"
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-on-surface-variant block mb-1">
              {t('translate.settings.detectThresholdLabel')}
            </label>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <span className="text-[10px] text-on-surface-variant block mb-0.5">Text</span>
                <input
                  type="text"
                  placeholder="Default"
                  value={safeSettings.textThreshold ?? 'Default'}
                  onChange={(e) => save({ textThreshold: e.target.value })}
                  className="w-full rounded-xl border border-outline-variant/25 bg-surface-container-low px-2.5 py-1.5 text-xs text-on-surface focus:border-primary focus:bg-surface-container-lowest focus:outline-none text-center"
                />
              </div>
              <div>
                <span className="text-[10px] text-on-surface-variant block mb-0.5">Bubble</span>
                <input
                  type="text"
                  placeholder="Default"
                  value={safeSettings.bubbleThreshold ?? 'Default'}
                  onChange={(e) => save({ bubbleThreshold: e.target.value })}
                  className="w-full rounded-xl border border-outline-variant/25 bg-surface-container-low px-2.5 py-1.5 text-xs text-on-surface focus:border-primary focus:bg-surface-container-lowest focus:outline-none text-center"
                />
              </div>
              <div>
                <span className="text-[10px] text-on-surface-variant block mb-0.5">Panel</span>
                <input
                  type="text"
                  placeholder="Default"
                  value={safeSettings.panelThreshold ?? 'Default'}
                  onChange={(e) => save({ panelThreshold: e.target.value })}
                  className="w-full rounded-xl border border-outline-variant/25 bg-surface-container-low px-2.5 py-1.5 text-xs text-on-surface focus:border-primary focus:bg-surface-container-lowest focus:outline-none text-center"
                />
              </div>
            </div>
          </div>
        </div>
      </SettingCard>

      {/* ─── OCR Card ─── */}
      <SettingCard
        isOpen={isCardOpen('ocr')}
        onToggle={() => toggleCard('ocr')}
        icon="text_fields"
        title={t('translate.settings.ocrTitle')}
        subtitle={t('translate.settings.ocrSub')}
      >
        <div>
          <label className="text-[11px] font-semibold text-on-surface-variant block mb-1">
            {t('translate.settings.ocrModelLabel')}
          </label>
          <SearchableSelect
            value={safeSettings.ocrModel || 'paddleocr-vl-1.6'}
            onChange={(val) => {
              save({
                ocrModel: val,
                ocrProvider: val === 'cloud' ? 'cloud' : 'local',
              });
            }}
            options={ocrModelOptions}
            placeholder={t('translate.settings.ocrModelLabel')}
            className="w-full"
          />
        </div>
      </SettingCard>

      {/* ─── Inpainting Card ─── */}
      <SettingCard
        isOpen={isCardOpen('inpainting')}
        onToggle={() => toggleCard('inpainting')}
        icon="auto_fix_high"
        title={t('translate.settings.inpaintTitle')}
        subtitle={t('translate.settings.inpaintSub')}
      >
        <div>
          <label className="text-[11px] font-semibold text-on-surface-variant block mb-1">
            {t('translate.settings.inpaintModelLabel')}
          </label>
          <SearchableSelect
            value={safeSettings.inpaintingModel || 'lama'}
            onChange={(val) => save({ inpaintingModel: val })}
            options={inpaintingModelOptions}
            placeholder={t('translate.settings.inpaintModelLabel')}
            className="w-full"
          />
        </div>
      </SettingCard>
    </div>
  );
}

export default TranslatePipelineEnginesSection;
