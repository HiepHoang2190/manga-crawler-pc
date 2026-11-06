'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');

const { loadEpubFromFilePath } = require('./loadEpubForOfflineRead');

function execFilePromise(file, args, options) {
  return new Promise((resolve, reject) => {
    childProcess.execFile(file, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        return reject(error);
      }
      resolve({ stdout, stderr });
    });
  });
}

function hash16(input) {
  return crypto.createHash('sha1').update(String(input)).digest('hex').slice(0, 16);
}

function findEpubInDir(dir) {
  let entries;
  try { entries = fs.readdirSync(dir); } catch { return null; }
  for (const name of entries) {
    if (name.toLowerCase().endsWith('.epub')) return path.join(dir, name);
  }
  for (const name of entries) {
    const full = path.join(dir, name);
    try {
      if (fs.statSync(full).isDirectory()) {
        const found = findEpubInDir(full);
        if (found) return found;
      }
    } catch { /* */ }
  }
  return null;
}

async function findPython() {
  for (const cmd of ['python3', 'python', 'py']) {
    try {
      await execFilePromise(cmd, ['--version'], { windowsHide: true });
      return cmd;
    } catch { /* */ }
  }
  return null;
}

/**
 * Tìm đường dẫn thực thi của kindleunpack.exe (Windows).
 * Đảm bảo file nằm trên filesystem thật (ngoài virtual app.asar)
 * để Windows CreateProcessW có thể khởi chạy trực tiếp mà không qua cmd.exe.
 */
function resolveKindleUnpackExe() {
  const asarPath = path.resolve(__dirname, '../../../../node_modules/kindleunpack/dist/kindleunpack.exe');
  const unpackedPath = asarPath.replace(/[\\/]app\.asar([\\/])/, '$1app.asar.unpacked$1');

  // 1. Nếu file đã được electron-builder giải nén ra app.asar.unpacked
  if (unpackedPath !== asarPath && fs.existsSync(unpackedPath)) {
    return unpackedPath;
  }

  // 2. Nếu đang chạy dev mode (chưa đóng gói asar)
  if (!asarPath.includes('app.asar') && fs.existsSync(asarPath)) {
    return asarPath;
  }

  // 3. Cơ chế tự phục hồi (Self-healing fallback):
  // Nếu binary bị đóng gói bên trong virtual app.asar (ở các bản build cũ chưa có asarUnpack),
  // Electron fs vẫn đọc được Buffer từ trong asar. Ta trích xuất ra thư mục temp để CreateProcessW chạy được.
  if (fs.existsSync(asarPath)) {
    try {
      const tempExe = path.join(os.tmpdir(), 'kindleunpack_mc.exe');
      let needExtract = true;
      if (fs.existsSync(tempExe)) {
        try {
          const statAsar = fs.statSync(asarPath);
          const statTemp = fs.statSync(tempExe);
          if (statTemp.size === statAsar.size && statTemp.size > 0) {
            needExtract = false;
          }
        } catch (_) {}
      }
      if (needExtract) {
        fs.copyFileSync(asarPath, tempExe);
      }
      return tempExe;
    } catch (err) {
      console.warn('[loadMobiForOfflineRead] Failed to extract kindleunpack.exe from asar:', err?.message || err);
    }
  }

  return unpackedPath;
}

/**
 * Tìm đường dẫn wrapper script và package directory của kindleunpack (macOS/Linux hoặc fallback).
 */
function resolveKindleUnpackPy() {
  const asarWrapper = path.resolve(__dirname, 'kindleunpack_wrapper.py');
  const unpackedWrapper = asarWrapper.replace(/[\\/]app\.asar([\\/])/, '$1app.asar.unpacked$1');
  const asarPkg = path.resolve(__dirname, '../../../../node_modules/kindleunpack');
  const unpackedPkg = asarPkg.replace(/[\\/]app\.asar([\\/])/, '$1app.asar.unpacked$1');

  let scriptPath = fs.existsSync(unpackedWrapper) ? unpackedWrapper : asarWrapper;
  let pkgDir = fs.existsSync(unpackedPkg) ? unpackedPkg : asarPkg;

  // Nếu scriptPath nằm trong virtual asar, Python OS ngoài không đọc được
  if (scriptPath.includes('app.asar') && fs.existsSync(scriptPath)) {
    try {
      const tempPy = path.join(os.tmpdir(), 'kindleunpack_wrapper_mc.py');
      fs.copyFileSync(scriptPath, tempPy);
      scriptPath = tempPy;
    } catch (_) {}
  }

  return { scriptPath, pkgDir };
}

