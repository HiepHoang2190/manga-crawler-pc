const fs = require('fs');
const path = require('path');
const { extractChapterNumberString } = require('../shared/mangaUtils');
const { listChapterImageFiles, IMAGE_EXT } = require('./listChapterImageFiles');

/** Thứ tự ưu tiên tên file bìa phổ biến (chữ thường, khớp chính xác trước). */
const COVER_NAMES = [
  'cover',
  'poster',
  'folder',
  'thumb',
  'thumbnail',
  'front',
];

const COVER_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.bmp'];

const COVER_RE = /^(cover|poster|folder|thumb|thumbnail|front)\.(jpe?g|png|webp|avif|gif|bmp)$/i;

/**
 * Tìm file bìa trong thư mục gốc truyện (cover.jpg, poster.png, …, không phân biệt hoa thường).
 * Nếu không có, tự động fallback:
 * 1. Ảnh trực tiếp ở gốc thư mục (oneshot / flat layout).
 * 2. Ảnh đầu tiên của Chapter 1 (hoặc chapter nhỏ nhất có ảnh).
 * @param {string} mangaDir
 * @returns {string | null} đường dẫn tuyệt đối tới file ảnh hoặc null
 */
function findLocalCoverInMangaDir(mangaDir) {
  const abs = path.resolve(String(mangaDir || '').trim());
  if (!abs || !fs.existsSync(abs)) return null;
  let st;
  try {
    st = fs.statSync(abs);
  } catch {
    return null;
  }
  if (!st.isDirectory()) return null;

  // 1. Kiểm tra các tên file bìa chuẩn trước
  for (const name of COVER_NAMES) {
    for (const ext of COVER_EXTENSIONS) {
      const fp = path.join(abs, `${name}${ext}`);
      try {
        if (fs.existsSync(fp) && fs.statSync(fp).isFile() && fs.statSync(fp).size > 0) {
          return path.resolve(fp);
        }
      } catch {
        /* */
      }
    }
  }

  // 2. Khớp regex không phân biệt hoa thường
  let names;
  try {
    names = fs.readdirSync(abs);
  } catch {
    return null;
  }
  for (const n of names) {
    if (!COVER_RE.test(n)) continue;
    const fp = path.join(abs, n);
    try {
      if (fs.statSync(fp).isFile() && fs.statSync(fp).size > 0) return path.resolve(fp);
    } catch {
      /* */
    }
  }

  // 3. Fallback: Ảnh trực tiếp ở thư mục truyện (oneshot / flat layout)
  const directImages = names
    .filter((n) => !n.startsWith('.') && !n.startsWith('._') && IMAGE_EXT.has(path.extname(n).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

  for (const imgName of directImages) {
    const fp = path.join(abs, imgName);
    try {
      if (fs.statSync(fp).isFile() && fs.statSync(fp).size > 0) return path.resolve(fp);
    } catch {
      /* */
    }
  }

  // 4. Fallback: Ảnh đầu tiên của Chapter 1 (hoặc chapter nhỏ nhất có ảnh)
  const subdirs = names.filter((n) => {
    if (n.startsWith('.') || n.startsWith('._')) return false;
    try {
      return fs.statSync(path.join(abs, n)).isDirectory();
    } catch {
      return false;
    }
  });

  subdirs.sort((a, b) => {
    const na = extractChapterNumberString(a);
    const nb = extractChapterNumberString(b);
    if (na != null && nb != null) {
      const fa = parseFloat(na);
      const fb = parseFloat(nb);
      if (!Number.isNaN(fa) && !Number.isNaN(fb) && fa !== fb) return fa - fb;
      return na.localeCompare(nb, undefined, { numeric: true, sensitivity: 'base' });
    }
    if (na != null) return -1;
    if (nb != null) return 1;
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  });

  for (const sub of subdirs) {
    const subDir = path.join(abs, sub);
    const listed = listChapterImageFiles(subDir);
    if (listed.ok && Array.isArray(listed.files) && listed.files.length > 0) {
      for (const f of listed.files) {
        const fp = path.join(subDir, f);
        try {
          if (fs.existsSync(fp) && fs.statSync(fp).size > 0) {
            return path.resolve(fp);
          }
        } catch {
          /* */
        }
      }
    }
  }

  return null;
}

module.exports = { findLocalCoverInMangaDir, COVER_NAMES };
