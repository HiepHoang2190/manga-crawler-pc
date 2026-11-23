import { useI18n } from '../../context/I18nContext';
import SystemResourceBadge from './SystemResourceBadge.jsx';

export default function StatusBar({
  savePath = '',
  mangaTitle = '',
  queueProcessing = false,
  downloadProgress = null,
  queueProgressSummary = null,
  unreadErrorCount = 0,
  logFooterVisible = true,
  onToggleLogFooter,
}) {
  const { t } = useI18n();
  const dp = downloadProgress;
  let statusRight = t('statusBar.ready');
  if (queueProcessing && dp && dp.total > 0) {
    statusRight = t('statusBar.downloadingPage', { current: dp.current, total: dp.total });
  } else if (queueProcessing) {
    statusRight = t('statusBar.processingQueue');
  }

  const showQueueChapters = queueProcessing && queueProgressSummary?.totalChapters > 0;

  return (
    <footer className="bg-surface-container-low h-8 px-4 flex items-center justify-between z-50 font-headline text-[11px] font-medium tracking-wide uppercase border-t border-outline-variant/10 shrink-0">
      <div className="flex items-center gap-4 min-w-0 flex-1">
        <span className="text-on-surface/80 truncate normal-case">
          {mangaTitle ? (
            <span className="text-on-surface font-medium">{mangaTitle}</span>
          ) : (
            <span className="text-on-surface-variant">{t('statusBar.noManga')}</span>
          )}
          {savePath ? (
            <span className="text-on-surface-variant normal-case ml-2">• {savePath}</span>
          ) : null}
        </span>
      </div>
      <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 max-w-[65%] justify-end min-w-0">
        {/* CPU & RAM metrics badge kiểu Koharu */}
        <SystemResourceBadge className="mr-0.5" />

        {!logFooterVisible && unreadErrorCount > 0 && typeof onToggleLogFooter === 'function' ? (
          <button
            type="button"
            onClick={onToggleLogFooter}
            data-testid="status-unread-errors-btn"
            data-tooltip={t('statusBar.unreadErrors', { count: unreadErrorCount })}
            aria-label={t('statusBar.unreadErrors', { count: unreadErrorCount })}
            className="inline-flex items-center gap-1 rounded-full border border-error/35 bg-error/15 px-2 py-0.5 text-[10px] font-bold text-error normal-case tabular-nums hover:bg-error/25 transition-colors cursor-pointer shrink-0"
          >
            <span className="material-symbols-outlined !text-[12px] leading-none">error</span>
            <span>{unreadErrorCount}</span>
          </button>
        ) : null}

        {typeof onToggleLogFooter === 'function' ? (
          <button
            type="button"
            onClick={onToggleLogFooter}
            aria-label={logFooterVisible ? t('statusBar.hideLogPanel') : t('statusBar.showLogPanel')}
            aria-expanded={logFooterVisible}
            data-tooltip={logFooterVisible ? t('statusBar.hideLogPanel') : t('statusBar.showLogPanel')}
            className="shrink-0 flex h-6 w-6 items-center justify-center rounded-md border border-outline-variant/20 bg-surface-container-highest/60 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface cursor-pointer transition-colors"
          >
            <span className="material-symbols-outlined text-[16px] leading-none">
              {logFooterVisible ? 'unfold_less' : 'unfold_more'}
            </span>
          </button>
        ) : null}

        {showQueueChapters ? (
          <div className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary normal-case tabular-nums shrink-0">
            <span>
              {t('statusBar.queueChaptersProgress', {
                done: queueProgressSummary.doneChapters,
                total: queueProgressSummary.totalChapters,
              })}
            </span>
            <span className="w-12 h-1.5 rounded-full bg-surface-container-highest overflow-hidden">
              <span
                className={`block h-full rounded-full transition-all duration-200 ${
                  queueProgressSummary.errorChapters > 0 ? 'bg-amber-400' : 'bg-primary'
                }`}
                style={{ width: `${Math.min(100, Math.max(4, queueProgressSummary.percent || 0))}%` }}
              />
            </span>
          </div>
        ) : null}

        <span
          className="text-on-surface-variant normal-case truncate text-right min-w-0"
          data-tooltip={queueProcessing && dp ? `${dp.mangaTitle || ''} — ${dp.chapterTitle || ''}` : undefined}
        >
          {statusRight}
        </span>
      </div>
    </footer>
  );
}
