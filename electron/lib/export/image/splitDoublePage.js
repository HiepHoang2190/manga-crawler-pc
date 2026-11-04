'use strict';

const fs = require('fs');
const path = require('path');
const fg = require('fast-glob');
const logger = require('../../shared/logger').createLogger('SplitDoublePage');
const { getSharp } = require('../../shared/checkSharp');

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);
const IMAGE_GLOB = '*.{jpg,jpeg,png,webp,gif,avif}';
const IMAGE_GLOB_REC = '**/*.{jpg,jpeg,png,webp,gif,avif}';
const FORMAT_EXT = { jpg: '.jpg', png: '.png', webp: '.webp', original: null };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeExt(ext) {
  const e = String(ext || '').toLowerCase();
  return e.startsWith('.') ? e : `.${e}`;
}

function isImageExt(ext) {
  return IMAGE_EXTS.has(normalizeExt(ext));
}

/**
 * Determine the output extension for a given source file.
 * When `outputFormat` is 'original' the source extension is kept.
 */
function resolveOutputExt(sourceExt, outputFormat) {
  if (!outputFormat || outputFormat === 'original') return normalizeExt(sourceExt);
  const mapped = FORMAT_EXT[String(outputFormat).toLowerCase()];
  return mapped || normalizeExt(sourceExt);
}

/**
 * Determine the destination directory for an image.
 * When in-place, returns the directory containing the file itself.
 * When outputDir is provided, preserves the nested relative subdirectories (con, cháu, etc.).
 */
