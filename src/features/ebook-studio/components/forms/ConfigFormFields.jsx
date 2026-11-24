import { useState, useEffect } from 'react';
import { useI18n } from '../../../../context/I18nContext';

/**
 * Compact single-line chip selector for packaging output modes.
 */
export function PackagingModeSelector({ modes = [], value, onChange, disabled = false, description }) {
  const colsClass = modes.length === 3 ? 'grid-cols-3' : 'grid-cols-2';
  return (
    <div className="space-y-1.5">
      <div className={`grid ${colsClass} gap-1.5`}>
        {modes.map((mode) => {
          const isSelected = value === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(mode.id)}
              aria-pressed={isSelected}
              className={`h-9 rounded-xl border px-2 flex items-center justify-center text-xs transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 active:scale-95 select-none truncate ${
                isSelected
                  ? 'border-primary bg-primary/10 text-primary font-semibold shadow-2xs'
                  : 'border-outline-variant/25 bg-surface-container-high/50 font-medium text-on-surface-variant hover:border-primary/40 hover:bg-surface-container-high hover:text-on-surface'
              }`}
            >
              <span className="truncate">{mode.title}</span>
            </button>
          );
        })}
      </div>
      {description && (
        <p className="text-[11px] text-on-surface-variant/75 leading-relaxed">
          {description}
        </p>
      )}
    </div>
  );
}

/**
 * Clamped MB-per-file numeric input with draft editing so users can clear & retype without mid-keystroke reset.
 */
export function MaxMbLimitInput({
  id,
  label,
  value,
  onChange,
  disabled = false,
  min = 10,
  max = 2048,
  inputWidthClass = 'w-24',
}) {
  const [draft, setDraft] = useState(String(value ?? 200));

  useEffect(() => {
    setDraft(String(value ?? 200));
  }, [value]);

  const clampMb = (raw) => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return 200;
    return Math.min(max, Math.max(min, Math.round(parsed)));
  };

  return (
    <div className="flex items-center justify-between gap-2 pt-1">
      <label htmlFor={id} className="text-xs font-medium text-on-surface-variant">
        {label}
      </label>
      <div className="flex items-center gap-1.5 shrink-0">
        <input
          id={id}
          type="number"
          min={min}
          max={max}
          value={draft}
          onChange={(e) => {
            const raw = e.target.value;
            setDraft(raw);
            if (raw.trim() === '') return;
            const parsed = Number(raw);
            if (Number.isFinite(parsed) && parsed >= min && parsed <= max) {
              onChange(Math.round(parsed));
            }
          }}
          onBlur={() => {
            const clamped = clampMb(draft);
            setDraft(String(clamped));
            if (clamped !== value) {
              onChange(clamped);
            }
          }}
          disabled={disabled}
          className={`h-10 ${inputWidthClass} rounded-xl border border-outline-variant/25 bg-surface-container-highest px-3 text-xs sm:text-sm text-right font-mono text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50`}
        />
        <span className="text-xs font-medium text-on-surface-variant">MB / file</span>
      </div>
    </div>
  );
}

/**
 * Shared auto-rotate double-page checkbox & description across Packaging forms and Converter.
 */
export function RotateDoublePageOption({ checked, onChange, disabled = false, bordered = true, topSpacingClass = 'pt-2.5' }) {
  const { t } = useI18n();
  return (
    <div className={`space-y-0.5 ${bordered ? `${topSpacingClass} border-t border-outline-variant/15` : ''}`.trim()}>
      <label className="flex cursor-pointer items-center gap-2 text-xs text-on-surface hover:text-primary transition-colors select-none">
        <input
          type="checkbox"
          checked={Boolean(checked)}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="rounded accent-primary"
        />
        <span className="font-medium">
          {t('ebookStudio.packaging.rotateDoublePage', 'Tự động xoay trang đôi theo chiều ngang')}
        </span>
      </label>
      <p className="text-[11px] text-on-surface-variant/65 pl-5 leading-normal">
        {t(
          'ebookStudio.packaging.rotateDoublePageDesc',
          'Tự động nhận diện trang đôi (tỷ lệ rộng/cao ≥ 1.2) và xoay ngang 90° tối ưu khi đọc truyện.'
        )}
      </p>
    </div>
  );
}
