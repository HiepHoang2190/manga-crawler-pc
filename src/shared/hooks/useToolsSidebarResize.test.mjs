import {
  clampToolsSidebarWidth,
  loadToolsSidebarWidth,
  TOOLS_SIDEBAR_WIDTH_KEY,
  TOOLS_SIDEBAR_WIDTH_DEFAULT,
  TOOLS_SIDEBAR_WIDTH_MIN,
  TOOLS_SIDEBAR_WIDTH_MAX,
} from './useToolsSidebarResize.js';

describe('useToolsSidebarResize helpers', () => {
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

  test('clampToolsSidebarWidth clamps to minimum and maximum boundaries', () => {
    expect(clampToolsSidebarWidth(100, 1200)).toBe(TOOLS_SIDEBAR_WIDTH_MIN);
    expect(clampToolsSidebarWidth(500, 1200)).toBe(500);
    expect(clampToolsSidebarWidth(2000, 1200)).toBe(800);
    expect(clampToolsSidebarWidth(700, 800)).toBe(480); // Math.max(280 + 200, 800 - 360) = 480
  });

  test('loadToolsSidebarWidth returns default if localStorage is empty', () => {
    expect(loadToolsSidebarWidth()).toBe(TOOLS_SIDEBAR_WIDTH_DEFAULT);
  });

  test('loadToolsSidebarWidth returns stored value if valid', () => {
    localStorage.setItem(TOOLS_SIDEBAR_WIDTH_KEY, '460');
    expect(loadToolsSidebarWidth()).toBe(460);
  });

  test('loadToolsSidebarWidth returns default if stored value is invalid', () => {
    localStorage.setItem(TOOLS_SIDEBAR_WIDTH_KEY, 'invalid');
    expect(loadToolsSidebarWidth()).toBe(TOOLS_SIDEBAR_WIDTH_DEFAULT);
  });
});