function resolveTargetDir({ sourceDir, absolutePath, inPlace, outputDir, isFilesMode }) {
  if (inPlace) {
    return path.dirname(absolutePath);
  }
  if (isFilesMode) {
    return outputDir;
  }
  const rel = path.relative(sourceDir, absolutePath);
  const relDir = path.dirname(rel);
  return relDir === '.' ? outputDir : path.join(outputDir, relDir);
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Should this image be split?
 * Both conditions must be satisfied:
 *   1. width >= minWidth
 *   2. width / height >= ratioThreshold
 *
 * @param {number} width
 * @param {number} height
 * @param {number} [minWidth=1200]
 * @param {number} [ratioThreshold=1.15]
 * @returns {boolean}
 */
function shouldSplit(width, height, minWidth = 1200, ratioThreshold = 1.15) {
  if (width <= 0 || height <= 0) return false;
  return width >= minWidth && width / height >= ratioThreshold;
}

// ---------------------------------------------------------------------------
// Smart split — find optimal vertical split column
// ---------------------------------------------------------------------------

/**
 * Find the optimal vertical column to split an image by analysing pixel
 * variance in a narrow band around the centre (±searchPercent).
 *
 * Columns with low variance are "uniform" — they are likely the gutter
 * between two manga pages and therefore safe to cut along.
 *
 * Falls back to the exact centre if analysis is not possible.
 *
 * @param {Buffer} rawPixels  — raw pixel buffer (grayscale, 1 channel)
 * @param {number} width
 * @param {number} height
 * @param {number} [searchPercent=0.05] — how far from centre to search (0-1)
 * @returns {number} — optimal x coordinate for the split
 */
function findOptimalSplitColumn(rawPixels, width, height, searchPercent = 0.05) {
  const centre = Math.floor(width / 2);
  const halfSearch = Math.max(1, Math.floor(width * searchPercent));
  const xMin = Math.max(0, centre - halfSearch);
  const xMax = Math.min(width - 1, centre + halfSearch);

  let bestX = centre;
  let bestVariance = Infinity;

  for (let x = xMin; x <= xMax; x++) {
    // Calculate mean for this column
    let sum = 0;
    for (let y = 0; y < height; y++) {
      sum += rawPixels[y * width + x];
    }
    const mean = sum / height;

    // Calculate variance
    let variance = 0;
    for (let y = 0; y < height; y++) {
      const diff = rawPixels[y * width + x] - mean;
      variance += diff * diff;
    }
    variance /= height;

    if (variance < bestVariance) {
      bestVariance = variance;
      bestX = x;
    }
  }

  logger.debug(`Optimal split column: x=${bestX} (variance=${bestVariance.toFixed(1)}, searched ${xMin}-${xMax})`);
  return bestX;
}

// ---------------------------------------------------------------------------
// Image splitting with sharp
// ---------------------------------------------------------------------------

/**
 * Split a single image into left and right halves using sharp.
 *
 * @param {string} inputPath
 * @param {string} outputPathA — first-read page
 * @param {string} outputPathB — second-read page
 * @param {'ltr'|'rtl'} readingDirection
 * @param {string} outputFormat — 'original' | 'jpg' | 'png' | 'webp'
 * @returns {Promise<{splitX: number, width: number, height: number}>}
 */
/**
 * Normalize custom split configuration from frontend or tests.
 * Supports number (ratio), or object { topRatio, bottomRatio, rotation }.
 */
function normalizeCustomSplit(config) {
  if (typeof config === 'number') {
    return { topRatio: config, bottomRatio: config, rotation: 0 };
  }
  if (config && typeof config === 'object') {
    const top = typeof config.topRatio === 'number'
      ? config.topRatio
      : (typeof config.top === 'number' ? config.top : (typeof config.ratio === 'number' ? config.ratio : 0.5));
    const bottom = typeof config.bottomRatio === 'number'
      ? config.bottomRatio
      : (typeof config.bottom === 'number' ? config.bottom : (typeof config.ratio === 'number' ? config.ratio : top));
    const rotation = typeof config.rotation === 'number'
      ? config.rotation
      : (typeof config.rotate === 'number' ? config.rotate : 0);
    return {
      topRatio: Math.max(0.05, Math.min(0.95, top)),
      bottomRatio: Math.max(0.05, Math.min(0.95, bottom)),
      rotation: Math.max(-45, Math.min(45, rotation)),
    };
  }
  return null;
}

async function splitImageWithSharp(
  inputPath,
  outputPathA,
  outputPathB,
  readingDirection,
  outputFormat = 'original',
  customConfig = null
) {
  const sharp = getSharp();
  if (!sharp) {
    throw new Error('sharp module is not available. Please reinstall the application.');
  }

  const norm = normalizeCustomSplit(customConfig);

  // Read image buffer
  let inputBuffer = await fs.promises.readFile(inputPath);

  // Apply rotation if specified (deskew)
  if (norm && norm.rotation !== 0) {
    inputBuffer = await sharp(inputBuffer)
      .rotate(norm.rotation, { background: '#ffffff' })
      .toBuffer();
  }

  const meta = await sharp(inputBuffer).metadata();
  const { width, height } = meta;

  let topX;
  let bottomX;

  if (norm) {
    topX = Math.max(1, Math.min(width - 1, Math.round(width * norm.topRatio)));
    bottomX = Math.max(1, Math.min(width - 1, Math.round(width * norm.bottomRatio)));
  } else {
    // Find optimal split column using grayscale analysis
    const grayBuffer = await sharp(inputBuffer)
      .grayscale()
      .raw()
      .toBuffer();

    const optX = findOptimalSplitColumn(grayBuffer, width, height);
    topX = optX;
    bottomX = optX;
  }

  // Helper to apply output format
  const applyFormat = (pipeline, srcExt) => {
    const fmt = outputFormat === 'original' ? normalizeExt(srcExt).replace('.', '') : outputFormat;
    switch (fmt) {
      case 'png': return pipeline.png();
      case 'webp': return pipeline.webp({ lossless: true });
      case 'jpg':
      case 'jpeg': return pipeline.jpeg({ quality: 100 });
      default: return pipeline.jpeg({ quality: 100 });
    }
  };

  const srcExt = path.extname(inputPath);

  // Ensure output directories exist
  fs.mkdirSync(path.dirname(outputPathA), { recursive: true });
  fs.mkdirSync(path.dirname(outputPathB), { recursive: true });

  if (topX === bottomX) {
    // Straight cut
    const splitX = topX;
    const leftCrop = { left: 0, top: 0, width: splitX, height };
    const rightCrop = { left: splitX, top: 0, width: width - splitX, height };

    const cropA = readingDirection === 'rtl' ? rightCrop : leftCrop;
    const cropB = readingDirection === 'rtl' ? leftCrop : rightCrop;

    await applyFormat(sharp(inputBuffer).extract(cropA), srcExt).toFile(outputPathA);
    await applyFormat(sharp(inputBuffer).extract(cropB), srcExt).toFile(outputPathB);

    return { splitX, topX, bottomX, width, height };
  }

  // Slanted / diagonal cut
  const leftWidth = Math.max(topX, bottomX);
  const minX = Math.min(topX, bottomX);
  const rightWidth = width - minX;

  // Mask right side of seam on left half with white
  const svgOverlayLeft = Buffer.from(`
    <svg width="${leftWidth}" height="${height}">
      <polygon points="${topX},0 ${leftWidth},0 ${leftWidth},${height} ${bottomX},${height}" fill="#ffffff" />
    </svg>
  `);

  // Mask left side of seam on right half with white
  const svgOverlayRight = Buffer.from(`
    <svg width="${rightWidth}" height="${height}">
      <polygon points="0,0 ${topX - minX},0 ${bottomX - minX},${height} 0,${height}" fill="#ffffff" />
    </svg>
  `);

  const leftPipeline = sharp(inputBuffer)
    .extract({ left: 0, top: 0, width: leftWidth, height })
    .composite([{ input: svgOverlayLeft, top: 0, left: 0 }]);

  const rightPipeline = sharp(inputBuffer)
    .extract({ left: minX, top: 0, width: rightWidth, height })
    .composite([{ input: svgOverlayRight, top: 0, left: 0 }]);

  const pipeA = readingDirection === 'rtl' ? rightPipeline : leftPipeline;
  const pipeB = readingDirection === 'rtl' ? leftPipeline : rightPipeline;

  await applyFormat(pipeA, srcExt).toFile(outputPathA);
  await applyFormat(pipeB, srcExt).toFile(outputPathB);

  return { splitX: Math.round((topX + bottomX) / 2), topX, bottomX, width, height };
}

// ---------------------------------------------------------------------------
// Image splitting with Jimp (fallback)
// ---------------------------------------------------------------------------

/**
 * Split a single image into left and right halves using Jimp.
 *
 * @param {string} inputPath
 * @param {string} outputPathA
 * @param {string} outputPathB
 * @param {'ltr'|'rtl'} readingDirection
 * @param {number|object|null} [customConfig=null]
 * @returns {Promise<{splitX: number, width: number, height: number}>}
 */
async function splitImageWithJimp(inputPath, outputPathA, outputPathB, readingDirection, customConfig = null) {
  const Jimp = require('jimp');

  let image = await Jimp.read(inputPath);
  const norm = normalizeCustomSplit(customConfig);

  if (norm && norm.rotation !== 0) {
    image = image.rotate(norm.rotation, false);
  }

  const { width, height } = image.bitmap;

  let topX;
  let bottomX;

  if (norm) {
    topX = Math.max(1, Math.min(width - 1, Math.round(width * norm.topRatio)));
    bottomX = Math.max(1, Math.min(width - 1, Math.round(width * norm.bottomRatio)));
  } else {
    // For Jimp, do a simpler column variance analysis on the bitmap directly
    const centre = Math.floor(width / 2);
    const halfSearch = Math.max(1, Math.floor(width * 0.05));
    const xMin = Math.max(0, centre - halfSearch);
    const xMax = Math.min(width - 1, centre + halfSearch);

    let bestX = centre;
    let bestVariance = Infinity;

    for (let x = xMin; x <= xMax; x++) {
      let sum = 0;
      for (let y = 0; y < height; y++) {
        const idx = (y * width + x) * 4;
        const gray =
          0.299 * image.bitmap.data[idx] +
          0.587 * image.bitmap.data[idx + 1] +
          0.114 * image.bitmap.data[idx + 2];
        sum += gray;
      }
      const mean = sum / height;

      let variance = 0;
      for (let y = 0; y < height; y++) {
        const idx = (y * width + x) * 4;
        const gray =
          0.299 * image.bitmap.data[idx] +
          0.587 * image.bitmap.data[idx + 1] +
          0.114 * image.bitmap.data[idx + 2];
        const diff = gray - mean;
        variance += diff * diff;
      }
      variance /= height;

      if (variance < bestVariance) {
        bestVariance = variance;
        bestX = x;
      }
    }

    topX = bestX;
    bottomX = bestX;
  }

  logger.debug(`Jimp split column: topX=${topX}, bottomX=${bottomX}`);

  // Ensure output directories exist
  fs.mkdirSync(path.dirname(outputPathA), { recursive: true });
  fs.mkdirSync(path.dirname(outputPathB), { recursive: true });

  if (topX === bottomX) {
    const leftImage = image.clone().crop(0, 0, topX, height);
    const rightImage = image.clone().crop(topX, 0, width - topX, height);

    const imageA = readingDirection === 'rtl' ? rightImage : leftImage;
    const imageB = readingDirection === 'rtl' ? leftImage : rightImage;

    await new Promise((resolve, reject) => {
      imageA.write(outputPathA, (err) => (err ? reject(err) : resolve()));
    });
    await new Promise((resolve, reject) => {
      imageB.write(outputPathB, (err) => (err ? reject(err) : resolve()));
    });
  } else {
    const leftWidth = Math.max(topX, bottomX);
    const minX = Math.min(topX, bottomX);
    const rightWidth = width - minX;

    const leftImage = image.clone().crop(0, 0, leftWidth, height);
    const rightImage = image.clone().crop(minX, 0, rightWidth, height);

    // White out outside the seam (0xFFFFFFFF = white in 32-bit RGBA)
    for (let y = 0; y < height; y++) {
      const seamX = Math.round(topX + (bottomX - topX) * (y / height));
      for (let x = seamX; x < leftWidth; x++) {
        leftImage.setPixelColor(0xFFFFFFFF, x, y);
      }
      const relSeamX = seamX - minX;
      for (let x = 0; x < relSeamX; x++) {
        rightImage.setPixelColor(0xFFFFFFFF, x, y);
      }
    }

    const imageA = readingDirection === 'rtl' ? rightImage : leftImage;
    const imageB = readingDirection === 'rtl' ? leftImage : rightImage;

    await new Promise((resolve, reject) => {
      imageA.write(outputPathA, (err) => (err ? reject(err) : resolve()));
    });
    await new Promise((resolve, reject) => {
      imageB.write(outputPathB, (err) => (err ? reject(err) : resolve()));
    });
  }

  return { splitX: Math.round((topX + bottomX) / 2), topX, bottomX, width, height };
}

// ---------------------------------------------------------------------------
// Scan
// ---------------------------------------------------------------------------

/**
 * Scan a folder and identify which images should be split.
 *
 * @param {object} opts
 * @param {string} opts.sourceDir
 * @param {number} [opts.minWidth=1200]
 * @param {number} [opts.ratioThreshold=1.3]
 * @param {boolean} [opts.includeSubfolders=true]
 * @param {number} [opts.maxDepth=5] Max recursion depth (5 = root + 4 subfolder levels: con, cháu, chắt, chút)
 * @returns {Promise<{ok: boolean, error?: string, images: Array, stats: object}>}
 */
async function scanForSplit({
  sourceDir,
  sourceFiles,
  minWidth = 1200,
  ratioThreshold = 1.15,
  includeSubfolders = true,
  maxDepth = 5,
} = {}) {
  let sorted = [];
  let root = null;
  const isFilesMode = Array.isArray(sourceFiles) && sourceFiles.length > 0;

  if (isFilesMode) {
    const valid = sourceFiles.filter((fp) => {
      try {
        const ext = path.extname(fp);
        return isImageExt(ext) && fs.existsSync(fp) && fs.statSync(fp).isFile();
      } catch {
        return false;
      }
    });
    if (valid.length === 0) {
      return { ok: false, error: 'Không tìm thấy file ảnh hợp lệ nào.', images: [], stats: {} };
    }
    sorted = valid.sort((a, b) => {
      return path.basename(a).localeCompare(path.basename(b), undefined, { numeric: true, sensitivity: 'base' });
    });
    root = path.dirname(sorted[0]);
  } else {
    const dir = String(sourceDir || '').trim();
    if (!dir) {
      return { ok: false, error: 'Chưa chọn thư mục hoặc file ảnh.', images: [], stats: {} };
    }
    root = path.resolve(dir);
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
      return { ok: false, error: 'Thư mục không tồn tại.', images: [], stats: {} };
    }

    const recursive = Boolean(includeSubfolders);
    const pattern = recursive ? IMAGE_GLOB_REC : IMAGE_GLOB;
    const deep = recursive ? Math.max(1, Math.min(10, maxDepth)) : 1;

    const found = await fg.glob(pattern, {
      cwd: root,
      onlyFiles: true,
      caseSensitiveMatch: false,
      absolute: true,
      dot: false,
      deep,
    });

    sorted = found.sort((a, b) => {
      const relA = path.relative(root, a);
      const relB = path.relative(root, b);
      return relA.localeCompare(relB, undefined, { numeric: true, sensitivity: 'base' });
    });
  }

  const sharp = getSharp();
  const images = [];
  let willSplitCount = 0;
  let willCopyCount = 0;

  for (const absolutePath of sorted) {
    const ext = path.extname(absolutePath);
    if (!isImageExt(ext)) continue;

    const relativePath = isFilesMode ? path.basename(absolutePath) : path.relative(root, absolutePath);
    let width = 0;
    let height = 0;
    let willSplit = false;

    try {
      if (sharp) {
        const inputBuffer = await fs.promises.readFile(absolutePath);
        const meta = await sharp(inputBuffer).metadata();
        width = meta.width || 0;
        height = meta.height || 0;
      } else {
        const Jimp = require('jimp');
        const img = await Jimp.read(absolutePath);
        width = img.bitmap.width;
        height = img.bitmap.height;
      }
      willSplit = shouldSplit(width, height, minWidth, ratioThreshold);
    } catch (e) {
      logger.error(`Failed to read metadata for ${relativePath}:`, e.message);
    }

    if (willSplit) willSplitCount++;
    else willCopyCount++;

    images.push({ absolutePath, relativePath, width, height, willSplit });
  }

  return {
    ok: true,
    images,
    stats: { total: images.length, willSplit: willSplitCount, willCopy: willCopyCount },
  };
}

