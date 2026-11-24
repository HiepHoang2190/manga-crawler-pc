import React from 'react';

function extractHostname(rawUrl) {
  try {
    return new URL(rawUrl).hostname;
  } catch {
    return rawUrl || '';
  }
}

function formatStepTelemetry(step, t) {
  const { id, status, detail, meta } = step;
  if (status === 'pending') return t('plugins.autoGen.matrix.statusPending');
  if (status === 'skipped') return t('plugins.autoGen.matrix.statusSkipped');
  if (status === 'error') return detail || t('plugins.autoGen.matrix.statusError');

  if (status === 'running') {
    if (id === 'chapter_images' && meta?.subStage === 'cdp-sniffer') {
      return t('plugins.autoGen.matrix.subStageCdp');
    }
    if (id === 'chapter_images' && meta?.subStage === 'ts-reader') {
      return t('plugins.autoGen.matrix.subStageTsReader');
    }
    if (id === 'chapter_images' && meta?.subStage === 'embedded-json') {
      return t('plugins.autoGen.matrix.subStageEmbedded');
    }
    return detail || t('plugins.autoGen.matrix.statusRunning');
  }

  if (id === 'fetch_manga') {
    return meta?.usedChromiumFallback
      ? t('plugins.autoGen.matrix.fetchedChromium')
      : t('plugins.autoGen.matrix.fetchedDirect');
  }
  if (id === 'cms_metadata') {
    return detail || meta?.templateId || t('plugins.autoGen.matrix.statusDone');
  }
  if (id === 'tier1_chapters') {
    if (!meta?.count) return t('plugins.autoGen.matrix.noneFound');
    if (meta?.paginated) {
      return t('plugins.autoGen.matrix.chaptersPaginated', {
        count: meta.count,
        pages: meta.maxPages || 2,
      });
    }
    return t('plugins.autoGen.detectedChapters', { count: meta.count });
  }
  if (id === 'tier2_ssr_json') {
    return meta?.count
      ? `${meta.sourceType || 'SSR'} · ${t('plugins.autoGen.detectedChapters', { count: meta.count })}`
      : t('plugins.autoGen.matrix.statusDone');
  }
  if (id === 'tier3_spa_sniffer') {
    if (!meta?.count) return t('plugins.autoGen.matrix.noneFound');
    const prefix = meta.strategy === 'api-json' ? 'API JSON' : 'SPA DOM';
    return `${prefix} · ${t('plugins.autoGen.detectedChapters', { count: meta.count })}`;
  }
  if (id === 'latest_updates') {
    return meta?.count
      ? t('plugins.autoGen.detectedLatestItems', { count: meta.count })
      : t('plugins.autoGen.matrix.statusSkipped');
  }
  if (id === 'chapter_images') {
    if (!meta?.count) return t('plugins.autoGen.matrix.noneImagesFound');
    const strat =
      meta.strategy === 'api-json'
        ? 'API'
        : meta.strategy === 'embedded-json'
        ? 'SSR'
        : meta.strategy === 'ts-reader'
        ? 'TS'
        : 'HTML';
    return `${strat} · ${t('plugins.autoGen.detectedImages', { count: meta.count })}`;
  }
  if (id === 'build_preview') {
    return t('plugins.autoGen.matrix.statusDone');
  }

  return detail || t('plugins.autoGen.matrix.statusDone');
}

function stepBadgeVisual(status) {
  switch (status) {
    case 'running':
      return {
        card: 'border-primary/45 bg-primary/10 ring-1 ring-primary/25 shadow-2xs',
        iconWrap: 'bg-primary/20 text-primary',
        statusIcon: 'progress_activity',
        spin: true,
        text: 'text-primary font-semibold',
      };
    case 'done':
      return {
        card: 'border-emerald-500/30 bg-emerald-500/8',
        iconWrap: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
        statusIcon: 'check_circle',
        spin: false,
        text: 'text-emerald-700 dark:text-emerald-300',
      };
    case 'warn':
      return {
        card: 'border-amber-500/30 bg-amber-500/8',
        iconWrap: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
        statusIcon: 'horizontal_rule',
        spin: false,
        text: 'text-amber-700 dark:text-amber-300',
      };
    case 'error':
      return {
        card: 'border-error/45 bg-error-container/40',
        iconWrap: 'bg-error/20 text-error',
        statusIcon: 'error',
        spin: false,
        text: 'text-error font-semibold',
      };
    case 'skipped':
      return {
        card: 'border-outline-variant/15 bg-surface-container-highest/35 opacity-65',
        iconWrap: 'bg-surface-container-high text-on-surface-variant',
        statusIcon: 'skip_next',
        spin: false,
        text: 'text-on-surface-variant',
      };
    default:
      return {
        card: 'border-outline-variant/15 bg-surface-container-highest/40 opacity-75',
        iconWrap: 'bg-surface-container-high text-on-surface-variant',
        statusIcon: 'radio_button_unchecked',
        spin: false,
        text: 'text-on-surface-variant',
      };
  }
}

