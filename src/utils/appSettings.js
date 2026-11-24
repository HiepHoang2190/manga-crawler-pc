/** Cài đặt ứng dụng (localStorage) — đồng bộ với giới hạn backend (1–5 luồng). */
const THREADS_KEY = "mangaDownloadThreads";
const AUTO_RETRY_MAX_KEY = "mangaAutoRetryMax";
const DUPLICATE_SCAN_RECURSIVE_KEY = "duplicateScanRecursive_v2";
const FAVORITE_AUTO_CHECK_ENABLED_KEY = "mangaFavoriteAutoCheckEnabled";
const FAVORITE_AUTO_CHECK_INTERVAL_MIN_KEY = "mangaFavoriteAutoCheckIntervalMin";
// Transient per-machine polling timestamp; intentionally excluded from userDataBackup sync sections.
export const FAVORITE_AUTO_CHECK_LAST_AT_KEY = "mangaFavoriteAutoCheckLastAt";
export const FAVORITE_AUTO_CHECK_INTERVAL_PRESETS = [15, 30, 60, 180, 360, 720, 1440];
const MANGADEX_VOLUME_FOLDER_GROUPING_KEY = "mangadex_volume_folder_grouping_v1";

export function loadMangadexVolumeFolderGrouping() {
  try {
    const raw = localStorage.getItem(MANGADEX_VOLUME_FOLDER_GROUPING_KEY);
    if (raw == null) return true;
    return raw !== "false";
  } catch {
    return true;
  }
}

export function saveMangadexVolumeFolderGrouping(value) {
  try {
    localStorage.setItem(MANGADEX_VOLUME_FOLDER_GROUPING_KEY, value ? "true" : "false");
  } catch {
    /* quota */
  }
}

function clampThreads(n) {
  const x = Number(n);
  const v = Number.isFinite(x) ? Math.floor(x) : 5;
  return Math.max(1, Math.min(v || 5, 5));
}

export function loadThreads() {
  try {
    const raw = localStorage.getItem(THREADS_KEY);
    if (raw == null) return 5;
    return clampThreads(JSON.parse(raw));
  } catch {
    return 5;
  }
}

export function saveThreads(n) {
  try {
    localStorage.setItem(THREADS_KEY, JSON.stringify(clampThreads(n)));
  } catch {
    /* quota */
  }
}

export function loadDuplicateScanRecursive() {
  try {
    const raw = localStorage.getItem(DUPLICATE_SCAN_RECURSIVE_KEY);
    if (raw == null) return true;
    return JSON.parse(raw) === true;
  } catch {
    return true;
  }
}

export function saveDuplicateScanRecursive(value) {
  try {
    localStorage.setItem(DUPLICATE_SCAN_RECURSIVE_KEY, JSON.stringify(Boolean(value)));
  } catch {
    /* quota */
  }
}

/** Tối thiểu 15 phút; tối đa 1440 (24 giờ) giữa hai lần kiểm tra. */
const FAVORITE_AUTO_CHECK_INTERVAL_MIN_MIN = 15;
const FAVORITE_AUTO_CHECK_INTERVAL_MIN_MAX = 24 * 60;

export function clampFavoriteAutoIntervalMin(n) {
  const x = Number(n);
  const v = Number.isFinite(x) ? Math.floor(x) : 60;
  return Math.max(
    FAVORITE_AUTO_CHECK_INTERVAL_MIN_MIN,
    Math.min(v || 60, FAVORITE_AUTO_CHECK_INTERVAL_MIN_MAX)
  );
}

export function loadFavoriteAutoCheckEnabled() {
  try {
    const raw = localStorage.getItem(FAVORITE_AUTO_CHECK_ENABLED_KEY);
    if (raw == null) return false;
    return JSON.parse(raw) === true;
  } catch {
    return false;
  }
}

export function saveFavoriteAutoCheckEnabled(value) {
  try {
    localStorage.setItem(FAVORITE_AUTO_CHECK_ENABLED_KEY, JSON.stringify(Boolean(value)));
  } catch {
    /* quota */
  }
}

export function loadFavoriteAutoCheckIntervalMin() {
  try {
    const raw = localStorage.getItem(FAVORITE_AUTO_CHECK_INTERVAL_MIN_KEY);
    if (raw == null) return 60;
    return clampFavoriteAutoIntervalMin(JSON.parse(raw));
  } catch {
    return 60;
  }
}

export function saveFavoriteAutoCheckIntervalMin(n) {
  try {
    localStorage.setItem(FAVORITE_AUTO_CHECK_INTERVAL_MIN_KEY, JSON.stringify(clampFavoriteAutoIntervalMin(n)));
  } catch {
    /* quota */
  }
}

