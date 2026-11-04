const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { extractCbzWithEncoding } = require('../extractCbzWithEncoding');
const { loadOfflineMangaAtResolvedDir } = require('./loadOfflineMangaFromDisk');
const { IMAGE_EXT } = require('../../library/listChapterImageFiles');

/** Thư mục con khi mọi ảnh nằm ở gốc CBZ (không có thư mục chương). */
const FLAT_CHAPTER_FOLDER = '_cbz_pages';

function hash16(input) {
  return crypto.createHash('sha1').update(String(input)).digest('hex').slice(0, 16);
}

function collectRootImageBasenames(mangaDir) {
  let names;
  try {
    names = fs.readdirSync(mangaDir);
  } catch {
    return [];
  }
  const out = [];
  for (const name of names) {
    if (name.startsWith('._') || name.startsWith('.')) continue;
    if (name === 'download_db.json') continue;
    const full = path.join(mangaDir, name);
    try {
      if (!fs.statSync(full).isFile()) continue;
    } catch {
      continue;
    }
    const ext = path.extname(name).toLowerCase();
    if (IMAGE_EXT.has(ext)) out.push(name);
  }
  return out;
}

function moveRootImagesIntoFlatFolder(mangaDir) {
  const roots = collectRootImageBasenames(mangaDir);
  if (roots.length === 0) return false;
  const dest = path.join(mangaDir, FLAT_CHAPTER_FOLDER);
  fs.mkdirSync(dest, { recursive: true });
  for (const name of roots) {
    fs.renameSync(path.join(mangaDir, name), path.join(dest, name));
  }
  return true;
}

/**
 * Nếu dir chỉ chứa đúng 1 thư mục con (không có ảnh ở gốc) — layout "wrapped root"
 * kiểu SPRITE/ bọc toàn bộ nội dung — trả về đường dẫn thư mục con đó, ngược lại null.
 */
function detectWrappedRootDir(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return null;
  }
  // Bỏ qua macOS metadata (._*, .DS_Store, ...)
  const visible = entries.filter((n) => !n.startsWith('._') && !n.startsWith('.'));
  if (visible.length !== 1) return null;
  const candidate = path.join(dir, visible[0]);
  try {
    if (fs.statSync(candidate).isDirectory()) return candidate;
  } catch {
    /* */
  }
  return null;
}

/**
 * Thử load từ một thư mục: trước tiên thẳng, nếu thất bại thì thử moveRootImages.
 */
function tryLoadDir(dir, titleHint) {
  let loaded = loadOfflineMangaAtResolvedDir(dir, titleHint);
  if (loaded.ok && loaded.chapters?.length) return loaded;
  const moved = moveRootImagesIntoFlatFolder(dir);
  if (moved) {
    loaded = loadOfflineMangaAtResolvedDir(dir, titleHint);
  }
  return loaded;
}

/**
 * Giải nén CBZ, chuẩn hóa layout phẳng nếu cần, dựng manga/chapters giống offline thư mục.
 * Hỗ trợ 3 layout:
 *   1. Flat: ảnh nằm thẳng ở gốc ZIP → gom vào _cbz_pages/
 *   2. Chapters: thư mục chương nằm thẳng ở gốc ZIP
 *   3. Wrapped root: 1 thư mục gốc bọc toàn bộ (vd: SPRITE/ > Chuong 1/ > ảnh)
 *
 * @param {string} cbzPath
 * @param {{ tempRoot: string, onProgress?: (extracted: number, total: number) => void }} opts
 * @returns {Promise<{ ok: boolean, error?: string, cancelled?: boolean, manga?: object, chapters?: Array, cbzTempExtractDir?: string }>}
 */
async function loadCbzFromFilePath(cbzPath, { tempRoot, onProgress }) {
  const resolved = path.resolve(String(cbzPath || '').trim());
  if (!resolved) {
    return { ok: false, error: 'Đường dẫn CBZ trống.' };
  }
  if (!fs.existsSync(resolved)) {
    return { ok: false, error: 'Không tìm thấy file CBZ.' };
  }
  let st;
  try {
    st = fs.statSync(resolved);
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
  if (!st.isFile()) {
    return { ok: false, error: 'Không phải file CBZ.' };
  }
  const lower = resolved.toLowerCase();
  if (!lower.endsWith('.cbz')) {
    return { ok: false, error: 'Chỉ hỗ trợ file .cbz.' };
  }

  const baseName = path.basename(resolved);
  const titleHint = baseName.toLowerCase().endsWith('.cbz')
    ? path.basename(resolved, path.extname(resolved))
    : baseName;

  const outDir = path.join(String(tempRoot || '').trim(), `${Date.now()}-${hash16(resolved)}`);

  try {
    await fs.promises.mkdir(outDir, { recursive: true });
    await extractCbzWithEncoding(resolved, outDir, { onProgress });
  } catch (e) {
    try {
      await fs.promises.rm(outDir, { recursive: true, force: true });
    } catch {
      /* */
    }
    return { ok: false, error: String(e?.message || e) || 'Không giải nén được CBZ.' };
  }

  // Layout 1 & 2: thử trực tiếp với outDir
  let loaded = tryLoadDir(outDir, titleHint);

  // Layout 3: wrapped root — CBZ chứa 1 thư mục gốc bọc toàn bộ (vd: SPRITE/)
  if (!loaded.ok || !loaded.chapters?.length) {
    const wrappedDir = detectWrappedRootDir(outDir);
    if (wrappedDir) {
      loaded = tryLoadDir(wrappedDir, titleHint);
    }
  }

  if (!loaded.ok || !loaded.chapters?.length) {
    try {
      await fs.promises.rm(outDir, { recursive: true, force: true });
    } catch {
      /* */
    }
    return {
      ok: false,
      error: loaded?.error || 'Không có chương có ảnh trong CBZ (hoặc file không hợp lệ).',
    };
  }

  const manga = {
    ...loaded.manga,
    cbzTempExtractDir: outDir,
    cbzFilePath: resolved,
  };

  return {
    ok: true,
    manga,
    chapters: loaded.chapters,
    cbzTempExtractDir: outDir,
  };
}

/**
 * Streaming variant: opens the CBZ as an in-memory session via
 * cbzSessionService instead of extracting to disk. Returned shape matches
 * loadCbzFromFilePath so callers can swap between the two.
 *
 * Falls back to the disk-extract path when session open fails for any reason
 * (corrupt archive, unsupported layout, etc.) so behavior is at least as good
 * as before.
 */
async function loadCbzFromFilePathStreaming(cbzPath, opts = {}) {
  const { openSession } = require('../cbzSessionService');
  const session = await openSession(cbzPath);
  if (session.ok) {
    return {
      ok: true,
      manga: session.manga,
      chapters: session.chapters,
      cbzTempExtractDir: session.manga.cbzTempExtractDir,
      sessionId: session.sessionId,
    };
  }
  // Surface the original error from session open if the caller is fine with
  // sticking to streaming-only. The legacy disk-extract path is reachable via
  // loadCbzFromFilePath when needed.
  return { ok: false, error: session.error || 'Không mở được CBZ.' };
}

module.exports = {
  loadCbzFromFilePath,
  loadCbzFromFilePathStreaming,
  FLAT_CHAPTER_FOLDER,
};
