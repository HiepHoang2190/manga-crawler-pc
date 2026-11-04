const fs = require('fs');
const path = require('path');

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);

/** Raster pages extracted from a single-chapter PDF (see ensureChapterPdfRenderedAsPngPages). */
const CHAPTER_PDF_RASTER_SUBDIR = '_drive_pdf_pages';

/**
 * Liệt kê file ảnh trong thư mục một chương (đã tải), sort theo tên (numeric).
 * @param {string} chapterDir
 * @param {{ namePrefix?: string }} [options]
 * @returns {{ ok: boolean, error?: string, files: string[] }}
 */
function listChapterImageFiles(chapterDir, options = {}) {
  const namePrefix = typeof options.namePrefix === 'string' ? options.namePrefix : '';
  const dir = String(chapterDir || '').trim();
  if (!dir || !fs.existsSync(dir)) {
    return { ok: false, error: 'Không tìm thấy thư mục chương.', files: [] };
  }
  let st;
  try {
    st = fs.statSync(dir);
  } catch {
    return { ok: false, error: 'Không đọc được thư mục chương.', files: [] };
  }
  if (!st.isDirectory()) {
    return { ok: false, error: 'Không phải thư mục.', files: [] };
  }
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return { ok: false, error: 'Không đọc được danh sách file.', files: [] };
  }
  const basenames = names.filter((name) => {
    if (name.startsWith('._')) return false;
    if (namePrefix && !name.startsWith(namePrefix)) return false;
    const ext = path.extname(name).toLowerCase();
    return IMAGE_EXT.has(ext);
  });
  basenames.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  if (basenames.length > 0) {
    return { ok: true, files: basenames };
  }

  const raster_dir = path.join(dir, CHAPTER_PDF_RASTER_SUBDIR);
  if (!fs.existsSync(raster_dir)) {
    return { ok: true, files: [] };
  }
  let sub_names;
  try {
    sub_names = fs.readdirSync(raster_dir);
  } catch {
    return { ok: true, files: [] };
  }
  const raster_files = sub_names
    .filter((name) => {
      if (name.startsWith('._')) return false;
      const ext = path.extname(name).toLowerCase();
      if (!IMAGE_EXT.has(ext)) return false;
      return true;
    })
    .map((name) => `${CHAPTER_PDF_RASTER_SUBDIR}/${name}`);
  raster_files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  return { ok: true, files: raster_files };
}

module.exports = { listChapterImageFiles, IMAGE_EXT, CHAPTER_PDF_RASTER_SUBDIR };
