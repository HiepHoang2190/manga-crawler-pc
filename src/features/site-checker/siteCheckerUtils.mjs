function getSortableRtt(result) {
  const value = result?.rtt;
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') {
    return null;
  }
  const rtt = Number(value);
  return Number.isFinite(rtt) && rtt >= 0 ? rtt : null;
}

function parseDurationMs(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function getBrokenPriority(result) {
  if (result?.status === 'failed') return 0;
  if (result?.status === 'success') return 2;
  return 1; // untested or testing
}

export function sortConnectorsForChecker(connectors = [], results = {}, sortMode = 'default') {
  if (!Array.isArray(connectors)) return [];
  const list = [...connectors];
  if (sortMode === 'default') return list;

  if (sortMode === 'rttAsc') {
    return list.sort((a, b) => {
      const ra = getSortableRtt(results?.[a.id]);
      const rb = getSortableRtt(results?.[b.id]);
      if (ra === null && rb === null) return 0;
      if (ra === null) return 1;
      if (rb === null) return -1;
      return ra - rb;
    });
  }

  if (sortMode === 'rttDesc') {
    return list.sort((a, b) => {
      const ra = getSortableRtt(results?.[a.id]);
      const rb = getSortableRtt(results?.[b.id]);
      if (ra === null && rb === null) return 0;
      if (ra === null) return 1;
      if (rb === null) return -1;
      return rb - ra;
    });
  }

  if (sortMode === 'brokenFirst') {
    return list.sort((a, b) => {
      const pa = getBrokenPriority(results?.[a.id]);
      const pb = getBrokenPriority(results?.[b.id]);
      return pa - pb;
    });
  }

  return list;
}

export function buildHealthReportMarkdown(connectors = [], results = {}, stats = {}) {
  const total = Number.isFinite(stats?.total) ? stats.total : connectors.length;
  const working = Number.isFinite(stats?.working) ? stats.working : 0;
  const broken = Number.isFinite(stats?.broken) ? stats.broken : 0;

  const workingRtts = [];
  const brokenLines = [];

  for (const c of connectors) {
    const res = results?.[c.id];
    if (!res) continue;
    if (res.status === 'success') {
      const rtt = getSortableRtt(res);
      if (rtt !== null) workingRtts.push(rtt);
    } else if (res.status === 'failed') {
      const errText = String(res.error || 'Unknown error').replace(/\s+/g, ' ').trim();
      brokenLines.push(`- ${c.label || c.id} (${c.domain || c.id}): ${errText}`);
    }
  }

  const avgRtt =
    workingRtts.length > 0
      ? Math.round(workingRtts.reduce((sum, v) => sum + v, 0) / workingRtts.length)
      : null;

  const lines = [
    `# Site Health Report`,
    `- Working: ${working}/${total}`,
    `- Broken: ${broken}`,
  ];
  if (avgRtt !== null) {
    lines.push(`- Avg RTT (working): ${avgRtt}ms`);
  }
  if (brokenLines.length > 0) {
    lines.push('', '## Broken Connectors', ...brokenLines);
  }

  return lines.join('\n');
}

export function buildConnectorErrorReport(connector = {}, result = {}, displayDomain = '') {
  const label = connector?.label || connector?.id || 'Connector';
  const id = connector?.id;
  const domain = String(displayDomain || connector?.domain || '').trim();
  const status = result?.status || 'failed';
  const rtt = getSortableRtt(result);
  const errorText = String(result?.error || '').trim() || 'Unknown error';

  const header = id && id !== label ? `${label} (${id})` : label;
  const lines = [`Connector: ${header}`];
  if (domain) lines.push(`Domain: ${domain}`);
  lines.push(`Status: ${status}${rtt !== null ? ` (${rtt}ms)` : ''}`);
  lines.push(`Error: ${errorText}`);

  const stepsObj = result?.steps;
  if (stepsObj && typeof stepsObj === 'object') {
    const orderedKeys = stepsObj.custom ? ['custom'] : ['listing', 'chapters', 'download'];
    const stepLines = [];
    for (const key of orderedKeys) {
      const step = stepsObj[key];
      if (!step) continue;
      const durationMs = parseDurationMs(step.durationMs);
      const duration = durationMs !== null ? ` (${durationMs}ms)` : '';
      const outcome = step.ok ? 'OK' : 'FAILED';
      const stepErr = !step.ok && step.error ? ` — ${String(step.error).trim()}` : '';
      stepLines.push(`- ${key}: ${outcome}${duration}${stepErr}`);
    }
    if (stepLines.length > 0) {
      lines.push('', 'Steps:', ...stepLines);
    }
  }

  const details = result?.testDetails;
  if (details && (details.mangaTitle || details.mangaUrl || details.chapterTitle || details.chapterUrl)) {
    const detailLines = [];
    if (details.mangaTitle) detailLines.push(`- Manga: ${details.mangaTitle}`);
    if (details.mangaUrl) detailLines.push(`- Manga URL: ${details.mangaUrl}`);
    if (details.chapterTitle) detailLines.push(`- Chapter: ${details.chapterTitle}`);
    if (details.chapterUrl) detailLines.push(`- Chapter URL: ${details.chapterUrl}`);
    if (detailLines.length > 0) {
      lines.push('', 'Test Context:', ...detailLines);
    }
  }

  return lines.join('\n');
}

export function getUntestedConnectors(connectors = [], results = {}) {
  if (!Array.isArray(connectors)) return [];
  return connectors.filter((c) => {
    if (!c || !c.id) return false;
    const r = results?.[c.id];
    if (!r) return true;
    if (r.checking || r.queued || r.status === 'testing') return false;
    return r.status !== 'success' && r.status !== 'failed';
  });
}

export const SITE_CHECKER_VIEW_MODE_KEY = 'site_checker_view_mode_v1';
export const SITE_CHECKER_SORT_PREF_KEY = 'site_checker_sort_pref_v1';

const VALID_VIEW_MODES = new Set(['grid', 'list']);
const VALID_SORT_MODES = new Set(['default', 'rttAsc', 'rttDesc', 'brokenFirst']);

function resolveStorage(explicitStorage) {
  if (explicitStorage) return explicitStorage;
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

export function loadSiteCheckerViewMode(explicitStorage) {
  try {
    const storage = resolveStorage(explicitStorage);
    const raw = storage?.getItem?.(SITE_CHECKER_VIEW_MODE_KEY);
    return VALID_VIEW_MODES.has(raw) ? raw : 'grid';
  } catch {
    return 'grid';
  }
}

export function saveSiteCheckerViewMode(mode, explicitStorage) {
  if (!VALID_VIEW_MODES.has(mode)) return;
  try {
    const storage = resolveStorage(explicitStorage);
    storage?.setItem?.(SITE_CHECKER_VIEW_MODE_KEY, mode);
  } catch {
    // Ignore storage quota or security errors
  }
}

export function loadSiteCheckerSortPref(explicitStorage) {
  try {
    const storage = resolveStorage(explicitStorage);
    const raw = storage?.getItem?.(SITE_CHECKER_SORT_PREF_KEY);
    return VALID_SORT_MODES.has(raw) ? raw : 'default';
  } catch {
    return 'default';
  }
}

export function saveSiteCheckerSortPref(sortMode, explicitStorage) {
  if (!VALID_SORT_MODES.has(sortMode)) return;
  try {
    const storage = resolveStorage(explicitStorage);
    storage?.setItem?.(SITE_CHECKER_SORT_PREF_KEY, sortMode);
  } catch {
    // Ignore storage quota or security errors
  }
}
