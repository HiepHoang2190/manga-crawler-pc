import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useI18n } from '../../context/I18nContext';

export default function ThemeCardPicker() {
  const { presetTheme, setPresetTheme, availableThemes = [], darkMode } = useTheme();
  const { t } = useI18n();

  return (
    <div className="space-y-3 pt-2">
      <div className="flex flex-col gap-0.5">
        <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block">
          {t('settings.theme.preset')}
        </label>
        <p className="text-xs text-on-surface-variant/80">
          {t('settings.theme.preset.hint')}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        {availableThemes.map((theme) => {
          const isSelected = presetTheme === theme.id;
          const currentSwatches =
            theme.swatches?.[darkMode ? 'dark' : 'light'] ||
            theme.swatches?.light ||
            [];

          return (
            <button
              key={theme.id}
              type="button"
              data-testid={`theme-card-${theme.id}`}
              onClick={() => setPresetTheme(theme.id)}
              className={`relative flex flex-col justify-between min-w-0 w-full p-3.5 rounded-2xl border text-left cursor-pointer transition-all duration-150 select-none overflow-hidden ${
                isSelected
                  ? 'border-primary ring-2 ring-primary/30 bg-primary/8 shadow-sm'
                  : 'border-outline-variant/25 bg-surface-container-highest/30 hover:bg-surface-container-highest/60 hover:border-outline-variant/50'
              }`}
              aria-pressed={isSelected}
            >
              {/* Header row: Color swatches & Active check badge */}
              <div className="flex items-center justify-between gap-2 mb-2 w-full min-w-0">
                <div className="flex items-center -space-x-1.5 p-1 rounded-full bg-surface-container-lowest/60 border border-outline-variant/20 shadow-xs shrink-0">
                  {currentSwatches.map((color, idx) => (
                    <span
                      key={idx}
                      className="w-3.5 h-3.5 rounded-full border border-black/10 dark:border-white/10 shrink-0"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>

                {isSelected ? (
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-on-primary shrink-0 shadow-xs">
                    <span className="material-symbols-outlined text-[14px] leading-none">
                      check
                    </span>
                  </span>
                ) : (
                  <span className="w-5 h-5 rounded-full border border-outline-variant/30 shrink-0" />
                )}
              </div>

              {/* Title and description */}
              <div className="w-full min-w-0 flex-1 flex flex-col justify-start">
                <div
                  className={`text-sm font-semibold tracking-tight truncate w-full ${
                    isSelected ? 'text-primary' : 'text-on-surface'
                  }`}
                  title={t(theme.nameKey) || theme.id}
                >
                  {t(theme.nameKey) || theme.id}
                </div>
                <div
                  className="text-[11px] text-on-surface-variant/75 line-clamp-2 leading-relaxed mt-0.5 break-words w-full"
                  title={t(theme.descKey) || ''}
                >
                  {t(theme.descKey) || ''}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
