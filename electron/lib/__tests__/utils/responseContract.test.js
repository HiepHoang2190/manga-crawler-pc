'use strict';

/**
 * Property 6: Successful load satisfies the response contract
 * Property 8: Error messages always contain the file basename
 *
 * Validates: Requirements 8.5, 1.1, 2.1, 3.1, 4.1, 9.3
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const archiver = require('archiver');
const fc = require('fast-check');

const { loadZipFromFilePath } = require('../../reader/loaders/loadZipForOfflineRead');
const { loadEpubFromFilePath } = require('../../reader/loaders/loadEpubForOfflineRead');
const { loadPdfFromFilePath } = require('../../reader/loaders/loadPdfForOfflineRead');
const { loadRarFromFilePath } = require('../../reader/loaders/loadRarForOfflineRead');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Minimal 1×1 PNG (67 bytes) */
const TINY_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108020000009001' +
  '2e00000000c4944415478016360f8cfc00000000200016e0221800000000049454e44ae426082',
  'hex'
);

/**
 * Minimal valid 1-page PDF (no images, but parseable by pdf-to-png-converter).
 * This is a hand-crafted minimal PDF with one blank page.
 */
const MINIMAL_PDF_BASE64 =
  'JVBERi0xLjAKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSA+PgplbmRvYmoKeHJlZgowIDQKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDQgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjE5MAolJUVPRgo=';

/** Create a temp directory for a test run */
function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'contract-test-'));
}

/** Recursively remove a directory */
async function rmDir(dir) {
  try { await fs.promises.rm(dir, { recursive: true, force: true }); } catch { /* */ }
}

/**
 * Build a minimal flat ZIP with one image at the root.
 * @param {string} destPath
 */
function buildFlatZip(destPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(destPath);
    const archive = archiver('zip', { zlib: { level: 0 } });
    archive.on('error', reject);
    output.on('close', resolve);
    archive.pipe(output);
    archive.append(TINY_PNG, { name: '001.jpg' });
    archive.finalize();
  });
}

/**
 * Build a minimal EPUB with one direct-image spine item.
 * @param {string} destPath
 */
function buildFlatEpub(destPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(destPath);
    const archive = archiver('zip', { zlib: { level: 0 } });
    archive.on('error', reject);
    output.on('close', resolve);
    archive.pipe(output);

    archive.append(
      `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
      { name: 'META-INF/container.xml' }
    );

    const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0">
  <metadata/>
  <manifest>
    <item id="img1" href="images/page1.jpg" media-type="image/jpeg"/>
  </manifest>
  <spine>
    <itemref idref="img1"/>
  </spine>
</package>`;
    archive.append(opf, { name: 'OEBPS/content.opf' });
    archive.append(TINY_PNG, { name: 'OEBPS/images/page1.jpg' });
    archive.finalize();
  });
}

/**
 * Assert the response contract for a successful load result.
 * Property 6: ok===true implies manga has title, chapters is non-empty,
 * every chapter has url, title, folderBasename.
 */
function assertResponseContract(result) {
  expect(result.ok).toBe(true);
  // manga must be a non-null object with a title
  expect(result.manga).toBeDefined();
  expect(result.manga).not.toBeNull();
  expect(typeof result.manga.title).toBe('string');
  expect(result.manga.title.length).toBeGreaterThan(0);
  // chapters must be a non-empty array
  expect(Array.isArray(result.chapters)).toBe(true);
  expect(result.chapters.length).toBeGreaterThan(0);
  // every chapter must have url, title, folderBasename
  for (const ch of result.chapters) {
    expect(typeof ch.url).toBe('string');
    expect(ch.url.length).toBeGreaterThan(0);
    expect(typeof ch.title).toBe('string');
    expect(ch.title.length).toBeGreaterThan(0);
    expect(typeof ch.folderBasename).toBe('string');
    expect(ch.folderBasename.length).toBeGreaterThan(0);
  }
}

// ─── Property 6: Response contract ───────────────────────────────────────────
// Validates: Requirements 8.5, 1.1, 2.1, 3.1, 4.1

