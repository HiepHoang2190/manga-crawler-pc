const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const { runPipeline, writeAtomic, safeRename, buildOutputName, resolveConcurrency } = require('../../../export/image/pipeline/runPipeline');
const { encodeFrame } = require('../../../export/image/pipeline/encodeOutput');
const { frameFromInput } = require('../../../export/image/pipeline/frame');
const { borderedPagePng, doublePagePng } = require('./fixtures');

describe('runPipeline', () => {
  let tmpDir;
  let srcDir;
  let outDir;
  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-run-'));
    srcDir = path.join(tmpDir, 'src');
    outDir = path.join(tmpDir, 'out');
    fs.mkdirSync(path.join(srcDir, 'ch1'), { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'ch1', 'p1.png'), await borderedPagePng());
    fs.writeFileSync(path.join(srcDir, 'ch1', 'p2.png'), await doublePagePng());
  });
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const files = () => ['p1.png', 'p2.png'].map((n) => ({
    absolutePath: path.join(srcDir, 'ch1', n),
    relativePath: path.join('ch1', n),
  }));
  const actions = [
    { id: 'c', type: 'crop' },
    { id: 's', type: 'splitPage' },
  ];

  test('buildOutputName adds split suffixes', () => {
    expect(buildOutputName(path.join('a', 'p.png'), '', '.webp')).toBe('p.webp');
    expect(buildOutputName(path.join('a', 'p.png'), 'a-b', '.png')).toBe('p-a-b.png');
  });

  test('writes into outputDir mirroring relative folders, splitting double pages', async () => {
    const progress = [];
    const res = await runPipeline({ files: files(), actions, output: { format: 'webp', inPlace: false, outputDir: outDir }, onProgress: (e) => progress.push(e) });
    expect(res).toMatchObject({ ok: true, done: 2, failed: [], cancelled: false });
    expect(fs.readdirSync(path.join(outDir, 'ch1')).sort()).toEqual(['p1.webp', 'p2-a.webp', 'p2-b.webp']);
    expect((await sharp(path.join(outDir, 'ch1', 'p1.webp')).metadata()).width).toBe(520);
    expect(progress.map((e) => e.current).sort()).toEqual([1, 2]);
    expect(fs.existsSync(path.join(srcDir, 'ch1', 'p2.png'))).toBe(true);
  });

  test('per-file overrides disable a step for one image', async () => {
    const p2 = path.join(srcDir, 'ch1', 'p2.png');
    await runPipeline({ files: files(), actions, overrides: { [p2]: { s: { enabled: false } } }, output: { inPlace: false, outputDir: outDir } });
    expect(fs.readdirSync(path.join(outDir, 'ch1')).sort()).toEqual(['p1.png', 'p2.png']);
  });

  test('inPlace replaces originals and removes the source when the name changes', async () => {
    const res = await runPipeline({ files: files(), actions, output: { inPlace: true } });
    expect(res.ok).toBe(true);
    expect(fs.readdirSync(path.join(srcDir, 'ch1')).sort()).toEqual(['p1.png', 'p2-a.png', 'p2-b.png']);
    expect((await sharp(path.join(srcDir, 'ch1', 'p1.png')).metadata()).width).toBe(520);
  });

  test('requires an output dir when not in place', async () => {
    expect(await runPipeline({ files: files(), actions, output: { inPlace: false } })).toMatchObject({ ok: false, error: 'OUTPUT_DIR_REQUIRED' });
  });

  test('a broken file is reported but does not stop the batch', async () => {
    fs.writeFileSync(path.join(srcDir, 'ch1', 'bad.png'), 'nope');
    const list = [...files(), { absolutePath: path.join(srcDir, 'ch1', 'bad.png'), relativePath: path.join('ch1', 'bad.png') }];
    const res = await runPipeline({ files: list, actions, output: { inPlace: false, outputDir: outDir } });
    expect(res.done).toBe(2);
    expect(res.failed).toHaveLength(1);
  });

  test('cancel stops taking new files', async () => {
    let calls = 0;
    const res = await runPipeline({ files: files(), actions, concurrency: 1, output: { inPlace: false, outputDir: outDir }, onProgress: () => { calls += 1; }, isCancelled: () => calls >= 1 });
    expect(res.cancelled).toBe(true);
    expect(res.done).toBe(1);
  });

  test('writes encoded output directly to target directory', async () => {
    await runPipeline({
      files: [files()[0]],
      actions: [],
      output: { format: 'webp', inPlace: false, outputDir: outDir },
    });
    expect(fs.existsSync(path.join(outDir, 'ch1', 'p1.webp'))).toBe(true);
  });

  test('writeAtomic removes the temp file when rename fails', async () => {
    const target = path.join(tmpDir, 'target.png');
    fs.mkdirSync(target);
    await expect(writeAtomic(target, Buffer.from('x'))).rejects.toThrow();
    expect(fs.readdirSync(tmpDir).filter((n) => n.includes('.tmp-'))).toEqual([]);
  });

  test('safeRename succeeds directly and retries on transient lock errors', async () => {
    const f1 = path.join(tmpDir, 'file1.txt');
    const f2 = path.join(tmpDir, 'file2.txt');
    fs.writeFileSync(f1, 'hello');
    await safeRename(f1, f2);
    expect(fs.existsSync(f2)).toBe(true);
    expect(fs.readFileSync(f2, 'utf8')).toBe('hello');

    // Simulate transient EBUSY error on first call, succeeding on second
    const origRename = fs.promises.rename;
    let attempts = 0;
    fs.promises.rename = jest.fn(async (...args) => {
      attempts++;
      if (attempts === 1) {
        const err = new Error('resource busy');
        err.code = 'EBUSY';
        throw err;
      }
      return origRename(...args);
    });
    try {
      const f3 = path.join(tmpDir, 'file3.txt');
      await safeRename(f2, f3);
      expect(attempts).toBe(2);
      expect(fs.existsSync(f3)).toBe(true);
    } finally {
      fs.promises.rename = origRename;
    }
  });

  test('resolveConcurrency computes optimal worker pool matching CPU architecture', () => {
    // 1-2 cores -> use all cores
    expect(resolveConcurrency('auto', 10, 1)).toBe(1);
    expect(resolveConcurrency('auto', 10, 2)).toBe(2);
    // 4 cores -> 3 workers (leaves 1 core for OS/UI)
    expect(resolveConcurrency('auto', 10, 4)).toBe(3);
    // 8 cores -> 7 workers
    expect(resolveConcurrency('auto', 10, 8)).toBe(7);
    // Clamped to total files
    expect(resolveConcurrency('auto', 2, 8)).toBe(2);
    // 'max' -> 100% CPU cores
    expect(resolveConcurrency('max', 10, 8)).toBe(8);
    // Explicit integer string or number
    expect(resolveConcurrency('4', 10, 8)).toBe(4);
    expect(resolveConcurrency(2, 10, 8)).toBe(2);
  });
});
