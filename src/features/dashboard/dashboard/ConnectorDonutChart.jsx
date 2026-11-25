import React, { useState } from 'react';

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
  const [hoveredId, setHoveredId] = useState(null);
  const items = Array.isArray(data?.items) ? data.items : [];
  const others = data?.others || null;
  const total = Number(data?.total) || 0;

  if (total <= 0 || items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-outline-variant/25 bg-surface-container-lowest/50 flex flex-col items-center justify-center gap-1.5 h-36 text-xs text-on-surface-variant/70">
        <span className="material-symbols-outlined text-[24px] text-on-surface-variant/40">
          donut_large
        </span>
        <span>{emptyLabel}</span>
      </div>
    );
  }

  const segments = others
    ? [
        ...items,
        {
          siteId: '__others__',
          name: othersLabel || 'Others',
          mangas: others.mangas,
          pct: others.pct,
        },
      ]
    : items;

  const cx = 64;
  const cy = 64;
  const rOuter = 56;
  const rInner = 39;
  let angle = -Math.PI / 2;

  const paths = segments.map((seg, i) => {
    const pctNum = Math.max(0, Number(seg.pct) || 0);
    const span = pctNum * 2 * Math.PI;
    const start = angle;
    const end = angle + span;
    angle = end;
    const color = PALETTE[i % PALETTE.length];
    const safeEnd = span > 0.008 ? end - 0.008 : end;
    return {
      d: span > 0 ? arcPath(cx, cy, rOuter, rInner, start, safeEnd) : '',
      color,
      seg,
      percent: Math.round(pctNum * 100),
    };
  });

  const activeSeg = hoveredId ? paths.find((p) => p.seg.siteId === hoveredId) : null;

  return (
    <div
      className="flex flex-col sm:flex-row sm:items-center gap-4"
      onMouseLeave={() => setHoveredId(null)}
    >
      <div className="relative shrink-0 mx-auto sm:mx-0" style={{ width: 128, height: 128 }}>
        <svg viewBox="0 0 128 128" width={128} height={128}>
          {paths.length === 1 ? (
            <circle
              cx={cx}
              cy={cy}
              r={(rOuter + rInner) / 2}
              fill="none"
              stroke={paths[0].color}
              strokeWidth={rOuter - rInner}
              className="cursor-pointer transition-opacity duration-150"
              onMouseEnter={() => setHoveredId(paths[0].seg.siteId)}
            />
          ) : (
            paths.map((p) => {
              if (!p.d) return null;
              const dimmed = Boolean(hoveredId && hoveredId !== p.seg.siteId);
              return (
                <path
                  key={p.seg.siteId}
                  d={p.d}
                  fill={p.color}
                  className={`cursor-pointer transition-opacity duration-150 ${
                    dimmed ? 'opacity-30' : 'opacity-100'
                  }`}
                  onMouseEnter={() => setHoveredId(p.seg.siteId)}
                />
              );
            })
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-3 text-center">
          <div className="text-2xl font-extrabold tabular-nums leading-tight text-on-surface">
            {activeSeg ? activeSeg.seg.mangas : total}
          </div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant/75 truncate max-w-full">
            {activeSeg ? `${activeSeg.percent}%` : centerLabel}
          </div>
        </div>
      </div>

      <ul className="flex-1 min-w-0 space-y-1 text-xs">
        {paths.map((p) => {
          const isActive = hoveredId === p.seg.siteId;
          return (
            <li
              key={p.seg.siteId}
              onMouseEnter={() => setHoveredId(p.seg.siteId)}
              className={`flex items-center gap-2 rounded-lg px-2 py-1 transition-colors cursor-default ${
                isActive ? 'bg-surface-container-high text-on-surface' : 'text-on-surface-variant'
              }`}
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
                style={{ backgroundColor: p.color }}
              />
              <span className="flex-1 min-w-0 truncate font-medium text-on-surface">
                {p.seg.name}
              </span>
              <span className="tabular-nums font-semibold text-on-surface shrink-0">
                {p.seg.mangas}
              </span>
              <span className="tabular-nums text-[10px] text-on-surface-variant/75 w-8 text-right shrink-0">
                {p.percent}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
