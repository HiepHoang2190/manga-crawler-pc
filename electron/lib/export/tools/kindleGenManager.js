'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawn } = require('child_process');
const { app } = require('electron');

function getToolsDirectory() {
  if (app && typeof app.getPath === 'function') {
    try {
      return path.join(app.getPath('userData'), 'tools');
    } catch {
      // fallback
    }
  }
  const home = os.homedir();
  if (process.platform === 'darwin') {
    return path.join(home, 'Library/Application Support/manga-crawler/tools');
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(home, 'AppData/Roaming'), 'manga-crawler/tools');
  }
  return path.join(home, '.config/manga-crawler/tools');
}

function isZipFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return false;
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size < 4) return false;
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(4);
    fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);
    return buf[0] === 0x50 && buf[1] === 0x4b;
  } catch {
    return false;
  }
}

function isExecutable(filePath) {
  try {
    if (!fs.existsSync(filePath)) return false;
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return false;
    if (stat.size === 0) return false;
    if (isZipFile(filePath)) return false;

    if (process.platform === 'darwin') {
      try {
        fs.accessSync(filePath, fs.constants.X_OK);
      } catch {
        return false;
      }

      // Kiểm tra kiến trúc Mach-O trên macOS
      // macOS 10.15+ (Catalina) và Apple Silicon (M1/M2/M3/M4...) hoàn toàn không hỗ trợ ứng dụng 32-bit (i386).
      // Nếu là binary 32-bit (magic 0xfeedface hoặc 0xcefaedfe), lệnh spawn sẽ ném lỗi EBADARCH (-86: Bad CPU type in executable).
      try {
        const fd = fs.openSync(filePath, 'r');
        const buf = Buffer.alloc(4);
        fs.readSync(fd, buf, 0, 4, 0);
        fs.closeSync(fd);
        const is32BitMachO =
          (buf[0] === 0xce && buf[1] === 0xfa && buf[2] === 0xed && buf[3] === 0xfe) ||
          (buf[0] === 0xfe && buf[1] === 0xed && buf[2] === 0xfa && buf[3] === 0xce);
        if (is32BitMachO) {
          return false;
        }
      } catch {
        return false;
      }
      return true;
    }

    if (process.platform !== 'win32') {
      try {
        fs.accessSync(filePath, fs.constants.X_OK);
        return true;
      } catch {
        return false;
      }
    }
    const ext = path.extname(filePath).toLowerCase();
    if (ext && ext !== '.exe') return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Giải nén file thực thi từ archive ZIP vào đường dẫn chỉ định.
 */
async function extractExecutableFromZip(zipFilePath, targetDestPath) {
  const extractZip = require('extract-zip');
  const tempExtractDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-unzip-'));
  try {
    await extractZip(zipFilePath, { dir: tempExtractDir });

    const isWin = process.platform === 'win32';
    const targetBase = path.basename(targetDestPath).toLowerCase();
    let foundPath = null;

    const walk = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile()) {
          const name = entry.name.toLowerCase();
          if (name === targetBase) {
            foundPath = full;
            return;
          }
          if (name === 'kindlegen.exe' || name === 'kindlegen') {
            foundPath = full;
            return;
          }
          if (name === 'ebook-convert.exe' || name === 'ebook-convert') {
            foundPath = full;
            return;
          }
        }
      }
    };
    walk(tempExtractDir);

    if (!foundPath) {
      return { ok: false, error: 'Không tìm thấy file thực thi hợp lệ bên trong tệp nén zip.' };
    }

    const destDir = path.dirname(targetDestPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    fs.copyFileSync(foundPath, targetDestPath);
    if (process.platform !== 'win32') {
      try { fs.chmodSync(targetDestPath, 0o755); } catch {}
    }
    return { ok: true, path: targetDestPath };
  } finally {
    try { fs.rmSync(tempExtractDir, { recursive: true, force: true }); } catch {}
  }
}

/**
 * Tự động sửa lỗi nếu kindlegen trong tools thực chất là file ZIP bị đổi tên.
 */
async function repairKindleCompilerIfZip(toolsDir = getToolsDirectory()) {
  try {
    if (!fs.existsSync(toolsDir)) return false;
    const isWin = process.platform === 'win32';
    const binaryName = isWin ? 'kindlegen.exe' : 'kindlegen';
    const fullPath = path.join(toolsDir, binaryName);

    if (fs.existsSync(fullPath) && isZipFile(fullPath)) {
      const backupZip = path.join(os.tmpdir(), `repair_kg_${Date.now()}.zip`);
      fs.renameSync(fullPath, backupZip);
      const res = await extractExecutableFromZip(backupZip, fullPath);
      try { fs.unlinkSync(backupZip); } catch {}
      if (res.ok) {
        return true;
      }
    }
  } catch {
    // ignore
  }
  return false;
}

/**
 * Phát hiện KindleGen hoặc Calibre ebook-convert trên hệ thống.
 * @param {{ customDir?: string, skipSystemPath?: boolean }} [opts]
 */
