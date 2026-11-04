const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  isImageExt,
  matchesTargetFormat,
  buildOutputPath,
  TARGET_EXT,
  scanImageFolder,
} = require('../../export/image/convertFolderImages');

describe('convertFolderImages helpers', () => {
  test('isImageExt accepts jpg/jpeg/png/webp/gif/bmp/avif', () => {
    for (const ext of ['.jpg', '.JPEG', '.png', '.webp', '.gif', '.bmp', '.avif']) {
      expect(isImageExt(ext)).toBe(true);
    }
    expect(isImageExt('.txt')).toBe(false);
  });

  test('matchesTargetFormat treats .jpg and .jpeg as jpg', () => {
    expect(matchesTargetFormat('.jpg', 'jpg')).toBe(true);
    expect(matchesTargetFormat('.jpeg', 'jpg')).toBe(true);
    expect(matchesTargetFormat('.png', 'jpg')).toBe(false);
    expect(matchesTargetFormat('.png', 'png')).toBe(true);
    expect(matchesTargetFormat('.webp', 'webp')).toBe(true);
  });

  test('buildOutputPath sameAsSource only changes extension', () => {
    const out = buildOutputPath({
      sourceDir: path.join('manga'),
      absolutePath: path.join('manga', 'ch1', '001.jpg'),
      sameAsSource: true,
      outputDir: '',
      targetFormat: 'png',
    });
    expect(out).toBe(path.join('manga', 'ch1', '001.png'));
    expect(TARGET_EXT.png).toBe('.png');
  });

  test('buildOutputPath preserves original extension when targetFormat is original', () => {
    const out = buildOutputPath({
      sourceDir: path.join('manga'),
      absolutePath: path.join('manga', 'ch1', '001.webp'),
      sameAsSource: false,
      outputDir: path.join('output'),
      targetFormat: 'original',
    });
    expect(out).toBe(path.join('output', 'ch1', '001.webp'));
  });

  test('buildOutputPath other folder preserves relative subdirs', () => {
    const sourceDir = path.join('srcRoot');
    const absolutePath = path.join('srcRoot', 'a', 'b', 'x.webp');
    const outputDir = path.join('outRoot');
    const out = buildOutputPath({
      sourceDir,
      absolutePath,
      sameAsSource: false,
      outputDir,
      targetFormat: 'jpg',
    });
    expect(out).toBe(path.join('outRoot', 'a', 'b', 'x.jpg'));
  });
});

describe('scanImageFolder', () => {
  let tmpDir;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'img-convert-scan-'));
    fs.mkdirSync(path.join(tmpDir, 'sub'));
    fs.writeFileSync(path.join(tmpDir, 'a.jpg'), Buffer.from([0xff, 0xd8, 0xff]));
    fs.writeFileSync(path.join(tmpDir, 'b.png'), Buffer.from([0x89, 0x50]));
    fs.writeFileSync(path.join(tmpDir, 'sub', 'c.webp'), Buffer.from([0x00]));
    fs.writeFileSync(path.join(tmpDir, 'note.txt'), 'x');
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('rejects an empty source directory', async () => {
    const scan_result = await scanImageFolder({ sourceDir: '', targetFormat: 'png' });
    expect(scan_result).toEqual({
      ok: false,
      error: 'Invalid source directory',
      images: [],
      skipped: [],
    });
  });

  test('non-recursive skips subfolder images', async () => {
    const r = await scanImageFolder({ sourceDir: tmpDir, includeSubfolders: false, targetFormat: 'png' });
    expect(r.ok).toBe(true);
    expect(r.images.map((i) => i.relativePath).sort()).toEqual(['a.jpg']);
    expect(r.skipped.map((i) => i.relativePath)).toEqual(['b.png']);
  });

  test('recursive includes subfolder', async () => {
    const r = await scanImageFolder({ sourceDir: tmpDir, includeSubfolders: true, targetFormat: 'jpg' });
    expect(r.ok).toBe(true);
    const rels = r.images.map((i) => i.relativePath).sort();
    expect(rels).toEqual(['b.png', path.join('sub', 'c.webp')].sort());
    expect(r.skipped.some((i) => i.relativePath === 'a.jpg')).toBe(true);
  });

  test('supports sourceFiles mode with explicit file list', async () => {
    const files = [path.join(tmpDir, 'a.jpg'), path.join(tmpDir, 'b.png')];
    const r = await scanImageFolder({ sourceFiles: files, targetFormat: 'png' });
    expect(r.ok).toBe(true);
    expect(r.images.map((i) => i.relativePath)).toEqual(['a.jpg']);
    expect(r.skipped.map((i) => i.relativePath)).toEqual(['b.png']);
  });
});

