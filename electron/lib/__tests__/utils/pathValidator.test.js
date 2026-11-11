const fs = require('fs');
const path = require('path');
const os = require('os');
const { validateDirectory } = require('../../utils/pathValidator');

describe('pathValidator - validateDirectory', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'path-validator-test-'));
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
  });

  it('should return error for empty or whitespace-only paths', () => {
    expect(validateDirectory('')).toEqual(
      expect.objectContaining({
        ok: false,
        reason: 'empty',
      })
    );
    expect(validateDirectory('   ')).toEqual(
      expect.objectContaining({
        ok: false,
        reason: 'empty',
      })
    );
    expect(validateDirectory(null)).toEqual(
      expect.objectContaining({
        ok: false,
        reason: 'empty',
      })
    );
  });

  it('should return ok: true for existing writable directory', () => {
    const res = validateDirectory(tempDir);
    expect(res.ok).toBe(true);
    expect(res.exists).toBe(true);
    expect(res.writable).toBe(true);
    expect(res.canCreate).toBe(true);
  });

  it('should return ok: false if path exists but is a file instead of a directory', () => {
    const filePath = path.join(tempDir, 'a-file.txt');
    fs.writeFileSync(filePath, 'hello');
    const res = validateDirectory(filePath);
    expect(res.ok).toBe(false);
    expect(res.exists).toBe(true);
    expect(res.reason).toBe('not_directory');
  });

  it('should return canCreate: true if directory does not exist but parent is writable', () => {
    const subDir = path.join(tempDir, 'new_manga_folder', 'sub');
    const res = validateDirectory(subDir);
    expect(res.ok).toBe(true);
    expect(res.exists).toBe(false);
    expect(res.canCreate).toBe(true);
  });

  it('should detect unmounted macOS volume path', () => {
    const fakeVolume = '/Volumes/NonExistentDisk_12345/Manga';
    const res = validateDirectory(fakeVolume);
    expect(res.ok).toBe(false);
    expect(res.exists).toBe(false);
    expect(res.canCreate).toBe(false);
    expect(res.reason).toBe('unmounted');
    expect(res.error).toContain('chưa được kết nối');
  });

  it('should detect when nearest existing parent is not writable', () => {
    if (process.platform === 'win32') return; // chmod behavior differs on Windows
    const readOnlyDir = path.join(tempDir, 'ro');
    fs.mkdirSync(readOnlyDir);
    fs.chmodSync(readOnlyDir, 0o555); // read and execute only

    const targetSub = path.join(readOnlyDir, 'cannot_create');
    const res = validateDirectory(targetSub);
    expect(res.ok).toBe(false);
    expect(res.canCreate).toBe(false);
    expect(res.reason).toBe('no_write_permission');

    // restore permissions for cleanup
    fs.chmodSync(readOnlyDir, 0o777);
  });
});

