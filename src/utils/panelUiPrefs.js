/**
 * Ghi nhớ tab Hàng đợi / Lịch sử / Yêu thích và tùy chọn hiển thị (localStorage).
 */
const STORAGE_KEY = 'mangaPanelUi';

const QUEUE_TABS = [
  'queue',
  'history',
  'favorites',
  'offlineRead',
  'duplicates',
  'cbzExport',
  'pdfExport',
  'imageConvert',
  'sendToKindle',
  'rename',
];

const SORT_MODES = ['titleAsc', 'titleDesc', 'dateDesc', 'dateAsc'];

const HISTORY_FILTERS = ['all', 'error', 'ok', 'skipped'];

/** Độ rộng cột bảng Lịch sử (px) — có thể kéo resize. Cột `manga` là min-width (cột co giãn). */
export const HISTORY_COL_WIDTH_DEFAULTS = {
  cover: 52,
  manga: 220,
  chapter: 128,
  /** Chỉ ngày trong ô; hover có ngày + giờ đầy đủ. */
  time: 100,
  status: 84,
  actions: 192,
};

const COL_KEYS = Object.keys(HISTORY_COL_WIDTH_DEFAULTS);

export function clampHistoryColWidth(key, n) {
  const min = { cover: 48, manga: 96, chapter: 72, time: 88, status: 80, actions: 168 }[key] ?? 64;
  const max = { cover: 88, manga: 480, chapter: 360, time: 320, status: 160, actions: 280 }[key] ?? 400;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function normalizeHistoryColWidths(obj) {
  const base = { ...HISTORY_COL_WIDTH_DEFAULTS };
  if (!obj || typeof obj !== 'object') return base;
  for (const k of COL_KEYS) {
    const n = Number(obj[k]);
    if (Number.isFinite(n)) base[k] = clampHistoryColWidth(k, n);
  }
  return base;
}

const OFFLINE_SORT_MODES = ['titleAsc', 'titleDesc'];

const BULK_SCAN_PAGE_SIZES = [24, 48, 96];

const DEFAULTS = {
  queueTab: 'queue',
  favorites: {
    viewMode: 'grid',
    siteFilter: '',
    sortMode: 'titleAsc',
  },
  offlineRead: {
    viewMode: 'grid',
    sortMode: 'titleAsc',
  },
  history: {
    statusFilter: 'all',
    colWidths: { ...HISTORY_COL_WIDTH_DEFAULTS },
  },
  bulkScan: {
    viewMode: 'grid',
    pageSize: 24,
  },
};

function normalizeBulkScanPageSize(n) {
  const num = Number(n);
  return BULK_SCAN_PAGE_SIZES.includes(num) ? num : DEFAULTS.bulkScan.pageSize;
}

function normalize(loaded) {
  if (!loaded || typeof loaded !== 'object')
    return {
      ...DEFAULTS,
      favorites: { ...DEFAULTS.favorites },
      offlineRead: { ...DEFAULTS.offlineRead },
      history: { ...DEFAULTS.history, colWidths: { ...DEFAULTS.history.colWidths } },
      bulkScan: { ...DEFAULTS.bulkScan },
    };

  const queueTab = QUEUE_TABS.includes(loaded.queueTab) ? loaded.queueTab : DEFAULTS.queueTab;

  const fav = loaded.favorites && typeof loaded.favorites === 'object' ? loaded.favorites : {};
  const viewMode = fav.viewMode === 'list' ? 'list' : 'grid';
  const siteFilter = typeof fav.siteFilter === 'string' ? fav.siteFilter : '';
  const sortMode = SORT_MODES.includes(fav.sortMode) ? fav.sortMode : DEFAULTS.favorites.sortMode;

  const off = loaded.offlineRead && typeof loaded.offlineRead === 'object' ? loaded.offlineRead : {};
  const offlineViewMode = off.viewMode === 'list' ? 'list' : 'grid';
  const offlineSortMode = OFFLINE_SORT_MODES.includes(off.sortMode)
    ? off.sortMode
    : DEFAULTS.offlineRead.sortMode;

  const hist = loaded.history && typeof loaded.history === 'object' ? loaded.history : {};
  const statusFilter = HISTORY_FILTERS.includes(hist.statusFilter) ? hist.statusFilter : DEFAULTS.history.statusFilter;
  const colWidths = normalizeHistoryColWidths(hist.colWidths);

  const bs = loaded.bulkScan && typeof loaded.bulkScan === 'object' ? loaded.bulkScan : {};
  const bulkScanViewMode = bs.viewMode === 'list' ? 'list' : 'grid';
  const bulkScanPageSize = normalizeBulkScanPageSize(bs.pageSize);

  return {
    queueTab,
    favorites: { viewMode, siteFilter, sortMode },
    offlineRead: { viewMode: offlineViewMode, sortMode: offlineSortMode },
    history: { statusFilter, colWidths },
    bulkScan: { viewMode: bulkScanViewMode, pageSize: bulkScanPageSize },
  };
}

export function loadPanelUi() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        ...DEFAULTS,
        favorites: { ...DEFAULTS.favorites },
        offlineRead: { ...DEFAULTS.offlineRead },
        history: { ...DEFAULTS.history, colWidths: { ...DEFAULTS.history.colWidths } },
        bulkScan: { ...DEFAULTS.bulkScan },
      };
    }
    return normalize(JSON.parse(raw));
  } catch {
    return {
      ...DEFAULTS,
      favorites: { ...DEFAULTS.favorites },
      offlineRead: { ...DEFAULTS.offlineRead },
      history: { ...DEFAULTS.history, colWidths: { ...DEFAULTS.history.colWidths } },
      bulkScan: { ...DEFAULTS.bulkScan },
    };
  }
}

