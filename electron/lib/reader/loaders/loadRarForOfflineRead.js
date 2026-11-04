const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { loadOfflineMangaAtResolvedDir } = require('./loadOfflineMangaFromDisk');
const { IMAGE_EXT } = require('../../library/listChapterImageFiles');

/** Thư mục con khi mọi ảnh nằm ở gốc RAR (không có thư mục chương). */
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
 * Giải nén RAR/CBR, chuẩn hóa layout phẳng nếu cần, dựng manga/chapters giống offline thư mục.
 * @param {string} rarPath
 * @param {{ tempRoot: string }} opts
 * @returns {Promise<{ ok: boolean, error?: string, manga?: object, chapters?: Array, cbzTempExtractDir?: string }>}
 */
async function loadRarFromFilePath(rarPath, { tempRoot }) {
  const resolved = path.resolve(String(rarPath || '').trim());
  const baseName = path.basename(resolved);

  if (!resolved) {
    return { ok: false, error: 'Đường dẫn RAR trống.' };
  }

  if (!fs.existsSync(resolved)) {
    return { ok: false, error: `${baseName}: File not found.` };
  }

  let st;
  try {
    st = fs.statSync(resolved);
  } catch (e) {
    return { ok: false, error: `${baseName}: ${String(e?.message || e)}` };
  }

  if (!st.isFile()) {
    return { ok: false, error: `${baseName}: Not a file.` };
  }

  const lower = resolved.toLowerCase();
  if (!lower.endsWith('.cbr') && !lower.endsWith('.rar')) {
    return { ok: false, error: `${baseName}: Only .cbr and .rar files are supported.` };
  }

  const titleHint = path.basename(resolved, path.extname(resolved));
  const outDir = path.join(String(tempRoot || '').trim(), `${Date.now()}-${hash16(resolved)}`);

  try {
    await fs.promises.mkdir(outDir, { recursive: true });

    // Use CJS require for node-unrar-js (main field points to CJS dist)
    const { createExtractorFromFile } = require('node-unrar-js');

    const extractor = await createExtractorFromFile({
      filepath: resolved,
      targetPath: outDir,
    });

    // First pass: scan file list to detect password-protected entries
    const list = extractor.getFileList();
    // Must consume the iterator fully to avoid memory leak
    const fileHeaders = [...list.fileHeaders];

    const hasEncrypted = fileHeaders.some(
      (fh) => fh.flags && fh.flags.encrypted === true,
    );

    if (hasEncrypted) {
      try {
        await fs.promises.rm(outDir, { recursive: true, force: true });
      } catch {
        /* non-fatal */
      }
      return { ok: false, error: `${baseName}: RAR file is password-protected.` };
    }

    // Extract all files
    const extracted = extractor.extract({});
    // Must consume the iterator fully
    for (const _file of extracted.files) {
      // Iterating triggers extraction to disk (targetPath)
    }
  } catch (e) {
    try {
      await fs.promises.rm(outDir, { recursive: true, force: true });
    } catch {
      /* non-fatal */
    }
    const msg = String(e?.message || e) || 'RAR extraction failed.';
    // Check for password-related errors from the library
    if (
      msg.toLowerCase().includes('password') ||
      msg.toLowerCase().includes('missing_password') ||
      msg.toLowerCase().includes('bad_password') ||
      (e?.reason && (e.reason === 'ERAR_MISSING_PASSWORD' || e.reason === 'ERAR_BAD_PASSWORD'))
    ) {
      return { ok: false, error: `${baseName}: RAR file is password-protected.` };
    }
    return { ok: false, error: `${baseName}: ${msg}` };
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
      /* non-fatal */
    }
    return {
      ok: false,
      error: loaded?.error
        ? `${baseName}: ${loaded.error}`
        : `${baseName}: No image chapters found in RAR (or invalid file).`,
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
  loadRarFromFilePath,
  FLAT_CHAPTER_FOLDER,
};
