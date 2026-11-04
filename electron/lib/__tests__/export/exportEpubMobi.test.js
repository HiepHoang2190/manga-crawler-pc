'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const extractZip = require('extract-zip');
const {
  buildEpubFromImages,
  exportEpubCore,
} = require('../../export/epub/exportEpubCore');
const {
  buildMobiFromImages,
} = require('../../export/mobi/exportMobiCore');

function tmpDir(prefix = 'epub-mobi-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeTinyPng(filePath) {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
  fs.writeFileSync(filePath, png);
}

describe('exportEpubCore', () => {
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

  test('buildEpubFromImages creates a valid reflowable EPUB file with pages', async () => {
    const img1 = path.join(dir, 'p1.png');
    const img2 = path.join(dir, 'p2.png');
    writeTinyPng(img1);
    writeTinyPng(img2);

    const outEpub = path.join(dir, 'test.epub');
    const result = await buildEpubFromImages({
      images: [
        { path: img1, title: 'Trang 1' },
        { path: img2, title: 'Trang 2' },
      ],
      outputPath: outEpub,
      metadata: { title: 'Test Comic EPUB', author: 'Author Name' },
    });

    expect(result.ok).toBe(true);
    expect(fs.existsSync(outEpub)).toBe(true);

    const extractedDir = path.join(dir, 'extracted');
    await extractZip(outEpub, { dir: extractedDir });
    expect(fs.readFileSync(path.join(extractedDir, 'mimetype'), 'utf8')).toBe('application/epub+zip');
    expect(fs.existsSync(path.join(extractedDir, 'OEBPS/content.opf'))).toBe(true);

    // Verify KCC-compatible fixed-layout OPF metadata
    const opfContent = fs.readFileSync(path.join(extractedDir, 'OEBPS/content.opf'), 'utf8');
    expect(opfContent).toContain('rendition:layout">pre-paginated');
    expect(opfContent).toContain('name="fixed-layout" content="true"');
    expect(opfContent).toContain('name="book-type" content="comic"');
    expect(opfContent).toContain('name="zero-gutter" content="true"');
    expect(opfContent).toContain('name="zero-margin" content="true"');
    expect(opfContent).toContain('toc="ncx"');
    expect(opfContent).toContain('href="toc.ncx"');
    expect(opfContent).toContain('href="style.css"');
    expect(opfContent).toMatch(/page-spread-/);

    // Verify EPUB 2 NCX TOC exists and is well-formed
    expect(fs.existsSync(path.join(extractedDir, 'OEBPS/toc.ncx'))).toBe(true);
    const ncxContent = fs.readFileSync(path.join(extractedDir, 'OEBPS/toc.ncx'), 'utf8');
    expect(ncxContent).toContain('<navMap>');
    expect(ncxContent).toContain('<navPoint id="navpoint_1"');
    expect(ncxContent).toContain('Trang 1');

    // Verify shared fixed-layout stylesheet
    expect(fs.existsSync(path.join(extractedDir, 'OEBPS/style.css'))).toBe(true);
    const cssContent = fs.readFileSync(path.join(extractedDir, 'OEBPS/style.css'), 'utf8');
    expect(cssContent).toContain('@page');
    expect(cssContent).toContain('page-wrapper');

    // Verify page XHTML has viewport meta, stylesheet link, and img width/height
    expect(fs.existsSync(path.join(extractedDir, 'OEBPS/pages/page_0001.xhtml'))).toBe(true);
    const pageXhtml = fs.readFileSync(path.join(extractedDir, 'OEBPS/pages/page_0001.xhtml'), 'utf8');
    expect(pageXhtml).toContain('name="viewport" content="width=1, height=1"');
    expect(pageXhtml).toContain('href="../style.css"');
    expect(pageXhtml).toContain('width="1" height="1"');
  });

  test('exportEpubCore singleVolume mode exports 1 epub file', async () => {
    const img = path.join(dir, 'p1.png');
    writeTinyPng(img);

    const outDir = path.join(dir, 'out');
    fs.mkdirSync(outDir, { recursive: true });

    const result = await exportEpubCore({
      images: [{ path: img, title: 'Chapter 1' }],
      mangaTitle: 'One Piece Test',
      outputDir: outDir,
      packMode: 'singleVolume',
    });

    expect(result.ok).toBe(true);
    expect(result.outputFiles.length).toBe(1);
    expect(result.outputFiles[0].endsWith('.epub')).toBe(true);
  });

  test('buildEpubFromImages computes viewport and spread properties for portrait and landscape', async () => {
    const sharp = require('sharp');
    const portraitPath = path.join(dir, 'portrait.jpg');
    const landscapePath = path.join(dir, 'landscape.jpg');
    await sharp({ create: { width: 600, height: 900, channels: 3, background: { r: 255, g: 255, b: 255 } } }).jpeg().toFile(portraitPath);
    await sharp({ create: { width: 1200, height: 800, channels: 3, background: { r: 255, g: 255, b: 255 } } }).jpeg().toFile(landscapePath);

    const outEpub = path.join(dir, 'spread_test.epub');
    const result = await buildEpubFromImages({
      images: [
        { path: portraitPath, title: 'Portrait' },
        { path: landscapePath, title: 'Landscape' },
      ],
      outputPath: outEpub,
      metadata: { title: 'Spread Test', author: 'Author' },
    });

    expect(result.ok).toBe(true);

    const extractedDir = path.join(dir, 'extracted_spread');
    await extractZip(outEpub, { dir: extractedDir });

    // Portrait page should have 600x900 viewport
    const p1 = fs.readFileSync(path.join(extractedDir, 'OEBPS/pages/page_0001.xhtml'), 'utf8');
    expect(p1).toContain('width=600, height=900');
    expect(p1).toContain('width="600" height="900"');

    // Landscape page should have 1200x800 viewport
    const p2 = fs.readFileSync(path.join(extractedDir, 'OEBPS/pages/page_0002.xhtml'), 'utf8');
    expect(p2).toContain('width=1200, height=800');
    expect(p2).toContain('width="1200" height="800"');

    // OPF spine should have page-spread-left for portrait, page-spread-center for landscape
    const opf = fs.readFileSync(path.join(extractedDir, 'OEBPS/content.opf'), 'utf8');
    expect(opf).toContain('page-spread-left');
    expect(opf).toContain('page-spread-center');
    expect(opf).toContain('prefix="rendition: http://www.idpf.org/vocab/rendition/#"');
  });

  test('buildEpubFromImages caps oversized images at 1920px max dimension for Kindle compatibility', async () => {
    const sharp = require('sharp');
    const hugePath = path.join(dir, 'huge.jpg');
    // Create 1600x2500 image (> 1920 limit)
    await sharp({ create: { width: 1600, height: 2500, channels: 3, background: { r: 255, g: 255, b: 255 } } }).jpeg().toFile(hugePath);

    const outEpub = path.join(dir, 'huge_test.epub');
    const result = await buildEpubFromImages({
      images: [{ path: hugePath, title: 'Huge' }],
      outputPath: outEpub,
      metadata: { title: 'Huge Test' },
    });

    expect(result.ok).toBe(true);

    const extractedDir = path.join(dir, 'extracted_huge');
    await extractZip(outEpub, { dir: extractedDir });

    // Page 1 should be downscaled so height is 1920
    const p1 = fs.readFileSync(path.join(extractedDir, 'OEBPS/pages/page_0001.xhtml'), 'utf8');
    expect(p1).toContain('height=1920');
    expect(p1).toContain('height="1920"');
    // Width should be scaled proportionally: 1600 * 1920 / 2500 = 1229 (approx)
    expect(p1).toContain('width=1229');
  });
});

describe('exportMobiCore', () => {
  let dir;

  beforeEach(() => {
    dir = tmpDir('mobi-test-');
  });

  afterEach(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  test('buildMobiFromImages returns error if compiler not found', async () => {
    const img = path.join(dir, 'p1.png');
    writeTinyPng(img);

    const outMobi = path.join(dir, 'test.mobi');
    const result = await buildMobiFromImages({
      images: [{ path: img, title: 'P1' }],
      outputPath: outMobi,
      compilerOpts: { customDir: dir, skipSystemPath: true }, // will not find compiler
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/KindleGen|compiler/i);
  });
});