// ---------------------------------------------------------------------------
// Batch split
// ---------------------------------------------------------------------------

let splitCancelled = false;

function requestCancelSplitDoublePages() {
  splitCancelled = true;
}

function resetSplitCancel() {
  splitCancelled = false;
}

/**
 * Split all double-page images in a folder.
 *
 * @param {object} opts
 * @param {string} opts.sourceDir
 * @param {string|null} opts.outputDir — null means overwrite in-place
 * @param {'ltr'|'rtl'} [opts.readingDirection='ltr']
 * @param {number} [opts.minWidth=1200]
 * @param {number} [opts.ratioThreshold=1.3]
 * @param {string} [opts.outputFormat='original']
 * @param {boolean} [opts.includeSubfolders=true]
 * @param {number} [opts.maxDepth=5]
 * @param {(progress: {done: number, total: number, currentFile: string}) => void} [opts.onProgress]
 * @returns {Promise<{ok: boolean, split: number, copied: number, failed: number, cancelled: boolean, errors: Array}>}
 */
async function splitDoublePages(opts = {}) {
  resetSplitCancel();

  const isFilesMode = Array.isArray(opts.sourceFiles) && opts.sourceFiles.length > 0;
  const sourceDir = isFilesMode && opts.sourceFiles[0]
    ? path.dirname(path.resolve(opts.sourceFiles[0]))
    : path.resolve(String(opts.sourceDir || '').trim());
  const outputDir = opts.outputDir ? path.resolve(String(opts.outputDir).trim()) : null;
  const readingDirection = opts.readingDirection === 'rtl' ? 'rtl' : 'ltr';
  const minWidth = typeof opts.minWidth === 'number' ? opts.minWidth : 1200;
  const ratioThreshold = typeof opts.ratioThreshold === 'number' ? opts.ratioThreshold : 1.15;
  const outputFormat = String(opts.outputFormat || 'original').toLowerCase();
  const includeSubfolders = opts.includeSubfolders !== false;
  const maxDepth = typeof opts.maxDepth === 'number' ? opts.maxDepth : 5;
  const excludedSplitPaths = new Set(
    Array.isArray(opts.excludedSplitPaths) ? opts.excludedSplitPaths : []
  );
  const customSplitPositions =
    opts.customSplitPositions && typeof opts.customSplitPositions === 'object'
      ? opts.customSplitPositions
      : {};
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : () => {};

  const inPlace = !outputDir || (!isFilesMode && outputDir === sourceDir);

  // Scan first
  const scan = await scanForSplit({
    sourceDir,
    sourceFiles: opts.sourceFiles,
    minWidth,
    ratioThreshold,
    includeSubfolders,
    maxDepth,
  });
  if (!scan.ok) {
    return { ok: false, split: 0, copied: 0, failed: 0, cancelled: false, errors: [{ error: scan.error }] };
  }

  const queue = scan.images;
  const total = queue.length;
  let splitCount = 0;
  let copiedCount = 0;
  let failedCount = 0;
  const errors = [];
  let cancelled = false;

  // Create output dir if needed
  if (!inPlace && outputDir) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const sharp = getSharp();

  for (let i = 0; i < queue.length; i++) {
    if (splitCancelled) {
      cancelled = true;
      break;
    }

    const item = queue[i];
    const baseName = path.basename(item.absolutePath);
    onProgress({ done: i, total, currentFile: item.relativePath });

    try {
      const targetDir = resolveTargetDir({
        sourceDir,
        absolutePath: item.absolutePath,
        inPlace,
        outputDir,
        isFilesMode,
      });

      const shouldActuallySplit = item.willSplit && !excludedSplitPaths.has(item.absolutePath);

      if (shouldActuallySplit) {
        // Build output filenames
        const parsed = path.parse(baseName);
        const outExt = resolveOutputExt(parsed.ext, outputFormat);
        const nameA = `${parsed.name}-a${outExt}`;
        const nameB = `${parsed.name}-b${outExt}`;

        fs.mkdirSync(targetDir, { recursive: true });
        const pathA = path.join(targetDir, nameA);
        const pathB = path.join(targetDir, nameB);

        const customConfig = customSplitPositions[item.absolutePath] != null
          ? customSplitPositions[item.absolutePath]
          : null;

        if (sharp) {
          await splitImageWithSharp(item.absolutePath, pathA, pathB, readingDirection, outputFormat, customConfig);
        } else {
          await splitImageWithJimp(item.absolutePath, pathA, pathB, readingDirection, customConfig);
        }

        // If in-place, remove the original double-page image
        if (inPlace) {
          try {
            fs.unlinkSync(item.absolutePath);
          } catch (e) {
            logger.error(`Failed to remove original ${baseName}:`, e.message);
          }
        }

        splitCount++;
        logger.debug(`Split: ${item.relativePath} → ${nameA}, ${nameB}`);
      } else {
        // Single page — copy to output if not in-place
        if (!inPlace && outputDir) {
          fs.mkdirSync(targetDir, { recursive: true });
          const destPath = path.join(targetDir, baseName);
          fs.copyFileSync(item.absolutePath, destPath);
          copiedCount++;
          logger.debug(`Copied: ${item.relativePath}`);
        } else {
          copiedCount++;
        }
      }
    } catch (e) {
      failedCount++;
      errors.push({ relativePath: item.relativePath, error: String(e?.message || e) });
      logger.error(`Failed to process ${item.relativePath}:`, e.message);
    }
  }

  onProgress({ done: cancelled ? splitCount + copiedCount + failedCount : total, total, currentFile: '' });

  return {
    ok: failedCount === 0 && !cancelled,
    split: splitCount,
    copied: copiedCount,
    failed: failedCount,
    cancelled,
    errors,
  };
}

module.exports = {
  shouldSplit,
  findOptimalSplitColumn,
  splitImageWithSharp,
  splitImageWithJimp,
  scanForSplit,
  splitDoublePages,
  requestCancelSplitDoublePages,
  resetSplitCancel,
  resolveOutputExt,
  resolveTargetDir,
  IMAGE_EXTS,
  IMAGE_GLOB,
  IMAGE_GLOB_REC,
};
