'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const extract = require('extract-zip');
const cheerio = require('cheerio');
const { loadOfflineMangaAtResolvedDir } = require('./loadOfflineMangaFromDisk');

/** Flat chapter folder name for EPUB pages */
const EPUB_PAGES_FOLDER = '_epub_pages';

/** Image media types recognised in OPF manifests */
const IMAGE_MEDIA_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
]);

function hash16(input) {
  return crypto.createHash('sha1').update(String(input)).digest('hex').slice(0, 16);
}

/**
 * Recursively find the first *.opf file under a directory.
 * @param {string} dir
 * @returns {string|null} absolute path to the OPF file, or null
 */
function findOpfFile(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return null;
  }
  for (const name of entries) {
    if (name.startsWith('.')) continue;
    const full = path.join(dir, name);
    let st;
    try {
      st = fs.statSync(full);
    } catch {
      continue;
    }
    if (st.isFile() && name.toLowerCase().endsWith('.opf')) {
      return full;
    }
    if (st.isDirectory()) {
      const found = findOpfFile(full);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Parse the OPF file and return an ordered list of resolved image paths.
 * @param {string} opfPath  — absolute path to the .opf file
 * @param {string} extractDir — root of the extracted EPUB
 * @returns {{ ok: boolean, images?: string[], error?: string }}
 */
function parseOpfSpine(opfPath, extractDir) {
  let xml;
  try {
    xml = fs.readFileSync(opfPath, 'utf8');
  } catch (e) {
    return { ok: false, error: `Cannot read OPF: ${e.message}` };
  }

  let $;
  try {
    $ = cheerio.load(xml, { xmlMode: true });
  } catch (e) {
    return { ok: false, error: `Cannot parse OPF: ${e.message}` };
  }

  const opfDir = path.dirname(opfPath);

  // Build manifest: id → { href (absolute), mediaType }
  const manifest = new Map();
  $('manifest item').each((_, el) => {
    const id = $(el).attr('id');
    const href = $(el).attr('href');
    const mediaType = ($(el).attr('media-type') || '').toLowerCase().trim();
    if (id && href) {
      const absHref = path.resolve(opfDir, href);
      manifest.set(id, { absHref, mediaType });
    }
  });

  if (manifest.size === 0) {
    return { ok: false, error: 'OPF manifest is empty or missing.' };
  }

  // Walk spine in order
  const images = [];
  $('spine itemref').each((_, el) => {
    const idref = $(el).attr('idref');
    if (!idref) return;
    const item = manifest.get(idref);
    if (!item) return;

    const { absHref, mediaType } = item;

    if (IMAGE_MEDIA_TYPES.has(mediaType)) {
      // Direct image spine item
      if (fs.existsSync(absHref)) {
        images.push(absHref);
      }
    } else if (
      mediaType === 'application/xhtml+xml' ||
      mediaType === 'text/html' ||
      mediaType === ''
    ) {
      // XHTML page — extract the single <img src>
      let xhtml;
      try {
        xhtml = fs.readFileSync(absHref, 'utf8');
      } catch {
        return; // skip unreadable XHTML
      }
      let $x;
      try {
        $x = cheerio.load(xhtml, { xmlMode: false });
      } catch {
        return;
      }
      const imgEl = $x('img').first();
      const src = imgEl.attr('src');
      if (!src) return;
      // src is relative to the XHTML file's directory
      const xhtmlDir = path.dirname(absHref);
      const imgAbs = path.resolve(xhtmlDir, src);
      if (fs.existsSync(imgAbs)) {
        images.push(imgAbs);
      }
    }
  });

  return { ok: true, images };
}

/**
 * Zero-pad a number to at least 3 digits.
 * @param {number} n
 * @returns {string}
 */
function pad3(n) {
  return String(n).padStart(3, '0');
}

/**
 * Extract an EPUB file, parse its OPF spine, copy images into a flat
 * `_epub_pages/` subfolder, and return a manga/chapters structure.
 *
 * @param {string} epubPath
 * @param {{ tempRoot: string }} opts
 * @returns {Promise<{ ok: boolean, manga?: object, chapters?: Array, cbzTempExtractDir?: string, error?: string }>}
 */
async function loadEpubFromFilePath(epubPath, { tempRoot }) {
  const resolved = path.resolve(String(epubPath || '').trim());
  const baseName = path.basename(resolved);

  // --- Validate ---
  if (!resolved) {
    return { ok: false, error: 'EPUB path is empty.' };
  }
  if (!fs.existsSync(resolved)) {
    return { ok: false, error: `${baseName}: File not found.` };
  }
  let st;
  try {
    st = fs.statSync(resolved);
  } catch (e) {
    return { ok: false, error: `${baseName}: ${e.message}` };
  }
  if (!st.isFile()) {
    return { ok: false, error: `${baseName}: Not a file.` };
  }
  if (!resolved.toLowerCase().endsWith('.epub')) {
    return { ok: false, error: `${baseName}: Only .epub files are supported.` };
  }

  const titleHint = path.basename(resolved, path.extname(resolved));
  const outDir = path.join(String(tempRoot || '').trim(), `${Date.now()}-${hash16(resolved)}`);

  // --- Extract EPUB (ZIP) ---
  try {
    await fs.promises.mkdir(outDir, { recursive: true });
    await extract(resolved, { dir: outDir });
  } catch (e) {
    try { await fs.promises.rm(outDir, { recursive: true, force: true }); } catch { /* */ }
    return { ok: false, error: `${baseName}: ${e.message || 'Failed to extract EPUB.'}` };
  }

  // --- Find and parse OPF ---
  const opfPath = findOpfFile(outDir);
  if (!opfPath) {
    try { await fs.promises.rm(outDir, { recursive: true, force: true }); } catch { /* */ }
    return { ok: false, error: `${baseName}: No OPF file found in EPUB.` };
  }

  const parsed = parseOpfSpine(opfPath, outDir);
  if (!parsed.ok) {
    try { await fs.promises.rm(outDir, { recursive: true, force: true }); } catch { /* */ }
    return { ok: false, error: `${baseName}: ${parsed.error}` };
  }

  const { images } = parsed;

  if (!images || images.length === 0) {
    try { await fs.promises.rm(outDir, { recursive: true, force: true }); } catch { /* */ }
    return { ok: false, error: `${baseName}: No images found in EPUB.` };
  }

  // --- Copy images into flat _epub_pages/ subfolder ---
  const pagesDir = path.join(outDir, EPUB_PAGES_FOLDER);
  try {
    await fs.promises.mkdir(pagesDir, { recursive: true });
  } catch (e) {
    try { await fs.promises.rm(outDir, { recursive: true, force: true }); } catch { /* */ }
    return { ok: false, error: `${baseName}: Failed to create pages folder: ${e.message}` };
  }

  for (let i = 0; i < images.length; i++) {
    const srcImg = images[i];
    const ext = path.extname(srcImg) || '.jpg';
    const destName = `${pad3(i + 1)}${ext}`;
    const destPath = path.join(pagesDir, destName);
    try {
      await fs.promises.copyFile(srcImg, destPath);
    } catch (e) {
      try { await fs.promises.rm(outDir, { recursive: true, force: true }); } catch { /* */ }
      return { ok: false, error: `${baseName}: Failed to copy image ${path.basename(srcImg)}: ${e.message}` };
    }
  }

  // --- Load manga structure ---
  const loaded = loadOfflineMangaAtResolvedDir(outDir, titleHint);

  if (!loaded.ok || !loaded.chapters?.length) {
    try { await fs.promises.rm(outDir, { recursive: true, force: true }); } catch { /* */ }
    return {
      ok: false,
      error: loaded?.error
        ? `${baseName}: ${loaded.error}`
        : `${baseName}: No images found in EPUB.`,
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
  loadEpubFromFilePath,
  EPUB_PAGES_FOLDER,
};
