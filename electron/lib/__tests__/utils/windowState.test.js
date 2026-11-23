const {
  DEFAULT_WINDOW_BOUNDS,
  clampWindowBounds,
  sanitizeWindowBoundsForSave,
} = require('../../shared/windowState');

describe('windowState utilities', () => {
  const displays = [
    { workArea: { x: 0, y: 25, width: 1920, height: 1055 } },
    { workArea: { x: 1920, y: 0, width: 1440, height: 900 } },
  ];

  test('returns default bounds when saved state is missing', () => {
    expect(clampWindowBounds(null, displays)).toEqual({
      width: DEFAULT_WINDOW_BOUNDS.width,
      height: DEFAULT_WINDOW_BOUNDS.height,
      isMaximized: false,
    });
  });

  test('preserves valid saved bounds on primary or secondary monitor', () => {
    const saved = { width: 1360, height: 840, x: 2000, y: 40, isMaximized: true };
    expect(clampWindowBounds(saved, displays)).toEqual({
      width: 1360,
      height: 840,
      x: 2000,
      y: 40,
      isMaximized: true,
    });
  });

  test('drops off-screen coordinates when external monitor is disconnected', () => {
    const saved = { width: 1300, height: 820, x: 3800, y: 100, isMaximized: false };
    const result = clampWindowBounds(saved, [displays[0]]);
    expect(result).toEqual({
      width: 1300,
      height: 820,
      isMaximized: false,
    });
    expect(result.x).toBeUndefined();
    expect(result.y).toBeUndefined();
  });

  test('enforces minimum and maximum dimensions against primary display', () => {
    const small = clampWindowBounds({ width: 400, height: 300, x: 100, y: 100 }, displays);
    expect(small.width).toBe(DEFAULT_WINDOW_BOUNDS.minWidth);
    expect(small.height).toBe(DEFAULT_WINDOW_BOUNDS.minHeight);

    const huge = clampWindowBounds({ width: 5000, height: 3000, x: 0, y: 25 }, displays);
    expect(huge.width).toBe(1920);
    expect(huge.height).toBe(1055);
  });

  test('clamps dimensions against matched larger secondary monitor instead of shrinking to primary', () => {
    const smallPrimaryAndBigSecondary = [
      { workArea: { x: 0, y: 25, width: 1440, height: 900 } },
      { workArea: { x: 1440, y: 0, width: 2560, height: 1440 } },
    ];
    const saved = { width: 2000, height: 1200, x: 1500, y: 50, isMaximized: false };
    expect(clampWindowBounds(saved, smallPrimaryAndBigSecondary)).toEqual({
      width: 2000,
      height: 1200,
      x: 1500,
      y: 50,
      isMaximized: false,
    });
  });

  test('sanitizeWindowBoundsForSave validates bounds and rejects invalid values', () => {
    expect(sanitizeWindowBoundsForSave({ width: 1280.4, height: 800.6, x: 10.2, y: 20.8 }, true)).toEqual({
      width: 1280,
      height: 801,
      x: 10,
      y: 21,
      isMaximized: true,
    });
    expect(sanitizeWindowBoundsForSave({ width: 0, height: 800, x: 0, y: 0 })).toBeNull();
    expect(sanitizeWindowBoundsForSave(null)).toBeNull();
  });
});
