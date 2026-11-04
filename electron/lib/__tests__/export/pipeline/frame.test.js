const { frameFromInput, extractFrame, childSuffix, clampInt } = require('../../../export/image/pipeline/frame');
const { borderedPagePng } = require('./fixtures');

describe('pipeline frame helpers', () => {
  test('frameFromInput decodes to srgb raw at full size with scale 1', async () => {
    const frame = await frameFromInput(await borderedPagePng({ width: 600, height: 800 }));
    expect(frame.info).toEqual({ width: 600, height: 800, channels: 3 });
    expect(frame.data.length).toBe(600 * 800 * 3);
    expect(frame.scale).toBe(1);
    expect(frame.suffix).toBe('');
  });

  test('frameFromInput downsizes to maxSize and records scale', async () => {
    const frame = await frameFromInput(await borderedPagePng({ width: 600, height: 800 }), { maxSize: 400 });
    expect(frame.info.height).toBe(400);
    expect(frame.info.width).toBe(300);
    expect(frame.scale).toBeCloseTo(0.5, 5);
  });

  test('extractFrame crops, clamps, and keeps scale', async () => {
    const frame = await frameFromInput(await borderedPagePng({ width: 600, height: 800 }), { maxSize: 400 });
    const out = await extractFrame(frame, { left: 10, top: 20, width: 9999, height: 50 }, 'a');
    expect(out.info.width).toBe(290);
    expect(out.info.height).toBe(50);
    expect(out.suffix).toBe('a');
    expect(out.scale).toBe(frame.scale);
  });

  test('extractFrame returns the same pixels for a full box', async () => {
    const frame = await frameFromInput(await borderedPagePng());
    const out = await extractFrame(frame, { left: 0, top: 0, width: 600, height: 800 });
    expect(out.data).toBe(frame.data);
  });

  test('childSuffix and clampInt', () => {
    expect(childSuffix('', 'a')).toBe('a');
    expect(childSuffix('a', 'b')).toBe('a-b');
    expect(clampInt(5.6, 0, 3)).toBe(3);
    expect(clampInt('x', 2, 9)).toBe(2);
  });
});
