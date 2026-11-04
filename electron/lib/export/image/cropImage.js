'use strict';

const fs = require('fs');
const path = require('path');
const fg = require('fast-glob');
const logger = require('../../shared/logger').createLogger('CropImage');
const { getSharp } = require('../../shared/checkSharp');

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);
const IMAGE_GLOB = '*.{jpg,jpeg,png,webp,gif,avif}';
const IMAGE_GLOB_REC = '**/*.{jpg,jpeg,png,webp,gif,avif}';
const FORMAT_EXT = { jpg: '.jpg', png: '.png', webp: '.webp', avif: '.avif', original: null };

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

function resolveOutputExt(sourceExt, outputFormat) {
  if (!outputFormat || outputFormat === 'original') return normalizeExt(sourceExt);
  const mapped = FORMAT_EXT[String(outputFormat).toLowerCase()];
  return mapped || normalizeExt(sourceExt);
}

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

function applyFormat(pipeline, targetExt, quality = 90, isGrayscale = false) {
  const ext = normalizeExt(targetExt);
  const q = Math.max(1, Math.min(100, Math.round(Number(quality) || 90)));
  if (isGrayscale && ext !== '.png') {
    pipeline = pipeline.toColourspace('b-w');
  }
  if (ext === '.png') return pipeline.png({ compressionLevel: 6 });
  if (ext === '.webp') return pipeline.webp({ quality: q, effort: 4 });
  if (ext === '.avif') return pipeline.avif({ quality: q });
  const jpegOpts = { quality: q, mozjpeg: true };
  if (!isGrayscale) {
    jpegOpts.chromaSubsampling = '4:2:0';
  }
  return pipeline.jpeg(jpegOpts);
}

// ---------------------------------------------------------------------------
// Geometry & Detection Calculations
// ---------------------------------------------------------------------------

/**
 * Computes the crop rectangle based on fixed margin offsets (top, bottom, left, right).
 */
function computeMarginCropBox({ width, height, margins = {} }) {
  const w = Math.max(1, Math.round(width || 1));
  const h = Math.max(1, Math.round(height || 1));

  const rawTop = Math.max(0, Math.round(margins.top || 0));
  const rawBottom = Math.max(0, Math.round(margins.bottom || 0));
  const rawLeft = Math.max(0, Math.round(margins.left || 0));
  const rawRight = Math.max(0, Math.round(margins.right || 0));

  const left = Math.min(rawLeft, w - 1);
  const top = Math.min(rawTop, h - 1);

  const croppedWidth = Math.max(1, w - rawLeft - rawRight);
  const croppedHeight = Math.max(1, h - rawTop - rawBottom);

  return {
    left,
    top,
    width: Math.min(croppedWidth, w - left),
    height: Math.min(croppedHeight, h - top),
  };
}

/**
 * Color distance helper.
 */
