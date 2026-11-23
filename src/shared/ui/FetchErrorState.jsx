import React from 'react';
import { useSafeI18n } from '../../context/I18nContext';
import { classifyFetchError } from './fetchErrorUtils.js';

/**
 * FetchErrorState — Centered, theme-aware error state card for fetch/scan failures.
 * Classifies errors into VPN/Network/Auth/Server categories with actionable retry controls.
 */
export default function FetchErrorState({
  message = '',
  multiErrors = [],
  heading = '',
  sourceLabel = '',
  requiresVpn = false,
  suggestsVpn = false,
  onRetry = null,
  retryLabel = '',
  secondaryAction = null,
  className = '',
}) {
  const { t } = useSafeI18n();
  const meta = classifyFetchError(message, { requiresVpn, suggestsVpn });
  const isWarningTone = meta.kind === 'vpn' || meta.kind === 'network' || meta.kind === 'auth';
  const resolvedHeading = heading || t(meta.titleKey);
  const resolvedHint = meta.hintKey ? t(meta.hintKey) : '';
  const hasMultiErrors = Array.isArray(multiErrors) && multiErrors.length > 1;

  return (
    <div
      className={`flex flex-1 flex-col items-center justify-center w-full min-h-[340px] p-4 sm:p-6 animate-in fade-in-50 duration-200 select-none ${className}`}
    >
      <div
        role="alert"
        data-testid="fetch-error-state"
        className="w-full max-w-lg rounded-2xl border border-outline-variant/20 bg-surface-container-low/85 backdrop-blur-sm p-6 sm:p-7 shadow-sm text-center"
      >
        <div
          className={`mx-auto mb-3.5 flex h-14 w-14 items-center justify-center rounded-2xl border ${
            isWarningTone
              ? 'border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400'
              : 'border-error/25 bg-error/10 text-error'
          }`}
        >
          <span className="material-symbols-outlined text-[28px] leading-none" aria-hidden>
            {meta.icon}
          </span>
        </div>

        {sourceLabel ? (
          <div className="mb-2 flex justify-center">
            <span className="inline-flex items-center rounded-full border border-outline-variant/25 bg-surface-container-high/80 px-2.5 py-0.5 text-[11px] font-semibold text-on-surface-variant">
              {sourceLabel}
            </span>
          </div>
        ) : null}

        <h3 className="text-base font-bold text-on-surface tracking-tight">
          {resolvedHeading}
        </h3>

        {resolvedHint ? (
          <p className="mt-1.5 text-xs text-on-surface-variant leading-relaxed max-w-md mx-auto">
            {resolvedHint}
          </p>
        ) : null}

        {(message || hasMultiErrors) ? (
          <div className="mt-4 rounded-xl border border-outline-variant/15 bg-surface-container-highest/60 px-3.5 py-2.5 text-left select-text">
            <div className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/65 mb-1">
              {t('fetchError.detailLabel')}
            </div>
            {hasMultiErrors ? (
              <ul className="max-h-40 overflow-y-auto custom-scrollbar space-y-1.5 text-xs text-on-surface-variant/90 leading-relaxed">
                {multiErrors.map((err, idx) => (
                  <li key={idx} className="flex items-start gap-1.5 break-words">
                    <span className="text-amber-500 font-bold shrink-0">•</span>
                    <span>{err}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-on-surface-variant/90 leading-relaxed break-words">
                {message}
              </p>
            )}
          </div>
        ) : null}

        {(typeof onRetry === 'function' || secondaryAction) ? (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {typeof onRetry === 'function' ? (
              <button
                type="button"
                onClick={onRetry}
                className="h-9 px-4 rounded-xl bg-primary text-on-primary text-xs font-semibold inline-flex items-center gap-1.5 hover:opacity-95 active:scale-95 transition-all cursor-pointer shadow-xs"
              >
                <span className="material-symbols-outlined text-[16px] leading-none">refresh</span>
                <span>{retryLabel || t('fetchError.retry')}</span>
              </button>
            ) : null}
            {secondaryAction}
          </div>
        ) : null}
      </div>
    </div>
  );
}