export function loadFavoriteAutoCheckLastAt() {
  try {
    const raw = localStorage.getItem(FAVORITE_AUTO_CHECK_LAST_AT_KEY);
    if (raw == null) return 0;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

export function saveFavoriteAutoCheckLastAt(ts) {
  try {
    const n = Number(ts);
    const val = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    localStorage.setItem(FAVORITE_AUTO_CHECK_LAST_AT_KEY, String(val));
  } catch {
    /* quota */
  }
}

/**
 * Selects favorites eligible for background periodic checks (all followed manga unless
 * explicitly muted via `notifyWatch: false`).
 */
export function selectPeriodicCheckFavorites(favorites) {
  return (Array.isArray(favorites) ? favorites : []).filter(
    (f) => f && f.notifyWatch !== false
  );
}

/**
 * Returns true if periodic checking is enabled, a prior check timestamp exists, and at
 * least one full interval has elapsed since that check.
 */
export function shouldRunStartupCatchUpCheck({
  enabled,
  intervalMin,
  lastCheckAt,
  now = Date.now(),
} = {}) {
  if (!enabled) return false;
  const last = Number(lastCheckAt);
  if (!Number.isFinite(last) || last <= 0) return false;
  const intervalMs = clampFavoriteAutoIntervalMin(intervalMin) * 60 * 1000;
  return now - last >= intervalMs;
}

export function formatFavoriteAutoCheckInterval(minutes, t) {
  const m = clampFavoriteAutoIntervalMin(minutes);
  if (m < 60) {
    return t('settings.time.minutes', { m });
  }
  if (m % 60 === 0) {
    return t('settings.time.hours', { h: Math.floor(m / 60) });
  }
  return t('settings.time.hoursMinutes', {
    h: Math.floor(m / 60),
    m: m % 60,
  });
}

export function formatFavoriteAutoCheckLastAt(ts, t) {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) {
    return t('settings.favoritesAutoCheckNever');
  }
  try {
    return new Date(n).toLocaleString();
  } catch {
    return t('settings.favoritesAutoCheckNever');
  }
}

/** Auto-retry max — số lần thử lại tự động khi tải thất bại (0–10, mặc định 0). */
export function clampAutoRetryMax(n) {
  return Math.max(0, Math.min(10, Math.floor(Number(n) || 0)));
}

export function loadAutoRetryMax() {
  try {
    const raw = localStorage.getItem(AUTO_RETRY_MAX_KEY);
    if (raw == null) return 0;
    return clampAutoRetryMax(JSON.parse(raw));
  } catch {
    return 0;
  }
}

export function saveAutoRetryMax(n) {
  try {
    localStorage.setItem(AUTO_RETRY_MAX_KEY, JSON.stringify(clampAutoRetryMax(n)));
  } catch {
    /* quota */
  }
}

export const FAVORITE_AUTO_DOWNLOAD_ENABLED_KEY = "mangaFavoriteAutoDownloadEnabled";
export const FAVORITE_AUTO_DOWNLOAD_MODE_KEY = "mangaFavoriteAutoDownloadMode";
export const FAVORITE_AUTO_DOWNLOAD_WORKFLOW_ID_KEY = "mangaFavoriteAutoDownloadWorkflowId";

export function loadFavoriteAutoDownloadEnabled() {
  try {
    const raw = localStorage.getItem(FAVORITE_AUTO_DOWNLOAD_ENABLED_KEY);
    if (raw == null) return false;
    return JSON.parse(raw) === true;
  } catch {
    return false;
  }
}

export function saveFavoriteAutoDownloadEnabled(value) {
  try {
    localStorage.setItem(FAVORITE_AUTO_DOWNLOAD_ENABLED_KEY, JSON.stringify(Boolean(value)));
  } catch {
    /* quota */
  }
}

export function loadFavoriteAutoDownloadMode() {
  try {
    const raw = localStorage.getItem(FAVORITE_AUTO_DOWNLOAD_MODE_KEY);
    if (raw === 'workflow') return 'workflow';
    return 'queue';
  } catch {
    return 'queue';
  }
}

export function saveFavoriteAutoDownloadMode(mode) {
  try {
    const val = mode === 'workflow' ? 'workflow' : 'queue';
    localStorage.setItem(FAVORITE_AUTO_DOWNLOAD_MODE_KEY, val);
  } catch {
    /* quota */
  }
}

export function loadFavoriteAutoDownloadWorkflowId() {
  try {
    return localStorage.getItem(FAVORITE_AUTO_DOWNLOAD_WORKFLOW_ID_KEY) || '';
  } catch {
    return '';
  }
}

export function saveFavoriteAutoDownloadWorkflowId(id) {
  try {
    localStorage.setItem(FAVORITE_AUTO_DOWNLOAD_WORKFLOW_ID_KEY, String(id || ''));
  } catch {
    /* quota */
  }
}
