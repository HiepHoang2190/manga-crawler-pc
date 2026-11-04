const {
  computeMarginCropBox,
  computeAutoTrimBox,
  resolveCropBox,
} = require('../../export/image/cropImage');

describe('cropImage engine', () => {
  describe('computeMarginCropBox', () => {
    test('calculates correct inner box for given margins', () => {
      const box = computeMarginCropBox({
        width: 1000,
        height: 1500,
        margins: { top: 50, bottom: 100, left: 20, right: 30 },
      });
      expect(box).toEqual({
        left: 20,
        top: 50,
        width: 950,
        height: 1350,
      });
    });

    test('clamps when margins exceed dimensions', () => {
      const box = computeMarginCropBox({
        width: 100,
        height: 100,
        margins: { top: 60, bottom: 60, left: 70, right: 70 },
      });
      expect(box.left).toBe(70);
      expect(box.top).toBe(60);
      expect(box.width).toBe(1);
      expect(box.height).toBe(1);
    });

    test('handles zero and negative margins gracefully', () => {
      const box = computeMarginCropBox({
        width: 800,
        height: 600,
        margins: { top: -10, bottom: 0, left: 0, right: -5 },
      });
      expect(box).toEqual({
        left: 0,
        top: 0,
        width: 800,
        height: 600,
      });
    });
  });

  describe('computeAutoTrimBox', () => {
    // Helper to generate RGB raw buffer (3 channels)
    function createBuffer(w, h, fillFn) {
      const buf = Buffer.alloc(w * h * 3);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 3;
          const [r, g, b] = fillFn(x, y);
          buf[idx] = r;
          buf[idx + 1] = g;
          buf[idx + 2] = b;
        }
      }
      return buf;
    }

    test('trims uniform black border (2px on all sides)', () => {
      // 10x10 image: outer 2px black (0,0,0), center 6x6 white (255,255,255)
      const w = 10;
      const h = 10;
      const buf = createBuffer(w, h, (x, y) => {
        if (x < 2 || x >= 8 || y < 2 || y >= 8) {
          return [0, 0, 0];
        }
        return [255, 255, 255];
      });

      const box = computeAutoTrimBox({
        rawPixels: buf,
        width: w,
        height: h,
        channels: 3,
        sampleColor: { r: 0, g: 0, b: 0 },
        tolerance: 10,
        edges: { top: true, bottom: true, left: true, right: true },
      });

      expect(box).toEqual({
        left: 2,
        top: 2,
        width: 6,
        height: 6,
      });
    });

    test('trims only selected edges (e.g. top and bottom only)', () => {
      const w = 10;
      const h = 10;
      const buf = createBuffer(w, h, (x, y) => {
        if (x < 2 || x >= 8 || y < 2 || y >= 8) {
          return [0, 0, 0];
        }
        return [255, 255, 255];
      });

      const box = computeAutoTrimBox({
        rawPixels: buf,
        width: w,
        height: h,
        channels: 3,
        sampleColor: { r: 0, g: 0, b: 0 },
        tolerance: 10,
        edges: { top: true, bottom: true, left: false, right: false },
      });

      expect(box).toEqual({
        left: 0,
        top: 2,
        width: 10,
        height: 6,
      });
    });
  });

  describe('resolveCropBox', () => {
    test('resolves margin crop mode', () => {
      const box = resolveCropBox({
        width: 500,
        height: 800,
        cropMode: 'margin',
        options: { margins: { top: 20, bottom: 40, left: 10, right: 10 } },
      });
      expect(box).toEqual({
        left: 10,
        top: 20,
        width: 480,
        height: 740,
      });
    });

    test('resolves box crop mode with bounding box', () => {
      const box = resolveCropBox({
        width: 1000,
        height: 1000,
        cropMode: 'box',
        options: { box: { left: 100, top: 150, width: 400, height: 600 } },
      });
      expect(box).toEqual({
        left: 100,
        top: 150,
        width: 400,
        height: 600,
      });
    });
  });
});