describe('encodeImageToFormat', () => {
  const {
    encodeImageToFormat,
    __resetSharpCacheForTests,
  } = require('../../export/image/convertFolderImages');

  beforeEach(() => {
    __resetSharpCacheForTests();
  });

  afterEach(() => {
    __resetSharpCacheForTests();
  });

  test('uses sharp png when provided', async () => {
    const toFile = jest.fn().mockResolvedValue(undefined);
    const png = jest.fn(() => ({ toFile }));
    const sharpFn = jest.fn(() => ({ png, jpeg: png, webp: png }));
    const result = await encodeImageToFormat('/in.jpg', '/out.png', 'png', {
      getSharp: () => sharpFn,
      getJimp: () => null,
    });
    expect(sharpFn).toHaveBeenCalledWith('/in.jpg');
    expect(png).toHaveBeenCalled();
    expect(toFile).toHaveBeenCalledWith('/out.png');
    expect(result).toEqual({ engine: 'sharp' });
  });

  test('sharp jpeg uses quality 100', async () => {
    const toFile = jest.fn().mockResolvedValue(undefined);
    const jpeg = jest.fn(() => ({ toFile }));
    const sharpFn = jest.fn(() => ({ png: jpeg, jpeg, webp: jpeg }));
    const result = await encodeImageToFormat('/in.png', '/out.jpg', 'jpg', {
      getSharp: () => sharpFn,
      getJimp: () => null,
    });
    expect(jpeg).toHaveBeenCalledWith({ quality: 100 });
    expect(toFile).toHaveBeenCalledWith('/out.jpg');
    expect(result).toEqual({ engine: 'sharp' });
  });

  test('sharp webp uses lossless true', async () => {
    const toFile = jest.fn().mockResolvedValue(undefined);
    const webp = jest.fn(() => ({ toFile }));
    const sharpFn = jest.fn(() => ({ png: webp, jpeg: webp, webp }));
    const result = await encodeImageToFormat('/in.png', '/out.webp', 'webp', {
      getSharp: () => sharpFn,
      getJimp: () => null,
    });
    expect(webp).toHaveBeenCalledWith({ lossless: true });
    expect(toFile).toHaveBeenCalledWith('/out.webp');
    expect(result).toEqual({ engine: 'sharp' });
  });

  test('falls back to jimp for jpg when sharp missing', async () => {
    const writeAsync = jest.fn().mockResolvedValue(undefined);
    const quality = jest.fn(() => ({ writeAsync }));
    const jimpImg = { quality };
    const getJimp = () => ({ read: jest.fn().mockResolvedValue(jimpImg) });
    const result = await encodeImageToFormat('/in.png', '/out.jpg', 'jpg', {
      getSharp: () => null,
      getJimp,
    });
    expect(quality).toHaveBeenCalledWith(100);
    expect(writeAsync).toHaveBeenCalledWith('/out.jpg');
    expect(result).toEqual({ engine: 'jimp' });
  });

  test('falls back to jimp for png when sharp missing', async () => {
    const writeAsync = jest.fn().mockResolvedValue(undefined);
    const jimpImg = { writeAsync };
    const getJimp = () => ({ read: jest.fn().mockResolvedValue(jimpImg) });
    const result = await encodeImageToFormat('/in.jpg', '/out.png', 'png', {
      getSharp: () => null,
      getJimp,
    });
    expect(writeAsync).toHaveBeenCalledWith('/out.png');
    expect(result).toEqual({ engine: 'jimp' });
  });

  test('webp without sharp throws clear error', async () => {
    await expect(
      encodeImageToFormat('/in.png', '/out.webp', 'webp', {
        getSharp: () => null,
        getJimp: () => ({ read: jest.fn() }),
      })
    ).rejects.toThrow(
      'Converting to WebP requires the sharp module, which failed to load. Please reinstall the app to restore sharp support.'
    );
  });
});

