/**
 * Trùng logic với electron/lib/mangaUtils.js (formatChapterFolderName / formatChapterTitle / …).
 * Dùng trong UI (Vite) — giữ đồng bộ khi đổi quy tắc đặt tên thư mục.
 */
const MAX_LENGTH_FOLDER_NAME = 255;

/** ASCII colon plus fullwidth / small / ratio colons that some volumes reject (EACCES/EINVAL). */
const COLON_LIKE_CHARS = /[:：﹕∶]/g;
/** Windows-illegal chars plus fullwidth lookalikes (／＼＊？＂＜＞｜). */
const WINDOWS_UNSAFE_CHARS = /[<>:"|?*\\/／＼＊？＂＜＞｜]/g;

function truncateUtf8ToMaxBytes(str, maxBytes) {
  const enc = new TextEncoder();
  const buf = enc.encode(str);
  if (buf.length <= maxBytes) return str;
  let end = maxBytes;
  while (end > 0 && (buf[end - 1] & 0xc0) === 0x80) end -= 1;
  return new TextDecoder().decode(buf.slice(0, end));
}

function stripUnsafePathChars(originalString) {
  let folderName = String(originalString).replace(COLON_LIKE_CHARS, ' ').replace(/\s+/g, ' ');
  folderName = folderName.replace(WINDOWS_UNSAFE_CHARS, '');
  folderName = folderName.trim();
  // Windows does not allow folder names ending in dot or space
  return folderName.replace(/[\s.]+$/g, '');
}

export function formatFolderName(originalString, maxLength = MAX_LENGTH_FOLDER_NAME) {
  if (originalString == null || originalString === '') return '';
  let folderName = stripUnsafePathChars(originalString);
  folderName = folderName.substring(0, Math.min(folderName.length, maxLength));
  const result = truncateUtf8ToMaxBytes(folderName, maxLength);
  return result.replace(/[\s.]+$/g, '');
}

export function formatChapterTitle(title) {
  if (title == null) return '';
  let s = stripUnsafePathChars(String(title));
  s = s.substring(0, Math.min(s.length, MAX_LENGTH_FOLDER_NAME));
  const result = truncateUtf8ToMaxBytes(s, MAX_LENGTH_FOLDER_NAME);
  return result.replace(/[\s.]+$/g, '');
}

const DEFAULT_CHAPTER_FOLDER_FORMAT = {
  mode: 'numbered',
  prefix: 'Chap',
  padDigits: 3,
  layout: 'subfolder',
};

export function normalizeChapterFolderFormat(input) {
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

export function isFlatChapterLayout(formatOptions) {
  return normalizeChapterFolderFormat(formatOptions).layout === 'flat';
}

export function extractChapterNumberString(title) {
  if (title == null || title === '') return null;
  const s = String(title);
  const afterKw =
    /(?:chapter|chapters|chương|chap(?:ter)?|ch\.|c\.)\s*[-#:]?\s*(\d+(?:\.\d+)?)/i;
  const m1 = s.match(afterKw);
  if (m1) return m1[1];
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
 * Tên thư mục chương trên đĩa (khớp khi tải / mở folder).
 */
export function formatChapterFolderName(title, formatOptions) {
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

export function getFlatChapterImageNamePrefix(chapterTitle, formatOptions) {
  const label = formatChapterFolderName(chapterTitle, formatOptions);
  return label ? `${label}_` : '';
}

export function formatChapterPageFileName(chapterTitle, pageIndex, ext, formatOptions) {
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
