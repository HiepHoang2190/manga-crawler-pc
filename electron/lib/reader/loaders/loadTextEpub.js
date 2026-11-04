'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const extract = require('extract-zip');

function hash16(input) {
  return crypto.createHash('sha1').update(String(input)).digest('hex').slice(0, 16);
}

/**
 * Load EPUB metadata and spine chapter list.
 *
 * @param {string} absolutePath
 * @param {{ tempRoot: string }} opts
 * @returns {Promise<{ ok: boolean, title?: string, chapters?: Array<{id: string, title: string, href: string}>, coverDataUrl?: string|null, extractDir?: string, error?: string }>}
 */
async function loadTextEpubFromFilePath(absolutePath, { tempRoot }) {
  const resolved = path.resolve(String(absolutePath || '').trim());
  const baseName = path.basename(resolved);

  // Validate file exists and is a file
  let st;
  try {
    st = fs.statSync(resolved);
  } catch {
    return { ok: false, error: `${baseName}: File not found.` };
  }

  if (!st.isFile()) {
    return { ok: false, error: `${baseName}: Not a file.` };
  }

  const outDir = path.join(String(tempRoot || '').trim(), `${Date.now()}-${hash16(resolved)}`);

  // Extract EPUB (ZIP) to temp dir
  try {
    await fs.promises.mkdir(outDir, { recursive: true });
    await extract(resolved, { dir: outDir });
  } catch (e) {
    try { await fs.promises.rm(outDir, { recursive: true, force: true }); } catch { /* */ }
    return { ok: false, error: `${baseName}: ${e.message || 'Failed to extract EPUB.'}` };
  }

  // Parse EPUB with epub2 (reads from ZIP in-memory for metadata/spine)
  let epub;
  try {
    const { EPub } = require('epub2');
    epub = await EPub.createAsync(resolved);
  } catch (e) {
    try { await fs.promises.rm(outDir, { recursive: true, force: true }); } catch { /* */ }
    const msg = String(e?.message || e);
    if (
      msg.toLowerCase().includes('no opf') ||
      msg.toLowerCase().includes('no rootfile') ||
      msg.toLowerCase().includes('no container') ||
      msg.toLowerCase().includes('rootfile not found') ||
      msg.toLowerCase().includes('empty rootfile')
    ) {
      return { ok: false, error: `${baseName}: No OPF file found in EPUB.` };
    }
    return { ok: false, error: `${baseName}: Cannot parse OPF: ${msg}` };
  }

  // Verify spine exists
  if (!epub.spine || !epub.spine.contents) {
    try { await fs.promises.rm(outDir, { recursive: true, force: true }); } catch { /* */ }
    return { ok: false, error: `${baseName}: No OPF file found in EPUB.` };
  }

  // Build chapters from spine (XHTML/HTML items only)
  const manifest = epub.manifest || {};
  const spineContents = epub.spine.contents;
  const chapters = [];

  for (let i = 0; i < spineContents.length; i++) {
    const spineItem = spineContents[i];
    const id = spineItem.id || '';
    const manifestItem = manifest[id] || spineItem;

    const mediaType = (manifestItem['media-type'] || manifestItem.mediaType || '').toLowerCase().trim();
    // Skip non-text spine items (images, etc.)
    if (
      mediaType !== '' &&
      mediaType !== 'application/xhtml+xml' &&
      mediaType !== 'text/html'
    ) {
      continue;
    }

    const href = manifestItem.href || spineItem.href || '';
    if (!id || !href) continue;

    // Try to get title from TOC
    let title = spineItem.title || manifestItem.title || '';
    if (!title || title.trim() === '') {
      title = `Chapter ${chapters.length + 1}`;
    }

    chapters.push({ id, title: title.trim(), href });
  }

  // Get cover data URL
  let coverDataUrl = null;
  try {
    const coverId = epub.metadata && epub.metadata.cover;
    if (coverId) {
      const result = await epub.getImageAsync(coverId);
      // getImageAsync returns [buffer, mimeType] (multiArgs: true)
      const coverBuffer = result[0];
      const mimeType = result[1];
      if (coverBuffer && coverBuffer.length > 0) {
        const mime = mimeType || 'image/jpeg';
        coverDataUrl = `data:${mime};base64,${coverBuffer.toString('base64')}`;
      }
    }
  } catch {
    // Cover is optional — silently ignore errors
    coverDataUrl = null;
  }

  const title =
    (epub.metadata && epub.metadata.title) ||
    path.basename(resolved, path.extname(resolved));

  return {
    ok: true,
    title,
    chapters,
    coverDataUrl,
    extractDir: outDir,
  };
}

/**
 * Read a single spine item's XHTML content from the extracted temp dir.
 *
 * @param {string} extractDir  — temp dir from loadTextEpubFromFilePath
 * @param {string} spineItemHref  — href as stored in chapters[].href (relative to OPF dir, already resolved by epub2)
 * @returns {Promise<{ ok: boolean, html?: string, error?: string }>}
 */
async function readSpineItem(extractDir, spineItemHref) {
  if (!extractDir || !spineItemHref) {
    return { ok: false, error: `Spine item not found: ${spineItemHref}` };
  }

  // epub2 stores hrefs relative to the OPF file's directory, already joined with the path prefix.
  // The extracted ZIP preserves the same directory structure.
  // Try the href directly under extractDir first, then search by basename.
  const candidates = [
    path.join(extractDir, spineItemHref),
  ];

  // Also search recursively by basename as a fallback
  const basename = path.basename(spineItemHref);
  const found = findFileInDir(extractDir, basename);
  for (const f of found) {
    if (!candidates.includes(f)) candidates.push(f);
  }

  let filePath = null;
  for (const candidate of candidates) {
    try {
      const s = fs.statSync(candidate);
      if (s.isFile()) {
        filePath = candidate;
        break;
      }
    } catch {
      // not found at this path
    }
  }

  if (!filePath) {
    return { ok: false, error: `Spine item not found: ${spineItemHref}` };
  }

  try {
    const html = await fs.promises.readFile(filePath, 'utf8');
    return { ok: true, html };
  } catch {
    return { ok: false, error: `Spine item not found: ${spineItemHref}` };
  }
}

/**
 * Recursively find all files with a given basename under a directory.
 * @param {string} dir
 * @param {string} basename
 * @returns {string[]}
 */
function findFileInDir(dir, basename) {
  const results = [];
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return results;
  }
  for (const name of entries) {
    if (name.startsWith('.')) continue;
    const full = path.join(dir, name);
    let st;
    try { st = fs.statSync(full); } catch { continue; }
    if (st.isFile() && name === basename) {
      results.push(full);
    } else if (st.isDirectory()) {
      results.push(...findFileInDir(full, basename));
    }
  }
  return results;
}

module.exports = { loadTextEpubFromFilePath, readSpineItem };
