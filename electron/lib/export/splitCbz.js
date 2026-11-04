const fs = require('fs');
const path = require('path');
const os = require('os');
const { finished } = require('stream/promises');
const archiver = require('archiver');
const { extractCbzWithEncoding } = require('../reader/extractCbzWithEncoding');

/**
 * Build the Part_File name for a given part index.
 * Pure function — exported for testing.
 *
 * @param {string} baseName       — base name (without .cbz)
 * @param {number} partIndex1Based — 1-based part index
 * @param {number} totalParts      — total number of parts
 * @returns {string}               — e.g. "MyManga - Part 01.cbz"
 */
function buildPartFileName(baseName, partIndex1Based, totalParts) {
  const width = Math.max(2, String(totalParts).length);
  const num = String(partIndex1Based).padStart(width, '0');
  return `${baseName} - Part ${num}.cbz`;
}

/**
 * Bin-pack chapters into parts such that each part's total bytes ≤ maxBytes,
 * except when a single chapter exceeds maxBytes (it gets its own part).
 * Chapters are never split across parts.
 * Pure function — exported for testing.
 *
 * @param {Array<{ name: string, totalBytes: number }>} chapters
 * @param {number} maxBytes
 * @returns {Array<string[]>}  — array of parts, each part is an array of chapter names
 */
function packChaptersIntoParts(chapters, maxBytes) {
  const parts = [];
  let currentPart = [];
  let currentSize = 0;

  for (const ch of chapters) {
    if (currentPart.length > 0 && currentSize + ch.totalBytes > maxBytes) {
      // Flush current part
      parts.push(currentPart);
      currentPart = [];
      currentSize = 0;
    }
    currentPart.push(ch.name);
    currentSize += ch.totalBytes;
  }

  if (currentPart.length > 0) {
    parts.push(currentPart);
  }

  return parts;
}

/**
 * Write a zip archive to outPath using the provided feedArchive callback.
 *
 * @param {string} outPath
 * @param {(archive: import('archiver').Archiver) => void} feedArchive
 */
async function runArchiveToFile(outPath, feedArchive) {
  const output = fs.createWriteStream(outPath);
  const archive = archiver('zip');
  archive.on('error', (err) => {
    output.destroy(err);
  });
  archive.pipe(output);
  feedArchive(archive);
  await archive.finalize();
  await finished(output);
}

/**
 * Recursively collect relative file paths under a directory.
 *
 * @param {string} dir
 * @param {string} [base]
 * @returns {string[]}
 */
function collectFilesRecursive(dir, base = '') {
  const results = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return results;
  }
  for (const entry of entries) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...collectFilesRecursive(path.join(dir, entry.name), rel));
    } else {
      results.push(rel);
    }
  }
  return results;
}

/**
 * Natural-sort comparator for file names (handles numeric sequences).
 * e.g. "page2.jpg" < "page10.jpg"
 */
function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Split a CBZ file into multiple Part_Files by:
 *   1. Extract all files from the CBZ
 *   2. Collect ALL image files recursively, sort by natural order
 *   3. Bin-pack images into parts by maxBytes (each image is one unit)
 *   4. Pack each group of images flat into a Part CBZ (no subdirs)
 *
 * @param {object} opts
 * @param {string}   opts.inputFile  — absolute path to source .cbz file
 * @param {string}   opts.outputDir  — destination directory
 * @param {number}   opts.maxBytes   — max bytes per Part_File
 * @param {(p: { done: number, total: number, label: string }) => void} [opts.onProgress]
 * @returns {Promise<{ ok: true, outputFiles: string[] } | { ok: false, error: string }>}
 */
async function splitCbz(opts) {
  const inputFile = String(opts.inputFile || '').trim();
  const outputDir = String(opts.outputDir || '').trim();
  const maxBytes = Number(opts.maxBytes);
  const onProgress = opts.onProgress;
  // Allow caller to override the base name used for Part files
  const baseName = String(opts.outputBaseName || '').trim() || path.basename(inputFile, path.extname(inputFile));

  const tempDir = path.join(
    os.tmpdir(),
    `splitCbz_${Date.now()}_${Math.random().toString(36).slice(2)}`
  );

  try {
    if (!fs.existsSync(inputFile)) {
      return { ok: false, error: `Không tìm thấy file: ${inputFile}` };
    }

    fs.mkdirSync(outputDir, { recursive: true });
    fs.mkdirSync(tempDir, { recursive: true });

    // 1. Extract
    try {
      await extractCbzWithEncoding(inputFile, tempDir);
    } catch (e) {
      return { ok: false, error: `Không giải nén được: ${String(e?.message || e)}` };
    }

    // 2. Collect ALL image files recursively, then natural-sort
    const imageExts = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.bmp']);
    const allRelPaths = collectFilesRecursive(tempDir);
    const imagePaths = allRelPaths
      .filter((f) => imageExts.has(path.extname(f).toLowerCase()))
      .sort(naturalCompare);

    if (imagePaths.length === 0) {
      return { ok: false, error: 'File CBZ không chứa ảnh nào.' };
    }

    // Build image metadata: { relPath, absPath, size }
    const images = imagePaths.map((relPath) => {
      const absPath = path.join(tempDir, relPath);
      let size = 0;
      try { size = fs.statSync(absPath).size; } catch (_) { /* ignore */ }
      return { relPath, absPath, size };
    });

    // 3. Bin-pack images into parts by maxBytes
    // Each image is one unit — never split an image across parts.
    // If a single image exceeds maxBytes, it gets its own part.
    const parts = []; // Array<Array<image>>
    let currentPart = [];
    let currentSize = 0;

    for (const img of images) {
      if (currentPart.length > 0 && currentSize + img.size > maxBytes) {
        parts.push(currentPart);
        currentPart = [];
        currentSize = 0;
      }
      currentPart.push(img);
      currentSize += img.size;
    }
    if (currentPart.length > 0) parts.push(currentPart);

    // 4. Pack each part into a flat CBZ (images at root, renamed sequentially)
    const totalParts = parts.length;
    const outputFiles = [];
    const total = images.length;
    let done = 0;

    onProgress?.({ done: 0, total, label: '' });

    // Compute global sequential index for renaming (so readers sort correctly)
    let globalIndex = 1;

    for (let i = 0; i < parts.length; i++) {
      const partImages = parts[i];
      const outFileName = buildPartFileName(baseName, i + 1, totalParts);
      const outPath = path.join(outputDir, outFileName);

      // Determine zero-pad width for this part's image numbering
      const padWidth = String(partImages.length).length;

      await runArchiveToFile(outPath, (archive) => {
        let localIndex = 1;
        for (const img of partImages) {
          const ext = path.extname(img.relPath).toLowerCase();
          const entryName = String(localIndex).padStart(padWidth, '0') + ext;
          archive.file(img.absPath, { name: entryName, store: true });
          done += 1;
          localIndex += 1;
          globalIndex += 1;
          onProgress?.({ done, total, label: outFileName });
        }
      });

      outputFiles.push(outPath);
    }

    return { ok: true, outputFiles };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) { /* ignore */ }
  }
}

module.exports = {
  splitCbz,
  buildPartFileName,
  packChaptersIntoParts,
};
