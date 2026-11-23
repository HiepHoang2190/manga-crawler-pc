import { useEffect } from 'react';
import { useI18n } from '../../context/I18nContext';

/**
 * Floating banner shown when a supported manga URL is detected in the system clipboard.
 */
export default function ClipboardUrlBanner({ candidate, onFetch, onDismiss }) {
  const { t } = useI18n();
  const hasCandidate = Boolean(candidate?.url);

  useEffect(() => {
    if (!hasCandidate) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onDismiss?.(candidate);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasCandidate, candidate, onDismiss]);

  if (!hasCandidate) return null;

  return (
    <div
      role="status"
      data-testid="clipboard-url-banner"
      className="fixed top-[6.25rem] right-4 z-[120] max-w-md w-[calc(100vw-2rem)] sm:w-auto rounded-2xl border border-primary/30 bg-surface-container-high/95 backdrop-blur-md shadow-2xl p-3 flex items-center gap-3 animate-in fade-in-0 slide-in-from-top-2 duration-150"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/15 text-primary">
        <span className="material-symbols-outlined text-[18px] leading-none">content_paste_go</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-on-surface truncate">
          {t('clipboardBanner.detected', { site: candidate.siteName || candidate.siteId })}
        </p>
        <p className="text-[11px] font-mono text-on-surface-variant truncate">
          {candidate.url}
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => onFetch?.(candidate)}
          className="h-8 px-3 rounded-lg bg-primary text-on-primary text-xs font-semibold shadow-xs hover:opacity-90 active:scale-95 transition-all cursor-pointer"
        >
          {t('clipboardBanner.fetchNow')}
        </button>
        <button
          type="button"
          onClick={() => onDismiss?.(candidate)}
          data-tooltip={t('clipboardBanner.dismiss')}
          aria-label={t('clipboardBanner.dismiss')}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-outline-variant/20 bg-surface-container-highest/60 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-[16px] leading-none">close</span>
        </button>
      </div>
    </div>
  );
}
