export const BULK_SCAN_SESSIONS_KEY = 'mangaBulkScanSessions';
export const BULK_SCAN_SITE_KEY = 'mangaBulkScanSiteId';

export function migrateHiddenMenuIds(ids) {
  const arr = Array.isArray(ids) ? ids : [];
  const out = [];
  const seen = new Set();
  for (const raw of arr) {
    let id = String(raw || '').trim();
    if (id === 'comicvnMoiNhat') id = 'bulkScan';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function intersectSelectedUrls(selectedUrls, items) {
  const allowed = new Set(
    (Array.isArray(items) ? items : [])
      .map((i) => String(i?.mangaUrl || '').trim())
      .filter(Boolean),
  );
  const prev = Array.isArray(selectedUrls) ? selectedUrls : [];
  const out = [];
  const seen = new Set();
  for (const u of prev) {
    const url = String(u || '').trim();
    if (!url || !allowed.has(url) || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

export function filterBulkScanItems(items, selectedSet, filter) {
  const list = Array.isArray(items) ? items : [];
  const set = selectedSet instanceof Set ? selectedSet : new Set();
  if (filter === 'selected') return list.filter((i) => set.has(i.mangaUrl));
  if (filter === 'unselected') return list.filter((i) => !set.has(i.mangaUrl));
  return list;
}

export function loadBulkScanSessions() {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(BULK_SCAN_SESSIONS_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
  } catch {
    return {};
  }
}

export function saveBulkScanSession(siteId, session) {
  const id = String(siteId || '').trim();
  if (!id || typeof localStorage === 'undefined') return false;
  try {
    const all = loadBulkScanSessions();
    const nextItems = Array.isArray(session?.items) ? session.items : [];
    const prevItems = Array.isArray(all[id]?.items) ? all[id].items : [];
    // Guard: do not clobber a non-empty stored list with an accidental empty write.
    if (!nextItems.length && prevItems.length) {
      return false;
    }
    all[id] = {
      scannedAt: session?.scannedAt || new Date().toISOString(),
      items: nextItems,
      selectedUrls: Array.isArray(session?.selectedUrls) ? session.selectedUrls : [],
    };
    localStorage.setItem(BULK_SCAN_SESSIONS_KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

export function loadBulkScanSiteId(supportedIds) {
  const ids = Array.isArray(supportedIds) ? supportedIds.map(String) : [];
  if (!ids.length) return '';
  if (typeof localStorage === 'undefined') return ids[0];
  try {
    const s = localStorage.getItem(BULK_SCAN_SITE_KEY);
    if (s && ids.includes(String(s).trim())) return String(s).trim();
  } catch {
    /* ignore */
  }
  return ids.includes('comicvn') ? 'comicvn' : ids[0];
}

export function persistBulkScanSiteId(siteId) {
  try {
    if (siteId) localStorage.setItem(BULK_SCAN_SITE_KEY, String(siteId));
  } catch {
    /* ignore */
  }
}

export function buildSessionAfterScan({ prevSelectedUrls, items }) {
  const list = Array.isArray(items) ? items : [];
  return {
    items: list,
    selectedUrls: intersectSelectedUrls(prevSelectedUrls, list),
    scannedAt: new Date().toISOString(),
  };
}

/**
 * Prefer Electron userData file (IPC); fall back to localStorage.
 * @returns {Promise<Record<string, { scannedAt?: string, items: array, selectedUrls: string[] }>>}
 */
export async function loadBulkScanSessionsAsync() {
  const api = typeof window !== 'undefined' ? window.electronAPI : null;
  if (api?.getBulkScanSessions) {
    try {
      const res = await api.getBulkScanSessions();
      if (res?.ok && res.sessions && typeof res.sessions === 'object') {
        return res.sessions;
      }
    } catch {
      /* fall through */
    }
  }
  return loadBulkScanSessions();
}

/**
 * Persist one site session via Electron userData when available.
 * Also mirrors to localStorage best-effort (may fail on quota).
 */
export async function saveBulkScanSessionAsync(siteId, session) {
  const id = String(siteId || '').trim();
  if (!id) return false;
  const api = typeof window !== 'undefined' ? window.electronAPI : null;
  if (api?.saveBulkScanSession) {
    try {
      const res = await api.saveBulkScanSession(id, session);
      if (res?.ok) {
        try {
          saveBulkScanSession(id, session);
        } catch {
          /* ignore mirror failure */
        }
        return true;
      }
      // File store refused empty overwrite — treat as soft failure (keep disk).
      if (res?.error && /overwrite/i.test(String(res.error))) {
        return false;
      }
      // Fall back to localStorage if IPC failed for other reasons.
    } catch {
      /* fall through */
    }
  }
  return saveBulkScanSession(id, session);
}