function colorDistance(r1, g1, b1, r2, g2, b2) {
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

/**
 * Computes the bounding box to trim outer uniform border pixels matching sampleColor.
 */
function computeAutoTrimBox({
  rawPixels,
  width,
  height,
  channels = 3,
  sampleColor = null,
  tolerance = 10,
  edges = {},
}) {
  const w = width;
  const h = height;

  if (!rawPixels || w <= 0 || h <= 0) {
    return { left: 0, top: 0, width: Math.max(1, w), height: Math.max(1, h) };
  }

  // Edge flags default to true if unspecified
  const trimTop = edges.top !== false;
  const trimBottom = edges.bottom !== false;
  const trimLeft = edges.left !== false;
  const trimRight = edges.right !== false;

  // Determine sample color from top-left if not provided
  let sR = 0;
  let sG = 0;
  let sB = 0;
  if (sampleColor && typeof sampleColor.r === 'number') {
    sR = sampleColor.r;
    sG = sampleColor.g;
    sB = sampleColor.b;
  } else {
    sR = rawPixels[0];
    sG = rawPixels[1];
    sB = rawPixels[2];
  }

  // Tolerance scale: tolerance is 0..100, max distance in RGB space is ~441.67
  const maxDiff = 441.673;
  const tolDist = (Math.max(0, Math.min(100, tolerance)) / 100) * maxDiff;

  function isMatch(x, y) {
    const idx = (y * w + x) * channels;
    const r = rawPixels[idx];
    const g = rawPixels[idx + 1];
    const b = rawPixels[idx + 2];
    return colorDistance(r, g, b, sR, sG, sB) <= tolDist;
  }

  function rowMatches(y, xStart, xEnd) {
    for (let x = xStart; x <= xEnd; x++) {
      if (!isMatch(x, y)) return false;
    }
    return true;
  }

  function colMatches(x, yStart, yEnd) {
    for (let y = yStart; y <= yEnd; y++) {
      if (!isMatch(x, y)) return false;
    }
    return true;
  }

  let top = 0;
  let bottom = h - 1;
  let left = 0;
  let right = w - 1;

  // Scan Top
  if (trimTop) {
    while (top <= bottom && rowMatches(top, 0, w - 1)) {
      top++;
    }
  }

  // Scan Bottom
  if (trimBottom) {
    while (bottom >= top && rowMatches(bottom, 0, w - 1)) {
      bottom--;
    }
  }

  // If entire image is border
  if (top > bottom) {
    return { left: 0, top: 0, width: w, height: h };
  }

  // Scan Left
  if (trimLeft) {
    while (left <= right && colMatches(left, top, bottom)) {
      left++;
    }
  }

  // Scan Right
  if (trimRight) {
    while (right >= left && colMatches(right, top, bottom)) {
      right--;
    }
  }

  if (left > right) {
    return { left: 0, top: 0, width: w, height: h };
  }

  return {
    left,
    top,
    width: Math.max(1, right - left + 1),
    height: Math.max(1, bottom - top + 1),
  };
}

/**
 * Resolves the final crop box for an image given the mode and settings.
 */
function resolveCropBox({ width, height, cropMode, options = {}, rawPixels = null, channels = 3 }) {
  const w = Math.max(1, Math.round(width || 1));
  const h = Math.max(1, Math.round(height || 1));

  if (cropMode === 'margin') {
    return computeMarginCropBox({ width: w, height: h, margins: options.margins || {} });
  }

  if (cropMode === 'box') {
    const rawBox = options.box || {};
    const left = Math.max(0, Math.min(w - 1, Math.round(rawBox.left || 0)));
    const top = Math.max(0, Math.min(h - 1, Math.round(rawBox.top || 0)));
    const rawWidth = Math.max(1, Math.round(rawBox.width || w));
    const rawHeight = Math.max(1, Math.round(rawBox.height || h));
    return {
      left,
      top,
      width: Math.min(rawWidth, w - left),
      height: Math.min(rawHeight, h - top),
    };
  }

  if (cropMode === 'autoTrim' && rawPixels) {
    return computeAutoTrimBox({
      rawPixels,
      width: w,
      height: h,
      channels,
      sampleColor: options.sampleColor,
      tolerance: options.tolerance ?? 10,
      edges: options.edges || { top: true, bottom: true, left: true, right: true },
    });
  }

  // Default no crop (full image)
  return { left: 0, top: 0, width: w, height: h };
}

// ---------------------------------------------------------------------------
// Scanning & Preview
// ---------------------------------------------------------------------------

/**
 * Scan source directory or files for image cropping.
 */
async function scanForCrop({
  sourceDir = '',
  sourceFiles = [],
  includeSubfolders = true,
  maxDepth = 5,
  cropMode = 'autoTrim',
  options = {},
}) {
  const sharp = getSharp();
  if (!sharp) {
    throw new Error('Sharp module is not available');
  }

  let filePaths = [];
  const isFilesMode = Array.isArray(sourceFiles) && sourceFiles.length > 0;

  if (isFilesMode) {
    filePaths = sourceFiles.filter((p) => typeof p === 'string' && isImageExt(path.extname(p)));
  } else if (sourceDir && fs.existsSync(sourceDir)) {
    const pattern = includeSubfolders ? IMAGE_GLOB_REC : IMAGE_GLOB;
    const matched = await fg(pattern, {
      cwd: sourceDir,
      absolute: true,
      caseSensitiveMatch: false,
      deep: includeSubfolders ? maxDepth : 1,
      onlyFiles: true,
    });
    filePaths = matched.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  }

  const results = [];
  let willCropCount = 0;

  for (const absPath of filePaths) {
    try {
      const relPath = sourceDir ? path.relative(sourceDir, absPath) : path.basename(absPath);
      const meta = await sharp(absPath).metadata();
      const W = meta.width || 0;
      const H = meta.height || 0;

      if (W <= 0 || H <= 0) continue;

      let cropBox = { left: 0, top: 0, width: W, height: H };

      if (cropMode === 'margin') {
        cropBox = computeMarginCropBox({ width: W, height: H, margins: options.margins || {} });
      } else if (cropMode === 'box') {
        cropBox = resolveCropBox({ width: W, height: H, cropMode: 'box', options });
      } else if (cropMode === 'autoTrim') {
        // Downscale slightly for super-fast border scanning if image is large
        const scanMaxDim = 600;
        const scale = Math.min(1, scanMaxDim / Math.max(W, H));
        const scanW = Math.max(1, Math.round(W * scale));
        const scanH = Math.max(1, Math.round(H * scale));

        const { data: rawPixels, info } = await sharp(absPath)
          .resize(scanW, scanH, { fit: 'fill' })
          .removeAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });

        // Sample color handling
        let sampleColor = options.sampleColor;
        if (options.sampleCorner && !sampleColor) {
          const corner = options.sampleCorner; // 'topLeft', 'topRight', 'bottomLeft', 'bottomRight'
          let cX = 0;
          let cY = 0;
          if (corner === 'topRight') cX = scanW - 1;
          else if (corner === 'bottomLeft') cY = scanH - 1;
          else if (corner === 'bottomRight') { cX = scanW - 1; cY = scanH - 1; }
          const cIdx = (cY * scanW + cX) * info.channels;
          sampleColor = {
            r: rawPixels[cIdx],
            g: rawPixels[cIdx + 1],
            b: rawPixels[cIdx + 2],
          };
        }

        const downscaledBox = computeAutoTrimBox({
          rawPixels,
          width: scanW,
          height: scanH,
          channels: info.channels,
          sampleColor,
          tolerance: options.tolerance ?? 10,
          edges: options.edges,
        });

        // Map box back to original coordinates
        const invScale = 1 / scale;
        const mappedLeft = Math.min(W - 1, Math.round(downscaledBox.left * invScale));
        const mappedTop = Math.min(H - 1, Math.round(downscaledBox.top * invScale));
        const mappedRight = Math.min(W, Math.round((downscaledBox.left + downscaledBox.width) * invScale));
        const mappedBottom = Math.min(H, Math.round((downscaledBox.top + downscaledBox.height) * invScale));

        cropBox = {
          left: mappedLeft,
          top: mappedTop,
          width: Math.max(1, mappedRight - mappedLeft),
          height: Math.max(1, mappedBottom - mappedTop),
        };
      }

      const willCrop = cropBox.width < W || cropBox.height < H || cropBox.left > 0 || cropBox.top > 0;
      if (willCrop) willCropCount++;

      results.push({
        absolutePath: absPath,
        relativePath: relPath,
        width: W,
        height: H,
        format: meta.format || path.extname(absPath).replace('.', ''),
        willCrop,
        cropBox,
      });
    } catch (err) {
      logger.warn(`Failed reading metadata for ${absPath}: ${err.message}`);
    }
  }

  return {
    ok: true,
    images: results,
    stats: {
      total: results.length,
      willCrop: willCropCount,
      ok: results.length - willCropCount,
    },
  };
}

