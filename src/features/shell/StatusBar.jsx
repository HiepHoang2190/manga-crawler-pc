import { useI18n } from '../../context/I18nContext';
import SystemResourceBadge from './SystemResourceBadge.jsx';

export default function StatusBar({
  savePath = '',
  mangaTitle = '',
  queueProcessing = false,
  downloadProgress = null,
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
      <div className="flex items-center gap-2 sm:gap-3 shrink-0 max-w-[58%] justify-end min-w-0">
        {/* CPU & RAM metrics badge kiểu Koharu */}
        <SystemResourceBadge className="mr-1" />

        {typeof onToggleLogFooter === 'function' ? (
          <button
            type="button"
            onClick={onToggleLogFooter}
            aria-label={logFooterVisible ? t('statusBar.hideLogPanel') : t('statusBar.showLogPanel')}
            aria-expanded={logFooterVisible}
            data-tooltip={logFooterVisible ? t('statusBar.hideLogPanel') : t('statusBar.showLogPanel')}
            className="shrink-0 flex h-7 w-7 items-center justify-center rounded-md text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px] leading-none">
              {logFooterVisible ? 'unfold_less' : 'unfold_more'}
            </span>
          </button>
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
