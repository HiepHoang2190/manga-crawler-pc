// electron/lib/__tests__/export/pipeline/actionDeskew.test.js
const deskew = require('../../../export/image/pipeline/actions/deskew');
const { frameFromInput } = require('../../../export/image/pipeline/frame');
const { computeInscribedCrop } = require('../../../export/image/deskewImage');
const { skewedPagePng } = require('./fixtures');

describe('deskew action', () => {
  test('validate fills defaults and clamps', () => {
    expect(deskew.validate({})).toEqual({ cropMode: 'autoCrop', minAngle: 0.1 });
    expect(deskew.validate({ cropMode: 'bad', minAngle: 99, angle: 80 })).toEqual({ cropMode: 'autoCrop', minAngle: 5, angle: 45 });
  });

  test('auto detects angle and auto-crops to the inscribed rectangle', async () => {
    const frame = await frameFromInput(await skewedPagePng({ angle: 3 }));
    const { frames, info } = await deskew.apply([frame], deskew.validate({}));
    expect(info[0].applied).toBe(true);
    expect(info[0].manual).toBe(false);
    expect(Math.abs(Math.abs(info[0].angle) - 3)).toBeLessThanOrEqual(0.5);
    const expected = computeInscribedCrop(800, 1000, info[0].angle);
    expect(frames[0].info.width).toBe(expected.width);
    expect(frames[0].info.height).toBe(expected.height);
  });

  test('manual angle override skips detection; fillWhite keeps the rotated bounding box', async () => {
    const frame = await frameFromInput(await skewedPagePng({ angle: 0 }));
    const { frames, info } = await deskew.apply([frame], deskew.validate({ angle: 5, cropMode: 'fillWhite' }));
    expect(info[0]).toMatchObject({ angle: 5, manual: true, applied: true });
    expect(frames[0].info.width).toBeGreaterThan(800);
  });

  test('angles below minAngle are left untouched', async () => {
    const frame = await frameFromInput(await skewedPagePng({ angle: 0 }));
    const { frames, info } = await deskew.apply([frame], deskew.validate({ angle: 0.05 }));
    expect(info[0].applied).toBe(false);
    expect(frames[0]).toBe(frame);
  });
});