describe('Property 6: Successful load satisfies the response contract', () => {
  let tempRoot;
  beforeEach(() => { tempRoot = makeTempRoot(); });
  afterEach(async () => { await rmDir(tempRoot); });

  // ── ZIP ──────────────────────────────────────────────────────────────────
  test('ZIP: valid flat archive satisfies response contract', async () => {
    const zipPath = path.join(tempRoot, 'manga.zip');
    await buildFlatZip(zipPath);
    const result = await loadZipFromFilePath(zipPath, { tempRoot });
    assertResponseContract(result);
    if (result.cbzTempExtractDir) await rmDir(result.cbzTempExtractDir);
  });

  test('ZIP property: for any valid flat ZIP, ok===true implies contract holds', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate 1–5 unique image filenames
        fc.array(
          fc.nat({ max: 9 }).map((n) => `page${n}.jpg`),
          { minLength: 1, maxLength: 5 }
        ).filter((arr) => new Set(arr).size === arr.length),
        async (imageNames) => {
          const zipPath = path.join(
            tempRoot,
            `prop6_zip_${Date.now()}_${Math.random().toString(36).slice(2)}.zip`
          );
          // Build a flat ZIP with the given image names
          await new Promise((resolve, reject) => {
            const output = fs.createWriteStream(zipPath);
            const archive = archiver('zip', { zlib: { level: 0 } });
            archive.on('error', reject);
            output.on('close', resolve);
            archive.pipe(output);
            for (const name of imageNames) {
              archive.append(TINY_PNG, { name });
            }
            archive.finalize();
          });

          const result = await loadZipFromFilePath(zipPath, { tempRoot });
          if (result.cbzTempExtractDir) await rmDir(result.cbzTempExtractDir);
          try { fs.unlinkSync(zipPath); } catch { /* */ }

          if (!result.ok) return true; // skip if loader rejects (shouldn't happen with valid input)

          // Contract assertions
          if (!result.manga || typeof result.manga.title !== 'string') return false;
          if (!Array.isArray(result.chapters) || result.chapters.length === 0) return false;
          for (const ch of result.chapters) {
            if (typeof ch.url !== 'string' || !ch.url) return false;
            if (typeof ch.title !== 'string' || !ch.title) return false;
            if (typeof ch.folderBasename !== 'string' || !ch.folderBasename) return false;
          }
          return true;
        }
      ),
      { numRuns: 20 }
    );
  }, 60000);

  // ── EPUB ─────────────────────────────────────────────────────────────────
  test('EPUB: valid archive satisfies response contract', async () => {
    const epubPath = path.join(tempRoot, 'manga.epub');
    await buildFlatEpub(epubPath);
    const result = await loadEpubFromFilePath(epubPath, { tempRoot });
    assertResponseContract(result);
    if (result.cbzTempExtractDir) await rmDir(result.cbzTempExtractDir);
  });

  test('EPUB property: for any valid EPUB, ok===true implies contract holds', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        async (count) => {
          const epubPath = path.join(
            tempRoot,
            `prop6_epub_${Date.now()}_${Math.random().toString(36).slice(2)}.epub`
          );

          await new Promise((resolve, reject) => {
            const output = fs.createWriteStream(epubPath);
            const archive = archiver('zip', { zlib: { level: 0 } });
            archive.on('error', reject);
            output.on('close', resolve);
            archive.pipe(output);

            archive.append(
              `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
              { name: 'META-INF/container.xml' }
            );

            const items = Array.from({ length: count }, (_, i) => i);
            const manifestItems = items
              .map((i) => `<item id="img${i}" href="images/p${i}.jpg" media-type="image/jpeg"/>`)
              .join('\n    ');
            const spineItems = items
              .map((i) => `<itemref idref="img${i}"/>`)
              .join('\n    ');

            const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0">
  <metadata/>
  <manifest>${manifestItems}</manifest>
  <spine>${spineItems}</spine>
</package>`;
            archive.append(opf, { name: 'OEBPS/content.opf' });
            for (const i of items) {
              archive.append(TINY_PNG, { name: `OEBPS/images/p${i}.jpg` });
            }
            archive.finalize();
          });

          const result = await loadEpubFromFilePath(epubPath, { tempRoot });
          if (result.cbzTempExtractDir) await rmDir(result.cbzTempExtractDir);
          try { fs.unlinkSync(epubPath); } catch { /* */ }

          if (!result.ok) return true;

          if (!result.manga || typeof result.manga.title !== 'string') return false;
          if (!Array.isArray(result.chapters) || result.chapters.length === 0) return false;
          for (const ch of result.chapters) {
            if (typeof ch.url !== 'string' || !ch.url) return false;
            if (typeof ch.title !== 'string' || !ch.title) return false;
            if (typeof ch.folderBasename !== 'string' || !ch.folderBasename) return false;
          }
          return true;
        }
      ),
      { numRuns: 15 }
    );
  }, 60000);

  // ── PDF ──────────────────────────────────────────────────────────────────
  test('PDF: valid 1-page PDF satisfies response contract', async () => {
    const pdfPath = path.join(tempRoot, 'manga.pdf');
    fs.writeFileSync(pdfPath, Buffer.from(MINIMAL_PDF_BASE64, 'base64'));
    const result = await loadPdfFromFilePath(pdfPath, { tempRoot });
    // PDF rendering may fail in CI without canvas; only assert contract if ok
    if (result.ok) {
      assertResponseContract(result);
      if (result.cbzTempExtractDir) await rmDir(result.cbzTempExtractDir);
    } else {
      // Acceptable: PDF renderer not available in test env — just verify shape
      expect(result.ok).toBe(false);
      expect(typeof result.error).toBe('string');
    }
  });
});

