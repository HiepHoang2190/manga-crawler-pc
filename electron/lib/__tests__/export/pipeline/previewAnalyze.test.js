const fs = require('fs');
const os = require('os');
const path = require('path');
const { previewPipeline } = require('../../../export/image/pipeline/previewPipeline');
const { analyzePipeline } = require('../../../export/image/pipeline/analyzePipeline');
const { scanPipelineImages } = require('../../../export/image/pipeline/scanImages');
const { createStepCache } = require('../../../export/image/pipeline/stepCache');
const { borderedPagePng, doublePagePng, skewedPagePng } = require('./fixtures');

describe('preview / analyze / scan', () => {
  let tmpDir;
  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-preview-'));
    fs.mkdirSync(path.join(tmpDir, 'sub'));
    fs.writeFileSync(path.join(tmpDir, 'b.png'), await borderedPagePng({ width: 600, height: 800 }));
    fs.writeFileSync(path.join(tmpDir, 'd.png'), await doublePagePng({ width: 1600, height: 1100 }));
    fs.writeFileSync(path.join(tmpDir, 'sub', 's.png'), await skewedPagePng());
    fs.writeFileSync(path.join(tmpDir, 'notes.txt'), 'x');
  });
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const actions = [{ id: 'k', type: 'deskew' }, { id: 'c', type: 'crop' }, { id: 's', type: 'splitPage' }];

  test('scan lists images recursively with relative paths and dimensions', async () => {
    const res = await scanPipelineImages({ sourceDir: tmpDir });
    expect(res.images.map((i) => i.relativePath)).toEqual(['b.png', 'd.png', path.join('sub', 's.png')]);
    expect(res.images[0]).toMatchObject({ width: 600, height: 800 });
    const flat = await scanPipelineImages({ sourceDir: tmpDir, includeSubfolders: false });
    expect(flat.images).toHaveLength(2);
  });

  test('final preview returns a data URL, both halves and an estimate', async () => {
    const res = await previewPipeline({ filePath: path.join(tmpDir, 'd.png'), actions, cache: createStepCache(), maxSize: 800 });
    expect(res.ok).toBe(true);
    expect(res.dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true);
    expect(res.frames).toHaveLength(2);
    expect(res.estimatedBytes).toBeGreaterThan(0);
    expect(res.sourceWidth).toBe(1600);
  });

  test('stepInput shows the input of a step and its info; frameIndex picks one half', async () => {
    const cache = createStepCache();
    const res = await previewPipeline({ filePath: path.join(tmpDir, 'b.png'), actions, mode: 'stepInput', upToStep: 1, cache });
    expect(res.frames[0]).toMatchObject({ width: 600, height: 800 });
    expect(res.stepInfo.frames[0].box).toEqual({ left: 40, top: 40, width: 520, height: 720 });
    expect(res.estimatedBytes).toBeUndefined();
    const half = await previewPipeline({ filePath: path.join(tmpDir, 'd.png'), actions: [...actions, { id: 'c2', type: 'crop' }], mode: 'stepInput', upToStep: 3, frameIndex: 1, cache });
    expect(half.frames).toHaveLength(1);
    expect(half.frames[0].suffix).toBe('b');
  });

  test('stepOutput shows the frames after the step', async () => {
    const res = await previewPipeline({ filePath: path.join(tmpDir, 'b.png'), actions, mode: 'stepOutput', upToStep: 1, cache: createStepCache() });
    expect(res.frames[0]).toMatchObject({ width: 520, height: 720 });
  });

  test('analyze returns badges per file and survives broken files', async () => {
    fs.writeFileSync(path.join(tmpDir, 'bad.png'), 'nope');
    const files = ['b.png', 'd.png', 'bad.png'].map((n) => ({ absolutePath: path.join(tmpDir, n), relativePath: n }));
    const res = await analyzePipeline({ files, actions });
    const byName = Object.fromEntries(res.results.map((r) => [path.basename(r.absolutePath), r]));
    expect(byName['b.png'].badges.hasBorder).toBe(true);
    expect(byName['d.png'].badges.isDoublePage).toBe(true);
    expect(byName['d.png'].outputCount).toBe(2);
    expect(byName['bad.png'].ok).toBe(false);
  });
});
