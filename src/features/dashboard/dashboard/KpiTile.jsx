import React from 'react';

const TONE_ICON_STYLES = {
  primary: 'bg-primary/12 text-primary border-primary/20',
  violet: 'bg-purple-500/12 text-purple-600 dark:text-purple-400 border-purple-500/20',
  amber: 'bg-amber-500/12 text-amber-600 dark:text-amber-400 border-amber-500/20',
  emerald: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  rose: 'bg-rose-500/12 text-rose-600 dark:text-rose-400 border-rose-500/20',
  neutral: 'bg-surface-container-high text-on-surface-variant border-outline-variant/20',
};

/**
 * Studio KPI summary card with optional icon tile, tone accent, subtext, and click action.
 *
 * @param {{
 *   label: string,
 *   value: React.ReactNode,
 *   subtext?: React.ReactNode,
 *   hint?: React.ReactNode,
 *   tooltip?: string,
 *   icon?: string,
 *   tone?: 'primary' | 'violet' | 'amber' | 'emerald' | 'rose' | 'neutral',
 *   loading?: boolean,
 *   accent?: boolean,
 *   onClick?: () => void,
 * }} props
 */
export default function KpiTile({
  label,
  value,
  subtext,
  hint,
  tooltip,
  icon,
  tone = 'neutral',
  loading = false,
  accent = false,
  onClick,
}) {
  const resolvedSubtext = subtext ?? hint;
  const resolvedTone = accent && tone === 'neutral' ? 'primary' : tone;
  const iconToneClass = TONE_ICON_STYLES[resolvedTone] || TONE_ICON_STYLES.neutral;
  const interactive = typeof onClick === 'function';
  const Tag = interactive ? 'button' : 'div';

  const cardSurfaceClass = accent
    ? 'border-primary/25 bg-primary/5 hover:border-primary/45 hover:bg-primary/10'
    : 'border-outline-variant/20 bg-surface-container-low/60 dark:bg-surface-container-low/30 hover:border-outline-variant/45 hover:bg-surface-container-low/95';

  return (
    <Tag
      type={interactive ? 'button' : undefined}
      onClick={onClick}
      data-tooltip={tooltip || undefined}
      aria-label={interactive && tooltip ? `${label} — ${tooltip}` : undefined}
      className={`group rounded-2xl border p-4 shadow-2xs flex flex-col justify-between gap-2.5 min-w-0 ${cardSurfaceClass}${
        interactive
          ? ' w-full cursor-pointer text-left transition-all active:scale-[0.99]'
          : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2 w-full min-w-0">
        <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant truncate min-w-0">
          {label}
        </span>
        {icon ? (
          <span
            className={`w-7 h-7 rounded-xl border inline-flex items-center justify-center shrink-0 ${iconToneClass}`}
          >
            <span className="material-symbols-outlined text-[16px] leading-none">{icon}</span>
          </span>
        ) : null}
      </div>

      <div className="flex items-baseline gap-1.5 min-w-0">
        {loading ? (
          <div className="h-8 w-20 rounded-lg bg-surface-container-high animate-pulse" />
        ) : (
          <div className="text-2xl sm:text-3xl font-extrabold tabular-nums tracking-tight leading-tight text-on-surface truncate">
            {value}
          </div>
        )}
      </div>

      {resolvedSubtext || interactive ? (
        <div className="flex items-center justify-between gap-1.5 w-full min-w-0">
          <span className="text-xs text-on-surface-variant/80 truncate min-w-0">
            {resolvedSubtext || ''}
          </span>
          {interactive ? (
            <span className="material-symbols-outlined text-[14px] text-on-surface-variant/50 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity shrink-0 leading-none">
              arrow_outward
            </span>
          ) : null}
        </div>
      ) : null}
    </Tag>
  );
}
