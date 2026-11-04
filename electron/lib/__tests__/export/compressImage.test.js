'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const sharp = require('sharp');
const {
  scanCompressibleImages,
  buildCompressOutputPath,
  compressSingleImage,
  batchCompressImages,
  requestCancelCompress,
  resetCompressCancel,
  isCompressibleImage,
} = require('../../export/image/compressImage');

function tmpDir(prefix = 'compress-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('compressImage Backend Unit Tests', () => {
  let dir;

  beforeEach(() => {
    dir = tmpDir();
    resetCompressCancel();
  });

  afterEach(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  describe('isCompressibleImage', () => {
    test('identifies supported image extensions correctly', () => {
      expect(isCompressibleImage('.jpg')).toBe(true);
      expect(isCompressibleImage('.jpeg')).toBe(true);
      expect(isCompressibleImage('.png')).toBe(true);
      expect(isCompressibleImage('.webp')).toBe(true);
      expect(isCompressibleImage('.JPG')).toBe(true);
      expect(isCompressibleImage('png')).toBe(true);

      expect(isCompressibleImage('.gif')).toBe(false);
      expect(isCompressibleImage('.bmp')).toBe(false);
      expect(isCompressibleImage('.txt')).toBe(false);
      expect(isCompressibleImage('.pdf')).toBe(false);
    });
  });

  describe('buildCompressOutputPath', () => {
    test('returns original path when inPlace is true', () => {
      const src = '/path/to/image.jpg';
      const result = buildCompressOutputPath({
        absolutePath: src,
        inPlace: true,
      });
      expect(result).toBe(src);
    });

    test('builds output path under outputDir preserving relative subpath', () => {
      const absolutePath = '/manga/vol1/ch1/01.jpg';
      const relativePath = 'vol1/ch1/01.jpg';
      const sourceDir = '/manga';
      const outputDir = '/compressed';

      const result = buildCompressOutputPath({
        absolutePath,
        relativePath,
        outputDir,
        sourceDir,
        inPlace: false,
      });
      expect(result).toBe(path.join(outputDir, 'vol1/ch1/01.jpg'));
    });

    test('falls back to basename when no sourceDir is provided', () => {
      const absolutePath = '/some/random/path/cover.png';
      const outputDir = '/out';

      const result = buildCompressOutputPath({
        absolutePath,
        outputDir,
        inPlace: false,
      });
      expect(result).toBe(path.join(outputDir, 'cover.png'));
    });
  });

  describe('scanCompressibleImages', () => {
    test('scans folder and returns image list with file metadata', async () => {
      // Create test images
      const img1Path = path.join(dir, 'test1.jpg');
      const img2Path = path.join(dir, 'test2.png');
      const nonImgPath = path.join(dir, 'notes.txt');

      await sharp({ create: { width: 50, height: 50, channels: 3, background: { r: 255, g: 0, b: 0 } } })
        .jpeg()
        .toFile(img1Path);
      await sharp({ create: { width: 50, height: 50, channels: 3, background: { r: 0, g: 255, b: 0 } } })
        .png()
        .toFile(img2Path);
      fs.writeFileSync(nonImgPath, 'hello world');

      const result = await scanCompressibleImages({ sourceDir: dir, includeSubfolders: false });
      expect(result.ok).toBe(true);
      expect(result.images).toHaveLength(2);
      expect(result.images.map((i) => i.fileName).sort()).toEqual(['test1.jpg', 'test2.png']);
      expect(result.images[0].originalSize).toBeGreaterThan(0);
    });

    test('scans subfolders when includeSubfolders is true', async () => {
      const subDir = path.join(dir, 'ch1');
      fs.mkdirSync(subDir, { recursive: true });
      const imgSub = path.join(subDir, 'page01.webp');

      await sharp({ create: { width: 30, height: 30, channels: 3, background: { r: 0, g: 0, b: 255 } } })
        .webp()
        .toFile(imgSub);

      const resShallow = await scanCompressibleImages({ sourceDir: dir, includeSubfolders: false });
      expect(resShallow.images).toHaveLength(0);

      const resDeep = await scanCompressibleImages({ sourceDir: dir, includeSubfolders: true });
      expect(resDeep.ok).toBe(true);
      expect(resDeep.images).toHaveLength(1);
      expect(resDeep.images[0].fileName).toBe('page01.webp');
    });

    test('scans specified sourceFiles directly and returns their metadata', async () => {
      const f1 = path.join(dir, 'test1.jpg');
      const f2 = path.join(dir, 'test2.png');
      fs.writeFileSync(f1, 'fake-jpg-content');
      fs.writeFileSync(f2, 'fake-png-content');
      const res = await scanCompressibleImages({ sourceFiles: [f1, f2] });
      expect(res.ok).toBe(true);
      expect(res.images).toHaveLength(2);
      expect(res.images[0].fileName).toBe('test1.jpg');
      expect(res.images[0].originalSize).toBeGreaterThan(0);
    });

    test('sorts images naturally (page2 before page10)', async () => {
      const p2 = path.join(dir, 'page2.jpg');
      const p10 = path.join(dir, 'page10.jpg');
      await sharp({ create: { width: 10, height: 10, channels: 3, background: { r: 1, g: 1, b: 1 } } })
        .jpeg()
        .toFile(p2);
      await sharp({ create: { width: 10, height: 10, channels: 3, background: { r: 2, g: 2, b: 2 } } })
        .jpeg()
        .toFile(p10);

      const res = await scanCompressibleImages({ sourceFiles: [p10, p2] });
      expect(res.images.map((i) => i.fileName)).toEqual(['page2.jpg', 'page10.jpg']);
    });
  });

  describe('compressSingleImage and batchCompressImages', () => {
    test('compresses a large image and reduces its size', async () => {
      const inputPath = path.join(dir, 'photo.jpg');
      const outDir = path.join(dir, 'output');
      fs.mkdirSync(outDir, { recursive: true });
      const outputPath = path.join(outDir, 'photo.jpg');

      // Create a 600x600 uncompressed / high-quality jpeg
      await sharp({
        create: {
          width: 600,
          height: 600,
          channels: 3,
          background: { r: 120, g: 180, b: 240 },
        },
      })
        .jpeg({ quality: 100 })
        .toFile(inputPath);

      const originalSize = fs.statSync(inputPath).size;

      const res = await compressSingleImage({
        inputPath,
        outputPath,
        quality: 75,
        resizePercent: 100,
      });

      expect(res.ok).toBe(true);
      expect(res.skipped).toBe(false);
      expect(fs.existsSync(outputPath)).toBe(true);
      expect(res.compressedSize).toBeLessThanOrEqual(originalSize);
    });

    test('supports resizing image by percent', async () => {
      const inputPath = path.join(dir, 'large.png');
      const outDir = path.join(dir, 'output');
      fs.mkdirSync(outDir, { recursive: true });
      const outputPath = path.join(outDir, 'large.png');

      await sharp({
        create: {
          width: 200,
          height: 200,
          channels: 4,
          background: { r: 200, g: 100, b: 50, alpha: 1 },
        },
      })
        .png()
        .toFile(inputPath);

      const res = await compressSingleImage({
        inputPath,
        outputPath,
        resizePercent: 50,
      });

      expect(res.ok).toBe(true);
      const meta = await sharp(outputPath).metadata();
      expect(meta.width).toBe(100);
      expect(meta.height).toBe(100);
    });

    test('batchCompressImages processes multiple files with progress reporting', async () => {
      const img1 = path.join(dir, 'img1.jpg');
      const img2 = path.join(dir, 'img2.jpg');
      const outDir = path.join(dir, 'out_batch');
      fs.mkdirSync(outDir, { recursive: true });

      await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 10, g: 20, b: 30 } } })
        .jpeg({ quality: 100 })
        .toFile(img1);
      await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 40, g: 50, b: 60 } } })
        .jpeg({ quality: 100 })
        .toFile(img2);

      const progressCalls = [];
      const onProgress = (p) => progressCalls.push(p);

      const batchResult = await batchCompressImages({
        images: [
          { input: img1, relativePath: 'img1.jpg', fileName: 'img1.jpg' },
          { input: img2, relativePath: 'img2.jpg', fileName: 'img2.jpg' },
        ],
        outputDir: outDir,
        sourceDir: dir,
        quality: 80,
        onProgress,
      });

      expect(batchResult.total).toBe(2);
      expect(batchResult.completed + batchResult.skipped).toBe(2);
      expect(batchResult.failed).toBe(0);
      expect(progressCalls.length).toBeGreaterThanOrEqual(2);
      expect(fs.existsSync(path.join(outDir, 'img1.jpg'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'img2.jpg'))).toBe(true);
    });

    test('auto-skips and preserves original when compressed file would be larger', async () => {
      const tinyPath = path.join(dir, 'tiny.jpg');
      const outDir = path.join(dir, 'out_skip');
      fs.mkdirSync(outDir, { recursive: true });
      const outputPath = path.join(outDir, 'tiny.jpg');

      // 10x10 solid image compressed at quality 1
      await sharp({ create: { width: 10, height: 10, channels: 3, background: { r: 0, g: 0, b: 0 } } })
        .jpeg({ quality: 1 })
        .toFile(tinyPath);

      const origSize = fs.statSync(tinyPath).size;

      // Compressing at quality 100 will produce a larger file than quality 1
      const res = await compressSingleImage({
        inputPath: tinyPath,
        outputPath,
        quality: 100,
      });

      expect(res.ok).toBe(true);
      expect(res.skipped).toBe(true);
      expect(res.compressedSize).toBe(origSize);
    });

    test('can cancel batch compression mid-way', async () => {
      const img1 = path.join(dir, 'cancel1.jpg');
      const img2 = path.join(dir, 'cancel2.jpg');
      const outDir = path.join(dir, 'out_cancel');
      fs.mkdirSync(outDir, { recursive: true });

      await sharp({ create: { width: 50, height: 50, channels: 3, background: { r: 1, g: 1, b: 1 } } })
        .jpeg()
        .toFile(img1);
      await sharp({ create: { width: 50, height: 50, channels: 3, background: { r: 2, g: 2, b: 2 } } })
        .jpeg()
        .toFile(img2);

      const batchResult = await batchCompressImages({
        images: [
          { input: img1, relativePath: 'cancel1.jpg', fileName: 'cancel1.jpg' },
          { input: img2, relativePath: 'cancel2.jpg', fileName: 'cancel2.jpg' },
        ],
        outputDir: outDir,
        sourceDir: dir,
        onProgress: (p) => {
          if (p.current === 1) {
            requestCancelCompress();
          }
        },
      });

      expect(batchResult.cancelled).toBe(true);
      expect(batchResult.completed + batchResult.skipped).toBe(1);
    });
  });
});
