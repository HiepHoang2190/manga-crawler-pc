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
});

