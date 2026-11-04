'use strict';

const fs = require('fs');
const path = require('path');
const fg = require('fast-glob');

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const IMAGE_GLOB = '*.{jpg,jpeg,png,webp}';
const IMAGE_GLOB_REC = '**/*.{jpg,jpeg,png,webp}';

let _sharpCache;
function getSharp() {
  if (_sharpCache === undefined) {
    try { _sharpCache = require('sharp'); } catch { _sharpCache = null; }
  }
  return _sharpCache;
}

function normalizeExt(ext) {
  const e = String(ext || '').toLowerCase();
  return e.startsWith('.') ? e : `.${e}`;
}

function isCompressibleImage(ext) {
  return IMAGE_EXTS.has(normalizeExt(ext));
}

/**
 * Scan a folder or file list for compressible images.
 * Returns { ok, images: [{ absolutePath, relativePath, fileName, ext, originalSize }], sourceDir }
 */
async function scanCompressibleImages({
  sourceDir,
  sourceFiles,
  includeSubfolders = false,
} = {}) {
  const isFilesMode = Array.isArray(sourceFiles) && sourceFiles.length > 0;
  const dirValue = String(sourceDir || '').trim();

  if (!isFilesMode && !dirValue) {
    return { ok: false, error: 'No source specified', images: [] };
  }

  let found = [];
  let root = '';

  if (isFilesMode) {
    found = sourceFiles.filter((f) => typeof f === 'string' && fs.existsSync(f));
    root = dirValue ? path.resolve(dirValue) : '';
  } else {
    root = path.resolve(dirValue);
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
      return { ok: false, error: 'Invalid source directory', images: [] };
    }
    const pattern = includeSubfolders ? IMAGE_GLOB_REC : IMAGE_GLOB;
    found = await fg.glob(pattern, {
      cwd: root,
      onlyFiles: true,
      caseSensitiveMatch: false,
      absolute: true,
      dot: false,
      deep: includeSubfolders ? 10 : 1,
    });
  }

  const images = [];
  const sortedPaths = found.sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  );
  for (const absolutePath of sortedPaths) {
    const ext = path.extname(absolutePath);
    if (!isCompressibleImage(ext)) continue;
    let size = 0;
    try {
      const stat = fs.statSync(absolutePath);
      size = stat.size;
    } catch {
      // skip files we can't stat
      continue;
    }
    const relativePath = isFilesMode
      ? (root ? path.relative(root, absolutePath) : path.basename(absolutePath))
      : path.relative(root, absolutePath);
    images.push({
      absolutePath,
      relativePath,
      fileName: path.basename(absolutePath),
      ext: normalizeExt(ext),
      originalSize: size,
    });
  }

  return { ok: true, images, sourceDir: root };
}

/**
 * Build output path for a compressed image.
 */
function buildCompressOutputPath({ absolutePath, relativePath, sourceDir, inPlace, outputDir }) {
  if (inPlace) return absolutePath;
  if (!outputDir) return absolutePath;

  const fileName = path.basename(absolutePath);
  if (!sourceDir) return path.join(outputDir, fileName);

  const relDir = path.dirname(relativePath);
  const outDir = relDir === '.' ? outputDir : path.join(outputDir, relDir);
  return path.join(outDir, fileName);
}

/**
 * Compress a single image using sharp.
 * Returns { ok, outputPath, originalSize, compressedSize, skipped }
 */
