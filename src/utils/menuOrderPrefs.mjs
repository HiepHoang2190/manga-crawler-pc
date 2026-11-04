export const DEFAULT_MENU_ORDER = [
  'explore',
  'home',
  'toolsStudio',
  'ebookStudio',
  'translate',
  'workflow',
  'plugins',
  'siteChecker',
  'settings',
  'dashboard',
];

export const MENU_ORDER_KEY = 'mangaMenuOrder';

/**
 * Loads menu item order array from localStorage.
 * Sanitizes unknown IDs, removes duplicates, and appends any missing default tabs.
 * @returns {string[]} Ordered array of menu tab IDs
 */
export function loadMenuOrder() {
  if (typeof localStorage === 'undefined') return [...DEFAULT_MENU_ORDER];
  try {
    const raw = localStorage.getItem(MENU_ORDER_KEY);
    if (!raw) return [...DEFAULT_MENU_ORDER];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [...DEFAULT_MENU_ORDER];
    const out = [];
    const seen = new Set();
    const defaultSet = new Set(DEFAULT_MENU_ORDER);
    for (const rawId of arr) {
      let id = String(rawId || '').trim();
      if (id === 'latestUpdates' || id === 'bulkScan') id = 'explore';
      if (!id || !defaultSet.has(id) || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    for (const id of DEFAULT_MENU_ORDER) {
      if (!seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
    let result = [...out];
    // Migration: Ensure explore is first (before home)
    const expIdx = result.indexOf('explore');
    const hIdx = result.indexOf('home');
    if (expIdx !== -1 && hIdx !== -1 && expIdx > hIdx) {
      result = result.filter((id) => id !== 'explore');
      const newHIdx = result.indexOf('home');
      result.splice(newHIdx, 0, 'explore');
    }
    // Migration: Ensure toolsStudio is 2nd and ebookStudio is 3rd (after home)
    const homeIdx = result.indexOf('home');
    const tsIdx = result.indexOf('toolsStudio');
    const ebIdx = result.indexOf('ebookStudio');
    if (homeIdx !== -1 && (tsIdx > homeIdx + 2 || ebIdx > homeIdx + 2)) {
      result = result.filter((id) => id !== 'toolsStudio' && id !== 'ebookStudio');
      const newHIdx = result.indexOf('home');
      result.splice(newHIdx + 1, 0, 'toolsStudio', 'ebookStudio');
    }
    // Migration: Ensure workflow is after translate
    const wfIdx = result.indexOf('workflow');
    const trIdx = result.indexOf('translate');
    if (wfIdx !== -1 && trIdx !== -1 && wfIdx < trIdx) {
      result = result.filter((id) => id !== 'workflow');
      const newTrIdx = result.indexOf('translate');
      result.splice(newTrIdx + 1, 0, 'workflow');
    }
    // Migration: Ensure settings and dashboard are at the very end
    const sIdx = result.indexOf('settings');
    const pIdx = result.indexOf('plugins');
    const scIdx = result.indexOf('siteChecker');
    if (sIdx !== -1 && (sIdx < pIdx || sIdx < scIdx)) {
      result = result.filter((id) => id !== 'settings' && id !== 'dashboard' && id !== 'donate');
      result.push('settings', 'dashboard');
    }
    // Migration: Ensure dashboard is moved to after settings
    const dbIdx = result.indexOf('dashboard');
    const setIdx = result.indexOf('settings');
    if (dbIdx !== -1 && setIdx !== -1 && dbIdx < setIdx) {
      result = result.filter((id) => id !== 'dashboard');
      const newSetIdx = result.indexOf('settings');
      result.splice(newSetIdx + 1, 0, 'dashboard');
    }
    if (JSON.stringify(result) !== JSON.stringify(out)) {
      try {
        localStorage.setItem(MENU_ORDER_KEY, JSON.stringify(result));
      } catch {
        /* ignore */
      }
    }
    return result;
  } catch {
    return [...DEFAULT_MENU_ORDER];
  }
}

/**
 * Saves menu order array to localStorage.
 * @param {string[]} order
 */
export function saveMenuOrder(order) {
  if (typeof localStorage === 'undefined') return;
  const arr = Array.isArray(order) ? order : [];
  try {
    localStorage.setItem(MENU_ORDER_KEY, JSON.stringify(arr));
  } catch {
    /* ignore quota or storage errors */
  }
}

/**
 * Moves an item up (earlier) or down (later) in the order array.
 * @param {string[]} currentOrder
 * @param {string} id
 * @param {'up' | 'down'} direction
 * @returns {string[]} Updated copy of menu order array
 */
export function moveMenuItem(currentOrder, id, direction) {
  const list = Array.isArray(currentOrder) ? [...currentOrder] : [...DEFAULT_MENU_ORDER];
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
 * Reorders an item from one position to another (e.g. via drag-and-drop).
 * @param {string[]} currentOrder
 * @param {string} fromId
 * @param {string} toId
 * @returns {string[]} Updated copy of menu order array
 */
export function reorderMenuItems(currentOrder, fromId, toId) {
  const list = Array.isArray(currentOrder) ? [...currentOrder] : [...DEFAULT_MENU_ORDER];
  const fromIdx = list.indexOf(fromId);
  const toIdx = list.indexOf(toId);
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return list;
  list.splice(fromIdx, 1);
  list.splice(toIdx, 0, fromId);
  return list;
}

/**
 * Clears menu order from localStorage and returns default order.
 * @returns {string[]}
 */
export function resetMenuOrder() {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(MENU_ORDER_KEY);
    } catch {
      /* ignore storage errors */
    }
  }
  return [...DEFAULT_MENU_ORDER];
}

/**
 * Sorts an array of menu item objects { id, ... } by their position in menuOrder.
 * @param {Array<{id: string}>} views
 * @param {string[]} menuOrder
 * @returns {Array<{id: string}>}
 */
export function sortViewsByOrder(views, menuOrder) {
  const list = Array.isArray(views) ? [...views] : [];
  if (!Array.isArray(menuOrder) || menuOrder.length === 0) {
    return list;
  }
  const orderMap = new Map(menuOrder.map((id, idx) => [id, idx]));
  return list.sort((a, b) => {
    const ia = orderMap.has(a?.id) ? orderMap.get(a.id) : 999;
    const ib = orderMap.has(b?.id) ? orderMap.get(b.id) : 999;
    return ia - ib;
  });
}
