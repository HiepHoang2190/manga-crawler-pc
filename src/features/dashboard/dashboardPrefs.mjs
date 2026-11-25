export const DASHBOARD_TREND_DAYS_KEY = 'dashboard_trend_days_v1';

const VALID_TREND_DAYS = new Set([7, 30]);

function resolveStorage(explicitStorage) {
  if (explicitStorage) return explicitStorage;
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

export function loadDashboardTrendDays(explicitStorage) {
  try {
    const storage = resolveStorage(explicitStorage);
    const raw = storage?.getItem?.(DASHBOARD_TREND_DAYS_KEY);
    if (raw === null || raw === undefined || raw === '') return 30;
    const parsed = Number(raw);
    return VALID_TREND_DAYS.has(parsed) ? parsed : 30;
  } catch {
    return 30;
  }
}

export function saveDashboardTrendDays(days, explicitStorage) {
  const normalized = Number(days);
  if (!VALID_TREND_DAYS.has(normalized)) return;
  try {
    const storage = resolveStorage(explicitStorage);
    storage?.setItem?.(DASHBOARD_TREND_DAYS_KEY, String(normalized));
  } catch {
    // Ignore storage quota or security errors
  }
}

export function extractPathBasename(fullPath) {
  const trimmed = String(fullPath || '').trim().replace(/[\\/]+$/, '');
  if (!trimmed) return '';
  const parts = trimmed.split(/[\\/]/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : '';
}