/**
 * Generate preview data URL of cropped image.
 */
async function previewCrop(imagePath, cropBox) {
  const sharp = getSharp();
  if (!sharp) throw new Error('Sharp module is not available');

  const meta = await sharp(imagePath).metadata();
  const W = meta.width || 0;
  const H = meta.height || 0;

  if (W <= 0 || H <= 0) {
    throw new Error('Invalid image dimensions');
  }

  const left = Math.max(0, Math.min(W - 1, Math.round(cropBox?.left || 0)));
  const top = Math.max(0, Math.min(H - 1, Math.round(cropBox?.top || 0)));
  const width = Math.max(1, Math.min(W - left, Math.round(cropBox?.width || W)));
  const height = Math.max(1, Math.min(H - top, Math.round(cropBox?.height || H)));

  // Extract crop area and convert to JPEG preview
  const buffer = await sharp(imagePath)
    .extract({ left, top, width, height })
    .jpeg({ quality: 92 })
    .toBuffer();

  const dataUrl = `data:image/jpeg;base64,${buffer.toString('base64')}`;
  return { ok: true, dataUrl, width, height };
}

// ---------------------------------------------------------------------------
// Batch Crop Processor
// ---------------------------------------------------------------------------

let cropCancelled = false;

function requestCancelCrop() {
  cropCancelled = true;
}

function resetCropCancel() {
  cropCancelled = false;
}

/**
 * Batch crop images.
 */
