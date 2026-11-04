import React from 'react';

/**
 * Segmented 7 / 30 day filter for dashboard trend charts.
 * @param {{ value: 7|30, onChange: (n: 7|30) => void, label7: string, label30: string }} props
 */
export default function TrendDaysFilter({ value, onChange, label7, label30 }) {
  const base =
    'px-2.5 py-0.5 rounded-md text-[10px] font-medium uppercase tracking-wide transition-colors';
  const active = 'bg-primary/15 text-primary';
  const idle = 'text-on-surface-variant/70 hover:text-on-surface-variant hover:bg-surface-container';
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-outline-variant/25 bg-surface-container-low p-0.5">
      <button
        type="button"
        className={`${base} ${value === 7 ? active : idle}`}
        onClick={() => onChange(7)}
        aria-pressed={value === 7}
      >
        {label7}
      </button>
      <button
        type="button"
        className={`${base} ${value === 30 ? active : idle}`}
        onClick={() => onChange(30)}
        aria-pressed={value === 30}
      >
        {label30}
      </button>
    </div>
  );
}
