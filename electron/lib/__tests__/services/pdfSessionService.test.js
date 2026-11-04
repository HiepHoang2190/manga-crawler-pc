const fs = require('fs');
const os = require('os');
const path = require('path');
const PDFDocument = require('pdfkit');

const {
  openSession,
  getSession,
  listChapterFiles,
  readEntryBytes,
  closeSession,
  closeAllSessions,
  isSessionUri,
  sessionIdFromUri,
  sessionUri,
  materializeChapter,
  PDF_PAGES_FOLDER,
} = require('../../reader/pdfSessionService');

/**
 * pdfjs-dist v5 is ESM-only. The session service loads it via dynamic
 * `import()`, which Jest's CJS transformer rejects without
 * `--experimental-vm-modules`. The render/index/cache tests need a real pdfjs,
 * so we skip them by default and only run them when the flag is set:
 *
 *   NODE_OPTIONS=--experimental-vm-modules npm test
 *
 * The URI-helper block below runs unconditionally — those don't touch pdfjs.
 */
const VM_MODULES_ENABLED =
  String(process.env.NODE_OPTIONS || '').includes('--experimental-vm-modules') ||
  (Array.isArray(process.execArgv) &&
    process.execArgv.some((a) => String(a).includes('experimental-vm-modules')));
const describeWithPdfjs = VM_MODULES_ENABLED ? describe : describe.skip;

/** Build a simple PDF with `pageCount` pages. Each page has a number drawn on it. */
function buildPdf(pdfPath, pageCount) {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(pdfPath);
    const doc = new PDFDocument({ size: [400, 600], margin: 0 });
    out.on('finish', resolve);
    out.on('error', reject);
    doc.pipe(out);
    for (let i = 1; i <= pageCount; i++) {
      if (i > 1) doc.addPage();
      doc.fontSize(72).text(`Page ${i}`, 50, 240);
    }
    doc.end();
  });
}

/** PNG starts with the 8-byte signature `89 50 4E 47 0D 0A 1A 0A`. */
function isPng(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) return false;
  return (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  );
}

