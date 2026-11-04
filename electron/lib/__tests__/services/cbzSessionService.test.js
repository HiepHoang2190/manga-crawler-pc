const fs = require('fs');
const os = require('os');
const path = require('path');
const archiver = require('archiver');

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
} = require('../../reader/cbzSessionService');

// Tiny 1x1 PNG payload — small but a real decodable image so size > 0 sanity
// checks pass and downstream tools that probe the header don't reject it.
const PNG_1x1 = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489000000' +
    '0d49444154789c63f8cfc0f01f0001050102b39b8b3a0000000049454e44ae426082',
  'hex',
);

/**
 * @param {string} cbzPath
 * @param {Array<{ name: string, body?: Buffer }>} entries
 */
function writeCbz(cbzPath, entries) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(cbzPath);
    const archive = archiver('zip', { zlib: { level: 0 } });
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    for (const e of entries) {
      archive.append(e.body || PNG_1x1, { name: e.name });
    }
    archive.finalize();
  });
}

describe('cbzSessionService', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cbz-session-test-'));
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
    test('isSessionUri matches the session prefix only', () => {
      expect(isSessionUri('cbz-session://abc')).toBe(true);
      expect(isSessionUri('  cbz-session://abc  ')).toBe(true);
      expect(isSessionUri('/tmp/something')).toBe(false);
      expect(isSessionUri('')).toBe(false);
      expect(isSessionUri(null)).toBe(false);
    });

    test('sessionIdFromUri / sessionUri round-trip', () => {
      const uri = sessionUri('deadbeef');
      expect(uri).toBe('cbz-session://deadbeef');
      expect(sessionIdFromUri(uri)).toBe('deadbeef');
      expect(sessionIdFromUri('not-a-session')).toBe('');
    });
  });

  describe('openSession — flat archive (images at root)', () => {
    test('produces a single synthetic chapter and exposes session URI', async () => {
      const cbz = path.join(tmpRoot, 'flat.cbz');
      await writeCbz(cbz, [
        { name: '01.png' },
        { name: '02.png' },
        { name: '10.png' },
      ]);

      const result = await openSession(cbz);
      expect(result.ok).toBe(true);
      expect(isSessionUri(result.manga.offlineMangaDirAbsolute)).toBe(true);
      expect(result.chapters).toHaveLength(1);
      // Natural sort: 01, 02, 10 (not 01, 10, 02).
      const list = listChapterFiles(result.sessionId, result.chapters[0].folderBasename);
      expect(list.ok).toBe(true);
      expect(list.files).toEqual(['01.png', '02.png', '10.png']);
    });
  });

  describe('openSession — chapter folders at root', () => {
    test('one chapter per top-level directory, sorted naturally', async () => {
      const cbz = path.join(tmpRoot, 'multi.cbz');
      await writeCbz(cbz, [
        { name: 'Chapter 2/a.jpg' },
        { name: 'Chapter 2/b.jpg' },
        { name: 'Chapter 10/a.jpg' },
        { name: 'Chapter 1/a.jpg' },
      ]);

      const result = await openSession(cbz);
      expect(result.ok).toBe(true);
      const titles = result.chapters.map((c) => c.title);
      expect(titles).toEqual(['Chapter 1', 'Chapter 2', 'Chapter 10']);
    });
  });

  describe('openSession — wrapped root', () => {
    test('strips the outer wrapper directory', async () => {
      const cbz = path.join(tmpRoot, 'wrapped.cbz');
      await writeCbz(cbz, [
        { name: 'SPRITE/Chapter 1/a.png' },
        { name: 'SPRITE/Chapter 1/b.png' },
        { name: 'SPRITE/Chapter 2/a.png' },
      ]);

      const result = await openSession(cbz);
      expect(result.ok).toBe(true);
      const titles = result.chapters.map((c) => c.title).sort();
      expect(titles).toEqual(['Chapter 1', 'Chapter 2']);
    });
  });

  describe('junk entries', () => {
    test('macOS metadata and .DS_Store are ignored', async () => {
      const cbz = path.join(tmpRoot, 'junk.cbz');
      await writeCbz(cbz, [
        { name: 'Chapter 1/a.png' },
        { name: '__MACOSX/Chapter 1/._a.png' },
        { name: 'Chapter 1/.DS_Store', body: Buffer.from('x') },
        { name: 'Chapter 1/._b.png' },
      ]);

      const result = await openSession(cbz);
      expect(result.ok).toBe(true);
      const list = listChapterFiles(result.sessionId, result.chapters[0].folderBasename);
      expect(list.files).toEqual(['a.png']);
    });
  });

  describe('readEntryBytes', () => {
    test('decompresses the requested entry into a non-empty buffer', async () => {
      const cbz = path.join(tmpRoot, 'read.cbz');
      const customBody = Buffer.concat([PNG_1x1, Buffer.from('tag')]);
      await writeCbz(cbz, [
        { name: 'Chapter 1/a.png' },
        { name: 'Chapter 1/b.png', body: customBody },
      ]);

      const session = await openSession(cbz);
      const fb = session.chapters[0].folderBasename;
      const res = await readEntryBytes(session.sessionId, fb, 'b.png');
      expect(res.ok).toBe(true);
      expect(res.buffer.equals(customBody)).toBe(true);
      expect(res.mime).toBe('image/png');
    });

    test('returns an error for unknown entries', async () => {
      const cbz = path.join(tmpRoot, 'missing.cbz');
      await writeCbz(cbz, [{ name: '01.png' }]);
      const session = await openSession(cbz);
      const res = await readEntryBytes(session.sessionId, session.chapters[0].folderBasename, 'nope.png');
      expect(res.ok).toBe(false);
    });

    test('returns an error after the session is closed', async () => {
      const cbz = path.join(tmpRoot, 'closed.cbz');
      await writeCbz(cbz, [{ name: '01.png' }]);
      const session = await openSession(cbz);
      closeSession(session.sessionId);
      expect(getSession(session.sessionId)).toBeNull();
      const res = await readEntryBytes(session.sessionId, session.chapters[0].folderBasename, '01.png');
      expect(res.ok).toBe(false);
    });
  });

  describe('materializeChapter', () => {
    test('writes every page of one chapter to disk in order', async () => {
      const cbz = path.join(tmpRoot, 'export.cbz');
      await writeCbz(cbz, [
        { name: 'Chapter 1/01.png' },
        { name: 'Chapter 1/02.png' },
        { name: 'Chapter 2/01.png' },
      ]);
      const session = await openSession(cbz);
      const destDir = path.join(tmpRoot, 'out', 'Chapter 1');
      const res = await materializeChapter(session.sessionId, 'Chapter 1', destDir);
      expect(res.ok).toBe(true);
      expect(res.files).toEqual(['01.png', '02.png']);
      expect(fs.readdirSync(destDir).sort()).toEqual(['01.png', '02.png']);
      // File contents should be non-empty.
      const stat = fs.statSync(path.join(destDir, '01.png'));
      expect(stat.size).toBeGreaterThan(0);
    });
  });

  describe('openSession failure modes', () => {
    test('non-existent file returns ok:false', async () => {
      const result = await openSession(path.join(tmpRoot, 'nope.cbz'));
      expect(result.ok).toBe(false);
    });

    test('archive with no image entries returns ok:false', async () => {
      const cbz = path.join(tmpRoot, 'no-images.cbz');
      await writeCbz(cbz, [{ name: 'readme.txt', body: Buffer.from('hi') }]);
      const result = await openSession(cbz);
      expect(result.ok).toBe(false);
    });
  });
});