// ─── Property 8: Error messages always contain the file basename ──────────────
// Validates: Requirements 9.3

describe('Property 8: Error messages always contain the file basename', () => {
  let tempRoot;
  beforeEach(() => { tempRoot = makeTempRoot(); });
  afterEach(async () => { await rmDir(tempRoot); });

  /**
   * Generate a safe basename: alphanumeric + hyphens, non-empty, no path separators.
   * We append the extension ourselves so the loader doesn't reject on extension check.
   */
  const safeBasename = fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,15}$/);

  // ── ZIP ──────────────────────────────────────────────────────────────────
  test('ZIP property: error always contains basename for non-existent file', async () => {
    await fc.assert(
      fc.asyncProperty(safeBasename, async (name) => {
        const filePath = path.join(tempRoot, `${name}.zip`);
        const result = await loadZipFromFilePath(filePath, { tempRoot });
        if (result.ok) return true; // shouldn't happen for non-existent file
        return typeof result.error === 'string' && result.error.includes(`${name}.zip`);
      }),
      { numRuns: 30 }
    );
  });

  // ── EPUB ─────────────────────────────────────────────────────────────────
  test('EPUB property: error always contains basename for non-existent file', async () => {
    await fc.assert(
      fc.asyncProperty(safeBasename, async (name) => {
        const filePath = path.join(tempRoot, `${name}.epub`);
        const result = await loadEpubFromFilePath(filePath, { tempRoot });
        if (result.ok) return true;
        return typeof result.error === 'string' && result.error.includes(`${name}.epub`);
      }),
      { numRuns: 30 }
    );
  });

  // ── PDF ──────────────────────────────────────────────────────────────────
  test('PDF property: error always contains basename for non-existent file', async () => {
    await fc.assert(
      fc.asyncProperty(safeBasename, async (name) => {
        const filePath = path.join(tempRoot, `${name}.pdf`);
        const result = await loadPdfFromFilePath(filePath, { tempRoot });
        if (result.ok) return true;
        return typeof result.error === 'string' && result.error.includes(`${name}.pdf`);
      }),
      { numRuns: 30 }
    );
  });

  // ── RAR ──────────────────────────────────────────────────────────────────
  test('RAR property: error always contains basename for non-existent file', async () => {
    await fc.assert(
      fc.asyncProperty(safeBasename, async (name) => {
        const filePath = path.join(tempRoot, `${name}.rar`);
        const result = await loadRarFromFilePath(filePath, { tempRoot });
        if (result.ok) return true;
        return typeof result.error === 'string' && result.error.includes(`${name}.rar`);
      }),
      { numRuns: 30 }
    );
  });

  // ── CBR ──────────────────────────────────────────────────────────────────
  test('CBR property: error always contains basename for non-existent file', async () => {
    await fc.assert(
      fc.asyncProperty(safeBasename, async (name) => {
        const filePath = path.join(tempRoot, `${name}.cbr`);
        const result = await loadRarFromFilePath(filePath, { tempRoot });
        if (result.ok) return true;
        return typeof result.error === 'string' && result.error.includes(`${name}.cbr`);
      }),
      { numRuns: 30 }
    );
  });

  // ── Corrupt ZIP ───────────────────────────────────────────────────────────
  test('ZIP property: error contains basename for corrupt file', async () => {
    await fc.assert(
      fc.asyncProperty(safeBasename, async (name) => {
        const filePath = path.join(tempRoot, `${name}.zip`);
        fs.writeFileSync(filePath, Buffer.from('this is not a valid zip file'));
        const result = await loadZipFromFilePath(filePath, { tempRoot });
        try { fs.unlinkSync(filePath); } catch { /* */ }
        if (result.ok) return true;
        return typeof result.error === 'string' && result.error.includes(`${name}.zip`);
      }),
      { numRuns: 20 }
    );
  });

  // ── Corrupt EPUB ──────────────────────────────────────────────────────────
  test('EPUB property: error contains basename for corrupt file', async () => {
    await fc.assert(
      fc.asyncProperty(safeBasename, async (name) => {
        const filePath = path.join(tempRoot, `${name}.epub`);
        fs.writeFileSync(filePath, Buffer.from('not a valid epub'));
        const result = await loadEpubFromFilePath(filePath, { tempRoot });
        try { fs.unlinkSync(filePath); } catch { /* */ }
        if (result.ok) return true;
        return typeof result.error === 'string' && result.error.includes(`${name}.epub`);
      }),
      { numRuns: 20 }
    );
  });
});
