const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { extractCbzWithEncoding } = require('../extractCbzWithEncoding');
const { loadOfflineMangaAtResolvedDir } = require('./loadOfflineMangaFromDisk');
const { IMAGE_EXT } = require('../../library/listChapterImageFiles');

/** Thư mục con khi mọi ảnh nằm ở gốc ZIP (không có thư mục chương). */
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
 * Giải nén ZIP, chuẩn hóa layout phẳng nếu cần, dựng manga/chapters giống offline thư mục.
 * @param {string} zipPath
 * @param {{ tempRoot: string }} opts
 * @returns {Promise<{ ok: boolean, error?: string, cancelled?: boolean, manga?: object, chapters?: Array, cbzTempExtractDir?: string }>}
 */
async function loadZipFromFilePath(zipPath, { tempRoot }) {
  const resolved = path.resolve(String(zipPath || '').trim());
  if (!resolved) {
    return { ok: false, error: 'Đường dẫn ZIP trống.' };
  }

  const baseName = path.basename(resolved);

  if (!fs.existsSync(resolved)) {
    return { ok: false, error: `${baseName}: Không tìm thấy file ZIP.` };
  }
  let st;
  try {
    st = fs.statSync(resolved);
  } catch (e) {
    return { ok: false, error: `${baseName}: ${String(e?.message || e)}` };
  }
  if (!st.isFile()) {
    return { ok: false, error: `${baseName}: Không phải file ZIP.` };
  }
  const lower = resolved.toLowerCase();
  if (!lower.endsWith('.zip')) {
    return { ok: false, error: `${baseName}: Chỉ hỗ trợ file .zip.` };
  }

  const titleHint = path.basename(resolved, path.extname(resolved));
  const outDir = path.join(String(tempRoot || '').trim(), `${Date.now()}-${hash16(resolved)}`);

  try {
    await fs.promises.mkdir(outDir, { recursive: true });
    await extractCbzWithEncoding(resolved, outDir);
  } catch (e) {
    try {
      await fs.promises.rm(outDir, { recursive: true, force: true });
    } catch {
      /* */
    }
    return { ok: false, error: `${baseName}: ${String(e?.message || e) || 'Không giải nén được ZIP.'}` };
  }

  let loaded = loadOfflineMangaAtResolvedDir(outDir, titleHint);
  if (!loaded.ok || !loaded.chapters?.length) {
    const moved = moveRootImagesIntoFlatFolder(outDir);
    if (moved) {
      loaded = loadOfflineMangaAtResolvedDir(outDir, titleHint);
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
      error: loaded?.error
        ? `${baseName}: ${loaded.error}`
        : `${baseName}: Không có chương có ảnh trong ZIP (hoặc file không hợp lệ).`,
    };
  }

  const manga = {
    ...loaded.manga,
    cbzTempExtractDir: outDir,
  };

  return {
    ok: true,
    manga,
    chapters: loaded.chapters,
    cbzTempExtractDir: outDir,
  };
}

module.exports = {
  loadZipFromFilePath,
  FLAT_CHAPTER_FOLDER,
};