function detectKindleCompiler(opts = {}) {
  const isWin = process.platform === 'win32';
  const toolsDir = opts.customDir || getToolsDirectory();

  // 0. Trên macOS, tự động dọn dẹp file 32-bit kindlegen không tương thích nếu có trong toolsDir
  if (process.platform === 'darwin') {
    try {
      const kgPath = path.join(toolsDir, 'kindlegen');
      if (fs.existsSync(kgPath) && !isExecutable(kgPath)) {
        try { fs.unlinkSync(kgPath); } catch {}
      }
    } catch {}
  }

  // 1. Kiểm tra trong tools directory
  const kindlegenNames = isWin
    ? ['kindlegen.exe', path.join('kindlegen', 'kindlegen.exe')]
    : ['kindlegen', path.join('kindlegen', 'kindlegen')];
  for (const name of kindlegenNames) {
    const fullPath = path.join(toolsDir, name);
    if (isExecutable(fullPath)) {
      return {
        available: true,
        type: 'kindlegen',
        path: fullPath,
        source: 'tools',
      };
    }
  }

  const ebookConvertNames = isWin
    ? ['ebook-convert.exe', path.join('calibre', 'ebook-convert.exe')]
    : ['ebook-convert', path.join('calibre', 'ebook-convert')];
  for (const name of ebookConvertNames) {
    const fullPath = path.join(toolsDir, name);
    if (isExecutable(fullPath)) {
      return {
        available: true,
        type: 'calibre',
        path: fullPath,
        source: 'tools',
      };
    }
  }

  // 2. Kiểm tra Calibre mặc định trên macOS
  if (!opts.skipSystemPath && process.platform === 'darwin') {
    const macCalibre = '/Applications/calibre.app/Contents/MacOS/ebook-convert';
    if (isExecutable(macCalibre)) {
      return {
        available: true,
        type: 'calibre',
        path: macCalibre,
        source: 'calibre_app',
      };
    }
  }

  // 3. Kiểm tra Calibre mặc định trên Windows (C:\Program Files\Calibre2)
  if (!opts.skipSystemPath && isWin) {
    const winCalibrePaths = [
      'C:\\Program Files\\Calibre2\\ebook-convert.exe',
      'C:\\Program Files (x86)\\Calibre2\\ebook-convert.exe',
    ];
    for (const p of winCalibrePaths) {
      if (isExecutable(p)) {
        return {
          available: true,
          type: 'calibre',
          path: p,
          source: 'calibre_app',
        };
      }
    }
  }

  // 4. Kiểm tra trong PATH hệ thống
  if (!opts.skipSystemPath) {
    const checkCmd = isWin ? 'where' : 'which';
    for (const tool of ['kindlegen', 'ebook-convert']) {
      try {
        const out = execSync(`${checkCmd} ${tool}`, { stdio: ['pipe', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
        const firstLine = out.split(/\r?\n/)[0];
        if (firstLine && isExecutable(firstLine)) {
          return {
            available: true,
            type: tool === 'kindlegen' ? 'kindlegen' : 'calibre',
            path: firstLine,
            source: 'system',
          };
        }
      } catch {
        // not found in PATH
      }
    }
  }

  return {
    available: false,
    type: null,
    path: null,
    source: null,
  };
}

/**
 * Trả về trạng thái compiler kèm thông tin hiển thị UI.
 */
function getKindleCompilerStatus(opts = {}) {
  const detected = detectKindleCompiler(opts);
  return {
    ...detected,
    platform: process.platform,
    toolsDirectory: opts.customDir || getToolsDirectory(),
  };
}

/**
 * Import file compiler từ bên ngoài vào tools directory.
 */
async function importKindleCompiler(sourceFilePath, opts = {}) {
  if (!sourceFilePath || !fs.existsSync(sourceFilePath)) {
    return { ok: false, error: 'File nguồn không tồn tại.' };
  }

  const stat = fs.statSync(sourceFilePath);
  if (!stat.isFile()) {
    return { ok: false, error: 'Đường dẫn đã chọn không phải là tệp tin.' };
  }

  const toolsDir = opts.customToolsDir || getToolsDirectory();
  if (!fs.existsSync(toolsDir)) {
    fs.mkdirSync(toolsDir, { recursive: true });
  }

  const isWin = process.platform === 'win32';
  const baseName = path.basename(sourceFilePath).toLowerCase();
  const isCalibre = baseName.includes('ebook-convert');
  const targetName = isCalibre
    ? (isWin ? 'ebook-convert.exe' : 'ebook-convert')
    : (isWin ? 'kindlegen.exe' : 'kindlegen');

  const destPath = path.join(toolsDir, targetName);

  // Nếu người dùng chọn file zip: giải nén tự động tìm binary
  if (baseName.endsWith('.zip') || isZipFile(sourceFilePath)) {
    const extractRes = await extractExecutableFromZip(sourceFilePath, destPath);
    if (!extractRes.ok) {
      return extractRes;
    }
    return {
      ok: true,
      path: destPath,
      type: isCalibre ? 'calibre' : 'kindlegen',
    };
  }

  // File binary trực tiếp
  fs.copyFileSync(sourceFilePath, destPath);

  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(destPath, 0o755);
    } catch {
      // ignore
    }
  }

  if (!isExecutable(destPath)) {
    try { fs.unlinkSync(destPath); } catch {}
    return {
      ok: false,
      error: process.platform === 'darwin'
        ? 'File thực thi không tương thích với CPU của máy (macOS hiện đại không hỗ trợ KindleGen 32-bit). Vui lòng chọn file ebook-convert từ Calibre 64-bit.'
        : 'File thực thi không hợp lệ hoặc thiếu quyền thực thi.'
    };
  }

  return {
    ok: true,
    path: destPath,
    type: isCalibre ? 'calibre' : 'kindlegen',
  };
}

/**
 * Tải KindleGen tự động từ kho lưu trữ mirror chính thức.
 */
async function downloadKindleCompiler(onProgress = () => {}, opts = {}) {
  const toolsDir = opts.customToolsDir || getToolsDirectory();
  if (!fs.existsSync(toolsDir)) {
    fs.mkdirSync(toolsDir, { recursive: true });
  }

  const isWin = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  if (isMac) {
    // Trên macOS 10.15+ và chip Apple Silicon, Amazon KindleGen 32-bit cũ không thể chạy (lỗi -86: Bad CPU type).
    // Tự động kiểm tra xem Calibre đã được cài đặt trên máy chưa:
    const detected = detectKindleCompiler({ skipSystemPath: false });
    if (detected.available && detected.type === 'calibre') {
      onProgress({ percent: 100, message: 'Đã tìm thấy Calibre ebook-convert trên máy!' });
      return {
        ok: true,
        path: detected.path,
        toolsDir,
        type: 'calibre',
      };
    }
    return {
      ok: false,
      error:
        'Trên macOS (từ macOS 10.15 Catalina và chip Apple Silicon M1/M2/M3/M4), Amazon KindleGen 32-bit cũ không thể chạy (lỗi Bad CPU type -86). Vui lòng cài đặt Calibre (miễn phí tại https://calibre-ebook.com) để biên dịch MOBI.',
    };
  }

  let url;
  let targetBinaryName;
  if (isWin) {
    url = 'https://archive.org/download/kindlegen2.9/kindlegen_win32_v2_9.zip';
    targetBinaryName = 'kindlegen.exe';
  } else {
    url = 'https://archive.org/download/kindlegen2.9/kindlegen_linux_2.6_i386_v2_9.tar.gz';
    targetBinaryName = 'kindlegen';
  }

  onProgress({ percent: 10, message: 'Đang kết nối tải KindleGen...' });
  const tempZip = path.join(os.tmpdir(), `kindlegen_${Date.now()}.zip`);
  const destPath = path.join(toolsDir, targetBinaryName);

  try {
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok) {
      throw new Error(`Tải thất bại với mã trạng thái ${response.status}`);
    }

    const totalBytes = Number(response.headers.get('content-length')) || 0;
    let receivedBytes = 0;

    const fileStream = fs.createWriteStream(tempZip);
    const reader = response.body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fileStream.write(Buffer.from(value));
      receivedBytes += value.length;
      if (totalBytes > 0) {
        const pct = Math.min(85, Math.round(10 + (receivedBytes / totalBytes) * 75));
        const mb = (receivedBytes / (1024 * 1024)).toFixed(1);
        const totalMb = (totalBytes / (1024 * 1024)).toFixed(1);
        onProgress({ percent: pct, message: `Đang tải KindleGen (${mb}/${totalMb} MB)...` });
      }
    }

    await new Promise((resolve, reject) => {
      fileStream.end((err) => (err ? reject(err) : resolve()));
    });

    onProgress({ percent: 90, message: 'Đang giải nén công cụ KindleGen...' });
    const extractRes = await extractExecutableFromZip(tempZip, destPath);
    if (!extractRes.ok) {
      throw new Error(extractRes.error || 'Giải nén thất bại');
    }

    onProgress({ percent: 100, message: 'Cài đặt KindleGen hoàn tất!' });
    return {
      ok: true,
      path: destPath,
      toolsDir,
    };
  } catch (err) {
    return {
      ok: false,
      error: `Không thể tải KindleGen: ${err.message}`,
    };
  } finally {
    try {
      if (fs.existsSync(tempZip)) fs.unlinkSync(tempZip);
    } catch {}
  }
}

module.exports = {
  getToolsDirectory,
  isExecutable,
  isZipFile,
  extractExecutableFromZip,
  repairKindleCompilerIfZip,
  detectKindleCompiler,
  getKindleCompilerStatus,
  importKindleCompiler,
  downloadKindleCompiler,
};
