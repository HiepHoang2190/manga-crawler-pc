'use strict';

const fs = require('fs');
const path = require('path');
const extractZip = require('extract-zip');
const { IMAGE_EXT } = require('../../library/listChapterImageFiles');

function findImagesRecursively(dir, baseRel = '') {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const results = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = baseRel ? `${baseRel}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      results.push(...findImagesRecursively(fullPath, relPath));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (IMAGE_EXT.has(ext)) {
        results.push({
          path: fullPath,
          name: entry.name,
          relPath,
        });
      }
    }
  }

  results.sort((a, b) => a.relPath.localeCompare(b.relPath, undefined, { numeric: true, sensitivity: 'base' }));
  return results;
}

/**
 * Trích xuất toàn bộ ảnh từ file sách hoặc thư mục ảnh.
 * @param {string} sourcePath
 * @param {string} tempExtractDir
 * @param {object} [opts]
 * @param {function} [opts.onProgress]
 * @param {AbortSignal} [opts.signal]
 */
async function extractImagesFromBook(sourcePath, tempExtractDir, opts = {}) {
  const { onProgress = () => {}, signal } = opts;
  const resolved = path.resolve(sourcePath);

  if (!fs.existsSync(resolved)) {
    return { ok: false, error: `Không tìm thấy file nguồn: ${path.basename(resolved)}` };
  }

  const stat = fs.statSync(resolved);
  const title = path.basename(resolved, path.extname(resolved));

  if (signal?.aborted) throw new Error('Đã hủy trích xuất');

  // Trường hợp nguồn là Thư mục
  if (stat.isDirectory()) {
    onProgress({ message: 'Đang quét ảnh trong thư mục...' });
    const images = findImagesRecursively(resolved);
    if (!images.length) {
      return { ok: false, error: 'Không tìm thấy ảnh hợp lệ trong thư mục nguồn.' };
    }
    return { ok: true, images, title };
  }

  // Trường hợp nguồn là File sách
  if (!fs.existsSync(tempExtractDir)) {
    fs.mkdirSync(tempExtractDir, { recursive: true });
  }

  const ext = path.extname(resolved).toLowerCase();

  // 1. Định dạng ZIP / CBZ / EPUB
  if (['.cbz', '.zip', '.epub'].includes(ext)) {
    onProgress({ message: `Đang giải nén ${ext.toUpperCase()}: ${path.basename(resolved)}` });
    try {
      await extractZip(resolved, { dir: tempExtractDir });
    } catch (zipErr) {
      return { ok: false, error: `Lỗi giải nén ${ext}: ${String(zipErr?.message || zipErr)}` };
    }

    const images = findImagesRecursively(tempExtractDir);
    if (!images.length) {
      return { ok: false, error: `Không tìm thấy ảnh bên trong tệp ${ext.toUpperCase()}.` };
    }
    return { ok: true, images, title };
  }

  // 2. Định dạng PDF
  if (ext === '.pdf') {
    onProgress({ message: `Đang trích xuất các trang PDF: ${path.basename(resolved)}` });
    try {
      // Internal renderer — pdf-to-png-converter is broken on Windows with
      // pdfjs v5 ("Invalid factory url ... must include trailing slash").
      // See electron/lib/shared/pdfToPng.js.
      const { pdfToPng } = require('../../shared/pdfToPng');
      const pngPages = await pdfToPng(resolved, {
        outputFolder: tempExtractDir,
        viewportScale: 1.5,
      });

      const images = pngPages.map((p, idx) => ({
        path: p.path,
        name: path.basename(p.path),
        relPath: path.basename(p.path),
        pageIndex: idx + 1,
      }));

      return { ok: true, images, title };
    } catch (pdfErr) {
      return { ok: false, error: `Lỗi trích xuất PDF: ${String(pdfErr?.message || pdfErr)}` };
    }
  }

  // 3. Định dạng MOBI
  if (['.mobi', '.azw', '.azw3'].includes(ext)) {
    onProgress({ message: `Đang giải nén ${ext.toUpperCase()}: ${path.basename(resolved)}` });
    try {
      const { loadMobiFromFilePath } = require('../../reader/loaders/loadMobiForOfflineRead');
      const mobiResult = await loadMobiFromFilePath(resolved, {
        tempRoot: tempExtractDir,
      });

      if (!mobiResult.ok) {
        return { ok: false, error: mobiResult.error || 'Không thể giải nén MOBI' };
      }

      const images = findImagesRecursively(tempExtractDir);
      if (!images.length) {
        return { ok: false, error: 'Không tìm thấy ảnh sau khi giải nén MOBI.' };
      }
      return { ok: true, images, title };
    } catch (mobiErr) {
      return { ok: false, error: `Lỗi giải nén MOBI: ${String(mobiErr?.message || mobiErr)}` };
    }
  }

  return { ok: false, error: `Định dạng tệp không được hỗ trợ: ${ext}` };
}

module.exports = {
  findImagesRecursively,
  extractImagesFromBook,
};
