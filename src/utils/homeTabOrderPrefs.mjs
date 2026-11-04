export const DEFAULT_HOME_TAB_ORDER = [
  'queue',
  'history',
  'offlineRead',
];

export const HOME_TAB_ORDER_KEY = 'mangaHomeTabOrder';
export const HOME_TAB_HIDDEN_KEY = 'mangaHomeTabHiddenIds';
export const HOME_TAB_PINNED_COUNT_KEY = 'mangaHomeTabPinnedCount';
export const DEFAULT_PINNED_TAB_COUNT = 3;

const DEFAULT_HOME_TAB_SET = new Set(DEFAULT_HOME_TAB_ORDER);

/**
 * Loads home tab order array from localStorage.
 * Sanitizes unknown IDs, removes duplicates, and appends any missing default tabs.
 * @returns {string[]} Ordered array of home tab IDs
 */
export function loadHomeTabOrder() {
  if (typeof localStorage === 'undefined') return [...DEFAULT_HOME_TAB_ORDER];
  try {
    const raw = localStorage.getItem(HOME_TAB_ORDER_KEY);
    if (!raw) return [...DEFAULT_HOME_TAB_ORDER];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [...DEFAULT_HOME_TAB_ORDER];
    const out = [];
    const seen = new Set();
    for (const rawId of arr) {
      const id = String(rawId || '').trim();
      if (!id || !DEFAULT_HOME_TAB_SET.has(id) || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    for (const id of DEFAULT_HOME_TAB_ORDER) {
      if (!seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
    return out;
  } catch {
    return [...DEFAULT_HOME_TAB_ORDER];
  }
}

/**
 * Saves home tab order array to localStorage.
 * @param {string[]} order
 */
export function saveHomeTabOrder(order) {
  if (typeof localStorage === 'undefined') return;
  const arr = Array.isArray(order) ? order : [];
  try {
    localStorage.setItem(HOME_TAB_ORDER_KEY, JSON.stringify(arr));
  } catch {
    /* ignore storage errors */
  }
}

/**
 * Loads hidden tab IDs from localStorage.
 * 'queue' tab is never permitted to be hidden.
 * @returns {string[]} Array of hidden tab IDs
 */
export function loadHomeTabHiddenIds() {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(HOME_TAB_HIDDEN_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    const filtered = arr
      .map((id) => String(id || '').trim())
      .filter((id) => id && id !== 'queue' && DEFAULT_HOME_TAB_SET.has(id));
    return [...new Set(filtered)];
  } catch {
    return [];
  }
}

/**
 * Saves hidden tab IDs to localStorage, stripping 'queue' if present.
 * @param {string[]} ids
 */
export function saveHomeTabHiddenIds(ids) {
  if (typeof localStorage === 'undefined') return;
  const arr = Array.isArray(ids) ? ids : [];
  const safe = arr
    .map((id) => String(id || '').trim())
    .filter((id) => id && id !== 'queue' && DEFAULT_HOME_TAB_SET.has(id));
  try {
    localStorage.setItem(HOME_TAB_HIDDEN_KEY, JSON.stringify([...new Set(safe)]));
  } catch {
    /* ignore storage errors */
  }
}

/**
 * Moves a tab up (earlier) or down (later) in the order array.
 * @param {string[]} currentOrder
 * @param {string} id
 * @param {'up' | 'down'} direction
 * @returns {string[]}
 */
export function moveHomeTab(currentOrder, id, direction) {
  const list = Array.isArray(currentOrder) ? [...currentOrder] : [...DEFAULT_HOME_TAB_ORDER];
  const idx = list.indexOf(id);
  if (idx < 0) return list;
  if (direction === 'up' && idx > 0) {
    const tmp = list[idx - 1];
    list[idx - 1] = list[idx];
    list[idx] = tmp;
  } else if (direction === 'down' && idx < list.length - 1) {
    const tmp = list[idx + 1];
    list[idx + 1] = list[idx];
    list[idx] = tmp;
  }
  return list;
}

/**
 * Reorders a tab from one position to another (via drag-and-drop).
 * @param {string[]} currentOrder
 * @param {string} fromId
 * @param {string} toId
 * @returns {string[]}
 */
export function reorderHomeTabs(currentOrder, fromId, toId) {
  const list = Array.isArray(currentOrder) ? [...currentOrder] : [...DEFAULT_HOME_TAB_ORDER];
  const fromIdx = list.indexOf(fromId);
  const toIdx = list.indexOf(toId);
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return list;
  list.splice(fromIdx, 1);
  list.splice(toIdx, 0, fromId);
  return list;
}

/**
 * Loads pinned tab count from localStorage.
 * Constrained between 1 and 8 tabs.
 * @returns {number}
 */
export function loadHomePinnedTabCount() {
  if (typeof localStorage === 'undefined') return DEFAULT_PINNED_TAB_COUNT;
  try {
    const raw = localStorage.getItem(HOME_TAB_PINNED_COUNT_KEY);
    if (!raw) return DEFAULT_PINNED_TAB_COUNT;
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 1 && n <= 8) return n;
  } catch {
    /* ignore storage errors */
  }
  return DEFAULT_PINNED_TAB_COUNT;
}

/**
 * Saves pinned tab count to localStorage.
 * @param {number} count
 */
export function saveHomePinnedTabCount(count) {
  if (typeof localStorage === 'undefined') return;
  const n = Number(count);
  const safe = Number.isInteger(n) && n >= 1 && n <= 8 ? n : DEFAULT_PINNED_TAB_COUNT;
  try {
    localStorage.setItem(HOME_TAB_PINNED_COUNT_KEY, String(safe));
  } catch {
    /* ignore storage errors */
  }
}

/**
 * Resets home tab order and hidden preferences in localStorage.
 * @returns {{ tabOrder: string[], hiddenTabIds: string[], pinnedTabCount: number }}
 */
export function resetHomeTabPrefs() {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(HOME_TAB_ORDER_KEY);
      localStorage.removeItem(HOME_TAB_HIDDEN_KEY);
      localStorage.removeItem(HOME_TAB_PINNED_COUNT_KEY);
    } catch {
      /* ignore storage errors */
    }
  }
  return {
    tabOrder: [...DEFAULT_HOME_TAB_ORDER],
    hiddenTabIds: [],
    pinnedTabCount: DEFAULT_PINNED_TAB_COUNT,
  };
}

/**
 * Sorts an array of tab objects { id, ... } by their position in tabOrder.
 * @param {Array<{id: string}>} tabs
 * @param {string[]} tabOrder
 * @returns {Array<{id: string}>}
 */
export function sortTabsByOrder(tabs, tabOrder) {
  const list = Array.isArray(tabs) ? [...tabs] : [];
  if (!Array.isArray(tabOrder) || tabOrder.length === 0) {
    return list;
  }
  const orderMap = new Map(tabOrder.map((id, idx) => [id, idx]));
  return list.sort((a, b) => {
    const ia = orderMap.has(a?.id) ? orderMap.get(a.id) : 999;
    const ib = orderMap.has(b?.id) ? orderMap.get(b.id) : 999;
    return ia - ib;
  });
}
