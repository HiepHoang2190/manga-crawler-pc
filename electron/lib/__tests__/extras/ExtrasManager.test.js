const fs = require('fs');
const path = require('path');
const os = require('os');
const { ExtrasManager } = require('../../extras/ExtrasManager');

describe('ExtrasManager', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'extras-mgr-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  test('getExtrasDir returns stable non-app directory based on platform', () => {
    const mgr = new ExtrasManager();
    const dir = mgr.getExtrasDir();
    expect(typeof dir).toBe('string');
    expect(dir.length).toBeGreaterThan(0);
  });

  test('getStatus returns installed: false when directory is empty', () => {
    const mgr = new ExtrasManager(tempDir);
    const status = mgr.getStatus();
    expect(status.installed).toBe(false);
    expect(status.version).toBe(null);
    expect(status.components.upscale).toBe(false);
    expect(status.components.onnx).toBe(false);
  });

  test('getStatus returns installed: true when manifest and components exist', () => {
    const manifest = { version: '1.0.0', platform: 'darwin', arch: 'arm64' };
    fs.writeFileSync(path.join(tempDir, 'manifest.json'), JSON.stringify(manifest));
    fs.mkdirSync(path.join(tempDir, 'upscale'));
    fs.mkdirSync(path.join(tempDir, 'onnxruntime'));

    const mgr = new ExtrasManager(tempDir);
    const status = mgr.getStatus();
    expect(status.installed).toBe(true);
    expect(status.version).toBe('1.0.0');
    expect(status.components.upscale).toBe(true);
    expect(status.components.onnx).toBe(true);
  });

  test('getUpscaleBinaryPath resolves correct path when file exists', () => {
    fs.mkdirSync(path.join(tempDir, 'upscale'));
    const ext = process.platform === 'win32' ? '.exe' : '';
    const binaryName = `realesrgan-ncnn-vulkan${ext}`;
    const fullPath = path.join(tempDir, 'upscale', binaryName);
    fs.writeFileSync(fullPath, 'fake-binary');

    const mgr = new ExtrasManager(tempDir);
    expect(mgr.getUpscaleBinaryPath('realesrgan-ncnn-vulkan')).toBe(fullPath);
    expect(mgr.getUpscaleBinaryPath('non-existent')).toBe(null);
  });

  test('getOnnxRuntimePath resolves directory when exists', () => {
    const mgr = new ExtrasManager(tempDir);
    expect(mgr.getOnnxRuntimePath()).toBe(null);

    const onnxDir = path.join(tempDir, 'onnxruntime');
    fs.mkdirSync(onnxDir);
    expect(mgr.getOnnxRuntimePath()).toBe(onnxDir);
  });

  test('deleteExtras removes directory and resets status', () => {
    const manifest = { version: '1.0.0' };
    fs.writeFileSync(path.join(tempDir, 'manifest.json'), JSON.stringify(manifest));
    fs.mkdirSync(path.join(tempDir, 'upscale'));

    const mgr = new ExtrasManager(tempDir);
    expect(mgr.getStatus().installed).toBe(true);

    const newStatus = mgr.deleteExtras();
    expect(newStatus.installed).toBe(false);
    expect(fs.existsSync(tempDir)).toBe(false);
  });

  test('installFromZip succeeds and handles symlinks gracefully on Windows EPERM', async () => {
    const archiver = require('archiver');
    const zipPath = path.join(tempDir, 'extras-test.zip');
    const destDir = path.join(tempDir, 'installed-extras');

    // Create a zip with manifest, upscale folder, and a symlink entry
    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(zipPath);
      const archive = archiver('zip');
      output.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(output);

      archive.append(JSON.stringify({ version: '1.2.0' }), { name: 'manifest.json' });
      archive.append('binary-content', { name: 'upscale/realesrgan-ncnn-vulkan' });
      archive.append('console.log("semver")', { name: 'onnxruntime/node_modules/semver/bin/semver.js' });
      archive.symlink('onnxruntime/node_modules/.bin/semver', '../semver/bin/semver.js');
      archive.finalize();
    });

    // Mock fs.promises.symlink to throw EPERM as on Windows without Developer Mode
    jest.spyOn(fs.promises, 'symlink').mockImplementation(async () => {
      const err = new Error("EPERM: operation not permitted, symlink '..\\semver\\bin\\semver.js'");
      err.code = 'EPERM';
      throw err;
    });

    try {
      const mgr = new ExtrasManager(destDir);
      const progressList = [];
      const status = await mgr.installFromZip(zipPath, (p) => progressList.push(p));

      expect(status.installed).toBe(true);
      expect(status.version).toBe('1.2.0');
      expect(status.components.upscale).toBe(true);
      expect(status.components.onnx).toBe(true);

      // Verify symlink was cleanly resolved as a copied file without EPERM crash
      const binSemver = path.join(destDir, 'onnxruntime', 'node_modules', '.bin', 'semver');
      expect(fs.existsSync(binSemver)).toBe(true);
      expect(fs.readFileSync(binSemver, 'utf8')).toBe('console.log("semver")');

      // Verify progress reporting occurred
      expect(progressList.length).toBeGreaterThan(0);
      expect(progressList.some((p) => p.phase === 'extracting')).toBe(true);
      expect(progressList.some((p) => p.phase === 'ready' && p.percent === 100)).toBe(true);
    } finally {
      fs.promises.symlink.mockRestore();
    }
  });

  test('installFromZip on win32 extracts extras zip without attempting native symlink', async () => {
    const archiver = require('archiver');
    const zipPath = path.join(tempDir, 'win32-extras-test.zip');
    const destDir = path.join(tempDir, 'win32-installed-extras');

    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(zipPath);
      const archive = archiver('zip');
      output.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(output);

      archive.append(JSON.stringify({ version: '1.2.0' }), { name: 'manifest.json' });
      archive.append('binary-content', { name: 'upscale/realesrgan-ncnn-vulkan.exe' });
      archive.append('console.log("semver")', { name: 'onnxruntime/node_modules/semver/bin/semver.js' });
      archive.symlink('onnxruntime/node_modules/.bin/semver', '../semver/bin/semver.js');
      archive.finalize();
    });

    const originalPlatform = process.platform;
    const symlinkSpy = jest.spyOn(fs.promises, 'symlink');

    try {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      const mgr = new ExtrasManager(destDir);
      const status = await mgr.installFromZip(zipPath);

      expect(status.installed).toBe(true);
      expect(status.components.upscale).toBe(true);
      expect(status.components.onnx).toBe(true);

      // On Windows, native symlink must not have been attempted
      expect(symlinkSpy).not.toHaveBeenCalled();

      // Semver file is properly copied
      const binSemver = path.join(destDir, 'onnxruntime', 'node_modules', '.bin', 'semver');
      expect(fs.existsSync(binSemver)).toBe(true);
      expect(fs.readFileSync(binSemver, 'utf8')).toBe('console.log("semver")');
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
      symlinkSpy.mockRestore();
    }
  });

  test('downloadAndInstall downloads via DirectDownloader and installs zip', async () => {
    const directDownloader = require('../../extras/DirectDownloader');

    const spyDirect = jest.spyOn(directDownloader, 'downloadDirectFile').mockImplementation(async (url, dest) => {
      fs.writeFileSync(dest, 'mock-zip-content');
      return { destFilePath: dest, totalBytes: 100 };
    });

    const mgr = new ExtrasManager(tempDir);
    const installSpy = jest.spyOn(mgr, 'installFromZip').mockResolvedValue({ installed: true });

    const githubUrl = 'https://github.com/org/repo/releases/download/v1.0.0/manga-crawler-extras-win-x64.zip';
    const result = await mgr.downloadAndInstall(githubUrl);

    expect(spyDirect).toHaveBeenCalledWith(
      githubUrl,
      expect.any(String),
      expect.any(Function),
      null
    );
    expect(installSpy).toHaveBeenCalled();
    expect(result.installed).toBe(true);

    spyDirect.mockRestore();
  });
});

