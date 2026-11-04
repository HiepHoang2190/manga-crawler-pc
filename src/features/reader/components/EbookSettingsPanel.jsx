import { useI18n } from '../../../context/I18nContext';

const FONT_FAMILIES = ['serif', 'sans-serif', 'monospace'];
const THEMES = ['light', 'dark', 'sepia'];

function ToggleGroup({ options, value, onChange, labelFn }) {
  return (
    <div className="flex gap-1 flex-wrap">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={[
            'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
            value === opt
              ? 'bg-primary text-on-primary'
              : 'bg-surface-variant text-on-surface-variant hover:bg-surface-variant/80',
          ].join(' ')}
        >
          {labelFn(opt)}
        </button>
      ))}
    </div>
  );
}

function RangeRow({ label, value, min, max, step, onChange, display }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-sm text-on-surface-variant">{label}</span>
        <span className="text-sm font-medium text-on-surface tabular-nums">{display ?? value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
      />
    </div>
  );
}

/**
 * @param {{ prefs: import('../utils/ebookPrefs').ReaderPreferences, onPrefsChange: (partial: object) => void, onClose: () => void }} props
 */
export default function EbookSettingsPanel({ prefs, onPrefsChange, onClose }) {
  const { t } = useI18n();

  const fontFamilyLabel = (f) => {
    if (f === 'serif') return t('ebook.fontSerif');
    if (f === 'sans-serif') return t('ebook.fontSansSerif');
    return t('ebook.fontMonospace');
  };

  const themeLabel = (th) => {
    if (th === 'light') return t('ebook.themeLight');
    if (th === 'dark') return t('ebook.themeDark');
    return t('ebook.themeSepia');
  };

  return (
    /* Overlay backdrop */
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Panel */}
      <div className="w-full sm:w-96 max-h-[90dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-surface text-on-surface shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/20 shrink-0">
          <h2 className="text-base font-semibold">{t('ebook.settingsPanelTitle')}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('ebook.close')}
            className="material-symbols-outlined text-[22px] text-on-surface-variant hover:text-on-surface transition-colors"
          >
            close
          </button>
        </div>

        {/* Controls */}
        <div className="px-5 py-4 space-y-5">
          {/* Font size */}
          <RangeRow
            label={t('ebook.fontSize')}
            value={prefs.fontSize}
            min={12}
            max={32}
            step={2}
            onChange={(v) => onPrefsChange({ fontSize: v })}
            display={`${prefs.fontSize}px`}
          />

          {/* Font family */}
          <div className="space-y-2">
            <span className="text-sm text-on-surface-variant">{t('ebook.fontFamily')}</span>
            <ToggleGroup
              options={FONT_FAMILIES}
              value={prefs.fontFamily}
              onChange={(v) => onPrefsChange({ fontFamily: v })}
              labelFn={fontFamilyLabel}
            />
          </div>

          {/* Line height */}
          <RangeRow
            label={t('ebook.lineHeight')}
            value={prefs.lineHeight}
            min={1.2}
            max={2.4}
            step={0.2}
            onChange={(v) => onPrefsChange({ lineHeight: v })}
            display={prefs.lineHeight.toFixed(1)}
          />

          {/* Margin percent */}
          <RangeRow
            label={t('ebook.margins')}
            value={prefs.marginPercent}
            min={0}
            max={20}
            step={4}
            onChange={(v) => onPrefsChange({ marginPercent: v })}
            display={`${prefs.marginPercent}%`}
          />

          {/* Theme */}
          <div className="space-y-2">
            <span className="text-sm text-on-surface-variant">{t('settings.theme')}</span>
            <ToggleGroup
              options={THEMES}
              value={prefs.theme}
              onChange={(v) => onPrefsChange({ theme: v })}
              labelFn={themeLabel}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
