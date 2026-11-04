'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const { loadEpubFromFilePath } = require('./loadEpubForOfflineRead');

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
    try { await execAsync(`${cmd} --version`); return cmd; } catch { /* */ }
  }
  return null;
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

    const wrapperScript = path.resolve(__dirname, 'kindleunpack_wrapper.py');
    let unpackCmd;
    if (process.platform === 'win32') {
      const exe = path.resolve(__dirname, '../../../../node_modules/kindleunpack/dist/kindleunpack.exe');
      unpackCmd = `"${exe}" --epub_version=3 "${resolved}" "${outDir}"`;
    } else {
      const python = await findPython();
      if (!python) {
        return { ok: false, error: `${baseName}: Python không tìm thấy. Cần cài Python 3 để đọc file MOBI/AZW.` };
      }
      unpackCmd = `${python} "${wrapperScript}" "${resolved}" "${outDir}"`;
    }

    onProgress?.(0, 1);
    try {
      await execAsync(unpackCmd, { timeout: 60000 });
    } catch (e) {
      const msg = String(e?.stderr || e?.message || e);
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

module.exports = { loadMobiFromFilePath };
