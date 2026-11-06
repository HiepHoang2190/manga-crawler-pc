'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const childProcess = require('child_process');
const {
  loadMobiFromFilePath,
  resolveKindleUnpackExe,
  resolveKindleUnpackPy,
} = require('../../reader/loaders/loadMobiForOfflineRead');

describe('loadMobiForOfflineRead', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mobi-loader-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  test('resolveKindleUnpackExe resolves kindleunpack.exe path', () => {
    const exe = resolveKindleUnpackExe();
    expect(typeof exe).toBe('string');
    expect(exe.endsWith('kindleunpack.exe') || exe.endsWith('kindleunpack_mc.exe')).toBe(true);
    expect(exe).not.toContain('app.asar/');
  });

  test('resolveKindleUnpackPy resolves script path and package dir', () => {
    const { scriptPath, pkgDir } = resolveKindleUnpackPy();
    expect(typeof scriptPath).toBe('string');
    expect(scriptPath.endsWith('.py')).toBe(true);
    expect(typeof pkgDir).toBe('string');
    expect(pkgDir).toContain('kindleunpack');
  });

  test('loadMobiFromFilePath returns error when file does not exist', async () => {
    const nonExistent = path.join(tempDir, 'missing.mobi');
    const result = await loadMobiFromFilePath(nonExistent, { tempRoot: tempDir });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('File not found');
  });

  test('loadMobiFromFilePath on win32 invokes execFile directly without cmd.exe', async () => {
    // Create a dummy file with Vietnamese unicode name and parentheses
    const unicodeDir = path.join(tempDir, 'Danh Nhân Thế Giới (MOBI)');
    fs.mkdirSync(unicodeDir, { recursive: true });
    const dummyMobi = path.join(unicodeDir, 'DNTG - Albert Schweitzer - Suto.mobi');
    fs.writeFileSync(dummyMobi, 'dummy-mobi-binary-header');

    const originalPlatform = process.platform;
    const execFileSpy = jest.spyOn(childProcess, 'execFile').mockImplementation((file, args, options, callback) => {
      // Create a mock epub file in outDir so findEpubInDir succeeds
      const outDir = args[args.length - 1];
      const mobi8Dir = path.join(outDir, 'mobi8');
      fs.mkdirSync(mobi8Dir, { recursive: true });
      fs.writeFileSync(path.join(mobi8Dir, 'book.epub'), 'PK dummy epub');

      if (typeof callback === 'function') {
        callback(null, 'OK', '');
      }
    });

    try {
      Object.defineProperty(process, 'platform', { value: 'win32' });

      const result = await loadMobiFromFilePath(dummyMobi, { tempRoot: tempDir });

      // Must call execFile directly (CreateProcessW), NOT cmd.exe
      expect(execFileSpy).toHaveBeenCalled();
      const [calledExe, calledArgs, calledOpts] = execFileSpy.mock.calls[0];

      expect(calledExe).toMatch(/kindleunpack.*\.exe$/);
      expect(calledArgs).toContain('-i');
      expect(calledArgs).toContain('--epub_version=3');
      expect(calledArgs).toContain(dummyMobi);
      expect(calledOpts.windowsHide).toBe(true);

      // Successfully processed mobi
      expect(result.ok).toBe(true);
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
      execFileSpy.mockRestore();
    }
  });

  test('loadMobiFromFilePath returns clear error when unpack fails', async () => {
    const dummyMobi = path.join(tempDir, 'corrupted.mobi');
    fs.writeFileSync(dummyMobi, 'corrupt-content');

    const originalPlatform = process.platform;
    const execFileSpy = jest.spyOn(childProcess, 'execFile').mockImplementation((file, args, options, callback) => {
      const err = new Error('Corrupted Kindle structure');
      err.stderr = 'Error: Invalid PalmDB header';
      if (typeof callback === 'function') {
        callback(err, '', err.stderr);
      }
    });

    try {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      const result = await loadMobiFromFilePath(dummyMobi, { tempRoot: tempDir });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Không unpack được');
      expect(result.error).toContain('Invalid PalmDB header');
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
      execFileSpy.mockRestore();
    }
  });
});
