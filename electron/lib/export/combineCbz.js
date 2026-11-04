const fs = require('fs');
const path = require('path');
const os = require('os');
const { finished } = require('stream/promises');
const archiver = require('archiver');
const { extractCbzWithEncoding } = require('../reader/extractCbzWithEncoding');

/**
 * Deduplicate an array of folder names by appending _2, _3, … for collisions.
 * Pure function — exported for testing.
 *
 * @param {string[]} names
 * @returns {string[]}
 */
function deduplicateFolderNames(names) {
  const seen = new Set();
  return names.map((name) => {
    let candidate = name;
    let n = 2;
    while (seen.has(candidate)) {
      candidate = `${name}_${n}`;
      n += 1;
    }
    seen.add(candidate);
    return candidate;
  });
}

/**
 * Ensure a file name ends with .cbz (case-insensitive append).
 * Pure function — exported for testing.
 *
 * @param {string} name
 * @returns {string}
 */
function normalizeCbzExtension(name) {
  if (typeof name === 'string' && name.toLowerCase().endsWith('.cbz')) {
    return name;
  }
  return (name || '') + '.cbz';
}

/**
 * Resolve the default output directory from the first input file path.
 * Pure function — exported for testing.
 *
 * @param {string} firstInputFile
 * @returns {string}
 */
function resolveDefaultOutputDir(firstInputFile) {
  return path.dirname(firstInputFile);
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
 * Natural-sort comparator for file names.
 */
function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Combine multiple CBZ files into a single flat CBZ file.
 * All images from all source CBZs are collected, natural-sorted per source file,
 * then concatenated in order and packed flat (no subdirs) with sequential numbering.
 *
 * @param {object} opts
 * @param {string[]} opts.inputFiles       — absolute paths to source .cbz files (≥ 2)
 * @param {string}   opts.outputDir        — destination directory
 * @param {string}   [opts.outputFileName] — output file name (without .cbz); auto if omitted
 * @param {(p: { done: number, total: number, label: string }) => void} [opts.onProgress]
 * @returns {Promise<{ ok: true, outputFile: string } | { ok: false, error: string }>}
 */
async function combineCbz(opts) {
  const inputFiles = Array.isArray(opts.inputFiles) ? opts.inputFiles : [];
  const outputDir = String(opts.outputDir || '').trim();
  const onProgress = opts.onProgress;

  let outputFileName = String(opts.outputFileName || '').trim();
  if (!outputFileName) {
    const firstBase = path.basename(inputFiles[0], path.extname(inputFiles[0]));
    outputFileName = `${firstBase}_combined`;
  }
  const outputFile = path.join(outputDir, normalizeCbzExtension(outputFileName));

  const tempDir = path.join(os.tmpdir(), `combineCbz_${Date.now()}_${Math.random().toString(36).slice(2)}`);

  try {
    for (const f of inputFiles) {
      if (!fs.existsSync(f)) {
        return { ok: false, error: `Không tìm thấy file: ${f}` };
      }
    }

    fs.mkdirSync(outputDir, { recursive: true });

    // Extract each CBZ into its own sub-temp dir, collect all images in order
    const imageExts = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.bmp']);
    const allImages = []; // [{ absPath, srcLabel }]

    for (let i = 0; i < inputFiles.length; i++) {
      const cbzPath = inputFiles[i];
      const srcLabel = path.basename(cbzPath, path.extname(cbzPath));
      const subDir = path.join(tempDir, `src_${i}`);
      fs.mkdirSync(subDir, { recursive: true });

      try {
        await extractCbzWithEncoding(cbzPath, subDir);
      } catch (e) {
        return { ok: false, error: `Không giải nén được: ${cbzPath} — ${String(e?.message || e)}` };
      }

      // Collect all image files from this source, natural-sort
      const relPaths = collectFilesRecursive(subDir)
        .filter((f) => imageExts.has(path.extname(f).toLowerCase()))
        .sort(naturalCompare);

      for (const relPath of relPaths) {
        allImages.push({ absPath: path.join(subDir, relPath), srcLabel });
      }
    }

    if (allImages.length === 0) {
      return { ok: false, error: 'Các file CBZ không chứa ảnh nào.' };
    }

    // Pack all images flat with global sequential numbering
    const total = allImages.length;
    const padWidth = String(total).length;
    let done = 0;

    onProgress?.({ done: 0, total, label: '' });

    await runArchiveToFile(outputFile, (archive) => {
      allImages.forEach((img, idx) => {
        const ext = path.extname(img.absPath).toLowerCase();
        const entryName = String(idx + 1).padStart(padWidth, '0') + ext;
        archive.file(img.absPath, { name: entryName, store: true });
        done += 1;
        onProgress?.({ done, total, label: img.srcLabel });
      });
    });

    return { ok: true, outputFile };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) { /* ignore */ }
  }
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

module.exports = {
  combineCbz,
  deduplicateFolderNames,
  normalizeCbzExtension,
  resolveDefaultOutputDir,
};
