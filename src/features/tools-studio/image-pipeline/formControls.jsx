// src/features/tools-studio/image-pipeline/formControls.jsx
export function SectionLabel({ children }) {
  return <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">{children}</p>;
}

const GRID_COLS = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4' };

export function ModeButtons({ value, options, onChange, disabled = false, cols = 2 }) {
  return (
    <div className={`grid gap-1.5 ${GRID_COLS[cols] || 'grid-cols-2'}`}>
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            data-tooltip={selected ? undefined : opt.tooltip}
            aria-label={opt.label}
            className={`rounded-lg border px-2 py-1.5 text-xs transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
              selected
                ? 'border-primary bg-primary/10 text-primary font-semibold'
                : 'border-outline-variant/25 font-medium text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function NumberField({ label, value, onChange, min, max, step = 1, disabled = false, tooltip }) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-on-surface-variant">
      <span className="min-w-0 truncate flex items-center gap-1">
        <span>{label}</span>
        {tooltip && (
          <span
            className="material-symbols-outlined text-[14px] text-on-surface-variant/50 hover:text-primary transition-colors cursor-help shrink-0"
            data-tooltip={tooltip}
          >
            help
          </span>
        )}
      </span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
        }}
        className="h-8 w-24 shrink-0 rounded-lg border border-outline-variant/25 bg-surface-container-highest px-2 text-right text-xs text-on-surface focus:border-primary focus:outline-none disabled:opacity-50"
      />
    </label>
  );
}
