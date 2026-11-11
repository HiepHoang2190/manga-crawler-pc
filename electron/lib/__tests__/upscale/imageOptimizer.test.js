'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const sharp = require('sharp');
const { optimizeUpscaledImage } = require('../../upscale/imageOptimizer');

describe('imageOptimizer (Caesium Engine)', () => {
  let tempDir;
  let sampleJpg;
  let samplePng;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'img-opt-test-'));

    // Create test JPG (1000x1000 solid with noise/gradient)
    sampleJpg = path.join(tempDir, 'sample.jpg');
    await sharp({
      create: {
        width: 1000,
        height: 1000,
        channels: 3,
        background: { r: 120, g: 150, b: 200 },
      },
    })
      .jpeg({ quality: 100 })
      .toFile(sampleJpg);

    // Create test PNG
    samplePng = path.join(tempDir, 'sample.png');
    await sharp({
      create: {
        width: 1000,
        height: 1000,
        channels: 3,
        background: { r: 255, g: 200, b: 100 },
      },
    })
      .png({ compressionLevel: 0 })
      .toFile(samplePng);
  });

  afterAll(async () => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup error
    }
  });

  it('resizes image to 80% with Lanczos3 and optimizes with mozjpeg for JPG', async () => {
    const destJpg = path.join(tempDir, 'output_80.jpg');
    const result = await optimizeUpscaledImage(sampleJpg, destJpg, {
      enabled: true,
      resizeRatio: 0.8,
      quality: 85,
    });

    expect(result.success).toBe(true);
    expect(fs.existsSync(destJpg)).toBe(true);

    const meta = await sharp(destJpg).metadata();
    expect(meta.width).toBe(800);
    expect(meta.height).toBe(800);
    expect(result.savedPercent).toBeGreaterThan(0);
    expect(result.optimizedBytes).toBeLessThan(result.originalBytes);
  });

  it('resizes image to 75% for PNG and compresses with high effort', async () => {
    const destPng = path.join(tempDir, 'output_75.png');
    const result = await optimizeUpscaledImage(samplePng, destPng, {
      enabled: true,
      resizeRatio: 0.75,
      quality: 85,
    });

    expect(result.success).toBe(true);
    expect(fs.existsSync(destPng)).toBe(true);

    const meta = await sharp(destPng).metadata();
    expect(meta.width).toBe(750);
    expect(meta.height).toBe(750);
    expect(result.savedPercent).toBeGreaterThan(0);
  });

  it('supports 100% ratio (re-compress only, no dimension resize)', async () => {
    const destJpg = path.join(tempDir, 'output_100.jpg');
    const result = await optimizeUpscaledImage(sampleJpg, destJpg, {
      enabled: true,
      resizeRatio: 1.0,
      quality: 80,
    });

    expect(result.success).toBe(true);
    const meta = await sharp(destJpg).metadata();
    expect(meta.width).toBe(1000);
    expect(meta.height).toBe(1000);
    expect(result.optimizedBytes).toBeLessThan(result.originalBytes);
  });

  it('copies file untouched when enabled is false', async () => {
    const destJpg = path.join(tempDir, 'output_disabled.jpg');
    const result = await optimizeUpscaledImage(sampleJpg, destJpg, {
      enabled: false,
    });

    expect(result.success).toBe(true);
    expect(fs.existsSync(destJpg)).toBe(true);
    const origStat = fs.statSync(sampleJpg);
    const destStat = fs.statSync(destJpg);
    expect(destStat.size).toBe(origStat.size);
  });

  it('safely falls back to copyFile when source is invalid or sharp fails', async () => {
    const fakeSrc = path.join(tempDir, 'fake.txt');
    fs.writeFileSync(fakeSrc, 'hello world dummy file');
    const destFallback = path.join(tempDir, 'output_fallback.jpg');

    const result = await optimizeUpscaledImage(fakeSrc, destFallback, {
      enabled: true,
      resizeRatio: 0.8,
      quality: 85,
    });

    expect(result.success).toBe(false);
    expect(result.fallbackCopied).toBe(true);
    expect(fs.existsSync(destFallback)).toBe(true);
    expect(fs.readFileSync(destFallback, 'utf8')).toBe('hello world dummy file');
  });

  it('optimizes in-place safely when srcPath === destPath', async () => {
    const inPlaceJpg = path.join(tempDir, 'inplace.jpg');
    fs.copyFileSync(sampleJpg, inPlaceJpg);

    const result = await optimizeUpscaledImage(inPlaceJpg, inPlaceJpg, {
      enabled: true,
      resizeRatio: 0.8,
      quality: 85,
    });

    expect(result.success).toBe(true);
    expect(fs.existsSync(inPlaceJpg)).toBe(true);
    const meta = await sharp(inPlaceJpg).metadata();
    expect(meta.width).toBe(800);
    expect(meta.height).toBe(800);
  });

  it('handles in-place fallback safely when file is corrupt without deleting original', async () => {
    const corruptPath = path.join(tempDir, 'corrupt.jpg');
    fs.writeFileSync(corruptPath, 'corrupt data');

    const result = await optimizeUpscaledImage(corruptPath, corruptPath, {
      enabled: true,
      resizeRatio: 0.8,
      quality: 85,
    });

    expect(result.success).toBe(false);
    expect(result.fallbackCopied).toBe(true);
    expect(fs.existsSync(corruptPath)).toBe(true);
    expect(fs.readFileSync(corruptPath, 'utf8')).toBe('corrupt data');
  });
});

