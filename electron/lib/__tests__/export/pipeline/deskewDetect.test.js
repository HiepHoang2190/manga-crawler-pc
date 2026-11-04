const fs = require('fs');
const os = require('os');
const path = require('path');
const { detectSkewAngle, detectSkewAngleFromBuffer } = require('../../../export/image/deskewImage');
const { skewedPagePng, decodeRaw } = require('./fixtures');

describe('detectSkewAngleFromBuffer', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deskew-detect-')); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  test('matches detectSkewAngle(path) for encoded and raw input', async () => {
    const png = await skewedPagePng({ angle: 3 });
    const file = path.join(tmpDir, 'page.png');
    fs.writeFileSync(file, png);

    const fromPath = await detectSkewAngle(file);
    const fromEncoded = await detectSkewAngleFromBuffer(png);
    const raw = await decodeRaw(png);
    const fromRaw = await detectSkewAngleFromBuffer(raw.data, { raw: raw.info });

    expect(Math.abs(Math.abs(fromPath.angle) - 3)).toBeLessThanOrEqual(0.5);
    expect(fromEncoded.angle).toBe(fromPath.angle);
    expect(Math.abs(fromRaw.angle - fromPath.angle)).toBeLessThanOrEqual(0.25);
  }, 15000);

  test('returns zero angle for unreadable input', async () => {
    const res = await detectSkewAngleFromBuffer(Buffer.from('not an image'));
    expect(res).toEqual({ angle: 0, confidence: 0 });
  });
});
