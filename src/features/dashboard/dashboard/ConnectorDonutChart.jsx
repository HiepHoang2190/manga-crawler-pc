import React from 'react';

const PALETTE = ['#3b82f6', '#a855f7', '#ec4899', '#f97316', '#22c55e', '#94a3b8'];

function polar(cx, cy, r, angleRad) {
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function arcPath(cx, cy, rOuter, rInner, startAngle, endAngle) {
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  const p1 = polar(cx, cy, rOuter, startAngle);
  const p2 = polar(cx, cy, rOuter, endAngle);
  const p3 = polar(cx, cy, rInner, endAngle);
  const p4 = polar(cx, cy, rInner, startAngle);
  return [
    `M ${p1.x} ${p1.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${p2.x} ${p2.y}`,
    `L ${p3.x} ${p3.y}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${p4.x} ${p4.y}`,
    'Z',
  ].join(' ');
}

export default function ConnectorDonutChart({ data, centerLabel, emptyLabel, othersLabel }) {
  const items = Array.isArray(data?.items) ? data.items : [];
  const others = data?.others || null;
  const total = Number(data?.total) || 0;

  if (total === 0 || items.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-xs text-on-surface-variant/70">
        {emptyLabel}
      </div>
    );
  }

  const segments = others
    ? [...items, { siteId: '__others__', name: othersLabel || 'Others', mangas: others.mangas, pct: others.pct }]
    : items;
  const cx = 60, cy = 60, rOuter = 55, rInner = 38;
  let angle = -Math.PI / 2;
  const paths = segments.map((seg, i) => {
    const span = (Number(seg.pct) || 0) * 2 * Math.PI;
    const start = angle;
    const end = angle + span;
    angle = end;
    const color = PALETTE[i % PALETTE.length];
    return { d: arcPath(cx, cy, rOuter, rInner, start, end - 0.005), color, seg };
  });

  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0" style={{ width: 120, height: 120 }}>
        <svg viewBox="0 0 120 120" width={120} height={120}>
          {paths.map((p) => (
            <path key={p.seg.siteId} d={p.d} fill={p.color}>
              <title>{`${p.seg.name}: ${p.seg.mangas}`}</title>
            </path>
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="text-2xl font-semibold tabular-nums leading-tight">{total}</div>
          <div className="text-[10px] uppercase tracking-wide text-on-surface-variant/70">{centerLabel}</div>
        </div>
      </div>
      <ul className="flex-1 min-w-0 space-y-1 text-xs">
        {paths.map((p) => (
          <li key={p.seg.siteId} className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: p.color }} />
            <span className="flex-1 truncate">{p.seg.name}</span>
            <span className="tabular-nums text-on-surface-variant/70">{p.seg.mangas}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
