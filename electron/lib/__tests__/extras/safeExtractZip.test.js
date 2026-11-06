const fs = require('fs');
const path = require('path');
const os = require('os');
const archiver = require('archiver');
const { safeExtractZip } = require('../../extras/safeExtractZip');

function createArchive(zipPath, entriesFn) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 1 } });
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    entriesFn(archive);
    archive.finalize();
  });
}

describe('safeExtractZip', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'safe-extract-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  test('extracts normal files and directories correctly', async () => {
    const zipPath = path.join(tempDir, 'normal.zip');
    const outDir = path.join(tempDir, 'out-normal');

    await createArchive(zipPath, (archive) => {
      archive.append('hello world', { name: 'sub/test.txt' });
      archive.append('data 123', { name: 'root.txt' });
    });

    await safeExtractZip(zipPath, { dir: outDir });

    expect(fs.existsSync(path.join(outDir, 'sub', 'test.txt'))).toBe(true);
    expect(fs.readFileSync(path.join(outDir, 'sub', 'test.txt'), 'utf8')).toBe('hello world');
    expect(fs.readFileSync(path.join(outDir, 'root.txt'), 'utf8')).toBe('data 123');
  });

  test('handles symlink entry when fs.symlink works normally', async () => {
    const zipPath = path.join(tempDir, 'symlink.zip');
    const outDir = path.join(tempDir, 'out-symlink');

    await createArchive(zipPath, (archive) => {
      archive.append('target content', { name: 'target.txt' });
      archive.symlink('link.txt', 'target.txt');
    });

    await safeExtractZip(zipPath, { dir: outDir });

    const linkPath = path.join(outDir, 'link.txt');
    expect(fs.existsSync(linkPath)).toBe(true);
    expect(fs.readFileSync(linkPath, 'utf8')).toBe('target content');
  });

  test('falls back to copying file when fs.symlink throws EPERM (Windows simulation)', async () => {
    const zipPath = path.join(tempDir, 'eperm-symlink.zip');
    const outDir = path.join(tempDir, 'out-eperm');

    await createArchive(zipPath, (archive) => {
      archive.append('original binary file content', { name: 'bin/actual_file.exe' });
      archive.symlink('.bin/shortcut.exe', '../bin/actual_file.exe');
    });

    // Mock fs.symlink / fs.promises.symlink to throw EPERM (operation not permitted)
    const originalSymlink = fs.promises.symlink;
    jest.spyOn(fs.promises, 'symlink').mockImplementation(async () => {
      const err = new Error("EPERM: operation not permitted, symlink");
      err.code = 'EPERM';
      throw err;
    });

    try {
      await safeExtractZip(zipPath, { dir: outDir });

      const shortcutPath = path.join(outDir, '.bin', 'shortcut.exe');
      expect(fs.existsSync(shortcutPath)).toBe(true);
      expect(fs.readFileSync(shortcutPath, 'utf8')).toBe('original binary file content');
    } finally {
      fs.promises.symlink.mockRestore();
    }
  });

  test('does not throw when dangling symlink target does not exist and symlink fails', async () => {
    const zipPath = path.join(tempDir, 'dangling-symlink.zip');
    const outDir = path.join(tempDir, 'out-dangling');

    await createArchive(zipPath, (archive) => {
      archive.append('just some file', { name: 'readme.txt' });
      archive.symlink('broken-link', 'non_existent_file.js');
    });

    jest.spyOn(fs.promises, 'symlink').mockImplementation(async () => {
      const err = new Error("EPERM: operation not permitted, symlink");
      err.code = 'EPERM';
      throw err;
    });

    try {
      await expect(safeExtractZip(zipPath, { dir: outDir })).resolves.not.toThrow();
      expect(fs.existsSync(path.join(outDir, 'readme.txt'))).toBe(true);
    } finally {
      fs.promises.symlink.mockRestore();
    }
  });

  test('rejects path traversal (ZipSlip vulnerability)', async () => {
    const zipPath = path.join(tempDir, 'zipslip.zip');
    const outDir = path.join(tempDir, 'out-slip');

    // Tạo raw zip có chứa entry với tên '../escaped.txt'
    const fileName = '../escaped.txt';
    const fileContent = 'danger';
    const fnBuf = Buffer.from(fileName, 'utf8');
    const dataBuf = Buffer.from(fileContent, 'utf8');

    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(20, 4);
    lfh.writeUInt32LE(dataBuf.length, 18);
    lfh.writeUInt32LE(dataBuf.length, 22);
    lfh.writeUInt16LE(fnBuf.length, 26);
    const lfhRecord = Buffer.concat([lfh, fnBuf, dataBuf]);

    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0);
    cdh.writeUInt16LE(20, 4);
    cdh.writeUInt16LE(20, 6);
    cdh.writeUInt32LE(dataBuf.length, 20);
    cdh.writeUInt32LE(dataBuf.length, 24);
    cdh.writeUInt16LE(fnBuf.length, 28);
    const cdhRecord = Buffer.concat([cdh, fnBuf]);

    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(1, 8);
    eocd.writeUInt16LE(1, 10);
    eocd.writeUInt32LE(cdhRecord.length, 12);
    eocd.writeUInt32LE(lfhRecord.length, 16);

    fs.writeFileSync(zipPath, Buffer.concat([lfhRecord, cdhRecord, eocd]));

    await expect(safeExtractZip(zipPath, { dir: outDir })).rejects.toThrow(/invalid relative path|Out of bound/);
  });

  test('skips native fs.promises.symlink on win32 and copies file directly', async () => {
    const zipPath = path.join(tempDir, 'win32-symlink.zip');
    const outDir = path.join(tempDir, 'out-win32');

    await createArchive(zipPath, (archive) => {
      archive.append('win32 target content', { name: 'target.txt' });
      archive.symlink('link.txt', 'target.txt');
    });

    const originalPlatform = process.platform;
    const symlinkSpy = jest.spyOn(fs.promises, 'symlink');

    try {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      await safeExtractZip(zipPath, { dir: outDir });

      // On win32, native fs.promises.symlink must NOT be called at all
      expect(symlinkSpy).not.toHaveBeenCalled();

      // File was copied directly to link.txt
      const linkPath = path.join(outDir, 'link.txt');
      expect(fs.existsSync(linkPath)).toBe(true);
      expect(fs.readFileSync(linkPath, 'utf8')).toBe('win32 target content');
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
      symlinkSpy.mockRestore();
    }
  });

  test('sanitizes symlinks with trailing null bytes or whitespace', async () => {
    const zipPath = path.join(tempDir, 'null-symlink.zip');
    const outDir = path.join(tempDir, 'out-null');

    await createArchive(zipPath, (archive) => {
      archive.append('target text', { name: 'target.txt' });
      // Symlink target containing trailing null bytes
      archive.symlink('link.txt', 'target.txt\0\0');
    });

    const originalPlatform = process.platform;
    try {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      await safeExtractZip(zipPath, { dir: outDir });

      const linkPath = path.join(outDir, 'link.txt');
      expect(fs.existsSync(linkPath)).toBe(true);
      expect(fs.readFileSync(linkPath, 'utf8')).toBe('target text');
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    }
  });

  test('safely overwrites existing dest file when copying deferred symlink', async () => {
    const zipPath = path.join(tempDir, 'overwrite-symlink.zip');
    const outDir = path.join(tempDir, 'out-overwrite');

    await createArchive(zipPath, (archive) => {
      archive.append('new content from target', { name: 'actual.txt' });
      archive.symlink('alias.txt', 'actual.txt');
    });

    // Pre-create destination alias.txt with stale content
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'alias.txt'), 'old stale content');

    const originalPlatform = process.platform;
    try {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      await safeExtractZip(zipPath, { dir: outDir });

      const aliasPath = path.join(outDir, 'alias.txt');
      expect(fs.existsSync(aliasPath)).toBe(true);
      expect(fs.readFileSync(aliasPath, 'utf8')).toBe('new content from target');
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    }
  });

  test('handles .bin symlinks with non-existent target without throwing or warning', async () => {
    const zipPath = path.join(tempDir, 'cli-bin-symlink.zip');
    const outDir = path.join(tempDir, 'out-cli-bin');

    await createArchive(zipPath, (archive) => {
      archive.append('dummy content', { name: 'lib/index.js' });
      archive.symlink('node_modules/.bin/missing-cli', '../missing-pkg/bin/cli.js');
    });

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const originalPlatform = process.platform;

    try {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      await expect(safeExtractZip(zipPath, { dir: outDir })).resolves.not.toThrow();

      // For .bin CLI wrappers, missing target is expected and should not produce noisy warnings
      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('missing-cli'));
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
      warnSpy.mockRestore();
    }
  });
});
