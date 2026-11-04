import {
  DEFAULT_HOME_TAB_ORDER,
  DEFAULT_PINNED_TAB_COUNT,
  HOME_TAB_ORDER_KEY,
  HOME_TAB_HIDDEN_KEY,
  HOME_TAB_PINNED_COUNT_KEY,
  loadHomeTabOrder,
  saveHomeTabOrder,
  loadHomeTabHiddenIds,
  saveHomeTabHiddenIds,
  loadHomePinnedTabCount,
  saveHomePinnedTabCount,
  moveHomeTab,
  reorderHomeTabs,
  resetHomeTabPrefs,
  sortTabsByOrder,
} from './homeTabOrderPrefs.mjs';

describe('homeTabOrderPrefs', () => {
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

  test('DEFAULT_HOME_TAB_ORDER contains all standard 3 tabs in exact order', () => {
    expect(DEFAULT_HOME_TAB_ORDER).toEqual([
      'queue',
      'history',
      'offlineRead',
    ]);
    expect(DEFAULT_HOME_TAB_ORDER.length).toBe(3);
  });

  test('loadHomeTabOrder returns DEFAULT_HOME_TAB_ORDER when storage is empty', () => {
    const res = loadHomeTabOrder();
    expect(res).toEqual(DEFAULT_HOME_TAB_ORDER);
  });

  test('loadHomeTabOrder sanitizes unknown IDs, removes duplicates, and appends missing tabs', () => {
    localStorage.setItem(
      HOME_TAB_ORDER_KEY,
      JSON.stringify(['history', 'queue', 'unknownId', 'history']),
    );
    const res = loadHomeTabOrder();
    expect(res[0]).toBe('history');
    expect(res[1]).toBe('queue');
    expect(res).not.toContain('unknownId');
    expect(res.length).toBe(3);
    expect(new Set(res).size).toBe(3);
  });

  test('saveHomeTabOrder stores stringified order to localStorage', () => {
    const newOrder = [...DEFAULT_HOME_TAB_ORDER].reverse();
    saveHomeTabOrder(newOrder);
    expect(JSON.parse(localStorage.getItem(HOME_TAB_ORDER_KEY))).toEqual(newOrder);
  });

  test('loadHomeTabHiddenIds returns empty array by default', () => {
    expect(loadHomeTabHiddenIds()).toEqual([]);
  });

  test('loadHomeTabHiddenIds never allows queue to be hidden', () => {
    localStorage.setItem(
      HOME_TAB_HIDDEN_KEY,
      JSON.stringify(['queue', 'offlineRead', 'history', 'invalidTab']),
    );
    const hidden = loadHomeTabHiddenIds();
    expect(hidden).not.toContain('queue');
    expect(hidden).not.toContain('invalidTab');
    expect(hidden).toContain('offlineRead');
    expect(hidden).toContain('history');
  });

  test('saveHomeTabHiddenIds strips queue if passed', () => {
    saveHomeTabHiddenIds(['queue', 'offlineRead', 'history']);
    const stored = JSON.parse(localStorage.getItem(HOME_TAB_HIDDEN_KEY));
    expect(stored).not.toContain('queue');
    expect(stored).toContain('offlineRead');
    expect(stored).toContain('history');
  });

  test('moveHomeTab moves item up and down', () => {
    const initial = ['queue', 'history', 'offlineRead'];
    const movedUp = moveHomeTab(initial, 'history', 'up');
    expect(movedUp).toEqual(['history', 'queue', 'offlineRead']);

    const cantMoveUpFirst = moveHomeTab(initial, 'queue', 'up');
    expect(cantMoveUpFirst).toEqual(initial);

    const movedDown = moveHomeTab(initial, 'history', 'down');
    expect(movedDown).toEqual(['queue', 'offlineRead', 'history']);

    const cantMoveDownLast = moveHomeTab(initial, 'offlineRead', 'down');
    expect(cantMoveDownLast).toEqual(initial);
  });

  test('reorderHomeTabs repositions item correctly', () => {
    const initial = ['queue', 'history', 'offlineRead', 'cbzExport'];
    const reordered = reorderHomeTabs(initial, 'cbzExport', 'queue');
    expect(reordered).toEqual(['cbzExport', 'queue', 'history', 'offlineRead']);
  });

  test('DEFAULT_PINNED_TAB_COUNT is 3', () => {
    expect(DEFAULT_PINNED_TAB_COUNT).toBe(3);
  });

  test('loadHomePinnedTabCount returns DEFAULT_PINNED_TAB_COUNT when storage is empty', () => {
    expect(loadHomePinnedTabCount()).toBe(3);
  });

  test('loadHomePinnedTabCount returns stored valid integer', () => {
    localStorage.setItem(HOME_TAB_PINNED_COUNT_KEY, '5');
    expect(loadHomePinnedTabCount()).toBe(5);
  });

  test('loadHomePinnedTabCount falls back to 3 for invalid values or out of bounds', () => {
    localStorage.setItem(HOME_TAB_PINNED_COUNT_KEY, 'not-a-number');
    expect(loadHomePinnedTabCount()).toBe(3);
    localStorage.setItem(HOME_TAB_PINNED_COUNT_KEY, '0');
    expect(loadHomePinnedTabCount()).toBe(3);
    localStorage.setItem(HOME_TAB_PINNED_COUNT_KEY, '99');
    expect(loadHomePinnedTabCount()).toBe(3);
  });

  test('saveHomePinnedTabCount stores value into localStorage', () => {
    saveHomePinnedTabCount(6);
    expect(localStorage.getItem(HOME_TAB_PINNED_COUNT_KEY)).toBe('6');
  });

  test('resetHomeTabPrefs removes keys from localStorage and returns defaults', () => {
    localStorage.setItem(HOME_TAB_ORDER_KEY, JSON.stringify(['offlineRead']));
    localStorage.setItem(HOME_TAB_HIDDEN_KEY, JSON.stringify(['history']));
    localStorage.setItem(HOME_TAB_PINNED_COUNT_KEY, '6');
    const res = resetHomeTabPrefs();
    expect(localStorage.getItem(HOME_TAB_ORDER_KEY)).toBeNull();
    expect(localStorage.getItem(HOME_TAB_HIDDEN_KEY)).toBeNull();
    expect(localStorage.getItem(HOME_TAB_PINNED_COUNT_KEY)).toBeNull();
    expect(res.tabOrder).toEqual(DEFAULT_HOME_TAB_ORDER);
    expect(res.hiddenTabIds).toEqual([]);
    expect(res.pinnedTabCount).toBe(3);
  });

  test('sortTabsByOrder sorts array of tab objects based on tabOrder', () => {
    const tabs = [{ id: 'favorites' }, { id: 'queue' }, { id: 'history' }];
    const order = ['queue', 'history', 'favorites'];
    const sorted = sortTabsByOrder(tabs, order);
    expect(sorted.map((t) => t.id)).toEqual(['queue', 'history', 'favorites']);
  });
});
