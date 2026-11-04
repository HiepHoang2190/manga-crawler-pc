/** Daily reading-time buckets (seconds per local calendar day). */

export const USAGE_BY_DAY_KEY = 'mangaUsageByDay';

const MAX_STORED_DAYS = 90;

/**
 * @param {number} [nowMs]
 * @returns {string} YYYY-MM-DD in local timezone
 */
export function localDateISO(nowMs = Date.now()) {
  const d = new Date(Number(nowMs) || Date.now());
  const y = d.getFullYear().toString().padStart(4, '0');
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * @returns {Record<string, number>}
 */
export function loadUsageByDayMap() {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(USAGE_BY_DAY_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object' || Array.isArray(o)) return {};
    return o;
  } catch {
    return {};
  }
}

/**
 * @param {Record<string, number>} map
 */
export function saveUsageByDayMap(map) {
  if (typeof window === 'undefined') return;
  const trimmed = trimUsageMap(map);
  try {
    localStorage.setItem(USAGE_BY_DAY_KEY, JSON.stringify(trimmed));
  } catch {
    /* quota / private mode */
  }
}

/**
 * @param {Record<string, number>} map
 * @returns {Record<string, number>}
 */
export function trimUsageMap(map) {
  const keys = Object.keys(map || {}).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k));
  if (keys.length <= MAX_STORED_DAYS) return map;
  keys.sort();
  const drop = keys.slice(0, keys.length - MAX_STORED_DAYS);
  const next = { ...map };
  for (const k of drop) delete next[k];
  return next;
}

/**
 * @param {number} seconds
 * @param {number} [nowMs]
 */
export function addUsageSeconds(seconds, nowMs = Date.now()) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  if (s <= 0) return;
  const iso = localDateISO(nowMs);
  const map = loadUsageByDayMap();
  map[iso] = (Number(map[iso]) || 0) + s;
  saveUsageByDayMap(map);
}

/**
 * @param {number} totalSeconds
 * @returns {string}
 */
export function formatDurationSeconds(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  if (s <= 0) return '0m';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

/**
 * @param {number} [nowMs]
 * @returns {number}
 */
export function getUsageTodaySeconds(nowMs = Date.now()) {
  const map = loadUsageByDayMap();
  return Math.max(0, Number(map[localDateISO(nowMs)]) || 0);
}

/**
 * @param {{ days?: number, nowMs?: number }} [opts]
 * @returns {Array<{ dateISO: string, count: number }>} seconds stored in `count`
 */
export function getUsagePerDay({ days = 30, nowMs } = {}) {
  const map = loadUsageByDayMap();
  const now = Number(nowMs) || Date.now();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const dayMs = 24 * 3600 * 1000;
  const startWindow = startOfToday.getTime() - (days - 1) * dayMs;
  const buckets = new Array(days).fill(0);
  for (const [iso, raw] of Object.entries(map)) {
    const sec = Number(raw);
    if (!Number.isFinite(sec) || sec <= 0) continue;
    const parts = iso.split('-').map(Number);
    if (parts.length !== 3) continue;
    const t = new Date(parts[0], parts[1] - 1, parts[2]).getTime();
    if (!Number.isFinite(t) || t < startWindow) continue;
    const idx = Math.floor((t - startWindow) / dayMs);
    if (idx >= 0 && idx < days) buckets[idx] += sec;
  }
  return buckets.map((count, i) => {
    const d = new Date(startWindow + i * dayMs);
    const y = d.getFullYear().toString().padStart(4, '0');
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return { dateISO: `${y}-${m}-${day}`, count };
  });
}
