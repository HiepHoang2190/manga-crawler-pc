const { BinaryManager } = require('../../upscale/BinaryManager');

describe('BinaryManager', () => {
  test('resolveBinaryPath returns correct path structure for waifu2x', () => {
    const bm = new BinaryManager('/fake/resources');
    const p = bm.resolveBinaryPath('waifu2x');
    expect(typeof p).toBe('string');
    expect(p).toContain('waifu2x-ncnn-vulkan');
    expect(p).toContain('upscale');
  });

  test('resolveBinaryPath returns correct path for realesrgan', () => {
    const bm = new BinaryManager('/fake/resources');
    const p = bm.resolveBinaryPath('realesrgan');
    expect(p).toContain('realesrgan-ncnn-vulkan');
  });

  test('resolveBinaryPath returns correct path for realcugan', () => {
    const bm = new BinaryManager('/fake/resources');
    const p = bm.resolveBinaryPath('realcugan');
    expect(p).toContain('realcugan-ncnn-vulkan');
  });

  test('resolveBinaryPath returns null for unknown engine', () => {
    const bm = new BinaryManager('/fake/resources');
    expect(bm.resolveBinaryPath('unknown')).toBeNull();
  });

  test('getPlatformDir returns valid directory name', () => {
    const bm = new BinaryManager('/fake/resources');
    const dir = bm.getPlatformDir();
    expect(typeof dir).toBe('string');
    // On macOS CI: mac-x64 or mac-arm64, on Windows: win-x64
    expect(dir).toMatch(/^(win-x64|mac-x64|mac-arm64|linux-.+)$/);
  });

  test('isBinaryAvailable returns false for non-existent path', () => {
    const { defaultExtrasManager } = require('../../extras/ExtrasManager');
    const spy = jest.spyOn(defaultExtrasManager, 'getUpscaleBinaryPath').mockReturnValue(null);
    try {
      const bm = new BinaryManager('/nonexistent/path');
      expect(bm.isBinaryAvailable('waifu2x')).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  test('isBinaryAvailable returns false for unknown engine', () => {
    const bm = new BinaryManager('/fake');
    expect(bm.isBinaryAvailable('unknown')).toBe(false);
  });

  test('ensureExecutable returns false for non-existent binary', () => {
    const { defaultExtrasManager } = require('../../extras/ExtrasManager');
    const spy = jest.spyOn(defaultExtrasManager, 'getUpscaleBinaryPath').mockReturnValue(null);
    try {
      const bm = new BinaryManager('/nonexistent/path');
      expect(bm.ensureExecutable('waifu2x')).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  test('ensureExecutable returns false for unknown engine', () => {
    const bm = new BinaryManager('/fake');
    expect(bm.ensureExecutable('unknown')).toBe(false);
  });

  test('resolveBinaryPath falls back to userDataPath when resourcesPath does not have binary', () => {
    const { defaultExtrasManager } = require('../../extras/ExtrasManager');
    const spy = jest.spyOn(defaultExtrasManager, 'getUpscaleBinaryPath').mockReturnValue(null);
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-test-'));
    const dir = new BinaryManager().getPlatformDir();
    const ext = process.platform === 'win32' ? '.exe' : '';
    const fakeEngineDir = path.join(tmpDir, 'upscale', dir);
    fs.mkdirSync(fakeEngineDir, { recursive: true });
    const fakeBin = path.join(fakeEngineDir, `waifu2x-ncnn-vulkan${ext}`);
    fs.writeFileSync(fakeBin, 'fake');

    try {
      const bm = new BinaryManager('/nonexistent/resources', tmpDir);
      expect(bm.isBinaryAvailable('waifu2x')).toBe(true);
      expect(bm.resolveBinaryPath('waifu2x')).toBe(fakeBin);
    } finally {
      spy.mockRestore();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