const {
  convertFolderImages,
  requestCancelConvertFolderImages,
  resetConvertFolderImagesCancel,
} = require('../../export/image/convertFolderImages');

describe('convertFolderImages batch', () => {
  let tmpDir;
  beforeEach(() => {
    resetConvertFolderImagesCancel();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'img-convert-batch-'));
    fs.mkdirSync(path.join(tmpDir, 'ch'));
    fs.writeFileSync(path.join(tmpDir, 'ch', '1.jpg'), Buffer.from('x'));
    fs.writeFileSync(path.join(tmpDir, 'ch', '2.png'), Buffer.from('y'));
  });
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  test('rejects an empty output directory when source output is disabled', async () => {
    const convert_result = await convertFolderImages({
      sourceDir: tmpDir,
      includeSubfolders: true,
      targetFormat: 'png',
      sameAsSource: false,
      outputDir: '',
    });
    expect(convert_result.ok).toBe(false);
    expect(convert_result.error).toBe('Missing output directory');
  });

  test('skips already-target, writes others, preserves relative path', async () => {
    const outRoot = path.join(tmpDir, 'out');
    const encodeCalls = [];
    const r = await convertFolderImages({
      sourceDir: tmpDir,
      includeSubfolders: true,
      targetFormat: 'png',
      sameAsSource: false,
      outputDir: outRoot,
      moveOriginalsToTrash: false,
      encodeImageToFormat: async (input, output, fmt) => {
        encodeCalls.push({ input, output, fmt });
        fs.mkdirSync(path.dirname(output), { recursive: true });
        fs.writeFileSync(output, Buffer.from('ok'));
        return { engine: 'mock' };
      },
    });
    expect(r.ok).toBe(true);
    expect(r.skipped).toBe(1);
    expect(r.converted).toBe(1);
    expect(encodeCalls).toHaveLength(1);
    expect(encodeCalls[0].output).toBe(path.join(outRoot, 'ch', '1.png'));
    expect(fs.existsSync(path.join(outRoot, 'ch', '1.png'))).toBe(true);
  });

  test('trash hook called after success when enabled', async () => {
    const trashed = [];
    await convertFolderImages({
      sourceDir: tmpDir,
      includeSubfolders: true,
      targetFormat: 'webp',
      sameAsSource: true,
      moveOriginalsToTrash: true,
      trashItem: async (p) => {
        trashed.push(p);
      },
      encodeImageToFormat: async (input, output) => {
        fs.writeFileSync(output, Buffer.from('ok'));
        return { engine: 'mock' };
      },
    });
    expect(trashed.length).toBeGreaterThanOrEqual(1);
  });

  test('cancel stops between files', async () => {
    // Two non-jpg files so cancel after first encode leaves one unprocessed.
    fs.writeFileSync(path.join(tmpDir, 'ch', '3.png'), Buffer.from('z'));
    let n = 0;
    const r = await convertFolderImages({
      sourceDir: tmpDir,
      includeSubfolders: true,
      targetFormat: 'jpg',
      sameAsSource: false,
      outputDir: path.join(tmpDir, 'out2'),
      encodeImageToFormat: async (input, output) => {
        n += 1;
        if (n === 1) requestCancelConvertFolderImages();
        fs.mkdirSync(path.dirname(output), { recursive: true });
        fs.writeFileSync(output, Buffer.from('ok'));
        return { engine: 'mock' };
      },
    });
    expect(r.cancelled).toBe(true);
    expect(r.converted).toBe(1);
  });

  test('overwrites existing destination', async () => {
    const dest = path.join(tmpDir, 'ch', '1.png');
    fs.writeFileSync(dest, Buffer.from('old'));
    await convertFolderImages({
      sourceDir: tmpDir,
      includeSubfolders: true,
      targetFormat: 'png',
      sameAsSource: true,
      encodeImageToFormat: async (input, output) => {
        fs.writeFileSync(output, Buffer.from('new'));
        return { engine: 'mock' };
      },
    });
    expect(fs.readFileSync(dest).toString()).toBe('new');
  });
});
