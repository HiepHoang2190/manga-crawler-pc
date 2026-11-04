import React from 'react';

/**
 * @param {{
 *   label: string,
 *   value: React.ReactNode,
 *   hint?: React.ReactNode,
 *   loading?: boolean,
 *   accent?: boolean,
 *   onClick?: () => void,
 * }} props
 */
export default function KpiTile({ label, value, hint, loading = false, accent = false, onClick }) {
  const base = accent
    ? 'rounded-xl border border-primary/20 bg-primary/5 p-4'
    : 'rounded-xl border border-outline-variant/30 bg-surface-container-low p-4';
  const interactive = typeof onClick === 'function';
  const Tag = interactive ? 'button' : 'div';
  return (
    <Tag
      type={interactive ? 'button' : undefined}
      onClick={onClick}
      className={`${base}${interactive ? ' w-full cursor-pointer text-left transition-colors hover:bg-surface-container' : ''}`}
    >
      <div className="text-[10px] uppercase tracking-wide text-on-surface-variant/80 font-medium">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        {loading ? (
          <div className="h-8 w-16 rounded bg-surface-container-high animate-pulse" />
        ) : (
          <div className="text-3xl font-semibold tabular-nums leading-tight">{value}</div>
        )}
      </div>
      {hint ? (
        <div className="mt-1 text-xs text-on-surface-variant/70">{hint}</div>
      ) : null}
    </Tag>
  );
}
