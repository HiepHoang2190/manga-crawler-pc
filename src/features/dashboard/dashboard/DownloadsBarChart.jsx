import { useEffect, useRef, useState } from 'react';
import { chartAxisLabel } from '../chartAxisLabels.js';
import { splitIntoWeekPages } from '../chartWeekPages.js';

const PAGE_DOTS_H = 14;

export default function DownloadsBarChart({
  data,
  emptyLabel,
  height = 120,
  formatValue,
  locale = 'vi',
}) {
  const safe = Array.isArray(data) ? data : [];
  const max = safe.reduce((m, d) => Math.max(m, Number(d.count) || 0), 0);
  const fmt = typeof formatValue === 'function' ? formatValue : (n) => String(n);
  const labelH = 16;
  const n = safe.length;
  const paged = n > 7;
  const pages = paged ? splitIntoWeekPages(safe) : [safe];
  const scrollRef = useRef(null);
  const [activePage, setActivePage] = useState(() => Math.max(0, pages.length - 1));
  const chartAreaH = paged ? height - PAGE_DOTS_H : height;
  const chartH = Math.max(80, chartAreaH - labelH);

  useEffect(() => {
    setActivePage(Math.max(0, pages.length - 1));
  }, [pages.length, safe[n - 1]?.dateISO]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!paged || !el) return;

    const scrollToLast = () => {
      el.scrollLeft = el.scrollWidth - el.clientWidth;
      setActivePage(Math.max(0, pages.length - 1));
    };
    scrollToLast();

    const onScroll = () => {
      const w = el.clientWidth || 1;
      const idx = Math.round(el.scrollLeft / w);
      setActivePage(Math.min(Math.max(0, idx), pages.length - 1));
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [paged, pages.length, safe[n - 1]?.dateISO]);

  const scrollToPage = (pageIdx) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: pageIdx * el.clientWidth, behavior: 'smooth' });
    setActivePage(pageIdx);
  };

  if (safe.length === 0 || max === 0) {
    return (
      <div
        className="rounded-md border border-outline-variant/20 bg-surface-container-low/60 flex items-center justify-center text-xs text-on-surface-variant/70"
        style={{ height }}
      >
        {emptyLabel}
      </div>
    );
  }

  const padTop = 8;
  const padBottom = 4;
  const innerH = chartH - padTop - padBottom;

  const chartBody = paged ? (
    <div
      ref={scrollRef}
      className="overflow-x-auto overflow-y-hidden snap-x snap-mandatory flex flex-1 min-h-0 custom-scrollbar"
      style={{ scrollbarGutter: 'stable' }}
    >
      {pages.map((pageData, pageIdx) => (
        <div
          key={`week-page-${pageIdx}-${pageData[0]?.dateISO ?? pageIdx}`}
          className="snap-start shrink-0 w-full min-w-full"
        >
          <WeekPageChart
            pageData={pageData}
            chartH={chartH}
            padTop={padTop}
            innerH={innerH}
            labelH={labelH}
            globalMax={max}
            locale={locale}
            fmt={fmt}
          />
        </div>
      ))}
    </div>
  ) : (
    <WeekPageChart
      pageData={safe}
      chartH={chartH}
      padTop={padTop}
      innerH={innerH}
      labelH={labelH}
      globalMax={max}
      locale={locale}
      fmt={fmt}
    />
  );

  return (
    <div className="relative flex flex-col" style={{ height }}>
      <div className="absolute right-1 top-0 text-[10px] text-on-surface-variant/70 tabular-nums z-10 pointer-events-none">
        max {fmt(max)}
      </div>
      <div className={paged ? 'flex-1 min-h-0 flex flex-col' : undefined}>{chartBody}</div>
      {paged ? (
        <ChartPageDots
          count={pages.length}
          activeIndex={activePage}
          onSelect={scrollToPage}
        />
      ) : null}
    </div>
  );
}

function ChartPageDots({ count, activeIndex, onSelect }) {
  if (count <= 1) return null;
  return (
    <div
      className="flex justify-center items-center gap-1.5 shrink-0"
      style={{ height: PAGE_DOTS_H }}
      role="tablist"
      aria-label="Chart week pages"
    >
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          role="tab"
          aria-selected={i === activeIndex}
          aria-label={`Week ${i + 1}`}
          onClick={() => onSelect(i)}
          className={`h-1.5 rounded-full transition-all ${
            i === activeIndex
              ? 'w-3 bg-primary'
              : 'w-1.5 bg-on-surface-variant/35 hover:bg-on-surface-variant/55'
          }`}
        />
      ))}
    </div>
  );
}

function GridLines({ padTop, innerH, w }) {
  return [0.25, 0.5, 0.75, 1].map((r) => (
    <line
      key={r}
      x1={0}
      x2={w}
      y1={padTop + innerH * (1 - r)}
      y2={padTop + innerH * (1 - r)}
      className="stroke-on-surface-variant/15"
      strokeWidth={0.3}
    />
  ));
}

/** Smooth cubic path through [x,y] points (wave-style line). */
function buildSmoothLinePath(points) {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function WeekPageChart({
  pageData,
  chartH,
  padTop,
  innerH,
  labelH,
  globalMax,
  locale,
  fmt,
}) {
  const n = pageData.length;
  const w = 100;
  const scaleMax = globalMax > 0 ? globalMax : 1;
  const baselineY = padTop + innerH;

  const points = pageData.map((d, i) => {
    const c = Number(d.count) || 0;
    const x = n === 1 ? w / 2 : (i / (n - 1)) * w;
    const y = padTop + innerH - (c / scaleMax) * innerH;
    return { d, i, c, x, y };
  });

  const linePath = buildSmoothLinePath(points);
  const areaPath =
    points.length > 0
      ? `${linePath} L ${points[points.length - 1].x} ${baselineY} L ${points[0].x} ${baselineY} Z`
      : '';

  return (
    <div style={{ height: chartH + labelH }}>
      <svg
        viewBox={`0 0 ${w} ${chartH}`}
        preserveAspectRatio="none"
        className="w-full text-primary block"
        style={{ height: chartH }}
        role="img"
        aria-label="Daily trend line chart"
      >
        <GridLines padTop={padTop} innerH={innerH} w={w} />
        {areaPath ? (
          <path d={areaPath} className="fill-primary/12" stroke="none" />
        ) : null}
        {linePath ? (
          <path
            d={linePath}
            fill="none"
            className="stroke-primary/80"
            strokeWidth={0.65}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        {points.map(({ d, c, x, y }) => (
          <circle
            key={d.dateISO}
            cx={x}
            cy={y}
            r={0.85}
            className="fill-primary stroke-surface-container-low"
            strokeWidth={0.35}
            vectorEffect="non-scaling-stroke"
          >
            <title>{`${d.dateISO}: ${fmt(c)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="flex w-full tabular-nums" style={{ height: labelH }} aria-hidden>
        {pageData.map((d, i) => (
          <div
            key={`axis-${d.dateISO}`}
            className="flex-1 min-w-0 text-center text-[9px] leading-tight text-on-surface-variant/70 truncate px-px"
          >
            {chartAxisLabel(d.dateISO, i, n, locale)}
          </div>
        ))}
      </div>
    </div>
  );
}
