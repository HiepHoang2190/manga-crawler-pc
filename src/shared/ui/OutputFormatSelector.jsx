import React from 'react';
import { useI18n } from '../../context/I18nContext';

export const OUTPUT_FORMATS = [
  { value: 'original', labelKey: 'outputFormat.original', defaultLabel: 'Giữ gốc' },
  { value: 'jpg', labelKey: 'outputFormat.jpg', defaultLabel: 'JPG' },
  { value: 'png', labelKey: 'outputFormat.png', defaultLabel: 'PNG' },
  { value: 'webp', labelKey: 'outputFormat.webp', defaultLabel: 'WebP' },
];

export default function OutputFormatSelector({
  value = 'original',
  onChange,
  disabled = false,
  title,
  formats = OUTPUT_FORMATS,
  className = '',
}) {
  const { t } = useI18n();
  const headingText = title ?? t('outputFormat.heading') ?? 'Định dạng đầu ra';

  return (
    <div className={`space-y-2 ${className}`.trim()}>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">
        {headingText}
      </p>
      <div className="grid grid-cols-4 gap-2">
        {formats.map((fmt) => {
          const selected = value === fmt.value;
          const label = t(fmt.labelKey) || fmt.defaultLabel || fmt.value.toUpperCase();
          return (
            <button
              key={fmt.value}
              type="button"
              onClick={() => onChange?.(fmt.value)}
              disabled={disabled}
              className={[
                'cursor-pointer rounded-lg border h-8 flex items-center justify-center px-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 text-center truncate select-none',
                selected
                  ? 'border-primary bg-primary/10 text-primary font-semibold shadow-xs'
                  : 'border-outline-variant/20 bg-surface-container-high text-on-surface-variant hover:border-primary/40 hover:text-on-surface',
              ].join(' ')}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
