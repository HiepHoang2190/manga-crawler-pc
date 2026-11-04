'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  detectKindleCompiler,
  importKindleCompiler,
  getKindleCompilerStatus,
  getToolsDirectory,
} = require('../../export/tools/kindleGenManager');

describe('kindleGenManager', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kindle-tool-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  test('getToolsDirectory returns a valid path string', () => {
    const dir = getToolsDirectory();
    expect(typeof dir).toBe('string');
    expect(dir.length).toBeGreaterThan(0);
  });

  test('detectKindleCompiler finds compiler if file exists', () => {
    const fakeExe = path.join(tempDir, process.platform === 'win32' ? 'kindlegen.exe' : 'kindlegen');
    fs.writeFileSync(fakeExe, '#!/bin/sh\necho "fake kindlegen"\n', { mode: 0o755 });

    const detected = detectKindleCompiler({ customDir: tempDir });
    expect(detected.available).toBe(true);
    expect(detected.type).toBe('kindlegen');
    expect(detected.path).toBe(fakeExe);
  });

  test('detectKindleCompiler ignores directory named kindlegen', () => {
    const fakeDir = path.join(tempDir, 'kindlegen');
    fs.mkdirSync(fakeDir, { recursive: true });

    const detected = detectKindleCompiler({ customDir: tempDir, skipSystemPath: true });
    expect(detected.available).toBe(false);
  });

  test('detectKindleCompiler ignores 0-byte file or zip file disguised as exe', async () => {
    const archiver = require('archiver');
    const exeName = process.platform === 'win32' ? 'kindlegen.exe' : 'kindlegen';
    const fakeExe = path.join(tempDir, exeName);

    // 0-byte file
    fs.writeFileSync(fakeExe, '');
    let detected = detectKindleCompiler({ customDir: tempDir, skipSystemPath: true });
    expect(detected.available).toBe(false);

    // ZIP file renamed as exe
    await new Promise((resolve, reject) => {
      const out = fs.createWriteStream(fakeExe);
      const archive = archiver('zip', { zlib: { level: 0 } });
      out.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(out);
      archive.append('dummy text', { name: 'readme.txt' });
      archive.finalize();
    });

    detected = detectKindleCompiler({ customDir: tempDir, skipSystemPath: true });
    expect(detected.available).toBe(false);
  });

  test('importKindleCompiler extracts kindlegen from a zip archive automatically', async () => {
    const archiver = require('archiver');
    const zipPath = path.join(tempDir, 'kindlegen_pack.zip');

    await new Promise((resolve, reject) => {
      const out = fs.createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 0 } });
      out.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(out);
      archive.append('#!/bin/sh\necho "nested kindlegen"\n', { name: 'kindlegen.exe' });
      archive.finalize();
    });

    const destDir = path.join(tempDir, 'tools_unzip_dest');
    const result = await importKindleCompiler(zipPath, { customToolsDir: destDir });
    expect(result.ok).toBe(true);
    expect(fs.existsSync(result.path)).toBe(true);

    const { isZipFile } = require('../../export/tools/kindleGenManager');
    expect(isZipFile(result.path)).toBe(false);
  });

  test('repairKindleCompilerIfZip automatically heals when kindlegen in tools is a zip archive', async () => {
    const archiver = require('archiver');
    const { repairKindleCompilerIfZip, isZipFile } = require('../../export/tools/kindleGenManager');
    const destDir = path.join(tempDir, 'tools_repair');
    fs.mkdirSync(destDir, { recursive: true });

    const binaryName = process.platform === 'win32' ? 'kindlegen.exe' : 'kindlegen';
    const fakeExe = path.join(destDir, binaryName);

    // Save a zip archive directly as kindlegen / kindlegen.exe (simulating the bug)
    await new Promise((resolve, reject) => {
      const out = fs.createWriteStream(fakeExe);
      const archive = archiver('zip', { zlib: { level: 0 } });
      out.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(out);
      archive.append('#!/bin/sh\necho "healed kindlegen"\n', { name: 'kindlegen.exe' });
      archive.finalize();
    });

    expect(isZipFile(fakeExe)).toBe(true);

    const repaired = await repairKindleCompilerIfZip(destDir);
    expect(repaired).toBe(true);
    expect(isZipFile(fakeExe)).toBe(false);
    expect(fs.readFileSync(fakeExe, 'utf8')).toContain('healed kindlegen');
  });

  test('detectKindleCompiler rejects 32-bit Mach-O binary on macOS', () => {
    if (process.platform !== 'darwin') return;
    const destDir = path.join(tempDir, 'tools_macho_32');
    fs.mkdirSync(destDir, { recursive: true });
    const fake32Bit = path.join(destDir, 'kindlegen');
    // Write 32-bit Mach-O magic: 0xcefaedfe
    const buf = Buffer.from([0xce, 0xfa, 0xed, 0xfe, 0x07, 0x00, 0x00, 0x00]);
    fs.writeFileSync(fake32Bit, buf, { mode: 0o755 });

    const detected = detectKindleCompiler({ customDir: destDir, skipSystemPath: true });
    expect(detected.available).toBe(false);
  });
});
