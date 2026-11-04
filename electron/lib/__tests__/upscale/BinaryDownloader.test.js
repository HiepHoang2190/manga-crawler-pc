const { ENGINES, getPlatformDir, findBinaryInDir } = require('../../upscale/BinaryDownloader');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('BinaryDownloader', () => {
  test('ENGINES contains definitions for waifu2x, realesrgan, and realcugan', () => {
    expect(ENGINES.map((e) => e.id)).toEqual(['waifu2x', 'realesrgan', 'realcugan']);
    for (const engine of ENGINES) {
      expect(engine.binaryName).toBeTruthy();
      expect(engine.assets['win-x64']).toBe('windows');
      expect(engine.assets['mac-arm64']).toBe('macos');
      expect(engine.assets['mac-x64']).toBe('macos');
    }
  });

  test('getPlatformDir returns valid platform string', () => {
    const dir = getPlatformDir();
    expect(typeof dir).toBe('string');
    expect(dir).toMatch(/^(win-x64|mac-x64|mac-arm64|linux-.+)$/);
  });

  test('findBinaryInDir locates nested binary file', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bd-test-'));
    const subDir = path.join(tmpDir, 'extracted', 'bin');
    fs.mkdirSync(subDir, { recursive: true });

    const ext = process.platform === 'win32' ? '.exe' : '';
    const targetFile = path.join(subDir, `waifu2x-ncnn-vulkan${ext}`);
    fs.writeFileSync(targetFile, 'dummy content');

    const found = findBinaryInDir(tmpDir, 'waifu2x-ncnn-vulkan');
    expect(found).toBe(targetFile);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('findBinaryInDir returns null when binary is not found', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bd-test-'));
    const found = findBinaryInDir(tmpDir, 'nonexistent-binary');
    expect(found).toBeNull();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
