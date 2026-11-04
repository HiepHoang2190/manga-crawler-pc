'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const extractZip = require('extract-zip');

const {
  writeFixedLayoutEpub,
  exportChaptersToEpub,
  estimateEpubPartBytes,
} = require('../../../export/exportEpub');

function tmpDir(prefix = 'epub-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Tiny valid PNG (1×1). */
function writeTinyPng(filePath, padBytes = 0) {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
  const buf = padBytes > 0 ? Buffer.concat([png, Buffer.alloc(padBytes, 0)]) : png;
  fs.writeFileSync(filePath, buf);
}

describe('estimateEpubPartBytes', () => {
  test('adds base + per-image overhead on top of raw sizes', () => {
    const n = estimateEpubPartBytes([{ sz: 1000 }, { sz: 2000 }]);
    expect(n).toBeGreaterThan(3000);
  });
});

describe('writeFixedLayoutEpub', () => {
  test('writes a Kindle-safe reflowable EPUB (no fixed-layout / pre-paginated)', async () => {
    const dir = tmpDir();
    const img = path.join(dir, 'page.png');
    writeTinyPng(img);
    const out = path.join(dir, 'book.epub');

    await writeFixedLayoutEpub({
      images: [{ path: img, title: 'Ch 1' }],
      outputPath: out,
      metadata: { title: 'Test Manga', creator: 'Manga Crawler' },
    });

    expect(fs.existsSync(out)).toBe(true);
    expect(fs.statSync(out).size).toBeGreaterThan(100);

    const extractDir = path.join(dir, 'extracted');
    await extractZip(out, { dir: extractDir });
    expect(fs.readFileSync(path.join(extractDir, 'mimetype'), 'utf8')).toBe('application/epub+zip');
    expect(fs.existsSync(path.join(extractDir, 'META-INF', 'container.xml'))).toBe(true);
    expect(fs.existsSync(path.join(extractDir, 'OEBPS', 'content.opf'))).toBe(true);
    const opf = fs.readFileSync(path.join(extractDir, 'OEBPS', 'content.opf'), 'utf8');
    expect(opf).toContain('Test Manga');
    // Send to Kindle rejects fixed-layout EPUBs with E999 — must stay reflowable.
    expect(opf).not.toContain('pre-paginated');
    expect(opf).not.toContain('rendition:layout');
    expect(opf).toContain('<dc:language>en</dc:language>');
    expect(opf).toContain('<guide>');
    expect(opf).toContain('<reference type="text" title="Start" href="pages/page_0001.xhtml"/>');
    expect(opf).toContain('<reference type="cover" title="Cover" href="pages/page_0001.xhtml"/>');
    expect(opf).toContain('properties="cover-image"');
    const nav = fs.readFileSync(path.join(extractDir, 'OEBPS', 'nav.xhtml'), 'utf8');
    expect(nav).toContain('epub:type="landmarks"');
    expect(nav).toContain('epub:type="bodymatter" href="pages/page_0001.xhtml"');
    const page = fs.readFileSync(path.join(extractDir, 'OEBPS', 'pages', 'page_0001.xhtml'), 'utf8');
    expect(page).toContain('max-width: 100%');
    expect(page).not.toContain('object-fit');
  });

  test('embeds JPEG/PNG bytes unchanged (no recompression)', async () => {
    const dir = tmpDir();
    const img = path.join(dir, 'page.png');
    writeTinyPng(img);
    const original = fs.readFileSync(img);
    const out = path.join(dir, 'passthrough.epub');

    await writeFixedLayoutEpub({
      images: [{ path: img, title: 'Ch 1' }],
      outputPath: out,
      metadata: { title: 'Passthrough', creator: 'Manga Crawler' },
    });

    const extractDir = path.join(dir, 'extracted');
    await extractZip(out, { dir: extractDir });
    const packed = fs.readFileSync(path.join(extractDir, 'OEBPS', 'images', 'img_0001.png'));
    expect(Buffer.compare(packed, original)).toBe(0);
  });

  test('converts WebP to JPEG (not PNG) for Kindle-safe packaging', async () => {
    const sharp = require('sharp');
    const dir = tmpDir();
    const webp = path.join(dir, 'page.webp');
    await sharp({
      create: { width: 32, height: 48, channels: 3, background: { r: 40, g: 40, b: 40 } },
    })
      .webp()
      .toFile(webp);
    const out = path.join(dir, 'webp.epub');

    await writeFixedLayoutEpub({
      images: [{ path: webp, title: 'Ch 1' }],
      outputPath: out,
      metadata: { title: 'WebP', creator: 'Manga Crawler' },
    });

    const extractDir = path.join(dir, 'extracted');
    await extractZip(out, { dir: extractDir });
    const imgPath = path.join(extractDir, 'OEBPS', 'images', 'img_0001.jpg');
    expect(fs.existsSync(imgPath)).toBe(true);
    expect(fs.existsSync(path.join(extractDir, 'OEBPS', 'images', 'img_0001.png'))).toBe(false);
    const opf = fs.readFileSync(path.join(extractDir, 'OEBPS', 'content.opf'), 'utf8');
    expect(opf).toContain('image/jpeg');
    const meta = await sharp(imgPath).metadata();
    expect(meta.format).toBe('jpeg');
  });

  test('TOC lists one entry per chapter, not one per page', async () => {
    const dir = tmpDir();
    const a1 = path.join(dir, 'a1.png');
    const a2 = path.join(dir, 'a2.png');
    const b1 = path.join(dir, 'b1.png');
    writeTinyPng(a1);
    writeTinyPng(a2);
    writeTinyPng(b1);
    const out = path.join(dir, 'toc.epub');

    await writeFixedLayoutEpub({
      images: [
        { path: a1, title: 'Chương 001' },
        { path: a2, title: 'Chương 001' },
        { path: b1, title: 'Chương 002' },
      ],
      outputPath: out,
      metadata: { title: 'TocTest', creator: 'Manga Crawler' },
    });

    const extractDir = path.join(dir, 'extracted');
    await extractZip(out, { dir: extractDir });
    const nav = fs.readFileSync(path.join(extractDir, 'OEBPS', 'nav.xhtml'), 'utf8');
    const chapterLinks = [...nav.matchAll(/<li><a href="pages\/[^"]+">([^<]+)<\/a><\/li>/g)].map(
      (m) => m[1]
    );
    expect(chapterLinks).toEqual(['Chương 001', 'Chương 002']);
    expect(nav).toContain('page_0001.xhtml');
    expect(nav).toContain('page_0003.xhtml');
  });
});

describe('exportChaptersToEpub sizeSplit', () => {
  test('splits into multiple EPUB parts when images exceed maxBytes', async () => {
    const root = tmpDir('manga-epub-');
    const chDir = path.join(root, 'ch1');
    fs.mkdirSync(chDir);
    // ~4KB each padded PNG; maxBytes 6KB → two parts
    writeTinyPng(path.join(chDir, '001.png'), 4000);
    writeTinyPng(path.join(chDir, '002.png'), 4000);
    const outputDir = path.join(root, 'out');
    fs.mkdirSync(outputDir);

    const files = await exportChaptersToEpub({
      mode: 'sizeSplit',
      mangaTitle: 'SplitTest',
      chapters: [{ title: 'Ch 1', folderBasename: 'ch1' }],
      absoluteMangaDir: root,
      outputDir,
      maxBytes: 6000,
      chapterFolderFormat: {},
    });

    expect(files.length).toBeGreaterThanOrEqual(2);
    for (const f of files) {
      expect(f.endsWith('.epub')).toBe(true);
      expect(fs.existsSync(f)).toBe(true);
    }
  });

  test('rejects empty chapter list with a clear error', async () => {
    await expect(
      exportChaptersToEpub({
        mode: 'sizeSplit',
        mangaTitle: 'Empty',
        chapters: [],
        absoluteMangaDir: tmpDir(),
        outputDir: tmpDir(),
        maxBytes: 10 * 1024 * 1024,
        chapterFolderFormat: {},
      })
    ).rejects.toThrow(/ảnh|chương|chapter/i);
  });
});
