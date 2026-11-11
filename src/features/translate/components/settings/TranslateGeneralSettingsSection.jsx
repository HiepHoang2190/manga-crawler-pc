import React from 'react';
import { useI18n } from '../../../../context/I18nContext';
import { SearchableSelect } from '../../../../shared';
import { SettingCard } from './SettingCard';

export function TranslateGeneralSettingsSection({
  safeSettings,
  save,
  isCardOpen,
  toggleCard,
  sourceLanguageOptions,
  targetLanguageOptions,
  allAvailableFontOptions,
  unaddedFontOptions,
  defaultFontStack = ['Anime Ace', 'CC Wild Words', 'Manga Temple'],
  diskUsage,
  clearCacheBusy,
  clearCacheResult,
  onClearCache,
  onOpenResetModal,
}) {
  const { t } = useI18n();

  return (
    <div className="space-y-3.5">
      {/* ─── Cặp Ngôn Ngữ Nguồn / Đích ─── */}
      <SettingCard
        isOpen={isCardOpen('langPair')}
        onToggle={() => toggleCard('langPair')}
        icon="language"
        title={t('translate.settings.langPairTitle')}
        subtitle={t('translate.settings.langPairSub')}
      >
        <div className="flex items-end gap-2">
          <div className="flex-1 min-w-0">
            <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">
              {t('translate.settings.sourceLang')}
            </label>
            <SearchableSelect
              value={safeSettings.sourceLanguage || 'auto'}
              onChange={(val) => save({ sourceLanguage: val })}
              options={sourceLanguageOptions}
              placeholder={t('translate.settings.sourceLang')}
              className="w-full"
            />
          </div>

          <div className="h-9 flex items-center justify-center text-primary/70 shrink-0 pb-0.5">
            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
          </div>

          <div className="flex-1 min-w-0">
            <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">
              {t('translate.settings.targetLang')}
            </label>
            <SearchableSelect
              value={safeSettings.targetLanguage || 'vi'}
              onChange={(val) => save({ targetLanguage: val })}
              options={targetLanguageOptions}
              placeholder={t('translate.settings.targetLang')}
              className="w-full"
            />
          </div>
        </div>
      </SettingCard>

      {/* ─── Phông Chữ Dàn Trang (Typography) ─── */}
      <SettingCard
        isOpen={isCardOpen('typesetting')}
        onToggle={() => toggleCard('typesetting')}
        icon="match_case"
        title={t('translate.settings.typographyTitle')}
        subtitle={t('translate.settings.typographySub')}
      >
        <p className="text-[11px] text-on-surface-variant leading-relaxed">
          {t('translate.settings.typographyDesc')}
        </p>

        <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low divide-y divide-outline-variant/15 overflow-hidden">
          {(safeSettings.fontStack || defaultFontStack).map((fontName, idx) => (
            <div key={idx} className="flex items-center gap-2.5 p-2.5 hover:bg-surface-container-high/40 transition-colors">
              <span className="w-6 h-6 rounded-lg bg-surface-container-high flex items-center justify-center font-mono text-[10px] font-bold text-on-surface-variant shrink-0">
                {String(idx + 1).padStart(2, '0')}
              </span>
              <div className="flex-1 min-w-0">
                <SearchableSelect
                  value={fontName}
                  onChange={(val) => {
                    const next = [...(safeSettings.fontStack || defaultFontStack)];
                    next[idx] = val;
                    save({ fontStack: next });
                  }}
                  options={allAvailableFontOptions}
                  placeholder="Chọn phông chữ..."
                  className="w-full"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = (safeSettings.fontStack || defaultFontStack).filter((_, i) => i !== idx);
                  save({ fontStack: next });
                }}
                disabled={(safeSettings.fontStack || []).length <= 1}
                className="cursor-pointer p-1.5 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors disabled:opacity-30 disabled:pointer-events-none shrink-0"
                data-tooltip={t('translate.settings.deleteFontTitle')}
                aria-label={t('translate.settings.deleteFontTitle')}
              >
                <span className="material-symbols-outlined text-[16px]">delete</span>
              </button>
            </div>
          ))}

          {/* Add font row */}
          <div className="flex items-center gap-2.5 p-2.5 bg-surface-container-lowest/40">
            <span className="w-6 h-6 rounded-lg border border-dashed border-outline-variant/50 flex items-center justify-center font-mono text-xs font-bold text-on-surface-variant shrink-0">
              +
            </span>
            <div className="flex-1 min-w-0">
              <SearchableSelect
                value=""
                onChange={(val) => {
                  if (val) {
                    const next = [...(safeSettings.fontStack || defaultFontStack), val];
                    save({ fontStack: next });
                  }
                }}
                options={unaddedFontOptions}
                placeholder={t('translate.settings.addFontPlaceholder')}
                className="w-full"
                disabled={unaddedFontOptions.length === 0}
              />
            </div>
          </div>
        </div>
      </SettingCard>

      {/* ─── Bộ Nhớ Tạm & Dung Lượng (Cache) ─── */}
      <SettingCard
        isOpen={isCardOpen('cache')}
        onToggle={() => toggleCard('cache')}
        icon="database"
        title={t('translate.settings.cacheTitle')}
        subtitle={t('translate.settings.cacheSub')}
      >
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-surface-container p-2 border border-outline-variant/15">
            <span className="text-[10px] text-on-surface-variant block">Models</span>
            <p className="text-xs font-bold text-on-surface mt-0.5">
              {diskUsage ? `${((diskUsage.modelBytes || 0) / (1024 * 1024)).toFixed(1)} MB` : '--'}
            </p>
          </div>
          <div className="rounded-xl bg-surface-container p-2 border border-outline-variant/15">
            <span className="text-[10px] text-on-surface-variant block">Cache</span>
            <p className="text-xs font-bold text-on-surface mt-0.5">
              {diskUsage ? `${((diskUsage.cacheBytes || 0) / (1024 * 1024)).toFixed(1)} MB` : '--'}
            </p>
          </div>
          <div className="rounded-xl bg-surface-container p-2 border border-outline-variant/15">
            <span className="text-[10px] text-on-surface-variant block">{t('translate.settings.cacheTotal')}</span>
            <p className="text-xs font-bold text-primary mt-0.5">
              {diskUsage ? `${((diskUsage.totalBytes || 0) / (1024 * 1024)).toFixed(1)} MB` : '--'}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1 border-t border-outline-variant/15 flex-wrap">
          <span className="text-[11px] text-on-surface-variant">
            {t('translate.settings.cacheDesc')}
          </span>
          <button
            type="button"
            onClick={onClearCache}
            disabled={clearCacheBusy}
            className="cursor-pointer shrink-0 rounded-xl border border-error/30 bg-error/5 hover:bg-error/15 px-3 py-1.5 text-xs font-medium text-error transition-colors disabled:opacity-40"
          >
            {clearCacheBusy ? t('translate.settings.clearingCache') : t('translate.settings.clearCacheBtn')}
          </button>
        </div>

        {clearCacheResult && (
          <p className={`text-xs ${clearCacheResult.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-error'}`}>
            {clearCacheResult.message}
          </p>
        )}
      </SettingCard>

      {/* ─── Khôi Phục Mặc Định (Reset Defaults) ─── */}
      <SettingCard
        isOpen={isCardOpen('reset')}
        onToggle={() => toggleCard('reset')}
        icon="restart_alt"
        title={t('translate.settings.resetScopeTitle')}
        subtitle={t('translate.settings.resetDesc')}
      >
        <div>
          <button
            type="button"
            onClick={onOpenResetModal}
            className="cursor-pointer rounded-xl border border-error/30 bg-error/5 hover:bg-error/15 px-3 py-1.5 text-xs font-medium text-error transition-colors"
            data-tooltip={t('translate.settings.resetBtn')}
          >
            {t('translate.settings.resetBtn')}
          </button>
        </div>
      </SettingCard>
    </div>
  );
}

export default TranslateGeneralSettingsSection;
