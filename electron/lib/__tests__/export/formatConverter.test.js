'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const archiver = require('archiver');
const {
  extractImagesFromBook,
} = require('../../export/converter/extractors');
const {
  convertSingleBook,
  batchConvertBooks,
} = require('../../export/converter/formatConverter');

function tmpDir(prefix = 'converter-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeTinyPng(filePath) {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
  fs.writeFileSync(filePath, png);
}

function createDummyCbz(zipPath, imageNames = ['01.png', '02.png']) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 1 } });
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);

    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    );
    for (const name of imageNames) {
      archive.append(png, { name });
    }
    archive.finalize();
  });
}

describe('Format Converter', () => {
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

  test('extractImagesFromBook extracts images from CBZ archive', async () => {
    const cbzPath = path.join(dir, 'test.cbz');
    await createDummyCbz(cbzPath, ['001.png', '002.png']);

    const tempExtract = path.join(dir, 'extract');
    const result = await extractImagesFromBook(cbzPath, tempExtract);

    expect(result.ok).toBe(true);
    expect(result.images.length).toBe(2);
    expect(result.title).toBe('test');
  });

  test('convertSingleBook converts CBZ to EPUB successfully', async () => {
    const cbzPath = path.join(dir, 'manga.cbz');
    await createDummyCbz(cbzPath, ['01.png', '02.png']);

    const outDir = path.join(dir, 'output');
    fs.mkdirSync(outDir, { recursive: true });

    const result = await convertSingleBook({
      inputPath: cbzPath,
      targetFormat: 'epub',
      outputDir: outDir,
    });

    expect(result.ok).toBe(true);
    expect(fs.existsSync(result.outputPath)).toBe(true);
    expect(result.outputPath.endsWith('.epub')).toBe(true);
  });

  test('convertSingleBook extracts CBZ to Images Folder', async () => {
    const cbzPath = path.join(dir, 'manga.cbz');
    await createDummyCbz(cbzPath, ['page1.png', 'page2.png']);

    const outDir = path.join(dir, 'output_images');
    fs.mkdirSync(outDir, { recursive: true });

    const result = await convertSingleBook({
      inputPath: cbzPath,
      targetFormat: 'folder',
      outputDir: outDir,
    });

    expect(result.ok).toBe(true);
    expect(fs.existsSync(result.outputPath)).toBe(true);
    const files = fs.readdirSync(result.outputPath);
    expect(files.length).toBe(2);
  });

  test('batchConvertBooks processes multiple items', async () => {
    const cbz1 = path.join(dir, 'vol1.cbz');
    const cbz2 = path.join(dir, 'vol2.cbz');
    await createDummyCbz(cbz1, ['01.png']);
    await createDummyCbz(cbz2, ['01.png']);

    const outDir = path.join(dir, 'batch_out');
    fs.mkdirSync(outDir, { recursive: true });

    const results = await batchConvertBooks({
      inputPaths: [cbz1, cbz2],
      targetFormat: 'epub',
      outputDir: outDir,
    });

    expect(results.length).toBe(2);
    expect(results[0].ok).toBe(true);
    expect(results[1].ok).toBe(true);
  });
});