describe('pdfSessionService', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-session-test-'));
  });

  afterEach(() => {
    closeAllSessions();
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      /* */
    }
  });

  describe('URI helpers', () => {
    test('isSessionUri matches the pdf-session prefix only', () => {
      expect(isSessionUri('pdf-session://abc')).toBe(true);
      expect(isSessionUri('  pdf-session://abc  ')).toBe(true);
      expect(isSessionUri('cbz-session://abc')).toBe(false);
      expect(isSessionUri('/tmp/something')).toBe(false);
      expect(isSessionUri('')).toBe(false);
    });

    test('sessionIdFromUri / sessionUri round-trip', () => {
      const uri = sessionUri('feedf00d');
      expect(uri).toBe('pdf-session://feedf00d');
      expect(sessionIdFromUri(uri)).toBe('feedf00d');
      expect(sessionIdFromUri('not-a-session')).toBe('');
    });
  });

  describeWithPdfjs('openSession', () => {
    test('indexes a multi-page PDF and exposes one synthetic chapter', async () => {
      const pdf = path.join(tmpRoot, 'multi.pdf');
      await buildPdf(pdf, 5);

      const result = await openSession(pdf);
      if (!result.ok) console.error('openSession error:', result.error);
      expect(result.ok).toBe(true);
      expect(isSessionUri(result.manga.offlineMangaDirAbsolute)).toBe(true);
      expect(result.chapters).toHaveLength(1);
      expect(result.chapters[0].folderBasename).toBe(PDF_PAGES_FOLDER);

      const list = listChapterFiles(result.sessionId, PDF_PAGES_FOLDER);
      expect(list.ok).toBe(true);
      expect(list.files).toEqual([
        '001.png',
        '002.png',
        '003.png',
        '004.png',
        '005.png',
      ]);
    });

    test('missing file returns ok:false', async () => {
      const result = await openSession(path.join(tmpRoot, 'nope.pdf'));
      expect(result.ok).toBe(false);
    });
  });

  describeWithPdfjs('readEntryBytes', () => {
    test('renders the requested page to a real PNG buffer', async () => {
      const pdf = path.join(tmpRoot, 'render.pdf');
      await buildPdf(pdf, 3);
      const session = await openSession(pdf, { scale: 1.0 });

      const res = await readEntryBytes(session.sessionId, PDF_PAGES_FOLDER, '002.png');
      expect(res.ok).toBe(true);
      expect(res.mime).toBe('image/png');
      expect(isPng(res.buffer)).toBe(true);
      // Pdfkit pages at scale 1.0 are 400×600 → encoded PNG is well over a few KB.
      expect(res.buffer.length).toBeGreaterThan(1000);
    }, 20000);

    test('cache makes the second read return identical bytes', async () => {
      const pdf = path.join(tmpRoot, 'cache.pdf');
      await buildPdf(pdf, 2);
      const session = await openSession(pdf, { scale: 1.0 });

      const a = await readEntryBytes(session.sessionId, PDF_PAGES_FOLDER, '001.png');
      const b = await readEntryBytes(session.sessionId, PDF_PAGES_FOLDER, '001.png');
      expect(a.ok && b.ok).toBe(true);
      expect(a.buffer.equals(b.buffer)).toBe(true);
    }, 20000);

    test('returns ok:false for out-of-range page indices', async () => {
      const pdf = path.join(tmpRoot, 'range.pdf');
      await buildPdf(pdf, 2);
      const session = await openSession(pdf, { scale: 1.0 });

      const tooHigh = await readEntryBytes(session.sessionId, PDF_PAGES_FOLDER, '009.png');
      expect(tooHigh.ok).toBe(false);

      const malformed = await readEntryBytes(session.sessionId, PDF_PAGES_FOLDER, 'cover.png');
      expect(malformed.ok).toBe(false);
    }, 20000);

    test('returns ok:false after the session is closed', async () => {
      const pdf = path.join(tmpRoot, 'closed.pdf');
      await buildPdf(pdf, 1);
      const session = await openSession(pdf, { scale: 1.0 });
      closeSession(session.sessionId);
      expect(getSession(session.sessionId)).toBeNull();

      const res = await readEntryBytes(session.sessionId, PDF_PAGES_FOLDER, '001.png');
      expect(res.ok).toBe(false);
    }, 20000);
  });

  describeWithPdfjs('render queue priority', () => {
    test('LIFO: when multiple pages are requested in parallel, the newest finishes first', async () => {
      const pdf = path.join(tmpRoot, 'lifo.pdf');
      await buildPdf(pdf, 6);
      const session = await openSession(pdf, { scale: 1.0 });

      // Fire 5 requests back-to-back — they queue while the first one is
      // mid-render. Track completion order.
      const completionOrder = [];
      const promises = [];
      const fname = (i) => `${String(i).padStart(3, '0')}.png`;
      for (let i = 1; i <= 5; i++) {
        const p = readEntryBytes(session.sessionId, PDF_PAGES_FOLDER, fname(i))
          .then((res) => {
            completionOrder.push(i);
            return res;
          });
        promises.push(p);
      }
      await Promise.all(promises);

      // Page 1 starts first (queue was empty), but the rest pop LIFO from the
      // queue: 5, 4, 3, 2. So completion order should be [1, 5, 4, 3, 2].
      expect(completionOrder[0]).toBe(1);
      expect(completionOrder.slice(1)).toEqual([5, 4, 3, 2]);
    }, 30000);
  });

  describeWithPdfjs('materializeChapter', () => {
    test('writes every page as a PNG file in the requested directory', async () => {
      const pdf = path.join(tmpRoot, 'materialize.pdf');
      await buildPdf(pdf, 3);
      const session = await openSession(pdf, { scale: 1.0 });

      const destDir = path.join(tmpRoot, 'out');
      const res = await materializeChapter(session.sessionId, PDF_PAGES_FOLDER, destDir);
      expect(res.ok).toBe(true);
      expect(res.files).toEqual(['001.png', '002.png', '003.png']);

      for (const fname of res.files) {
        const buf = fs.readFileSync(path.join(destDir, fname));
        expect(isPng(buf)).toBe(true);
      }
    }, 30000);
  });
});
