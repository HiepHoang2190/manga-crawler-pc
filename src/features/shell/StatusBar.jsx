import { useI18n } from '../../context/I18nContext';
import SystemResourceBadge from './SystemResourceBadge.jsx';
import ZoomControlBadge from './ZoomControlBadge.jsx';

export default function StatusBar({
  savePath = '',
  mangaTitle = '',
  unreadErrorCount = 0,
  logFooterVisible = true,
  onToggleLogFooter,
  zoomFactor = 1.0,
  onZoomIn,
  onZoomOut,
  onSetZoomFactor,
  onResetZoom,
}) {
  const { t } = useI18n();

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

        {typeof onSetZoomFactor === 'function' || typeof onResetZoom === 'function' ? (
          <ZoomControlBadge
            zoomFactor={zoomFactor}
            onZoomIn={onZoomIn}
            onZoomOut={onZoomOut}
            onSetZoomFactor={onSetZoomFactor}
            onResetZoom={onResetZoom}
          />
        ) : null}

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
      </div>
    </footer>
  );
}
