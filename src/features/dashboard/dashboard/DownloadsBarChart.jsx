import { useEffect, useId, useRef, useState } from 'react';
import { chartAxisLabel } from '../chartAxisLabels.js';
import { splitIntoWeekPages } from '../chartWeekPages.js';

const PAGE_DOTS_H = 16;

export default function DownloadsBarChart({
  data,
  emptyLabel,
  height = 148,
  formatValue,
  locale = 'vi',
  peakLabel,
  chartAriaLabel,
  weekPagesAria = 'Select chart week',
  weekPageLabel = (n) => `Week ${n}`,
}) {
  const safe = Array.isArray(data) ? data : [];
  const max = safe.reduce((m, d) => Math.max(m, Number(d.count) || 0), 0);
  const hasChartData = safe.length > 0 && max > 0;
  const fmt = typeof formatValue === 'function' ? formatValue : (n) => String(n);
  const rawGradId = useId();
  const gradId = `dash-wave-${rawGradId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const labelH = 18;
  const n = safe.length;
  const paged = n > 7;
  const pages = paged ? splitIntoWeekPages(safe) : [safe];
  const scrollRef = useRef(null);
  const [activePage, setActivePage] = useState(() => Math.max(0, pages.length - 1));
  const [hoverInfo, setHoverInfo] = useState(null); // { pageIdx, idx, dateISO, value }

  const chartAreaH = paged ? height - PAGE_DOTS_H - 6 : height;
  const chartH = Math.max(84, chartAreaH - labelH);

  useEffect(() => {
    setActivePage(Math.max(0, pages.length - 1));
    setHoverInfo(null);
  }, [pages.length, safe[n - 1]?.dateISO]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!paged || !hasChartData || !el) return;

    const scrollToLast = () => {
      el.scrollLeft = el.scrollWidth - el.clientWidth;
      setActivePage(Math.max(0, pages.length - 1));
    };
    scrollToLast();

    const onScroll = () => {
      const w = el.clientWidth || 1;
      const idx = Math.round(el.scrollLeft / w);
      setActivePage(Math.min(Math.max(0, idx), pages.length - 1));
      setHoverInfo(null);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [paged, hasChartData, pages.length, safe[n - 1]?.dateISO]);

  const scrollToPage = (pageIdx) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: pageIdx * el.clientWidth, behavior: 'smooth' });
    setActivePage(pageIdx);
    setHoverInfo(null);
  };

  if (!hasChartData) {
    return (
      <div
        className="rounded-xl border border-dashed border-outline-variant/25 bg-surface-container-lowest/50 flex flex-col items-center justify-center gap-1.5 text-xs text-on-surface-variant/70 px-4 text-center"
        style={{ height }}
      >
        <span className="material-symbols-outlined text-[24px] text-on-surface-variant/40">
          show_chart
        </span>
        <span>{emptyLabel}</span>
      </div>
    );
  }

  const padTop = 10;
  const padBottom = 6;
  const innerH = chartH - padTop - padBottom;

  const badgeText = hoverInfo
    ? `${chartAxisLabel(hoverInfo.dateISO, hoverInfo.idx, pages[hoverInfo.pageIdx]?.length || 7, locale) || hoverInfo.dateISO}: ${fmt(hoverInfo.value)}`
    : peakLabel || `max ${fmt(max)}`;

  const chartBody = paged ? (
    <div
      ref={scrollRef}
      className="overflow-x-auto overflow-y-hidden snap-x snap-mandatory flex flex-1 min-h-0 custom-scrollbar"
      style={{ scrollbarGutter: 'stable' }}
      onMouseLeave={() => setHoverInfo(null)}
    >
      {pages.map((pageData, pageIdx) => (
        <div
          key={`week-page-${pageIdx}-${pageData[0]?.dateISO ?? pageIdx}`}
          className="snap-start shrink-0 w-full min-w-full"
        >
          <WeekPageChart
            pageData={pageData}
            pageIdx={pageIdx}
            chartH={chartH}
            padTop={padTop}
            innerH={innerH}
            labelH={labelH}
            globalMax={max}
            locale={locale}
            gradId={`${gradId}-p${pageIdx}`}
            chartAriaLabel={chartAriaLabel}
            hoverInfo={hoverInfo}
            onHoverPoint={(idx, dateISO, value) =>
              setHoverInfo({ pageIdx, idx, dateISO, value })
            }
          />
        </div>
      ))}
    </div>
  ) : (
    <div onMouseLeave={() => setHoverInfo(null)}>
      <WeekPageChart
        pageData={safe}
        pageIdx={0}
        chartH={chartH}
        padTop={padTop}
        innerH={innerH}
        labelH={labelH}
        globalMax={max}
        locale={locale}
        gradId={`${gradId}-p0`}
        chartAriaLabel={chartAriaLabel}
        hoverInfo={hoverInfo}
        onHoverPoint={(idx, dateISO, value) =>
          setHoverInfo({ pageIdx: 0, idx, dateISO, value })
        }
      />
    </div>
  );

  return (
    <div className="relative flex flex-col" style={{ height }}>
      <div
        className={`absolute right-1 top-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium tabular-nums z-10 pointer-events-none transition-colors ${
          hoverInfo
            ? 'bg-primary/15 text-primary border border-primary/25'
            : 'text-on-surface-variant/75 bg-surface-container-low/80'
        }`}
      >
        {badgeText}
      </div>
      <div className={paged ? 'flex-1 min-h-0 flex flex-col' : undefined}>{chartBody}</div>
      {paged ? (
        <ChartPageDots
          count={pages.length}
          activeIndex={activePage}
          onSelect={scrollToPage}
          ariaLabel={weekPagesAria}
          weekPageLabel={weekPageLabel}
        />
      ) : null}
    </div>
  );
}

function ChartPageDots({ count, activeIndex, onSelect, ariaLabel, weekPageLabel }) {
  if (count <= 1) return null;
  return (
    <div
      className="flex justify-center items-center gap-1.5 shrink-0 pt-1"
      style={{ height: PAGE_DOTS_H }}
      role="group"
      aria-label={ariaLabel}
    >
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          aria-pressed={i === activeIndex}
          aria-label={typeof weekPageLabel === 'function' ? weekPageLabel(i + 1) : `Week ${i + 1}`}
          onClick={() => onSelect(i)}
          className={`h-1.5 rounded-full transition-all cursor-pointer ${
            i === activeIndex
              ? 'w-4 bg-primary'
              : 'w-1.5 bg-on-surface-variant/30 hover:bg-on-surface-variant/55'
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
      strokeWidth={0.5}
      strokeDasharray="1.5 1.5"
      vectorEffect="non-scaling-stroke"
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
  pageIdx,
  chartH,
  padTop,
  innerH,
  labelH,
  globalMax,
  locale,
  gradId,
  chartAriaLabel,
  hoverInfo,
  onHoverPoint,
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

  const hoveredPoint =
    hoverInfo && hoverInfo.pageIdx === pageIdx ? points[hoverInfo.idx] : null;

  return (
    <div className="px-1.5" style={{ height: chartH + labelH }}>
      <div className="relative w-full" style={{ height: chartH }}>
        <svg
          viewBox={`0 0 ${w} ${chartH}`}
          preserveAspectRatio="none"
          className="w-full h-full text-primary block overflow-visible"
          role="img"
          aria-label={chartAriaLabel || undefined}
          aria-hidden={!chartAriaLabel ? true : undefined}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.24" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0.01" />
            </linearGradient>
          </defs>
          <GridLines padTop={padTop} innerH={innerH} w={w} />
          {areaPath ? <path d={areaPath} fill={`url(#${gradId})`} stroke="none" /> : null}
          {linePath ? (
            <path
              d={linePath}
              fill="none"
              className="stroke-primary"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </svg>

        {/* Crisp non-distorted HTML indicator for hovered day */}
        {hoveredPoint ? (
          <div
            className="pointer-events-none absolute top-0 bottom-0 -translate-x-1/2"
            style={{ left: `${hoveredPoint.x}%` }}
          >
            <div className="h-full w-px bg-primary/35 mx-auto" />
            <span
              className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-primary ring-2 ring-surface-container-lowest shadow-xs"
              style={{ top: `${hoveredPoint.y}px` }}
            />
          </div>
        ) : null}

        {/* Interactive invisible hover hit zones */}
        <div
          className="absolute inset-0 grid"
          style={{ gridTemplateColumns: `repeat(${Math.max(1, n)}, minmax(0, 1fr))` }}
        >
          {points.map(({ d, i, c }) => (
            <div
              key={d.dateISO}
              onMouseEnter={() => onHoverPoint(i, d.dateISO, c)}
              className="h-full cursor-crosshair"
            />
          ))}
        </div>
      </div>

      <div className="flex w-full tabular-nums" style={{ height: labelH }} aria-hidden>
        {pageData.map((d, i) => (
          <div
            key={`axis-${d.dateISO}`}
            className={`flex-1 min-w-0 text-center text-[10px] leading-tight truncate px-px transition-colors ${
              hoverInfo && hoverInfo.pageIdx === pageIdx && hoverInfo.idx === i
                ? 'text-primary font-semibold'
                : 'text-on-surface-variant/70'
            }`}
          >
            {chartAxisLabel(d.dateISO, i, n, locale)}
          </div>
        ))}
      </div>
    </div>
  );
}
