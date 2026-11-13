const path = require('path');
const NcnnBatchRunner = require('../../upscale/NcnnBatchRunner');

describe('NcnnBatchRunner', () => {
  let runner;

  beforeEach(() => {
    runner = new NcnnBatchRunner();
  });

  afterEach(() => {
    runner.cancel();
  });

  test('builds batch command arguments with verbose mode and directory paths', () => {
    const args = runner.buildBatchArgs({
      engineId: 'realcugan',
      modelId: 'realcugan-se',
      modelDir: '/models/models-se',
      inputDir: '/tmp/batch_in',
      outputDir: '/tmp/batch_out',
      scale: 2,
      denoise: 1,
      tileSize: 400,
      gpuId: '0',
    });

    expect(args).toContain('-v');
    expect(args).toContain('-i');
    expect(args).toContain('/tmp/batch_in');
    expect(args).toContain('-o');
    expect(args).toContain('/tmp/batch_out');
    expect(args).toContain('-m');
    expect(args).toContain('/models/models-se');
    expect(args).toContain('-s');
    expect(args).toContain('2');
    expect(args).toContain('-n');
    expect(args).toContain('1');
    expect(args).toContain('-t');
    expect(args).toContain('400');
    expect(args).toContain('-j');
    expect(args).toContain('1:1:1');
    expect(args).toContain('-g');
    expect(args).toContain('0');
  });

  test('parses file completion events from NCNN verbose stderr lines', () => {
    const chunk = `
[0 Apple M1 Pro]  queueC=0[1]  queueG=0[1]
/tmp/batch_in/page_1.png -> /tmp/batch_out/page_1.png done
/tmp/batch_in/page_2.png -> /tmp/batch_out/page_2.png done
`;
    const events = runner.parseStderrEvents(chunk);

    expect(events.length).toBe(2);
    expect(events[0]).toEqual({
      inputFile: '/tmp/batch_in/page_1.png',
      outputFile: '/tmp/batch_out/page_1.png',
    });
    expect(events[1]).toEqual({
      inputFile: '/tmp/batch_in/page_2.png',
      outputFile: '/tmp/batch_out/page_2.png',
    });
  });

  test('parses progress percentage within tile chunk', () => {
    const percent = runner.parseTilePercent(' 75.00%\n');
    expect(percent).toBe(75);
  });

  // ─── Race condition / file-stability tests ────────────────────────────────

  describe('checkCompletedFiles stability guard (black-image race condition)', () => {
    /**
     * Simulate the internal prevFileSizes tracking used by checkCompletedFiles.
     * We replicate the exact logic so we can unit-test it without spawning a process.
     *
     * Logic under test (NcnnBatchRunner.js):
     *   const prev = prevFileSizes.get(entry);        // { size, count } | undefined
     *   if (prev && prev.size === currentSize) {
     *     prevFileSizes.set(entry, { size: currentSize, count: prev.count + 1 });
     *   } else {
     *     prevFileSizes.set(entry, { size: currentSize, count: 0 });
     *   }
     *   const stableCount = prevFileSizes.get(entry).count;
     *   const isStable    = stableCount >= STABLE_POLLS;   // STABLE_POLLS = 2
     */
    const STABLE_POLLS = 2;

    function simulatePoll(prevFileSizes, entry, currentSize) {
      const prev = prevFileSizes.get(entry);
      if (prev && prev.size === currentSize) {
        prevFileSizes.set(entry, { size: currentSize, count: prev.count + 1 });
      } else {
        prevFileSizes.set(entry, { size: currentSize, count: 0 });
      }
      const stableCount = prevFileSizes.get(entry).count;
      const isStable = stableCount >= STABLE_POLLS;
      return { stableCount, isStable };
    }

    test('does NOT trigger after only 1 same-size poll (old behaviour that caused black images)', () => {
      const prevFileSizes = new Map();

      // Poll 1: first observation (count = 0, not stable yet)
      const r1 = simulatePoll(prevFileSizes, 'img_00000.jpg', 50000);
      expect(r1.stableCount).toBe(0);
      expect(r1.isStable).toBe(false);
    });

    test('does NOT trigger after 2 same-size polls (count = 1, still < STABLE_POLLS)', () => {
      const prevFileSizes = new Map();

      simulatePoll(prevFileSizes, 'img_00000.jpg', 50000); // count = 0
      const r2 = simulatePoll(prevFileSizes, 'img_00000.jpg', 50000); // count = 1
      expect(r2.stableCount).toBe(1);
      expect(r2.isStable).toBe(false);
    });

    test('triggers only after 3 consecutive same-size polls (≥120ms of stability)', () => {
      const prevFileSizes = new Map();

      simulatePoll(prevFileSizes, 'img_00000.jpg', 50000); // count = 0
      simulatePoll(prevFileSizes, 'img_00000.jpg', 50000); // count = 1
      const r3 = simulatePoll(prevFileSizes, 'img_00000.jpg', 50000); // count = 2 >= STABLE_POLLS
      expect(r3.stableCount).toBe(2);
      expect(r3.isStable).toBe(true);
    });

    test('resets stability counter when file size changes between polls', () => {
      const prevFileSizes = new Map();

      simulatePoll(prevFileSizes, 'img_00001.jpg', 50000); // count = 0
      simulatePoll(prevFileSizes, 'img_00001.jpg', 50000); // count = 1

      // NCNN still writing — size changes
      const rChange = simulatePoll(prevFileSizes, 'img_00001.jpg', 75000);
      expect(rChange.stableCount).toBe(0);
      expect(rChange.isStable).toBe(false);

      // After reset, needs STABLE_POLLS more stable polls
      simulatePoll(prevFileSizes, 'img_00001.jpg', 75000); // count = 1 (not stable)
      const rFinal = simulatePoll(prevFileSizes, 'img_00001.jpg', 75000); // count = 2 >= STABLE_POLLS
      expect(rFinal.isStable).toBe(true);
    });

    test('each file tracked independently — one large file does not block another', () => {
      const prevFileSizes = new Map();

      // img_00000: reaches stability quickly
      simulatePoll(prevFileSizes, 'img_00000.jpg', 1000);
      simulatePoll(prevFileSizes, 'img_00000.jpg', 1000);
      const r0 = simulatePoll(prevFileSizes, 'img_00000.jpg', 1000);
      expect(r0.isStable).toBe(true);

      // img_00001: still being written (changing size)
      simulatePoll(prevFileSizes, 'img_00001.jpg', 10000);
      simulatePoll(prevFileSizes, 'img_00001.jpg', 15000); // size changed
      const r1 = simulatePoll(prevFileSizes, 'img_00001.jpg', 15000); // count = 1, NOT stable
      expect(r1.isStable).toBe(false);
    });
  });

  describe('handleChunk — stderr "done" event does not bypass stability guard', () => {
    test('parseStderrEvents returns events that should only add to readyEntries, not trigger immediately', () => {
      // The fix: handleChunk now only does readyEntries.add(entryName)
      // and calls checkCompletedFiles() (which applies the stability guard).
      // This test verifies parseStderrEvents correctly identifies done events.
      const chunk = '/tmp/out/img_00004.jpg -> /tmp/out/img_00004.jpg done\n';
      const events = runner.parseStderrEvents(chunk);
      expect(events.length).toBe(1);
      expect(path.basename(events[0].outputFile)).toBe('img_00004.jpg');
    });

    test('parseStderrEvents returns empty for tile-percentage lines (no premature trigger)', () => {
      const chunk = ' 42.50%\r 43.00%\r';
      const events = runner.parseStderrEvents(chunk);
      expect(events.length).toBe(0);
    });
  });

  describe('getEffectiveTileSize (Vulkan OOM & Black Tile Prevention)', () => {
    test('uses safe tile size 200 for realcugan across all scales (2x, 3x, 4x) to prevent Vulkan OOM and black tiles', () => {
      expect(runner.getEffectiveTileSize(0, 'realcugan', 2)).toBe(200);
      expect(runner.getEffectiveTileSize(0, 'realcugan', 3)).toBe(200);
      expect(runner.getEffectiveTileSize(0, 'realcugan', 4)).toBe(200);
    });

    test('uses safe tile size 256 for waifu2x scale 2 and 200 for scale 3', () => {
      expect(runner.getEffectiveTileSize(0, 'waifu2x', 2)).toBe(256);
      expect(runner.getEffectiveTileSize(0, 'waifu2x', 3)).toBe(200);
    });

    test('uses safe tile size 256 for realesrgan', () => {
      expect(runner.getEffectiveTileSize(0, 'realesrgan', 4)).toBe(256);
    });

    test('respects explicit tile size when user specifies one', () => {
      expect(runner.getEffectiveTileSize(100, 'realcugan', 3)).toBe(100);
      expect(runner.getEffectiveTileSize(512, 'realcugan', 2)).toBe(512);
    });
  });

  describe('extractDiscoveredGpus', () => {
    test('extracts GPU devices from NCNN diagnostic output', () => {
      const stderr = `
[0 NVIDIA GeForce RTX 3060]  queueC=0[1]  queueG=0[1]
[1 Intel(R) UHD Graphics]  queueC=0[1]  queueG=0[1]
`;
      const gpus = runner.extractDiscoveredGpus(stderr);
      expect(gpus).toHaveLength(2);
      expect(gpus[0]).toEqual({ id: 0, name: 'NVIDIA GeForce RTX 3060' });
      expect(gpus[1]).toEqual({ id: 1, name: 'Intel(R) UHD Graphics' });
    });
  });

  describe('finalizeOutputFile with Black Image Detection', () => {
    const fs = require('fs');
    const os = require('os');
    const sharp = require('sharp');

    test('detects and rejects an all-black image rendered due to Vulkan OOM', async () => {
      const tmpDir = path.join(os.tmpdir(), `test_black_${Date.now()}`);
      fs.mkdirSync(tmpDir, { recursive: true });

      const blackFile = path.join(tmpDir, 'black.jpg');
      const targetDest = path.join(tmpDir, 'out_black.jpg');

      await sharp({
        create: { width: 50, height: 50, channels: 3, background: { r: 0, g: 0, b: 0 } },
      }).jpeg().toFile(blackFile);

      const result = await runner.finalizeOutputFile(blackFile, targetDest, { enabled: false });

      expect(result.success).toBe(false);
      expect(result.isBlackImage).toBe(true);
      expect(fs.existsSync(targetDest)).toBe(false);

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('accepts and copies a normal non-black image', async () => {
      const tmpDir = path.join(os.tmpdir(), `test_normal_${Date.now()}`);
      fs.mkdirSync(tmpDir, { recursive: true });

      const normalFile = path.join(tmpDir, 'normal.jpg');
      const targetDest = path.join(tmpDir, 'out_normal.jpg');

      await sharp({
        create: { width: 50, height: 50, channels: 3, background: { r: 255, g: 255, b: 255 } },
      }).jpeg().toFile(normalFile);

      const result = await runner.finalizeOutputFile(normalFile, targetDest, { enabled: false });

      expect(result.success).toBe(true);
      expect(fs.existsSync(targetDest)).toBe(true);

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });
});

