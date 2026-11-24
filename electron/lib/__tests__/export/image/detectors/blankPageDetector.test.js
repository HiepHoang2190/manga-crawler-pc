const { detectBlankPage, classifyBlankFromRaw } = require('../../../../export/image/detectors/blankPageDetector');
const { getSharp } = require('../../../../shared/checkSharp');

describe('blankPageDetector', () => {
  const sharp = getSharp();

  test('detects pure white Buffer as BLANK_WHITE', async () => {
    const whiteBuf = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 255, b: 255 } },
    }).jpeg().toBuffer();

    const result = await detectBlankPage(whiteBuf);
    expect(result.isBlank).toBe(true);
    expect(result.blankType).toBe('white');
    expect(result.confidence).toBe(100);
  });

  test('detects pure black Sharp instance as BLANK_BLACK', async () => {
    const blackBuf = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 0, b: 0 } },
    }).jpeg().toBuffer();

    const result = await detectBlankPage(sharp(blackBuf));
    expect(result.isBlank).toBe(true);
    expect(result.blankType).toBe('black');
    expect(result.confidence).toBe(100);
  });

  test('does not flag normal manga image with contrasting ink panels', async () => {
    const halfWhiteHalfBlack = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .composite([
        {
          input: await sharp({
            create: { width: 50, height: 100, channels: 3, background: { r: 0, g: 0, b: 0 } },
          }).png().toBuffer(),
          left: 0,
          top: 0,
        },
      ])
      .jpeg()
      .toBuffer();

    const result = await detectBlankPage(halfWhiteHalfBlack);
    expect(result.isBlank).toBe(false);
  });

  test('handles invalid input safely', async () => {
    const result = await detectBlankPage(null);
    expect(result.isBlank).toBe(false);
  });

  test('does NOT flag transparent RGBA PNG with alpha-drawn strokes on uniform black/white RGB', async () => {
    const w = 100;
    const h = 100;
    const rgba = Buffer.alloc(w * h * 4, 0);
    // All RGB pixels are pure black (0,0,0), while half the canvas has opaque alpha strokes
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < 40; x += 1) {
        rgba[(y * w + x) * 4 + 3] = 255;
      }
    }
    const pngBuf = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
    const res = await detectBlankPage(pngBuf);
    expect(res.isBlank).toBe(false);
  });

  test('detects completely transparent RGBA PNG as blank solid', async () => {
    const transparentPng = await sharp({
      create: { width: 100, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).png().toBuffer();
    const res = await detectBlankPage(transparentPng);
    expect(res.isBlank).toBe(true);
    expect(res.blankType).toBe('solid');
  });

  test('classifyBlankFromRaw classifies white, black, alpha-drawn, and normal raw buffers directly', () => {
    const white = Buffer.alloc(36 * 32 * 3, 255);
    const whiteRes = classifyBlankFromRaw(white, { width: 36, height: 32, channels: 3 });
    expect(whiteRes.isBlank).toBe(true);
    expect(whiteRes.blankType).toBe('white');
    expect(whiteRes.avgMean).toBeCloseTo(255, 1);

    const black = Buffer.alloc(36 * 32 * 3, 0);
    const blackRes = classifyBlankFromRaw(black, { width: 36, height: 32, channels: 3 });
    expect(blackRes.isBlank).toBe(true);
    expect(blackRes.blankType).toBe('black');
    expect(blackRes.avgMean).toBeCloseTo(0, 1);

    const alphaDrawn = Buffer.alloc(36 * 32 * 4, 0);
    for (let i = 0; i < (36 * 32) / 2; i += 1) {
      alphaDrawn[i * 4 + 3] = 255;
    }
    const alphaRes = classifyBlankFromRaw(alphaDrawn, { width: 36, height: 32, channels: 4 });
    expect(alphaRes.isBlank).toBe(false);

    const normal = Buffer.alloc(36 * 32 * 3);
    for (let i = 0; i < normal.length; i += 3) {
      const v = (i * 13) % 256;
      normal[i] = v;
      normal[i + 1] = v;
      normal[i + 2] = v;
    }
    const normalRes = classifyBlankFromRaw(normal, { width: 36, height: 32, channels: 3 });
    expect(normalRes.isBlank).toBe(false);
    expect(normalRes.avgMean).toBeGreaterThan(50);

    // Grayscale (1-channel) & Gray+Alpha (2-channel) + low-entropy solid buffer + fully transparent raw
    const grayWhite = Buffer.alloc(36 * 32, 250);
    expect(classifyBlankFromRaw(grayWhite, { width: 36, height: 32, channels: 1 }).isBlank).toBe(true);

    const grayAlphaDrawn = Buffer.alloc(36 * 32 * 2, 0);
    for (let i = 0; i < (36 * 32) / 2; i += 1) {
      grayAlphaDrawn[i * 2 + 1] = 255;
    }
    expect(classifyBlankFromRaw(grayAlphaDrawn, { width: 36, height: 32, channels: 2 }).isBlank).toBe(false);

    const solidMidGray = Buffer.alloc(36 * 32 * 3, 120);
    const solidRes = classifyBlankFromRaw(solidMidGray, { width: 36, height: 32, channels: 3 });
    expect(solidRes.isBlank).toBe(true);
    expect(solidRes.blankType).toBe('solid');

    const transparentRaw = Buffer.alloc(36 * 32 * 4, 0);
    expect(classifyBlankFromRaw(transparentRaw, { width: 36, height: 32, channels: 4 }).isBlank).toBe(true);
  });
});
