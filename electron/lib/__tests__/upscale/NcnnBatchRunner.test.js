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
});

