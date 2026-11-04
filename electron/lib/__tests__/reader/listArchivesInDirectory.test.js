const fs = require('fs');
const path = require('path');
const os = require('os');
const archiver = require('archiver');
const {
  listArchivesInDirectory,
  isZipComicArchive,
} = require('../../reader/listArchivesInDirectory');

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

function writeZip(zipPath, entries) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
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

describe('listArchivesInDirectory & isZipComicArchive (Smart Verification)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-verify-test-'));
  });

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('isZipComicArchive', () => {
    it('returns true when zip contains image files', async () => {
      const zipPath = path.join(tmpDir, 'comic.zip');
      await writeZip(zipPath, [
        { name: 'cover.jpg' },
        { name: 'chapter1/page01.png' },
      ]);

      const result = await isZipComicArchive(zipPath);
      expect(result).toBe(true);
    });

    it('returns false when zip contains only binaries, text or non-image files', async () => {
      const zipPath = path.join(tmpDir, 'software.zip');
      await writeZip(zipPath, [
        { name: 'jitterbugpair', body: Buffer.from('binary-content') },
        { name: 'README.md', body: Buffer.from('# Documentation') },
        { name: 'config.json', body: Buffer.from('{"key":"value"}') },
      ]);

      const result = await isZipComicArchive(zipPath);
      expect(result).toBe(false);
    });

    it('returns false when zip contains only macOS junk metadata files', async () => {
      const zipPath = path.join(tmpDir, 'mac-junk.zip');
      await writeZip(zipPath, [
        { name: '__MACOSX/._01.jpg', body: Buffer.from('resource-fork') },
        { name: '.DS_Store', body: Buffer.from('ds-store') },
      ]);

      const result = await isZipComicArchive(zipPath);
      expect(result).toBe(false);
    });

    it('returns false for nonexistent or invalid zip path', async () => {
      const result = await isZipComicArchive(path.join(tmpDir, 'nonexistent.zip'));
      expect(result).toBe(false);
    });
  });

  describe('listArchivesInDirectory', () => {
    it('returns comic cbz and comic zip, but filters out non-comic zip files', async () => {
      // 1. Valid CBZ
      const cbzPath = path.join(tmpDir, 'OnePiece_Vol1.cbz');
      await writeZip(cbzPath, [{ name: '01.jpg' }]);

      // 2. Comic ZIP (has images)
      const comicZipPath = path.join(tmpDir, 'Naruto_Ch1.zip');
      await writeZip(comicZipPath, [{ name: '01.png' }, { name: '02.png' }]);

      // 3. Binary ZIP (like SideStore)
      const binaryZipPath = path.join(tmpDir, 'SideStoreTool.zip');
      await writeZip(binaryZipPath, [
        { name: 'jitterbugpair', body: Buffer.from('binary') },
      ]);

      // 4. Mac junk ZIP
      const junkZipPath = path.join(tmpDir, 'CorruptJunk.zip');
      await writeZip(junkZipPath, [
        { name: '__MACOSX/._fake.png', body: Buffer.from('junk') },
      ]);

      const res = await listArchivesInDirectory(tmpDir);
      expect(res.ok).toBe(true);
      expect(res.files).toBeDefined();

      const names = res.files.map((f) => f.name);
      expect(names).toContain('OnePiece_Vol1.cbz');
      expect(names).toContain('Naruto_Ch1.zip');
      expect(names).not.toContain('SideStoreTool.zip');
      expect(names).not.toContain('CorruptJunk.zip');
    });

    it('returns empty files array for a directory with only non-comic zips', async () => {
      const binaryZipPath = path.join(tmpDir, 'installer.zip');
      await writeZip(binaryZipPath, [{ name: 'setup.exe', body: Buffer.from('exe') }]);

      const res = await listArchivesInDirectory(tmpDir);
      expect(res.ok).toBe(true);
      expect(res.files).toHaveLength(0);
    });

    it('returns error when directory does not exist', async () => {
      const res = await listArchivesInDirectory(path.join(tmpDir, 'does-not-exist'));
      expect(res.ok).toBe(false);
      expect(res.files).toHaveLength(0);
    });
  });
});