/**
 * Unpack MOBI/AZW/AZW3 → EPUB, rồi:
 *   - Nếu EPUB text → trả { ok: true, textEbookPath } để mở EbookReader
 *   - Nếu EPUB ảnh → trả { ok: true, manga, chapters } để mở MangaReader
 *
 * @param {string} mobiPath
 * @param {{ tempRoot: string, onProgress?: (extracted: number, total: number) => void }} opts
 */
async function loadMobiFromFilePath(mobiPath, { tempRoot, onProgress }) {
  const resolved = path.resolve(String(mobiPath || '').trim());
  const baseName = path.basename(resolved);

  if (!fs.existsSync(resolved)) return { ok: false, error: `${baseName}: File not found.` };
  let st;
  try { st = fs.statSync(resolved); } catch (e) {
    return { ok: false, error: `${baseName}: ${String(e?.message || e)}` };
  }
  if (!st.isFile()) return { ok: false, error: `${baseName}: Not a file.` };

  // outDir: thư mục kindleunpack dump output vào
  const outDir = path.join(String(tempRoot || '').trim(), `mobi-${Date.now()}-${hash16(resolved)}`);

  try {
    await fs.promises.mkdir(outDir, { recursive: true });

    onProgress?.(0, 1);

    let unpacked = false;
    let lastError = null;

    // 1. Thử kindleunpack.exe trước trên Windows
    if (process.platform === 'win32') {
      const exe = resolveKindleUnpackExe();
      if (fs.existsSync(exe)) {
        try {
          // Bắt buộc dùng execFile để gọi CreateProcessW trực tiếp,
          // triệt tiêu toàn bộ lỗi "The system cannot find the path specified" của cmd.exe
          // khi đường dẫn chứa ký tự tiếng Việt Unicode hoặc dấu ngoặc đơn ()
          await execFilePromise(exe, ['-i', '--epub_version=3', resolved, outDir], {
            timeout: 60000,
            windowsHide: true,
            maxBuffer: 10 * 1024 * 1024,
          });
          unpacked = true;
        } catch (exeErr) {
          lastError = exeErr;
        }
      }
    }

    // 2. Nếu trên macOS/Linux HOẶC trên Windows nhưng kindleunpack.exe không có/lỗi, thử Python
    if (!unpacked) {
      const python = await findPython();
      if (python) {
        const { scriptPath, pkgDir } = resolveKindleUnpackPy();
        try {
          await execFilePromise(python, [scriptPath, resolved, outDir], {
            timeout: 60000,
            env: { ...process.env, KINDLEUNPACK_DIR: pkgDir },
            windowsHide: true,
            maxBuffer: 10 * 1024 * 1024,
          });
          unpacked = true;
        } catch (pyErr) {
          lastError = pyErr;
        }
      }
    }

    if (!unpacked) {
      const msg = String(lastError?.stderr || lastError?.message || 'Không tìm thấy công cụ giải nén MOBI (kindleunpack.exe hoặc Python).');
      try { await fs.promises.rm(outDir, { recursive: true, force: true }); } catch { /* */ }
      return { ok: false, error: `${baseName}: Không unpack được — ${msg.slice(0, 200)}` };
    }

    onProgress?.(1, 1);

    const epubPath = findEpubInDir(outDir);
    if (!epubPath) {
      try { await fs.promises.rm(outDir, { recursive: true, force: true }); } catch { /* */ }
      return { ok: false, error: `${baseName}: Không tìm thấy EPUB sau khi unpack.` };
    }

    // Thử image loader trước — EPUB từ MOBI ảnh có spine XHTML bọc ảnh,
    // detectEbookContentType hay nhầm là 'text' nên không dùng detect ở đây.
    const imageResult = await loadEpubFromFilePath(epubPath, { tempRoot });

    if (imageResult.ok && imageResult.chapters?.length) {
      // Image ebook thành công — dọn outDir của kindleunpack
      try { await fs.promises.rm(outDir, { recursive: true, force: true }); } catch { /* */ }
      return imageResult;
    }

    // Không có ảnh → thử text reader (giữ outDir vì epubPath nằm trong đó)
    return { ok: true, textEbookPath: epubPath, sourceFile: resolved, cbzTempExtractDir: outDir };
  } catch (e) {
    try { await fs.promises.rm(outDir, { recursive: true, force: true }); } catch { /* */ }
    return { ok: false, error: `${baseName}: ${String(e?.message || e)}` };
  }
}

module.exports = {
  loadMobiFromFilePath,
  resolveKindleUnpackExe,
  resolveKindleUnpackPy,
};
