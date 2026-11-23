import {
  AUTO_SCROLL_SPEEDS,
  getNextAutoScrollLevel,
  computeReadingProgressPercent,
} from '../readerUxUtils.mjs';

describe('readerUxUtils', () => {
  test('AUTO_SCROLL_SPEEDS defines 4 levels starting with 0', () => {
    expect(AUTO_SCROLL_SPEEDS).toEqual([0, 45, 95, 170]);
  });

  test('getNextAutoScrollLevel cycles cleanly 0 -> 1 -> 2 -> 3 -> 0', () => {
    expect(getNextAutoScrollLevel(0)).toBe(1);
    expect(getNextAutoScrollLevel(1)).toBe(2);
    expect(getNextAutoScrollLevel(2)).toBe(3);
    expect(getNextAutoScrollLevel(3)).toBe(0);
    expect(getNextAutoScrollLevel(-1)).toBe(1);
  });

  test('computeReadingProgressPercent calculates clamped 0..100 percent', () => {
    expect(computeReadingProgressPercent(0, 0)).toBe(0);
    expect(computeReadingProgressPercent(0, 10)).toBe(10);
    expect(computeReadingProgressPercent(4, 10)).toBe(50);
    expect(computeReadingProgressPercent(9, 10)).toBe(100);
    expect(computeReadingProgressPercent(50, 10)).toBe(100);
    expect(computeReadingProgressPercent(-3, 10)).toBe(10);
  });
});
