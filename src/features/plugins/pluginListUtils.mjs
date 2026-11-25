/**
 * Pure utilities & persistent preferences for PluginManagementPanel.
 */

export const PLUGINS_VIEW_MODE_KEY = 'plugins_view_mode_v1';
export const PLUGINS_SORT_PREF_KEY = 'plugins_sort_pref_v1';

const VALID_SORT_MODES = new Set(['enabled_first', 'disabled_first', 'name_asc', 'name_desc']);

export function loadPluginViewMode(fallback = 'grid') {
  const safeFallback = fallback === 'list' ? 'list' : 'grid';
  if (typeof localStorage === 'undefined') return safeFallback;
  try {
    const val = localStorage.getItem(PLUGINS_VIEW_MODE_KEY);
    if (val === 'grid' || val === 'list') return val;
  } catch {
    /* ignore storage errors */
  }
  return safeFallback;
}

export function savePluginViewMode(mode) {
  const safeMode = mode === 'list' ? 'list' : 'grid';
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PLUGINS_VIEW_MODE_KEY, safeMode);
  } catch {
    /* ignore storage errors */
  }
}

export function loadPluginSortPref(fallback = 'enabled_first') {
  const safeFallback = VALID_SORT_MODES.has(fallback) ? fallback : 'enabled_first';
  if (typeof localStorage === 'undefined') return safeFallback;
  try {
    const val = localStorage.getItem(PLUGINS_SORT_PREF_KEY);
    if (VALID_SORT_MODES.has(val)) return val;
  } catch {
    /* ignore storage errors */
  }
  return safeFallback;
}

export function savePluginSortPref(sortBy) {
  if (!VALID_SORT_MODES.has(sortBy) || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PLUGINS_SORT_PREF_KEY, sortBy);
  } catch {
    /* ignore storage errors */
  }
}

function compareNamesAsc(a, b) {
  const nameA = String(a?.metadata?.name || a?.metadata?.id || '').trim();
  const nameB = String(b?.metadata?.name || b?.metadata?.id || '').trim();
  return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
}

export function filterAndSortPlugins(
  plugins = [],
  { searchTerm = '', statusFilter = 'all', sortBy = 'enabled_first' } = {},
) {
  const list = Array.isArray(plugins) ? plugins : [];
  const q = String(searchTerm || '').toLowerCase().trim();

  const filtered = list.filter((p) => {
    if (!p || !p.metadata) return false;
    const name = String(p.metadata.name || '').toLowerCase();
    const id = String(p.metadata.id || '').toLowerCase();
    const author = String(p.metadata.author || '').toLowerCase();
    const desc = String(p.metadata.description || '').toLowerCase();
    const domains = Array.isArray(p.metadata.allowedDomains)
      ? p.metadata.allowedDomains.join(' ').toLowerCase()
      : '';
    const matchesSearch =
      !q || name.includes(q) || id.includes(q) || author.includes(q) || desc.includes(q) || domains.includes(q);
    if (!matchesSearch) return false;

    if (statusFilter === 'enabled') return Boolean(p.isEnabled);
    if (statusFilter === 'disabled') return !p.isEnabled;
    if (statusFilter === 'url') return Boolean(p?.sourceUrl || p?.metadata?.sourceUrl);
    return true;
  });

  const sorted = [...filtered];
  const safeSort = VALID_SORT_MODES.has(sortBy) ? sortBy : 'enabled_first';

  sorted.sort((a, b) => {
    if (safeSort === 'enabled_first') {
      if (Boolean(a.isEnabled) !== Boolean(b.isEnabled)) return a.isEnabled ? -1 : 1;
      return compareNamesAsc(a, b);
    }
    if (safeSort === 'disabled_first') {
      if (Boolean(a.isEnabled) !== Boolean(b.isEnabled)) return a.isEnabled ? 1 : -1;
      return compareNamesAsc(a, b);
    }
    if (safeSort === 'name_desc') {
      return compareNamesAsc(b, a);
    }
    return compareNamesAsc(a, b);
  });

  return sorted;
}
