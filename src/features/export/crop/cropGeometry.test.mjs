import { clampBox, moveBox, resizeBox, mmToPx, pxToMm, DEFAULT_CROP_DPI } from './cropGeometry.js';

describe('cropGeometry', () => {
  describe('clampBox', () => {
    test('keeps valid box untouched', () => {
      const box = { left: 10, top: 20, width: 100, height: 150 };
      expect(clampBox(box, 200, 300)).toEqual({ left: 10, top: 20, width: 100, height: 150 });
    });

    test('clamps negative coordinates and bounds exceeding size', () => {
      const box = { left: -5, top: -10, width: 250, height: 350 };
      expect(clampBox(box, 200, 300)).toEqual({ left: 0, top: 0, width: 200, height: 300 });
    });
  });

  describe('moveBox', () => {
    test('moves box within bounds', () => {
      const box = { left: 10, top: 10, width: 80, height: 80 };
      const moved = moveBox(box, 5, 10, 200, 200);
      expect(moved).toEqual({ left: 15, top: 20, width: 80, height: 80 });
    });

    test('clamps box when moving out of bounds', () => {
      const box = { left: 150, top: 150, width: 50, height: 50 };
      const moved = moveBox(box, 20, 20, 200, 200);
      expect(moved.left).toBe(150); // 200 - 50
      expect(moved.top).toBe(150);
    });
  });

  describe('resizeBox', () => {
    test('resizes east (e) handle', () => {
      const box = { left: 10, top: 10, width: 50, height: 50 };
      const resized = resizeBox(box, 'e', 15, 0, 100, 100);
      expect(resized).toEqual({ left: 10, top: 10, width: 65, height: 50 });
    });

    test('resizes south (s) handle', () => {
      const box = { left: 10, top: 10, width: 50, height: 50 };
      const resized = resizeBox(box, 's', 0, 20, 100, 100);
      expect(resized).toEqual({ left: 10, top: 10, width: 50, height: 70 });
    });

    test('resizes northwest (nw) handle', () => {
      const box = { left: 30, top: 30, width: 50, height: 50 };
      const resized = resizeBox(box, 'nw', -10, -10, 100, 100);
      expect(resized).toEqual({ left: 20, top: 20, width: 60, height: 60 });
    });

    test('prevents shrinking below minSize', () => {
      const box = { left: 10, top: 10, width: 50, height: 50 };
      const resized = resizeBox(box, 'e', -45, 0, 100, 100, 10);
      expect(resized.width).toBe(10);
    });
  });

  describe('mmToPx and pxToMm unit conversions', () => {
    test('converts mm to pixels correctly at 300 DPI', () => {
      expect(DEFAULT_CROP_DPI).toBe(300);
      expect(mmToPx(25.4, 300)).toBe(300);
      expect(mmToPx(5, 300)).toBe(59);
      expect(mmToPx(0, 300)).toBe(0);
      expect(mmToPx(-10, 300)).toBe(0);
      expect(mmToPx('10', 300)).toBe(118);
    });

    test('converts mm to pixels at custom DPI', () => {
      expect(mmToPx(25.4, 150)).toBe(150);
      expect(mmToPx(25.4, 72)).toBe(72);
      expect(mmToPx(25.4, 96)).toBe(96);
    });

    test('converts px to mm correctly at 300 DPI', () => {
      expect(pxToMm(300, 300)).toBe(25.4);
      expect(pxToMm(59, 300)).toBe(5.0);
      expect(pxToMm(0, 300)).toBe(0);
      expect(pxToMm(-20, 300)).toBe(0);
      expect(pxToMm('118', 300)).toBe(10.0);
    });

    test('handles invalid or non-numeric inputs gracefully', () => {
      expect(mmToPx(null, 300)).toBe(0);
      expect(mmToPx(undefined, 300)).toBe(0);
      expect(mmToPx('abc', 300)).toBe(0);
      expect(pxToMm(null, 300)).toBe(0);
      expect(pxToMm(undefined, 300)).toBe(0);
      expect(pxToMm('xyz', 300)).toBe(0);
    });
  });
});

