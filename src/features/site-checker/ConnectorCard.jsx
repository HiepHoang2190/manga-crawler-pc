import React, { useState, useEffect } from 'react';

function formatFileSize(bytes) {
  if (!bytes || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getAccentBarClass(isChecking, isQueued, isSuccess, isFailed) {
  if (isChecking) return 'bg-primary animate-pulse';
  if (isQueued) return 'bg-outline-variant/60 animate-pulse';
  if (isSuccess) return 'bg-emerald-500/80';
  if (isFailed) return 'bg-error/80';
  return 'bg-outline-variant/25';
}

function renderPreconditionBadges(connector) {
  return (
    <>
      {connector.requiresVpn && (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/15 uppercase tracking-wider shrink-0">
          VPN
        </span>
      )}
      {connector.suggestsVpn && (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-500/10 text-yellow-700 dark:text-yellow-300 border border-yellow-500/15 uppercase tracking-wider shrink-0">
          VPN
        </span>
      )}
      {connector.requiresCookie && (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border border-cyan-500/15 uppercase tracking-wider shrink-0">
          Cookie
        </span>
      )}
      {connector.isJsPlugin && (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/15 uppercase tracking-wider shrink-0">
          Plugin
        </span>
      )}
    </>
  );
}

/**
 * Presentation card/row for a site connector inside SiteCheckerPanel.
 * Supports both `grid` and `list` view modes with expandable deep-test diagnostics.
 */
export default function ConnectorCard({
  connector,
  result,
  displayDomain,
  viewMode = 'grid',
  isHighlighted = false,
  isExpanded = false,
  onToggleExpand,
  isRunningBatch = false,
  isExtractBusy = false,
  copiedUrl = null,
  isErrorCopied = false,
  onOpenDomain,
  onExtractCookie,
  onStartSingleTest,
  onCancelSingleTest,
  onCopyUrl,
  onCopyError,
  onOpenExternal,
  cardRef,
  t,
}) {
  const [iconError, setIconError] = useState(false);

  useEffect(() => {
    setIconError(false);
  }, [connector.icon]);

  const res = result || { status: 'not-tested' };
  const isChecking = res.checking === true || res.status === 'testing';
  const isQueued = res.queued === true && !isChecking;
  const isSuccess = res.status === 'success' && !isChecking && !isQueued;
  const isFailed = res.status === 'failed' && !isChecking && !isQueued;
  const hasDetails = Boolean((isSuccess || isFailed) && (res.steps || res.error));
  const cleanDomain = String(displayDomain || '')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
  const accentClass = getAccentBarClass(isChecking, isQueued, isSuccess, isFailed);
  const isList = viewMode === 'list';

  const renderIcon = (sizeClass) =>
    connector.icon && !iconError ? (
      <img
        src={connector.icon}
        alt={connector.label}
        onError={() => setIconError(true)}
        className={`${sizeClass} rounded-xl object-contain bg-surface-container-highest border border-outline-variant/20 p-1 shrink-0`}
      />
    ) : (
      <div
        className={`${sizeClass} rounded-xl bg-surface-container-high flex items-center justify-center border border-outline-variant/20 shrink-0`}
      >
        <span className="material-symbols-outlined text-[19px] text-on-surface-variant/55">
          public
        </span>
      </div>
    );

  const renderStatusBadge = () => {
    if (isSuccess) {
      if (!hasDetails) {
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>{t('siteChecker.status.success')}</span>
            {res.rtt !== undefined && (
              <span className="ml-0.5 text-[10px] opacity-80 tabular-nums">({res.rtt}ms)</span>
            )}
          </span>
        );
      }
      return (
        <button
          type="button"
          onClick={() => onToggleExpand(connector.id)}
          aria-expanded={isExpanded}
          data-tooltip={
            isExpanded ? t('siteChecker.deepTest.collapse') : t('siteChecker.deepTest.expand')
          }
          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/15 cursor-pointer transition-colors shrink-0"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span>{t('siteChecker.status.success')}</span>
          {res.rtt !== undefined && (
            <span className="ml-0.5 text-[10px] opacity-80 tabular-nums">({res.rtt}ms)</span>
          )}
          <span className="material-symbols-outlined text-[12px] leading-none">
            {isExpanded ? 'expand_less' : 'expand_more'}
          </span>
        </button>
      );
    }

    if (isFailed) {
      if (!hasDetails) {
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-error/10 text-error border border-error/20 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-error" />
            <span>{t('siteChecker.status.failed')}</span>
          </span>
        );
      }
      return (
        <button
          type="button"
          onClick={() => onToggleExpand(connector.id)}
          aria-expanded={isExpanded}
          data-tooltip={
            isExpanded ? t('siteChecker.deepTest.collapse') : t('siteChecker.deepTest.expand')
          }
          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-error/10 text-error border border-error/20 hover:bg-error/15 cursor-pointer text-left transition-colors shrink-0"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-error" />
          <span>{t('siteChecker.status.failed')}</span>
          <span className="material-symbols-outlined text-[12px] leading-none">
            {isExpanded ? 'expand_less' : 'expand_more'}
          </span>
        </button>
      );
    }

    if (isChecking) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
          <span>{t('siteChecker.status.testing')}</span>
        </span>
      );
    }

    if (isQueued) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-surface-container-high text-on-surface-variant/80 border border-outline-variant/20 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-outline-variant animate-pulse" />
          <span>{t('siteChecker.status.queued')}</span>
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-surface-container-high text-on-surface-variant/75 border border-outline-variant/20 shrink-0">
        {t('siteChecker.status.notTested')}
      </span>
    );
  };

  const renderStepDots = (extraClass = '') => {
    if (!((isSuccess || isFailed || isChecking) && res.steps && !res.steps.custom)) {
      return null;
    }
    return (
      <div className={`inline-flex items-center gap-1 ${extraClass}`}>
        {['listing', 'chapters', 'download'].map((stepKey, index, arr) => {
          const step = res.steps[stepKey];
          const passed = step && step.ok;
          const failed = step && step.ok === false;
          const prevStepFinished = index === 0 || Boolean(res.steps[arr[index - 1]]);
          const isRunningStep = isChecking && !step && prevStepFinished;

          const tipKey = `siteChecker.step.${stepKey}.tip`;
          const labelKey = `siteChecker.step.${stepKey}`;
          return (
            <button
              key={stepKey}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand(connector.id);
              }}
              aria-label={t(labelKey)}
              data-tooltip={`${t(labelKey)}: ${
                passed ? '✓' : failed ? '✗' : isRunningStep ? '...' : '—'
              }${step?.durationMs ? ` (${step.durationMs}ms)` : ''}\n${t(tipKey)}`}
              className={`w-2.5 h-2.5 rounded-full border transition-all cursor-pointer shrink-0 ${
                passed
                  ? 'bg-emerald-500 border-emerald-500/30'
                  : failed
                  ? 'bg-error border-error/30'
                  : isRunningStep
                  ? 'bg-primary animate-pulse border-primary/30'
                  : 'bg-surface-container-highest border-outline-variant/30'
              }`}
            />
          );
        })}
      </div>
    );
  };

  const renderActionButtons = () => (
    <div className="flex items-center gap-1.5 shrink-0">
      {isList && hasDetails && (
        <button
          type="button"
          onClick={() => onToggleExpand(connector.id)}
          aria-expanded={isExpanded}
          data-tooltip={
            isExpanded ? t('siteChecker.deepTest.collapse') : t('siteChecker.deepTest.expand')
          }
          aria-label={
            isExpanded ? t('siteChecker.deepTest.collapse') : t('siteChecker.deepTest.expand')
          }
          className="w-8 h-8 rounded-lg inline-flex items-center justify-center bg-surface-container-high text-on-surface-variant hover:text-on-surface hover:bg-surface-bright border border-outline-variant/20 transition-all active:scale-95 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[16px]">
            {isExpanded ? 'expand_less' : 'analytics'}
          </span>
        </button>
      )}

      {isFailed && onCopyError && (
        <button
          type="button"
          onClick={() => onCopyError(connector, res, displayDomain)}
          className={`w-8 h-8 rounded-lg inline-flex items-center justify-center border transition-all active:scale-95 cursor-pointer ${
            isErrorCopied
              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
              : 'bg-error/10 text-error hover:bg-error/20 border-error/25'
          }`}
          data-tooltip={
            isErrorCopied ? t('siteChecker.copiedError') : t('siteChecker.copyErrorTooltip')
          }
          aria-label={
            isErrorCopied ? t('siteChecker.copiedError') : t('siteChecker.copyErrorTooltip')
          }
        >
          <span className="material-symbols-outlined text-[16px]">
            {isErrorCopied ? 'check' : 'content_copy'}
          </span>
        </button>
      )}

      {connector.requiresCookie && (
        <button
          type="button"
          onClick={() => onExtractCookie(connector.id, displayDomain)}
          disabled={isRunningBatch || isChecking || isQueued || isExtractBusy}
          className="w-8 h-8 rounded-lg inline-flex items-center justify-center bg-surface-container-high text-on-surface hover:bg-surface-bright border border-outline-variant/20 transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
          data-tooltip={t('siteChecker.extractCookieTooltip')}
          aria-label={t('siteChecker.extractCookieTooltip')}
        >
          <span
            className={`material-symbols-outlined text-[16px] ${
              isExtractBusy ? 'animate-spin' : ''
            }`}
          >
            cookie
          </span>
        </button>
      )}

      {isChecking ? (
        <button
          type="button"
          onClick={() => onCancelSingleTest(connector.id)}
          className="w-8 h-8 rounded-lg inline-flex items-center justify-center bg-error/15 text-error hover:bg-error/25 border border-error/30 transition-all active:scale-95 cursor-pointer"
          data-tooltip={t('siteChecker.cancel')}
          aria-label={t('siteChecker.cancel')}
        >
          <span className="material-symbols-outlined text-[16px]">stop</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onStartSingleTest(connector.id)}
          disabled={isRunningBatch || isQueued}
          className="w-8 h-8 rounded-lg inline-flex items-center justify-center bg-surface-container-high text-on-surface hover:bg-surface-bright border border-outline-variant/20 transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
          data-tooltip={t('siteChecker.runSingleTest')}
          aria-label={t('siteChecker.runSingleTest')}
        >
          <span className="material-symbols-outlined text-[16px]">refresh</span>
        </button>
      )}
    </div>
  );

  const renderDetailUrlBox = (url, textClass = 'text-on-surface-variant/90') => (
    <div className="flex items-center gap-1.5 text-[11px] bg-surface-container-lowest/80 p-1.5 rounded-lg border border-outline-variant/15">
      <span className={`${textClass} font-mono select-all break-all flex-1 min-w-0`}>
        {url}
      </span>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={() => onCopyUrl(url)}
          className="w-7 h-7 rounded-lg border border-outline-variant/20 bg-surface-container-high/60 hover:bg-surface-container-high text-on-surface-variant hover:text-primary transition-colors inline-flex items-center justify-center cursor-pointer"
          data-tooltip={t('siteChecker.deepTest.copyUrl')}
          aria-label={t('siteChecker.deepTest.copyUrl')}
        >
          <span className="material-symbols-outlined text-[14px]">
            {copiedUrl === url ? 'check' : 'content_copy'}
          </span>
        </button>
        <button
          type="button"
          onClick={() => onOpenExternal(url)}
          className="w-7 h-7 rounded-lg border border-outline-variant/20 bg-surface-container-high/60 hover:bg-surface-container-high text-on-surface-variant hover:text-primary transition-colors inline-flex items-center justify-center cursor-pointer"
          data-tooltip={t('siteChecker.deepTest.openUrl')}
          aria-label={t('siteChecker.deepTest.openUrl')}
        >
          <span className="material-symbols-outlined text-[14px]">open_in_new</span>
        </button>
      </div>
    </div>
  );

  const renderDetailsPanel = () => {
    if (!isExpanded || !hasDetails) return null;

    const stepsList = res.steps
      ? (res.steps.custom
          ? [['custom', res.steps.custom]]
          : [
              ['listing', res.steps.listing],
              ['chapters', res.steps.chapters],
              ['download', res.steps.download],
            ]
        ).filter(([, step]) => step)
      : [];

    return (
      <div className="border-t border-outline-variant/15 bg-surface-container-lowest/85 overflow-hidden">
        <div className="px-3.5 py-2 border-b border-outline-variant/15 bg-surface-container-high/55 flex items-center justify-between gap-2 text-xs">
          <span className="font-bold text-on-surface flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[15px] text-primary">analytics</span>
            <span>{t('siteChecker.deepTest.details')}</span>
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(connector.id);
            }}
            className="px-2 py-0.5 rounded-lg text-[11px] font-medium bg-surface-container-highest/70 hover:bg-surface-container-highest border border-outline-variant/20 text-on-surface-variant hover:text-on-surface flex items-center gap-1 shrink-0 cursor-pointer transition-colors"
          >
            <span>{t('siteChecker.deepTest.collapse')}</span>
            <span className="material-symbols-outlined text-[14px]">expand_less</span>
          </button>
        </div>

        {/* Manga & Chapter Test Details header */}
        {res.testDetails && (res.testDetails.mangaTitle || res.testDetails.mangaUrl) && (
          <div className="px-3.5 py-2.5 border-b border-outline-variant/15 bg-surface-container-high/25 text-xs space-y-1.5">
            <div className="font-semibold text-on-surface flex items-center gap-1.5 min-w-0">
              <span className="material-symbols-outlined text-[14px] text-primary shrink-0">
                book_5
              </span>
              <span className="shrink-0">{t('siteChecker.testDetails.manga')}</span>
              <span className="text-primary font-bold truncate min-w-0">
                {res.testDetails.mangaTitle || t('siteChecker.testDetails.unknown')}
              </span>
              {res.testDetails.chapterCount > 0 && (
                <span className="text-[10px] text-on-surface-variant font-normal tabular-nums shrink-0">
                  ({t('siteChecker.deepTest.chapterCount', { count: res.testDetails.chapterCount })})
                </span>
              )}
            </div>

            {res.testDetails.mangaUrl && (
              <div className="mb-1">{renderDetailUrlBox(res.testDetails.mangaUrl)}</div>
            )}

            {(res.testDetails.chapterTitle || res.testDetails.chapterUrl) && (
              <div className="text-on-surface-variant text-[11px] space-y-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="material-symbols-outlined text-[13px] text-on-surface-variant/70 shrink-0">
                    description
                  </span>
                  <span className="shrink-0">{t('siteChecker.testDetails.chapter')}</span>
                  <span className="font-medium truncate min-w-0">
                    {res.testDetails.chapterTitle || t('siteChecker.testDetails.lastChapter')}
                  </span>
                </div>
                {res.testDetails.chapterUrl &&
                  renderDetailUrlBox(res.testDetails.chapterUrl, 'opacity-85')}
              </div>
            )}
          </div>
        )}

        {/* Step rows */}
        {stepsList.map(([stepKey, step], idx) => (
          <div
            key={stepKey}
            className={`flex items-center gap-2.5 px-3.5 py-2 text-xs ${
              idx < stepsList.length - 1 ? 'border-b border-outline-variant/10' : ''
            }`}
          >
            <span
              className={`w-4 h-4 rounded-full inline-flex items-center justify-center shrink-0 ${
                step.ok
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                  : 'bg-error/15 text-error'
              }`}
            >
              <span className="material-symbols-outlined text-[12px] leading-none">
                {step.ok ? 'check' : 'close'}
              </span>
            </span>

            <span className="font-semibold text-on-surface min-w-[55px] shrink-0">
              {t(`siteChecker.step.${stepKey}`)}
            </span>

            <span className="flex-1 min-w-0 text-on-surface-variant">
              {step.ok ? (
                <span className="block truncate">
                  {stepKey === 'chapters' && step.chapterCount > 0 && (
                    <>
                      {step.mangaTitle
                        ? `${step.mangaTitle} (${t('siteChecker.deepTest.chapterCount', {
                            count: step.chapterCount,
                          })})`
                        : t('siteChecker.deepTest.chapterCount', {
                            count: step.chapterCount,
                          })}
                    </>
                  )}
                  {stepKey === 'download' && step.fileSize > 0 && (
                    <>
                      {step.chapterTitle
                        ? `${step.chapterTitle} — ${t('siteChecker.deepTest.fileSize', {
                            size: formatFileSize(step.fileSize),
                          })}`
                        : t('siteChecker.deepTest.fileSize', {
                            size: formatFileSize(step.fileSize),
                          })}
                    </>
                  )}
                </span>
              ) : (
                <span className="text-error block break-words">{step.error || ''}</span>
              )}
            </span>

            {step.durationMs !== undefined && (
              <span className="text-[10px] text-on-surface-variant/65 tabular-nums shrink-0">
                {step.durationMs}ms
              </span>
            )}
          </div>
        ))}

        {isFailed && res.error && (
          <div className="px-3.5 py-2.5 border-t border-error/15 bg-error/5 text-xs text-error leading-relaxed whitespace-pre-wrap break-words">
            {res.error}
          </div>
        )}
      </div>
    );
  };

  if (isList) {
    return (
      <div
        ref={cardRef}
        className={`rounded-xl border bg-surface-container-low/50 dark:bg-surface-container-low/25 transition-all hover:border-outline-variant/45 hover:bg-surface-container-low/85 relative overflow-hidden ${
          isHighlighted
            ? 'border-primary ring-2 ring-primary/40 bg-primary/5'
            : 'border-outline-variant/20'
        }`}
      >
        <div className={`absolute inset-y-0 left-0 w-[3px] ${accentClass}`} />

        <div className="px-3.5 pl-4 py-2.5 sm:px-4 sm:pl-5 flex items-center justify-between gap-3">
          {/* Site Info + Inline Preconditions */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {renderIcon('w-9 h-9')}

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                <span className="text-sm font-bold text-on-surface truncate max-w-full">
                  {connector.label}
                </span>
                {renderPreconditionBadges(connector)}
              </div>
              <button
                type="button"
                onClick={(e) => onOpenDomain(e, displayDomain)}
                className="text-xs text-primary/85 hover:text-primary hover:opacity-80 transition-all inline-flex items-center gap-1 mt-0.5 font-medium truncate min-w-0 max-w-full cursor-pointer"
                data-tooltip={cleanDomain}
              >
                <span className="truncate">{cleanDomain}</span>
                <span className="material-symbols-outlined text-[12px] leading-none shrink-0">
                  open_in_new
                </span>
              </button>
            </div>
          </div>

          {/* Middle Status + Step Dots */}
          <div className="flex items-center gap-2 shrink-0">
            {renderStepDots('hidden md:inline-flex')}
            {renderStatusBadge()}
          </div>

          {/* Right Action Buttons */}
          {renderActionButtons()}
        </div>

        {renderDetailsPanel()}
      </div>
    );
  }

  return (
    <div
      ref={cardRef}
      className={`flex flex-col rounded-2xl border bg-surface-container-low/50 dark:bg-surface-container-low/25 shadow-sm relative overflow-hidden transition-all hover:border-outline-variant/45 hover:bg-surface-container-low/85 ${
        isHighlighted
          ? 'border-primary ring-2 ring-primary/40 bg-primary/5'
          : 'border-outline-variant/20'
      }`}
    >
      <div className={`absolute inset-y-0 left-0 w-[3px] ${accentClass}`} />

      {/* Top Header */}
      <div className="p-4 pl-5 pb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {renderIcon('w-10 h-10')}

          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-sm font-bold text-on-surface truncate">{connector.label}</span>
            <button
              type="button"
              onClick={(e) => onOpenDomain(e, displayDomain)}
              className="text-xs text-primary/85 hover:text-primary hover:opacity-80 transition-all inline-flex items-center gap-1 mt-0.5 font-medium truncate min-w-0 max-w-full cursor-pointer text-left"
              data-tooltip={cleanDomain}
            >
              <span className="truncate">{cleanDomain}</span>
              <span className="material-symbols-outlined text-[12px] leading-none shrink-0">
                open_in_new
              </span>
            </button>
          </div>
        </div>

        {renderActionButtons()}
      </div>

      {/* Status & Badges Footer Bar */}
      <div className="px-4 pl-5 py-2.5 border-t border-outline-variant/10 bg-surface-container-low/30 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          {renderStatusBadge()}
          {renderStepDots('ml-0.5')}
        </div>
        <div className="flex flex-wrap items-center gap-1 shrink-0">
          {renderPreconditionBadges(connector)}
        </div>
      </div>

      {renderDetailsPanel()}
    </div>
  );
}