async function cropBatch({
  sourceDir = '',
  sourceFiles = [],
  outputDir = null,
  inPlace = false,
  outputFormat = 'original',
  cropSettings = {},
  customCropBoxes = {},
  selectedPaths = null,
  excludedPaths = [],
  onProgress = () => {},
}) {
  const sharp = getSharp();
  if (!sharp) {
    return { ok: false, cropped: 0, skipped: 0, failed: 0, cancelled: false, errors: [{ error: 'Sharp not available' }] };
  }

  resetCropCancel();

  function normPath(p) {
    if (!p || typeof p !== 'string') return '';
    return path.resolve(p).replace(/\\/g, '/').normalize('NFC').toLowerCase();
  }

  const isFilesMode = Array.isArray(sourceFiles) && sourceFiles.length > 0;
  const selectedSet = Array.isArray(selectedPaths) && selectedPaths.length > 0
    ? new Set(selectedPaths.map(normPath))
    : null;
  const excludedSet = new Set((Array.isArray(excludedPaths) ? excludedPaths : []).map(normPath));

  // Scan items
  const scanResult = await scanForCrop({
    sourceDir,
    sourceFiles,
    includeSubfolders: cropSettings.includeSubfolders !== false,
    cropMode: cropSettings.cropMode || 'autoTrim',
    options: cropSettings,
  });

  const allImages = scanResult.images || [];

  // Filter to target images:
  // If selectedPaths was provided, ONLY process images in selectedSet
  // Otherwise, process allImages except excludedSet
  const targetImages = allImages.filter((item) => {
    const p = normPath(item.absolutePath);
    if (selectedSet) {
      return selectedSet.has(p);
    }
    return !excludedSet.has(p);
  });

  const total = targetImages.length;

  if (total === 0) {
    return { ok: true, cropped: 0, skipped: 0, failed: 0, cancelled: false, errors: [] };
  }

  if (!inPlace && outputDir && !fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  let croppedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const errors = [];

  // Concurrency pool of 4 workers
  const CONCURRENCY = 4;
  let cursor = 0;

  async function worker() {
    while (cursor < total) {
      if (cropCancelled) break;
      const idx = cursor++;
      const item = targetImages[idx];

      const absPath = item.absolutePath;

      try {
        const targetDir = resolveTargetDir({
          sourceDir,
          absolutePath: absPath,
          inPlace,
          outputDir,
          isFilesMode,
        });

        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }

        const srcExt = path.extname(absPath);
        const outExt = resolveOutputExt(srcExt, outputFormat);
        const baseName = path.basename(absPath, srcExt);
        const finalPath = path.join(targetDir, `${baseName}${outExt}`);

        // Determine effective crop box: custom box wins over default box
        const effectiveBox = customCropBoxes[absPath] || item.cropBox || {
          left: 0,
          top: 0,
          width: item.width,
          height: item.height,
        };

        const left = Math.max(0, Math.min(item.width - 1, Math.round(effectiveBox.left || 0)));
        const top = Math.max(0, Math.min(item.height - 1, Math.round(effectiveBox.top || 0)));
        const width = Math.max(1, Math.min(item.width - left, Math.round(effectiveBox.width || item.width)));
        const height = Math.max(1, Math.min(item.height - top, Math.round(effectiveBox.height || item.height)));

        const isUnchanged = left === 0 && top === 0 && width === item.width && height === item.height && outExt === normalizeExt(srcExt);

        if (isUnchanged && inPlace) {
          skippedCount++;
        } else {
          // Safe write via temporary file
          const tempPath = path.join(targetDir, `.${baseName}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}.tmp`);
          let originalSize = null;
          try {
            const stat = await fs.promises.stat(absPath);
            originalSize = stat.size || null;
          } catch (_) {}

          let isGrayscale = false;
          try {
            const meta = await sharp(absPath).metadata();
            isGrayscale = meta.channels === 1 || meta.space === 'b-w' || meta.space === 'grey' || meta.space === 'grey16';
          } catch (_) {}

          function makePipeline(q) {
            let p = sharp(absPath).extract({ left, top, width, height });
            return applyFormat(p, outExt, q, isGrayscale);
          }

          let buffer = await makePipeline(90).toBuffer();
          const isLossy = outExt === '.jpg' || outExt === '.jpeg' || outExt === '.webp';
          if (isLossy && Number.isFinite(originalSize) && originalSize > 0 && buffer.length > originalSize) {
            const testQualities = [82, 75, 68].filter((q) => q >= 65);
            for (const nextQ of testQualities) {
              const nextBuf = await makePipeline(nextQ).toBuffer();
              if (nextBuf.length < buffer.length) {
                buffer = nextBuf;
                if (buffer.length <= originalSize) break;
              }
            }
          }

          await fs.promises.writeFile(tempPath, buffer);

          // Atomic rename / overwrite
          await fs.promises.rename(tempPath, finalPath);
          croppedCount++;
        }
      } catch (err) {
        failedCount++;
        errors.push({ file: item.relativePath, error: err.message });
        logger.error(`Crop failed for ${item.relativePath}: ${err.message}`);
      }

      onProgress({
        current: croppedCount + skippedCount + failedCount,
        total,
        file: item.relativePath,
        cropped: croppedCount,
        skipped: skippedCount,
        failed: failedCount,
      });
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(CONCURRENCY, total); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  return {
    ok: errors.length === 0,
    cropped: croppedCount,
    skipped: skippedCount,
    failed: failedCount,
    cancelled: cropCancelled,
    errors,
  };
}

module.exports = {
  IMAGE_EXTS,
  IMAGE_GLOB,
  IMAGE_GLOB_REC,
  normalizeExt,
  isImageExt,
  resolveOutputExt,
  resolveTargetDir,
  computeMarginCropBox,
  computeAutoTrimBox,
  resolveCropBox,
  scanForCrop,
  previewCrop,
  cropBatch,
  requestCancelCrop,
  resetCropCancel,
};
