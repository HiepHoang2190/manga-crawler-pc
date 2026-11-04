import { useEffect, useMemo, useState } from 'react';

function getCookieApi() {
  return typeof window !== 'undefined' ? window.electronAPI : null;
}

/** Parse getCookieStatus() map for one siteId (stored length, send flag). */
export function parseSiteCookieStatus(status_map, site_id) {
  const raw_cookie = status_map?.[site_id];
  const stored_cookie_len = typeof raw_cookie === 'number' ? raw_cookie : 0;
  const cookie_send_on = status_map?.[site_id + '_cookieSend'] !== false;
  const effective_cookie_len = stored_cookie_len > 0 && cookie_send_on !== false ? stored_cookie_len : 0;
  return { stored_cookie_len, cookie_send_on, effective_cookie_len };
}

export function connectorHasSavedCookie(connector, cookie_status) {
  const cookie_len = typeof cookie_status[connector.id] === 'number' ? cookie_status[connector.id] : 0;
  return cookie_len > 0;
}

/** Sites that already have a stored cookie, sorted by label. */
export function filterSitesWithSavedCookie(connectors, cookie_status) {
  const connector_list = connectors || [];
  return connector_list
    .filter((connector) => connectorHasSavedCookie(connector, cookie_status))
    .sort((a, b) => String(a.label).localeCompare(String(b.label), undefined, { sensitivity: 'base' }));
}

/**
 * All-site cookie catalog for Settings (sites that already have a saved cookie).
 * Settings does not own this store; it only renders the download-owned list.
 */
export function useSiteCookieCatalog() {
  const [connectors, setConnectors] = useState([]);
  const [cookieStatus, setCookieStatus] = useState({});
  const [busy, setBusy] = useState({});

  const api = getCookieApi();

  const refreshStatus = async () => {
    if (!api?.getCookieStatus) return;
    try {
      const status = await api.getCookieStatus();
      setCookieStatus(status || {});
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    const load = async () => {
      if (!api?.listConnectors) return;
      try {
        const all = await api.listConnectors();
        setConnectors(all || []);
      } catch {
        // ignore
      }
      await refreshStatus();
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sitesWithSavedCookie = useMemo(
    () => filterSitesWithSavedCookie(connectors, cookieStatus),
    [connectors, cookieStatus],
  );

  const handleDeleteCookie = async (siteId) => {
    if (!api?.deleteCookie) return;
    setBusy((b) => ({ ...b, [siteId]: true }));
    try {
      await api.deleteCookie(siteId);
      await refreshStatus();
    } finally {
      setBusy((b) => ({ ...b, [siteId]: false }));
    }
  };

  return {
    connectors,
    cookieStatus,
    busy,
    sitesWithSavedCookie,
    handleDeleteCookie,
  };
}
