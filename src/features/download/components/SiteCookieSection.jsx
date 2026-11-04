import { useI18n } from '../../../context/I18nContext';
import { useSiteCookieCatalog } from '../useSiteCookie';

/**
 * Cookie list in Settings: only sites that already have a saved cookie.
 * First save happens on Home via the cookie extract button.
 */
export function SiteCookieSection() {
  const { t } = useI18n();
  const { connectors, cookieStatus, busy, sitesWithSavedCookie, handleDeleteCookie } =
    useSiteCookieCatalog();

  const renderSiteCard = (connector) => {
    const { id, label } = connector;
    const cookieLen = typeof cookieStatus[id] === 'number' ? cookieStatus[id] : 0;
    if (cookieLen <= 0) return null;

    return (
      <div key={id} className="flex items-center justify-between gap-3 py-2.5 border-b border-outline-variant/10 last:border-0">
        <div className="flex items-center gap-2 truncate">
          <span className="material-symbols-outlined text-[16px] text-on-surface-variant">public</span>
          <span className="text-sm font-medium text-on-surface truncate" data-tooltip={label || id}>{label || id}</span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 bg-surface-container-low px-2 py-1 rounded border border-outline-variant/15">
            <span className="material-symbols-outlined text-[14px] text-primary">cookie</span>
            <span className="text-xs font-medium text-on-surface-variant">{cookieLen}b</span>
            <button
              type="button"
              data-tooltip="Xóa Cookie"
              disabled={busy[id]}
              onClick={() => handleDeleteCookie(id)}
              className="flex size-5 items-center justify-center rounded text-error hover:bg-error/10 transition-all active:scale-95 disabled:opacity-50 ml-1"
            >
              <span className="material-symbols-outlined text-[14px]">close</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (connectors.length === 0) return null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-on-surface-variant">
        {sitesWithSavedCookie.length > 0 ? t('settings.siteCookies.hintSavedOnly') : t('settings.siteCookies.emptySavedList')}
      </p>
      {sitesWithSavedCookie.length > 0 ? (
        <div className="rounded-lg border border-outline-variant/20 bg-surface-container-lowest px-4">
          {sitesWithSavedCookie.map((c) => renderSiteCard(c))}
        </div>
      ) : null}
    </div>
  );
}