function MatrixBody({ matrix, elapsedMs, t }) {
  const percent = Math.max(0, Math.min(100, Number(matrix?.percent) || 0));
  const activeStepObj = matrix.steps.find((s) => s.id === matrix.activeStep);
  const activeLabel = activeStepObj ? t(activeStepObj.labelKey) : t('plugins.autoGen.analyzing');
  const hasError = matrix.steps.some((s) => s.status === 'error');
  const isFinished = Boolean(matrix.finishedAt);
  const recentLogs = (matrix.logs || []).slice(-3);

  return (
    <div className="space-y-3">
      {/* Header Telemetry Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            {!isFinished && !hasError && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            )}
            <span
              className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                hasError ? 'bg-error' : isFinished ? 'bg-emerald-500' : 'bg-primary'
              }`}
            />
          </span>
          <span className="text-xs font-bold text-on-surface truncate">
            {hasError
              ? t('plugins.autoGen.matrix.headerFailed')
              : isFinished
              ? t('plugins.autoGen.matrix.headerDone')
              : activeLabel}
          </span>
          {matrix.targetUrl ? (
            <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono bg-surface-container-high text-on-surface-variant border border-outline-variant/15 max-w-[14rem] truncate">
              {extractHostname(matrix.targetUrl)}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2.5 shrink-0 font-mono">
          <span className="text-[11px] text-on-surface-variant tabular-nums">
            {(Math.max(0, elapsedMs) / 1000).toFixed(1)}s
          </span>
          <span
            className={`text-xs font-extrabold tabular-nums px-2 py-0.5 rounded-full border ${
              hasError
                ? 'bg-error/10 text-error border-error/25'
                : isFinished
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25'
                : 'bg-primary/15 text-primary border-primary/25'
            }`}
          >
            {percent}%
          </span>
        </div>
      </div>

      {/* Monotonic Progress Bar */}
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('plugins.autoGen.matrix.progressAria')}
        className="w-full h-2 rounded-full bg-surface-container-highest overflow-hidden border border-outline-variant/15"
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ease-out ${
            hasError
              ? 'bg-error'
              : isFinished
              ? 'bg-emerald-500'
              : 'bg-gradient-to-r from-primary via-violet-500 to-cyan-400'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* 8-Cell Diagnostic Matrix Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {matrix.steps.map((step, index) => {
          const vis = stepBadgeVisual(step.status);
          const summary = formatStepTelemetry(step, t);
          return (
            <div
              key={step.id}
              data-step-id={step.id}
              data-step-status={step.status}
              className={`rounded-xl border px-3 py-2 flex items-center gap-2.5 transition-all duration-200 ${vis.card}`}
            >
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${vis.iconWrap}`}>
                <span className="material-symbols-outlined text-[16px]" aria-hidden>
                  {step.icon}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1.5">
                  <span className="text-[11px] font-semibold text-on-surface truncate">
                    <span className="font-mono text-on-surface-variant/65 mr-1">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    {t(step.labelKey)}
                  </span>
                  <span
                    className={`material-symbols-outlined text-[15px] shrink-0 ${vis.text} ${
                      vis.spin ? 'animate-spin' : ''
                    }`}
                    aria-hidden
                  >
                    {vis.statusIcon}
                  </span>
                </div>
                <p className={`text-[10px] truncate mt-0.5 ${vis.text}`}>{summary}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Compact Live Telemetry Log */}
      {recentLogs.length > 0 && (
        <div className="rounded-lg bg-surface-container-highest/70 border border-outline-variant/15 px-3 py-2 space-y-0.5 font-mono text-[10px] text-on-surface-variant">
          {recentLogs.map((entry, idx) => {
            const stepMeta = matrix.steps.find((s) => s.id === entry.step);
            const label = stepMeta ? t(stepMeta.labelKey) : entry.step;
            return (
              <div key={`${entry.step}-${idx}`} className="flex items-center justify-between gap-2 truncate">
                <span className="truncate">
                  <span className="text-primary/80">[{entry.progress}%]</span>{' '}
                  <span className="text-on-surface/90 font-medium">{label}</span>
                  {entry.detail ? <span className="text-on-surface-variant"> — {entry.detail}</span> : null}
                </span>
                <span className="uppercase text-[9px] opacity-70 shrink-0">{entry.status}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * AnalysisProgressMatrix — Live telemetry grid displaying plugin auto-generation progress.
 */
export default function AnalysisProgressMatrix({ matrix, elapsedMs = 0, collapsible = false, t }) {
  if (!matrix) return null;

  if (collapsible) {
    return (
      <details className="group rounded-xl border border-outline-variant/20 bg-surface-container-highest/45 px-3.5 py-2.5">
        <summary className="cursor-pointer flex items-center justify-between gap-2 select-none text-xs font-semibold text-on-surface hover:text-primary transition-colors">
          <span className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-[16px] text-emerald-500">monitoring</span>
            <span className="truncate">{t('plugins.autoGen.matrix.summaryToggle')}</span>
          </span>
          <span className="flex items-center gap-2 font-mono text-[11px] text-on-surface-variant shrink-0">
            <span className="text-emerald-600 dark:text-emerald-400 font-bold">{matrix.percent}%</span>
            <span>· {(Math.max(0, elapsedMs) / 1000).toFixed(1)}s</span>
            <span className="material-symbols-outlined text-[16px] transition-transform group-open:rotate-90">
              chevron_right
            </span>
          </span>
        </summary>
        <div className="mt-3 pt-3 border-t border-outline-variant/15">
          <MatrixBody matrix={matrix} elapsedMs={elapsedMs} t={t} />
        </div>
      </details>
    );
  }

  return (
    <div
      data-testid="analysis-progress-matrix"
      className="rounded-xl border border-outline-variant/20 bg-surface-container-highest/50 p-3.5 sm:p-4"
    >
      <MatrixBody matrix={matrix} elapsedMs={elapsedMs} t={t} />
    </div>
  );
}
