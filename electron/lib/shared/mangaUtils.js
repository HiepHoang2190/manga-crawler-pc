const MAX_LENGTH_FOLDER_NAME = 255;

/** ASCII colon plus fullwidth / small / ratio colons that some volumes reject (EACCES/EINVAL). */
const COLON_LIKE_CHARS = /[:：﹕∶]/g;
/** Windows-illegal chars plus fullwidth lookalikes (／＼＊？＂＜＞｜). */
const WINDOWS_UNSAFE_CHARS = /[<>:"|?*\\/／＼＊？＂＜＞｜]/g;

/** Hệ thống tính NAME_MAX theo byte (UTF-8); cắt an toàn, không tách giữa byte ký tự. */
function truncateUtf8ToMaxBytes(str, maxBytes) {
  const buf = Buffer.from(str, 'utf8');
  if (buf.length <= maxBytes) return str;
  let end = maxBytes;
  while (end > 0 && (buf[end - 1] & 0xc0) === 0x80) end -= 1;
  return buf.subarray(0, end).toString('utf8');
}

function stripUnsafePathChars(originalString) {
  let folderName = String(originalString).replace(COLON_LIKE_CHARS, ' ').replace(/\s+/g, ' ');
  folderName = folderName.replace(WINDOWS_UNSAFE_CHARS, '');
  folderName = folderName.trim();
  // Windows không cho phép tên thư mục kết thúc bằng dấu chấm hoặc khoảng trắng
  return folderName.replace(/[\s.]+$/g, '');
}

function formatFolderName(originalString, maxLength = MAX_LENGTH_FOLDER_NAME) {
  if (originalString == null || originalString === '') return '';
  let folderName = stripUnsafePathChars(originalString);
  folderName = folderName.substring(0, Math.min(folderName.length, maxLength));
  const result = truncateUtf8ToMaxBytes(folderName, maxLength);
  // Đảm bảo sau khi truncate cũng không kết thúc bằng dấu chấm hoặc khoảng trắng
  return result.replace(/[\s.]+$/g, '');
}

function formatChapterTitle(title) {
  if (title == null) return '';
  let s = stripUnsafePathChars(String(title));
  s = s.substring(0, Math.min(s.length, MAX_LENGTH_FOLDER_NAME));
  const result = truncateUtf8ToMaxBytes(s, MAX_LENGTH_FOLDER_NAME);
  // Đảm bảo sau khi truncate cũng không kết thúc bằng dấu chấm hoặc khoảng trắng
  return result.replace(/[\s.]+$/g, '');
}

const DEFAULT_CHAPTER_FOLDER_FORMAT = {
  mode: 'numbered',
  prefix: 'Chap',
  padDigits: 3,
  layout: 'subfolder',
};

/**
 * Chuẩn hoá cài đặt thư mục chương (settings.json / IPC).
 * @param {object} [input]
 * @returns {{ mode: 'numbered'|'original', prefix: string, padDigits: number, layout: 'subfolder'|'flat' }}
 */
function normalizeChapterFolderFormat(input) {
  const m = input && typeof input === 'object' ? input : {};
  const mode = m.mode === 'original' ? 'original' : 'numbered';
  let prefix = typeof m.prefix === 'string' ? m.prefix.trim() : DEFAULT_CHAPTER_FOLDER_FORMAT.prefix;
  if (mode === 'numbered' && prefix === '') {
    prefix = DEFAULT_CHAPTER_FOLDER_FORMAT.prefix;
  }
  let pad = Number(m.padDigits);
  if (!Number.isFinite(pad)) pad = DEFAULT_CHAPTER_FOLDER_FORMAT.padDigits;
  const padDigits = Math.max(1, Math.min(Math.floor(pad), 5));
  const layout = m.layout === 'flat' ? 'flat' : 'subfolder';
  return { mode, prefix, padDigits, layout };
}

function isFlatChapterLayout(formatOptions) {
  return normalizeChapterFolderFormat(formatOptions).layout === 'flat';
}

/**
 * Trích chuỗi số chương (gồm thập phân nếu có), ưu tiên sau từ khoá chapter/chap/chương/...
 * Chinese titles like "[第2部] 第13话" must use 13 (话), not 2 (部 = volume/part).
 * @param {string|null|undefined} title
 * @returns {string|null}
 */
function extractChapterNumberString(title) {
  if (title == null || title === '') return null;
  const s = String(title);
  const afterKw =
    /(?:chapter|chapters|chương|chap(?:ter)?|ch\.|c\.)\s*[-#:]?\s*(\d+(?:\.\d+)?)/i;
  const m1 = s.match(afterKw);
  if (m1) return m1[1];
  // Prefer 第N话/話/章/回 over earlier 第N部 (volume) numbers
  const chineseChapter = /第\s*(\d+(?:\.\d+)?)\s*[话話章回]/;
  const mChinese = s.match(chineseChapter);
  if (mChinese) return mChinese[1];
  const hash = /#\s*(\d+(?:\.\d+)?)/;
  const m2 = s.match(hash);
  if (m2) return m2[1];
  const tail = /(?:^|[\s/\-–—])(\d+(?:\.\d+)?)\s*$/;
  const m3 = s.match(tail);
  if (m3) return m3[1];
  const first = s.match(/(\d+(?:\.\d+)?)/);
  if (first) return first[1];
  return null;
}

function padNumericChapterString(numStr, padDigits) {
  const t = String(numStr).trim();
  const m = /^(\d+)(\.\d+)?$/.exec(t);
  if (!m) return t;
  const intPart = m[1];
  const dec = m[2] || '';
  const padded = intPart.padStart(padDigits, '0');
  return padded + dec;
}

/**
 * Tên thư mục một chương trên đĩa (khác với khóa DB = formatChapterTitle).
 * @param {string|null|undefined} title
 * @param {object} [formatOptions]
 */
function formatChapterFolderName(title, formatOptions) {
  const opts = normalizeChapterFolderFormat(formatOptions);
  if (opts.mode === 'original') {
    return formatChapterTitle(title);
  }
  const raw = extractChapterNumberString(title);
  if (raw == null) {
    return formatChapterTitle(title);
  }
  const padded = padNumericChapterString(raw, opts.padDigits);
  const label = opts.prefix ? `${opts.prefix} ${padded}` : padded;
  return formatFolderName(label, MAX_LENGTH_FOLDER_NAME);
}

/**
 * Tiền tố tên file ảnh khi layout flat (vd. "Chap 001_").
 * @param {string|null|undefined} chapterTitle
 * @param {object} [formatOptions]
 */
function getFlatChapterImageNamePrefix(chapterTitle, formatOptions) {
  const label = formatChapterFolderName(chapterTitle, formatOptions);
  return label ? `${label}_` : '';
}

/**
 * Tên file ảnh một trang — subfolder: 001.jpg; flat: Chap 001_000.jpg
 * @param {string|null|undefined} chapterTitle
 * @param {number} pageIndex — 1-based
 * @param {string} ext — không gồm dấu chấm
 * @param {object} [formatOptions]
 */
function formatChapterPageFileName(chapterTitle, pageIndex, ext, formatOptions) {
  const safeExt = String(ext || 'jpg').replace(/^\./, '').trim() || 'jpg';
  const idx = Math.max(1, Math.floor(Number(pageIndex) || 1));
  if (isFlatChapterLayout(formatOptions)) {
    const label = formatChapterFolderName(chapterTitle, formatOptions);
    const pagePart = String(idx - 1).padStart(3, '0');
    const base = formatFolderName(`${label}_${pagePart}`, MAX_LENGTH_FOLDER_NAME);
    return `${base}.${safeExt}`;
  }
  return `${String(idx).padStart(3, '0')}.${safeExt}`;
}

/**
 * So sánh tiêu đề chương khi xuất file (PDF/CBZ) — số chương tăng dần.
 * @param {string|null|undefined} titleA
 * @param {string|null|undefined} titleB
 * @returns {number}
 */
function compareChapterTitlesForExport(titleA, titleB) {
  const na = extractChapterNumberString(titleA);
  const nb = extractChapterNumberString(titleB);
  if (na != null && nb != null) {
    const fa = parseFloat(na);
    const fb = parseFloat(nb);
    if (!Number.isNaN(fa) && !Number.isNaN(fb) && fa !== fb) return fa - fb;
    const c = na.localeCompare(nb, undefined, { numeric: true, sensitivity: 'base' });
    if (c !== 0) return c;
  }
  if (na != null && nb == null) return -1;
  if (na == null && nb != null) return 1;
  return String(titleA || '').localeCompare(String(titleB || ''), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

/**
 * @param {Array<{ title?: string }>} chapters
 * @returns {Array<{ title?: string }>}
 */
function sortChaptersForExport(chapters) {
  if (!Array.isArray(chapters)) return [];
  return [...chapters].sort((a, b) => compareChapterTitlesForExport(a?.title, b?.title));
}

/**
 * Tên thư mục chương trong CBZ — prefix số thứ tự xuất để máy đọc sort đúng (strcmp).
 * @param {string|null|undefined} title
 * @param {number} chapterIndex1Based
 * @param {number} totalChapters
 * @param {object} [formatOptions]
 */
function formatExportZipChapterFolderName(title, chapterIndex1Based, totalChapters, formatOptions) {
  const total = Math.max(1, Math.floor(Number(totalChapters) || 1));
  const idx = Math.max(1, Math.floor(Number(chapterIndex1Based) || 1));
  const seqWidth = Math.max(3, String(total).length);
  const seq = String(idx).padStart(seqWidth, '0');
  const label =
    formatChapterFolderName(title, formatOptions) || formatChapterTitle(title) || 'chapter';
  return formatFolderName(`${seq} - ${label}`, MAX_LENGTH_FOLDER_NAME) || seq;
}

module.exports = {
  MAX_LENGTH_FOLDER_NAME,
  DEFAULT_CHAPTER_FOLDER_FORMAT,
  formatFolderName,
  formatChapterTitle,
  normalizeChapterFolderFormat,
  formatChapterFolderName,
  extractChapterNumberString,
  isFlatChapterLayout,
  getFlatChapterImageNamePrefix,
  formatChapterPageFileName,
  compareChapterTitlesForExport,
  sortChaptersForExport,
  formatExportZipChapterFolderName,
};
