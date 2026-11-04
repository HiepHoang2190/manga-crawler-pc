// electron/lib/__tests__/export/pipeline/actionSplit.test.js
const split = require('../../../export/image/pipeline/actions/splitPage');
const { frameFromInput } = require('../../../export/image/pipeline/frame');
const { doublePagePng, borderedPagePng } = require('./fixtures');

describe('splitPage action', () => {
  test('validate fills defaults and normalizes overrides', () => {
    expect(split.validate({})).toEqual({ minWidth: 1200, ratioThreshold: 1.15, readingDirection: 'ltr' });
    expect(split.validate({ force: 'split', customSplit: { topRatio: 0.01, bottomRatio: 0.7 } })).toMatchObject({
      force: 'split', customSplit: { topRatio: 0.05, bottomRatio: 0.7 },
    });
  });

  test('splits a double page at the white gutter (ltr: a = left)', async () => {
    const frame = await frameFromInput(await doublePagePng({ width: 1600, height: 1100 }));
    const { frames, info } = await split.apply([frame], split.validate({}));
    expect(info[0].willSplit).toBe(true);
    expect(frames).toHaveLength(2);
    expect(frames.map((f) => f.suffix)).toEqual(['a', 'b']);
    expect(frames[0].info.width + frames[1].info.width).toBe(1600);
    expect(frames[0].info.width).toBeGreaterThanOrEqual(780);
    expect(frames[0].info.width).toBeLessThanOrEqual(820);
  });

  test('rtl puts the right half first', async () => {
    const frame = await frameFromInput(await doublePagePng({ width: 1600, height: 1100 }));
    const { frames, info } = await split.apply([frame], split.validate({ readingDirection: 'rtl' }));
    const splitX = Math.round(info[0].topRatio * 1600);
    expect(frames[0].info.width).toBe(1600 - splitX);
  });

  test('uses source-equivalent width on downscaled preview frames', async () => {
    const frame = await frameFromInput(await doublePagePng({ width: 1600, height: 1100 }), { maxSize: 800 });
    const { info } = await split.apply([frame], split.validate({}));
    expect(info[0].willSplit).toBe(true);
  });

  test('single pages stay whole unless forced', async () => {
    const frame = await frameFromInput(await borderedPagePng());
    expect((await split.apply([frame], split.validate({}))).frames).toHaveLength(1);
    const forced = await split.apply([frame], split.validate({ force: 'split', customSplit: { topRatio: 0.5, bottomRatio: 0.5 } }));
    expect(forced.frames.map((f) => f.info.width)).toEqual([300, 300]);
  });

  test('force keep prevents splitting a double page', async () => {
    const frame = await frameFromInput(await doublePagePng());
    const { frames, info } = await split.apply([frame], split.validate({ force: 'keep' }));
    expect(frames).toHaveLength(1);
    expect(info[0]).toMatchObject({ willSplit: false, auto: true });
  });

  test('slanted custom split produces halves sized by the seam extremes', async () => {
    const frame = await frameFromInput(await doublePagePng({ width: 1600, height: 1100 }));
    const { frames } = await split.apply([frame], split.validate({ customSplit: { topRatio: 0.45, bottomRatio: 0.55 } }));
    expect(frames[0].info.width).toBe(880);
    expect(frames[1].info.width).toBe(1600 - 720);
  });
});
