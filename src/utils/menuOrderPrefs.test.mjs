import {
  DEFAULT_MENU_ORDER,
  MENU_ORDER_KEY,
  loadMenuOrder,
  saveMenuOrder,
  moveMenuItem,
  reorderMenuItems,
  resetMenuOrder,
  sortViewsByOrder,
} from './menuOrderPrefs.mjs';

describe('menuOrderPrefs', () => {
  beforeEach(() => {
    globalThis.localStorage = {
      _m: new Map(),
      getItem(k) {
        return this._m.has(k) ? this._m.get(k) : null;
      },
      setItem(k, v) {
        this._m.set(k, String(v));
      },
      removeItem(k) {
        this._m.delete(k);
      },
    };
  });

  test('DEFAULT_MENU_ORDER contains all standard 10 tabs in exact requested order', () => {
    expect(DEFAULT_MENU_ORDER).toEqual([
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
    ]);
    expect(DEFAULT_MENU_ORDER.length).toBe(10);
  });

  test('loadMenuOrder returns DEFAULT_MENU_ORDER when storage is empty', () => {
    const res = loadMenuOrder();
    expect(res).toEqual(DEFAULT_MENU_ORDER);
  });

  test('loadMenuOrder sanitizes unknown IDs, removes duplicates, and appends missing tabs', () => {
    localStorage.setItem(
      MENU_ORDER_KEY,
      JSON.stringify(['explore', 'home', 'toolsStudio', 'ebookStudio', 'unknownId', 'explore']),
    );
    const res = loadMenuOrder();
    expect(res[0]).toBe('explore');
    expect(res[1]).toBe('home');
    expect(res[2]).toBe('toolsStudio');
    expect(res[3]).toBe('ebookStudio');
    expect(res).not.toContain('unknownId');
    expect(res.length).toBe(DEFAULT_MENU_ORDER.length);
  });

  test('loadMenuOrder migrates legacy latestUpdates and bulkScan to explore', () => {
    localStorage.setItem(
      MENU_ORDER_KEY,
      JSON.stringify(['home', 'latestUpdates', 'bulkScan', 'settings']),
    );
    const res = loadMenuOrder();
    expect(res).toContain('explore');
    expect(res).not.toContain('latestUpdates');
    expect(res).not.toContain('bulkScan');
    // Ensure only 1 explore entry despite 2 legacy tabs
    expect(res.filter((id) => id === 'explore').length).toBe(1);
  });

  test('loadMenuOrder automatically migrates explore to first position when legacy order had explore after home', () => {
    localStorage.setItem(
      MENU_ORDER_KEY,
      JSON.stringify(['home', 'toolsStudio', 'ebookStudio', 'explore']),
    );
    const res = loadMenuOrder();
    expect(res[0]).toBe('explore');
    expect(res[1]).toBe('home');
  });

  test('loadMenuOrder automatically migrates settings and dashboard to the very end', () => {
    const legacyOrder = [
      'home',
      'toolsStudio',
      'ebookStudio',
      'settings',
      'donate',
      'dashboard',
      'latestUpdates',
      'translate',
      'workflow',
      'bulkScan',
      'plugins',
      'siteChecker',
    ];
    localStorage.setItem(MENU_ORDER_KEY, JSON.stringify(legacyOrder));
    const res = loadMenuOrder();
    expect(res.slice(-2)).toEqual(['settings', 'dashboard']);
    expect(res.length).toBe(DEFAULT_MENU_ORDER.length);
  });

  test('loadMenuOrder automatically migrates dashboard from position 4 to after settings', () => {
    const legacyOrder = [
      'home',
      'toolsStudio',
      'ebookStudio',
      'dashboard',
      'latestUpdates',
      'translate',
      'workflow',
      'bulkScan',
      'plugins',
      'siteChecker',
      'settings',
    ];
    localStorage.setItem(MENU_ORDER_KEY, JSON.stringify(legacyOrder));
    const res = loadMenuOrder();
    const setIdx = res.indexOf('settings');
    const dbIdx = res.indexOf('dashboard');
    expect(dbIdx).toBe(setIdx + 1);
    expect(res).toEqual(DEFAULT_MENU_ORDER);
  });

  test('loadMenuOrder automatically migrates legacy order with workflow before translate to after translate', () => {
    const legacyOrder = [
      'home',
      'toolsStudio',
      'ebookStudio',
      'workflow',
      'dashboard',
      'latestUpdates',
      'translate',
      'bulkScan',
      'settings',
      'help',
      'donate',
      'plugins',
      'siteChecker',
    ];
    localStorage.setItem(MENU_ORDER_KEY, JSON.stringify(legacyOrder));
    const res = loadMenuOrder();
    const wfIdx = res.indexOf('workflow');
    const trIdx = res.indexOf('translate');
    expect(wfIdx).toBe(trIdx + 1);
  });

  test('saveMenuOrder saves order array to localStorage', () => {
    const customOrder = ['settings', 'home', ...DEFAULT_MENU_ORDER.filter((id) => id !== 'settings' && id !== 'home')];
    saveMenuOrder(customOrder);
    const stored = JSON.parse(localStorage.getItem(MENU_ORDER_KEY));
    expect(stored).toEqual(customOrder);
  });

  test('moveMenuItem moves item up correctly', () => {
    const order = ['home', 'latestUpdates', 'settings'];
    const moved = moveMenuItem(order, 'settings', 'up');
    expect(moved).toEqual(['home', 'settings', 'latestUpdates']);
  });

  test('moveMenuItem moves item down correctly', () => {
    const order = ['home', 'latestUpdates', 'settings'];
    const moved = moveMenuItem(order, 'home', 'down');
    expect(moved).toEqual(['latestUpdates', 'home', 'settings']);
  });

  test('moveMenuItem ignores out-of-bounds up/down moves', () => {
    const order = ['home', 'latestUpdates', 'settings'];
    expect(moveMenuItem(order, 'home', 'up')).toEqual(order);
    expect(moveMenuItem(order, 'settings', 'down')).toEqual(order);
    expect(moveMenuItem(order, 'nonexistent', 'up')).toEqual(order);
  });

  test('resetMenuOrder clears localStorage key and returns default order', () => {
    saveMenuOrder(['settings', ...DEFAULT_MENU_ORDER.filter((x) => x !== 'settings')]);
    const res = resetMenuOrder();
    expect(res).toEqual(DEFAULT_MENU_ORDER);
    expect(localStorage.getItem(MENU_ORDER_KEY)).toBeNull();
  });

  test('sortViewsByOrder sorts array of views based on menuOrder', () => {
    const views = [
      { id: 'home', title: 'Home' },
      { id: 'settings', title: 'Settings' },
      { id: 'plugins', title: 'Plugins' },
    ];
    const sorted = sortViewsByOrder(views, ['settings', 'plugins', 'home']);
    expect(sorted.map((v) => v.id)).toEqual(['settings', 'plugins', 'home']);
  });

  test('reorderMenuItems reorders item from one position to another correctly', () => {
    const order = ['home', 'latestUpdates', 'bulkScan', 'settings'];
    const result = reorderMenuItems(order, 'settings', 'latestUpdates');
    expect(result).toEqual(['home', 'settings', 'latestUpdates', 'bulkScan']);
  });

  test('reorderMenuItems returns unchanged array if fromId/toId is invalid or same', () => {
    const order = ['home', 'latestUpdates', 'bulkScan'];
    expect(reorderMenuItems(order, 'home', 'home')).toEqual(order);
    expect(reorderMenuItems(order, 'unknown', 'home')).toEqual(order);
    expect(reorderMenuItems(order, 'home', 'unknown')).toEqual(order);
  });
});