async function compressSingleImage({
  inputPath,
  outputPath,
  quality = 90,
  resizePercent = 100,
} = {}) {
  const sharp = getSharp();
  if (!sharp) throw new Error('Sharp module not available');

  const inputStat = fs.statSync(inputPath);
  const originalSize = inputStat.size;
  const ext = normalizeExt(path.extname(inputPath));

  // Ensure output directory exists
  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Read to buffer first to prevent sharp from memory-mapping the file on Windows,
  // which locks the file and prevents overwrite/rename.
  const inputBuffer = await fs.promises.readFile(inputPath);
  let pipeline = sharp(inputBuffer);

  // Optional resize
  if (resizePercent > 0 && resizePercent < 100) {
    const metadata = await sharp(inputBuffer).metadata();
    if (metadata.width) {
      const newWidth = Math.round(metadata.width * resizePercent / 100);
      pipeline = pipeline.resize({ width: newWidth, withoutEnlargement: true });
    }
  }

  // Use temp file for in-place writes to avoid corruption
  const isInPlace = path.resolve(inputPath) === path.resolve(outputPath);
  const tempPath = isInPlace ? `${outputPath}.tmp_compress` : outputPath;

  // Format-specific encoding with optimized settings
  if (ext === '.jpg' || ext === '.jpeg') {
    await pipeline.jpeg({ quality, mozjpeg: true }).toFile(tempPath);
  } else if (ext === '.png') {
    // PNG is lossless — quality slider controls compressionLevel effort
    // compressionLevel 9 = max compression, adaptiveFiltering for better ratios
    await pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(tempPath);
  } else if (ext === '.webp') {
    await pipeline.webp({ quality }).toFile(tempPath);
  } else {
    throw new Error(`Unsupported format: ${ext}`);
  }

  const compressedStat = fs.statSync(tempPath);
  const compressedSize = compressedStat.size;

  // If compressed is larger or equal, keep original
  if (compressedSize >= originalSize) {
    if (isInPlace) {
      // Remove temp file, original stays untouched
      fs.unlinkSync(tempPath);
    } else {
      // Copy original to output instead of the bloated compressed version
      fs.unlinkSync(tempPath);
      fs.copyFileSync(inputPath, outputPath);
    }
    return { ok: true, outputPath, originalSize, compressedSize: originalSize, skipped: true };
  }

  // Finalize: for in-place, atomically replace original with compressed
  if (isInPlace) {
    fs.renameSync(tempPath, outputPath);
  }

  return { ok: true, outputPath, originalSize, compressedSize, skipped: false };
}

// ── Cancellation ──

let compressCancelled = false;

function requestCancelCompress() {
  compressCancelled = true;
}

function resetCompressCancel() {
  compressCancelled = false;
}

/**
 * Batch compress images with progress reporting.
 */
async function batchCompressImages({
  images = [],
  quality = 90,
  resizePercent = 100,
  sourceDir = '',
  inPlace = false,
  outputDir = '',
  onProgress = () => {},
} = {}) {
  resetCompressCancel();

  const total = images.length;
  let completed = 0;
  let failed = 0;
  let skipped = 0;
  let totalOriginalSize = 0;
  let totalCompressedSize = 0;
  const errors = [];
  const results = [];

  for (let i = 0; i < total; i++) {
    if (compressCancelled) break;

    const img = images[i];
    const outPath = buildCompressOutputPath({
      absolutePath: img.input,
      relativePath: img.relativePath,
      sourceDir,
      inPlace,
      outputDir,
    });

    onProgress({
      current: i + 1,
      total,
      currentFile: img.fileName || path.basename(img.input),
      inputPath: img.input,
      status: 'processing',
    });

    try {
      const result = await compressSingleImage({
        inputPath: img.input,
        outputPath: outPath,
        quality,
        resizePercent,
      });

      totalOriginalSize += result.originalSize;
      totalCompressedSize += result.compressedSize;

      if (result.skipped) {
        skipped++;
      } else {
        completed++;
      }

      onProgress({
        current: i + 1,
        total,
        currentFile: img.fileName || path.basename(img.input),
        inputPath: img.input,
        status: result.skipped ? 'skipped' : 'done',
        originalSize: result.originalSize,
        compressedSize: result.compressedSize,
      });

      results.push({
        input: img.input,
        success: true,
        skipped: result.skipped,
        originalSize: result.originalSize,
        compressedSize: result.compressedSize,
      });
    } catch (e) {
      failed++;
      const errMsg = String(e?.message || e);
      errors.push({ input: img.input, error: errMsg });
      results.push({ input: img.input, success: false, error: errMsg });

      onProgress({
        current: i + 1,
        total,
        currentFile: img.fileName || path.basename(img.input),
        inputPath: img.input,
        status: 'error',
        error: errMsg,
      });
    }
  }

  return {
    completed,
    failed,
    skipped,
    total,
    cancelled: compressCancelled,
    totalOriginalSize,
    totalCompressedSize,
    savedBytes: totalOriginalSize - totalCompressedSize,
    errors,
    results,
  };
}

module.exports = {
  scanCompressibleImages,
  buildCompressOutputPath,
  compressSingleImage,
  batchCompressImages,
  requestCancelCompress,
  resetCompressCancel,
  isCompressibleImage,
};
