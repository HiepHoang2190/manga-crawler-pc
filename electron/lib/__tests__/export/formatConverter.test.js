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

  test('convertSingleBook converts MOBI to PDF successfully', async () => {
    const mobiPath = path.join(dir, 'DNTG - Albert Schweitzer - Suto.mobi');
    fs.writeFileSync(mobiPath, 'dummy-mobi-data');

    const mobiLoader = require('../../reader/loaders/loadMobiForOfflineRead');
    jest.spyOn(mobiLoader, 'loadMobiFromFilePath').mockImplementation(async (filePath, opts) => {
      // Simulate loadMobiFromFilePath returning images unpacked into tempRoot
      const pagesDir = path.join(opts.tempRoot, '_epub_pages');
      fs.mkdirSync(pagesDir, { recursive: true });
      writeTinyPng(path.join(pagesDir, '001.png'));
      writeTinyPng(path.join(pagesDir, '002.png'));
      return {
        ok: true,
        chapters: [{ id: '1', title: 'Chapter 1' }],
        cbzTempExtractDir: opts.tempRoot,
      };
    });

    try {
      const outDir = path.join(dir, 'output_pdf');
      fs.mkdirSync(outDir, { recursive: true });

      const result = await convertSingleBook({
        inputPath: mobiPath,
        targetFormat: 'pdf',
        outputDir: outDir,
      });

      expect(result.ok).toBe(true);
      expect(result.outputPath.endsWith('.pdf')).toBe(true);
      expect(fs.existsSync(result.outputPath)).toBe(true);
    } finally {
      mobiLoader.loadMobiFromFilePath.mockRestore();
    }
  });

  test('batchConvertBooks reports page-by-page progress when converting single book to PDF', async () => {
    const cbzPath = path.join(dir, 'single-comic.cbz');
    await createDummyCbz(cbzPath, ['page1.png', 'page2.png', 'page3.png']);

    const outDir = path.join(dir, 'output_single_pdf');
    fs.mkdirSync(outDir, { recursive: true });

    const progressEvents = [];
    const results = await batchConvertBooks({
      inputPaths: [cbzPath],
      targetFormat: 'pdf',
      outputDir: outDir,
      onItemProgress: (p) => {
        progressEvents.push({ ...p });
      },
    });

    expect(results.length).toBe(1);
    expect(results[0].ok).toBe(true);

    // Verify progress events during PDF page addition
    const pageEvents = progressEvents.filter((e) => e.done !== undefined);
    expect(pageEvents.length).toBe(3);

    // Verify index increments with done, total is 3, message contains page progress
    expect(pageEvents[0].index).toBe(1);
    expect(pageEvents[0].total).toBe(3);
    expect(pageEvents[0].message).toContain('1/3');

    expect(pageEvents[1].index).toBe(2);
    expect(pageEvents[1].total).toBe(3);
    expect(pageEvents[1].message).toContain('2/3');

    expect(pageEvents[2].index).toBe(3);
    expect(pageEvents[2].total).toBe(3);
    expect(pageEvents[2].percent).toBe(100);
  });

  test('convertSingleBook skips conversion when options.skipExisting is true and target file already exists', async () => {
    const cbzPath = path.join(dir, 'manga.cbz');
    await createDummyCbz(cbzPath, ['01.png', '02.png']);

    const outDir = path.join(dir, 'output_skip');
    fs.mkdirSync(outDir, { recursive: true });
    const existingTarget = path.join(outDir, 'manga.epub');
    fs.writeFileSync(existingTarget, 'sentinel-existing-epub');

    const result = await convertSingleBook({
      inputPath: cbzPath,
      targetFormat: 'epub',
      outputDir: outDir,
      options: { skipExisting: true },
    });

    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.outputPath).toBe(existingTarget);
    expect(fs.readFileSync(existingTarget, 'utf8')).toBe('sentinel-existing-epub');
  });

  test('convertSingleBook skips folder export when options.skipExisting is true and target folder is non-empty', async () => {
    const cbzPath = path.join(dir, 'manga.cbz');
    await createDummyCbz(cbzPath, ['01.png', '02.png']);

    const outDir = path.join(dir, 'output_skip_folder');
    const existingFolder = path.join(outDir, 'manga');
    fs.mkdirSync(existingFolder, { recursive: true });
    const sentinelFile = path.join(existingFolder, 'keep.txt');
    fs.writeFileSync(sentinelFile, 'keep');

    const result = await convertSingleBook({
      inputPath: cbzPath,
      targetFormat: 'folder',
      outputDir: outDir,
      options: { skipExisting: true },
    });

    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.outputPath).toBe(existingFolder);
    expect(fs.readdirSync(existingFolder)).toEqual(['keep.txt']);
  });

  test('batchConvertBooks with inPlace: true saves each converted file in its own source directory', async () => {
    const subA = path.join(dir, 'seriesA');
    const subB = path.join(dir, 'seriesB');
    fs.mkdirSync(subA, { recursive: true });
    fs.mkdirSync(subB, { recursive: true });

    const cbzA = path.join(subA, 'bookA.cbz');
    const cbzB = path.join(subB, 'bookB.cbz');
    await createDummyCbz(cbzA, ['01.png']);
    await createDummyCbz(cbzB, ['01.png']);

    const results = await batchConvertBooks({
      inputPaths: [cbzA, cbzB],
      targetFormat: 'epub',
      outputDir: '',
      inPlace: true,
    });

    expect(results.length).toBe(2);
    expect(results[0].ok).toBe(true);
    expect(results[0].outputPath).toBe(path.join(subA, 'bookA.epub'));
    expect(fs.existsSync(path.join(subA, 'bookA.epub'))).toBe(true);
    expect(results[1].ok).toBe(true);
    expect(results[1].outputPath).toBe(path.join(subB, 'bookB.epub'));
    expect(fs.existsSync(path.join(subB, 'bookB.epub'))).toBe(true);
  });

  test('batchConvertBooks handles invalid inputPath safely when inPlace is true and converts directory input in-place', async () => {
    const imgFolder = path.join(dir, 'comicFolder');
    fs.mkdirSync(imgFolder, { recursive: true });
    writeTinyPng(path.join(imgFolder, '01.png'));

    const results = await batchConvertBooks({
      inputPaths: [null, imgFolder],
      targetFormat: 'cbz',
      outputDir: '',
      inPlace: true,
    });

    expect(results.length).toBe(2);
    expect(results[0].ok).toBe(false);
    expect(typeof results[0].error).toBe('string');
    expect(results[1].ok).toBe(true);
    expect(results[1].outputPath).toBe(path.join(imgFolder, 'comicFolder.cbz'));
    expect(fs.existsSync(path.join(imgFolder, 'comicFolder.cbz'))).toBe(true);
  });

  test('convertSingleBook does not skip folder export when target folder is empty', async () => {
    const cbzPath = path.join(dir, 'manga.cbz');
    await createDummyCbz(cbzPath, ['01.png']);

    const outDir = path.join(dir, 'output_empty_folder');
    const emptyFolder = path.join(outDir, 'manga');
    fs.mkdirSync(emptyFolder, { recursive: true });

    const result = await convertSingleBook({
      inputPath: cbzPath,
      targetFormat: 'folder',
      outputDir: outDir,
      options: { skipExisting: true },
    });

    expect(result.ok).toBe(true);
    expect(result.skipped).toBeUndefined();
    expect(fs.readdirSync(emptyFolder)).toEqual(['0001.png']);
  });

  test('convertSingleBook atomically overwrites same-path cbz without leaving temp files', async () => {
    const cbzPath = path.join(dir, 'same.cbz');
    await createDummyCbz(cbzPath, ['01.png', '02.png']);
    const originalSize = fs.statSync(cbzPath).size;

    const result = await convertSingleBook({
      inputPath: cbzPath,
      targetFormat: 'cbz',
      outputDir: dir,
      options: { skipExisting: false },
    });

    expect(result.ok).toBe(true);
    expect(result.outputPath).toBe(cbzPath);
    expect(fs.existsSync(cbzPath)).toBe(true);
    expect(fs.statSync(cbzPath).size).toBeGreaterThan(0);
    expect(originalSize).toBeGreaterThan(0);
    const leftover = fs.readdirSync(dir).filter((f) => f.includes('.converting-'));
    expect(leftover).toEqual([]);

    const verifyDir = path.join(dir, 'verify_same');
    const extracted = await extractImagesFromBook(cbzPath, verifyDir);
    expect(extracted.ok).toBe(true);
    expect(extracted.images.length).toBe(2);
  });

  test('batchConvertBooks preserves original file intact if same-path overwrite is aborted mid-conversion', async () => {
    const cbzPath = path.join(dir, 'keep-intact.cbz');
    await createDummyCbz(cbzPath, ['01.png', '02.png']);
    const originalBytes = fs.readFileSync(cbzPath);

    const ac = new AbortController();
    const results = await batchConvertBooks({
      inputPaths: [cbzPath],
      targetFormat: 'cbz',
      outputDir: '',
      inPlace: true,
      signal: ac.signal,
      onItemProgress: (p) => {
        if (p?.message?.includes('đóng gói')) {
          ac.abort();
        }
      },
    });

    expect(results.length).toBe(1);
    expect(results[0].ok).toBe(false);
    expect(fs.existsSync(cbzPath)).toBe(true);
    expect(fs.readFileSync(cbzPath).equals(originalBytes)).toBe(true);
    const leftover = fs.readdirSync(dir).filter((f) => f.includes('.converting-'));
    expect(leftover).toEqual([]);
  });

  test('batchConvertBooks with inPlace: true rejects directory-to-folder conversion instead of nesting', async () => {
    const imgFolder = path.join(dir, 'comicFolder');
    fs.mkdirSync(imgFolder, { recursive: true });
    writeTinyPng(path.join(imgFolder, '01.png'));

    const results = await batchConvertBooks({
      inputPaths: [imgFolder],
      targetFormat: 'folder',
      outputDir: '',
      inPlace: true,
    });

    expect(results.length).toBe(1);
    expect(results[0].ok).toBe(false);
    expect(fs.existsSync(path.join(imgFolder, 'comicFolder'))).toBe(false);
  });
});
