const COLOR_GREEN = 'var(--color-primary, #2e7d32)';
const COLOR_AMBER = '#d97706';
const COLOR_RED = '#c62828';

export default function GuestCreditBadge({ remaining = 0, max = 100 }) {
  const pct = max > 0 ? Math.round((remaining / max) * 100) : 0;
  let barColor = COLOR_GREEN;
  if (remaining <= 5) barColor = COLOR_RED;
  else if (remaining <= 20) barColor = COLOR_AMBER;

  return (
    <div
      className="flex flex-col gap-0.5 min-w-[4.5rem] max-w-[6rem] px-2 py-1 rounded-lg bg-surface-container-high/90 border border-outline-variant/25"
      data-tooltip={`${remaining} / ${max}`}
    >
      <div className="flex items-center gap-1 text-xs font-semibold tabular-nums text-on-surface leading-none">
        <span aria-hidden>⚡</span>
        <span>{remaining}</span>
      </div>
      <div className="h-1 w-full rounded-full bg-surface-container-highest overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${pct}%`, backgroundColor: barColor }}
        />
      </div>
    </div>
  );
}
