'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const sharp = require('sharp');
const {
  isDoublePage,
  processImageForDoublePageRotation,
  processRotateDoublePage,
} = require('../../export/image/rotateDoublePage');

function tmpDir(prefix = 'rotate-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('rotateDoublePage', () => {
  let dir;

  beforeEach(() => {
    dir = tmpDir();
  });

  afterEach(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  test('isDoublePage correctly identifies aspect ratio >= threshold (default 1.2)', () => {
    // 1600x1200 has ratio 1.333
    expect(isDoublePage(1600, 1200, 1.2)).toBe(true);
    // with 1.4 threshold, 1.333 was falsely considered NOT a double page
    expect(isDoublePage(1600, 1200, 1.4)).toBe(false);
    // portrait 800x1200 has ratio 0.667
    expect(isDoublePage(800, 1200, 1.2)).toBe(false);
  });

  test('processImageForDoublePageRotation rotates double-page WebP image', async () => {
    const webpInput = path.join(dir, 'spread.webp');
    const webpOutput = path.join(dir, 'rotated.webp');

    // Create a 1600x1200 landscape WebP image
    await sharp({
      create: {
        width: 1600,
        height: 1200,
        channels: 3,
        background: { r: 100, g: 150, b: 200 },
      },
    })
      .webp()
      .toFile(webpInput);

    const rotated = await processImageForDoublePageRotation(webpInput, webpOutput, { threshold: 1.2 });
    expect(rotated).toBe(true);
    expect(fs.existsSync(webpOutput)).toBe(true);

    const meta = await sharp(webpOutput).metadata();
    // After 90° rotation, dimensions should be swapped: width=1200, height=1600
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(1600);
  });

  test('processImageForDoublePageRotation does not rotate portrait image', async () => {
    const portraitInput = path.join(dir, 'single.png');
    const portraitOutput = path.join(dir, 'single_out.png');

    await sharp({
      create: {
        width: 800,
        height: 1200,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .png()
      .toFile(portraitInput);

    const rotated = await processImageForDoublePageRotation(portraitInput, portraitOutput, { threshold: 1.2 });
    expect(rotated).toBe(false);

    const meta = await sharp(portraitOutput).metadata();
    expect(meta.width).toBe(800);
    expect(meta.height).toBe(1200);
  });

  test('processRotateDoublePage processes a list of images and cleans up', async () => {
    const img1 = path.join(dir, 'spread.jpg');
    const img2 = path.join(dir, 'portrait.jpg');

    await sharp({
      create: { width: 1400, height: 1000, channels: 3, background: { r: 1, g: 2, b: 3 } },
    }).jpeg().toFile(img1);

    await sharp({
      create: { width: 700, height: 1000, channels: 3, background: { r: 4, g: 5, b: 6 } },
    }).jpeg().toFile(img2);

    const items = [
      { path: img1, title: 'Chapter 1' },
      { path: img2, title: 'Chapter 1' },
    ];

    const result = await processRotateDoublePage(items, true, 1.2);
    expect(result.rotatedCount).toBe(1);
    expect(result.processedItems.length).toBe(2);

    // img1 was rotated, so its output width should be 1000, height 1400
    const meta1 = await sharp(result.processedItems[0].path).metadata();
    expect(meta1.width).toBe(1000);
    expect(meta1.height).toBe(1400);

    // Cleanup tempDir
    if (result.tempDir) {
      fs.rmSync(result.tempDir, { recursive: true, force: true });
    }
  });
});