export function saveSettingsCollapsed(key, collapsed) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const cur = raw ? JSON.parse(raw) : {};
    const sc = cur.settingsCollapsed && typeof cur.settingsCollapsed === 'object' ? cur.settingsCollapsed : {};
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...cur, settingsCollapsed: { ...sc, [key]: collapsed } }));
  } catch { /* quota */ }
}

export function loadSettingsCollapsed(key, defaultOpen = false) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultOpen;
    const cur = JSON.parse(raw);
    const sc = cur.settingsCollapsed;
    if (!sc || typeof sc !== 'object' || !(key in sc)) return defaultOpen;
    return !sc[key];
  } catch {
    return defaultOpen;
  }
}

export function savePanelUi(partial) {
  try {
    const cur = loadPanelUi();
    const raw = localStorage.getItem(STORAGE_KEY);
    const rawParsed = raw ? JSON.parse(raw) : {};
    const settingsCollapsed = rawParsed.settingsCollapsed && typeof rawParsed.settingsCollapsed === 'object'
      ? rawParsed.settingsCollapsed : {};
    const next = {
      queueTab: partial.queueTab != null ? partial.queueTab : cur.queueTab,
      favorites: {
        ...cur.favorites,
        ...(partial.favorites && typeof partial.favorites === 'object' ? partial.favorites : {}),
      },
      offlineRead: {
        ...cur.offlineRead,
        ...(partial.offlineRead && typeof partial.offlineRead === 'object' ? partial.offlineRead : {}),
      },
      history: {
        ...cur.history,
        ...(partial.history && typeof partial.history === 'object' ? partial.history : {}),
        colWidths:
          partial.history?.colWidths && typeof partial.history.colWidths === 'object'
            ? normalizeHistoryColWidths(partial.history.colWidths)
            : cur.history.colWidths,
      },
      bulkScan: {
        ...cur.bulkScan,
        ...(partial.bulkScan && typeof partial.bulkScan === 'object' ? partial.bulkScan : {}),
        pageSize: normalizeBulkScanPageSize(
          partial.bulkScan?.pageSize != null ? partial.bulkScan.pageSize : cur.bulkScan.pageSize,
        ),
        viewMode:
          (partial.bulkScan?.viewMode ?? cur.bulkScan.viewMode) === 'list' ? 'list' : 'grid',
      },
      settingsCollapsed,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* quota */
  }
}
