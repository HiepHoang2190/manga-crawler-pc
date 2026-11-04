// electron/lib/__tests__/export/pipeline/actionDesaturate.test.js
const sharp = require('sharp');
const desaturate = require('../../../export/image/pipeline/actions/desaturate');
const { frameFromInput } = require('../../../export/image/pipeline/frame');

async function colorfulImagePng({ width = 100, height = 100 } = {}) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`
    + `<rect x="0" y="0" width="${width / 2}" height="${height / 2}" fill="#ff0000"/>`
    + `<rect x="${width / 2}" y="0" width="${width / 2}" height="${height / 2}" fill="#00ff00"/>`
    + `<rect x="0" y="${height / 2}" width="${width / 2}" height="${height / 2}" fill="#0000ff"/>`
    + `<rect x="${width / 2}" y="${height / 2}" width="${width / 2}" height="${height / 2}" fill="#ffff00"/>`
    + `</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

describe('desaturate action', () => {
  test('validate fills defaults and clamps', () => {
    expect(desaturate.validate({})).toEqual({ method: 'luminosity', intensity: 100 });
    expect(desaturate.validate({ method: 'invalid', intensity: -20 })).toEqual({ method: 'luminosity', intensity: 0 });
    expect(desaturate.validate({ method: 'average', intensity: 150 })).toEqual({ method: 'average', intensity: 100 });
    expect(desaturate.validate({ method: 'lightness', intensity: 50 })).toEqual({ method: 'lightness', intensity: 50 });
  });

  test('intensity 0 leaves frames untouched', async () => {
    const frame = await frameFromInput(await colorfulImagePng());
    const { frames, info } = await desaturate.apply([frame], desaturate.validate({ intensity: 0 }));
    expect(info[0].applied).toBe(false);
    expect(frames[0]).toBe(frame);
  });

  test('luminosity at 100% converts pure red to expected grayscale', async () => {
    const frame = await frameFromInput(await colorfulImagePng());
    const { frames, info } = await desaturate.apply([frame], desaturate.validate({ method: 'luminosity', intensity: 100 }));
    expect(info[0].applied).toBe(true);
    expect(frames[0].isGrayscale).toBe(true);
    // In top-left (red #ff0000), R, G, B should be equal (grayscale)
    const r = frames[0].data[0];
    const g = frames[0].data[1];
    const b = frames[0].data[2];
    expect(r).toBe(g);
    expect(g).toBe(b);
    // Luminosity of pure red is around 54 - 76 depending on ITU-R 601 / 709
    expect(r).toBeGreaterThan(40);
    expect(r).toBeLessThan(90);
  });

  test('average method at 100% calculates (R+G+B)/3', async () => {
    const frame = await frameFromInput(await colorfulImagePng());
    const { frames, info } = await desaturate.apply([frame], desaturate.validate({ method: 'average', intensity: 100 }));
    expect(info[0].applied).toBe(true);
    const r = frames[0].data[0];
    const g = frames[0].data[1];
    const b = frames[0].data[2];
    expect(r).toBe(g);
    expect(g).toBe(b);
    // (255 + 0 + 0) / 3 = 85
    expect(Math.abs(r - 85)).toBeLessThanOrEqual(2);
  });

  test('lightness method at 100% calculates (max+min)/2', async () => {
    const frame = await frameFromInput(await colorfulImagePng());
    const { frames, info } = await desaturate.apply([frame], desaturate.validate({ method: 'lightness', intensity: 100 }));
    expect(info[0].applied).toBe(true);
    const r = frames[0].data[0];
    const g = frames[0].data[1];
    const b = frames[0].data[2];
    expect(r).toBe(g);
    expect(g).toBe(b);
    // (255 + 0) / 2 = 127.5 ~ 128
    expect(Math.abs(r - 128)).toBeLessThanOrEqual(2);
  });

  test('partial intensity blends between original and desaturated', async () => {
    const frame = await frameFromInput(await colorfulImagePng());
    const { frames, info } = await desaturate.apply([frame], desaturate.validate({ method: 'average', intensity: 50 }));
    expect(info[0].applied).toBe(true);
    // Top-left was #ff0000. At 50% with average (85):
    // R: 0.5 * 255 + 0.5 * 85 = 170
    // G: 0.5 * 0 + 0.5 * 85 = 42.5 ~ 43
    // B: 0.5 * 0 + 0.5 * 85 = 42.5 ~ 43
    const r = frames[0].data[0];
    const g = frames[0].data[1];
    const b = frames[0].data[2];
    expect(Math.abs(r - 170)).toBeLessThanOrEqual(3);
    expect(Math.abs(g - 43)).toBeLessThanOrEqual(3);
    expect(Math.abs(b - 43)).toBeLessThanOrEqual(3);
  });
});
