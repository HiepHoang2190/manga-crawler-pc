'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const NcnnBatchRunner = require('../../upscale/NcnnBatchRunner');
const imageOptimizer = require('../../upscale/imageOptimizer');

describe('NcnnBatchRunner with Compression (Caesium Engine)', () => {
  let runner;
  let tempDir;
  let sampleSrc;

  beforeEach(() => {
    runner = new NcnnBatchRunner();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ncnn-compress-test-'));
    sampleSrc = path.join(tempDir, 'sample_upscaled.jpg');
    fs.writeFileSync(sampleSrc, 'dummy image content');
  });

  afterEach(() => {
    runner.cancel();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('delegates to optimizeUpscaledImage when compress option is enabled', async () => {
    const targetDest = path.join(tempDir, 'dest.jpg');
    const spy = jest.spyOn(imageOptimizer, 'optimizeUpscaledImage').mockResolvedValue({
      success: true,
      originalBytes: 1000,
      optimizedBytes: 300,
      savedBytes: 700,
      savedPercent: 70,
    });

    const result = await runner.finalizeOutputFile(sampleSrc, targetDest, {
      enabled: true,
      resizeRatio: 0.8,
      quality: 85,
    });

    expect(spy).toHaveBeenCalledWith(sampleSrc, targetDest, {
      enabled: true,
      resizeRatio: 0.8,
      quality: 85,
    });
    expect(result.savedPercent).toBe(70);
    spy.mockRestore();
  });

  it('copies file directly when compress option is disabled', async () => {
    const targetDest = path.join(tempDir, 'dest_disabled.jpg');
    const spy = jest.spyOn(imageOptimizer, 'optimizeUpscaledImage');

    const result = await runner.finalizeOutputFile(sampleSrc, targetDest, {
      enabled: false,
    });

    expect(spy).not.toHaveBeenCalled();
    expect(fs.existsSync(targetDest)).toBe(true);
    expect(fs.readFileSync(targetDest, 'utf8')).toBe('dummy image content');
    spy.mockRestore();
  });

  it('safely falls back to copyFile if optimizeUpscaledImage throws', async () => {
    const targetDest = path.join(tempDir, 'dest_error.jpg');
    const spy = jest.spyOn(imageOptimizer, 'optimizeUpscaledImage').mockRejectedValue(new Error('Sharp crash'));

    const result = await runner.finalizeOutputFile(sampleSrc, targetDest, {
      enabled: true,
      resizeRatio: 0.8,
      quality: 85,
    });

    expect(fs.existsSync(targetDest)).toBe(true);
    expect(fs.readFileSync(targetDest, 'utf8')).toBe('dummy image content');
    spy.mockRestore();
  });
});

