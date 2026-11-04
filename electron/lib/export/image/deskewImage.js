'use strict';

const fs = require('fs');
const path = require('path');
const fg = require('fast-glob');
const logger = require('../../shared/logger').createLogger('DeskewImage');
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

function determineOutputExt(srcExt, outputFormat) {
  const target = FORMAT_EXT[String(outputFormat || 'original').toLowerCase()];
  return target || normalizeExt(srcExt);
}

/**
 * Apply output format to a sharp pipeline.
 */
function applyFormat(pipeline, srcExt) {
  const ext = normalizeExt(srcExt);
  if (ext === '.png') return pipeline.png({ compressionLevel: 6 });
  if (ext === '.webp') return pipeline.webp({ quality: 95, effort: 4 });
  if (ext === '.avif') return pipeline.avif({ quality: 90 });
  return pipeline.jpeg({
    quality: 98,
    chromaSubsampling: '4:4:4',
    mozjpeg: true,
  });
}

// ---------------------------------------------------------------------------
// Auto-detect skew angle using projection profile analysis
// ---------------------------------------------------------------------------

/**
 * Detect the skew angle of an image using projection profile analysis.
 *
 * Algorithm:
 * 1. Convert to grayscale, resize to max 800px wide for speed
 * 2. Compute horizontal edge magnitude (Sobel-like horizontal gradient)
 * 3. For test angles from -15° to +15° (step 0.25°), compute the "sharpness"
 *    of the horizontal projection profile of edge pixels
 * 4. The angle producing the sharpest (highest variance) projection = skew angle
 *
 * @param {Buffer} input — encoded image bytes, or raw pixels when `raw` is given
 * @param {{ raw?: { width: number, height: number, channels: number }, label?: string }} [opts]
 * @returns {Promise<{ angle: number, confidence: number }>}
 */
async function detectSkewAngleFromBuffer(input, { raw = null, label = 'buffer' } = {}) {
  const sharp = getSharp();
  if (!sharp) {
    return { angle: 0, confidence: 0 };
  }

  try {
    const source = () => (raw ? sharp(input, { raw }) : sharp(input));
    const meta = raw ? { width: raw.width, height: raw.height } : await source().metadata();
    if (!meta.width || !meta.height) {
      return { angle: 0, confidence: 0 };
    }

    // Resize for speed (max 600px wide) and convert to greyscale raw pixels
    const maxW = Math.min(meta.width, 600);
    const scale = maxW / meta.width;
    const w = Math.round(meta.width * scale);
    const h = Math.round(meta.height * scale);

    const { data: rawPixels, info } = await source()
      .greyscale()
      .resize(w, h, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const imgW = info.width;
    const imgH = info.height;

    // Compute horizontal edge magnitude using simple Sobel-like kernel
    // We only need horizontal edges (which appear as horizontal lines in text)
    const edges = new Float32Array(imgW * imgH);
    for (let y = 1; y < imgH - 1; y++) {
      for (let x = 1; x < imgW - 1; x++) {
        // Vertical gradient (detects horizontal edges = text lines)
        const gy =
          -rawPixels[(y - 1) * imgW + (x - 1)] -
          2 * rawPixels[(y - 1) * imgW + x] -
          rawPixels[(y - 1) * imgW + (x + 1)] +
          rawPixels[(y + 1) * imgW + (x - 1)] +
          2 * rawPixels[(y + 1) * imgW + x] +
          rawPixels[(y + 1) * imgW + (x + 1)];
        edges[y * imgW + x] = Math.abs(gy);
      }
    }

    // Threshold edges — only keep strong edges
    const edgeThreshold = 30;

    // Test angles from -15° to +15° in 0.25° steps
    const testAngles = [];
    for (let a = -15; a <= 15; a += 0.25) {
      testAngles.push(a);
    }

    let bestAngle = 0;
    let bestScore = -Infinity;
    let baselineScore = 0;

    for (const angleDeg of testAngles) {
      const angleRad = (angleDeg * Math.PI) / 180;
      const cosA = Math.cos(angleRad);
      const sinA = Math.sin(angleRad);

      // Compute projection profile: sum edge values for each row after rotation
      const profile = new Float32Array(imgH * 2); // oversized to handle offset
      const centerX = imgW / 2;
      const centerY = imgH / 2;

      for (let y = 0; y < imgH; y++) {
        for (let x = 0; x < imgW; x++) {
          const edgeVal = edges[y * imgW + x];
          if (edgeVal < edgeThreshold) continue;

          // Rotate point (x, y) by angleDeg around center
          const dx = x - centerX;
          const dy = y - centerY;
          const newY = Math.round(-dx * sinA + dy * cosA + centerY);

          if (newY >= 0 && newY < imgH * 2) {
            profile[newY] += edgeVal;
          }
        }
      }

      // Score = variance of the projection profile
      // Higher variance means edges are more concentrated into specific rows
      // = text lines are more aligned = correct angle
      let sum = 0;
      let sumSq = 0;
      let count = 0;
      for (let i = 0; i < profile.length; i++) {
        if (profile[i] > 0) {
          sum += profile[i];
          sumSq += profile[i] * profile[i];
          count++;
        }
      }

      if (count > 0) {
        const mean = sum / count;
        const variance = sumSq / count - mean * mean;

        if (angleDeg === 0) baselineScore = variance;

        if (variance > bestScore) {
          bestScore = variance;
          bestAngle = angleDeg;
        }
      }
    }

    // Confidence: how much better is bestScore vs baseline (0°)
    const confidence =
      baselineScore > 0
        ? Math.min(1, Math.max(0, (bestScore - baselineScore) / baselineScore))
        : 0;

    // Round to 1 decimal
    const finalAngle = Math.round(bestAngle * 10) / 10;

    logger.debug(
      `detectSkewAngle ${label}: angle=${finalAngle}° confidence=${confidence.toFixed(3)}`
    );

    return { angle: finalAngle, confidence };
  } catch (err) {
    logger.error(`detectSkewAngle failed for ${label}:`, err.message);
    return { angle: 0, confidence: 0 };
  }
}

async function detectSkewAngle(imagePath) {
  try {
    const inputBuffer = await fs.promises.readFile(imagePath);
    return await detectSkewAngleFromBuffer(inputBuffer, { label: path.basename(imagePath) });
  } catch (err) {
    logger.error(`detectSkewAngle failed for ${path.basename(imagePath)}:`, err.message);
    return { angle: 0, confidence: 0 };
  }
}

// ---------------------------------------------------------------------------
// Inscribed rectangle calculation after rotation
// ---------------------------------------------------------------------------

/**
 * Compute the largest axis-aligned rectangle inscribed in a rotated rectangle.
 *
 * When you rotate a WxH rectangle by `angle` degrees, the result is a larger
 * bounding box with empty triangular corners. This function returns the crop
 * region for the largest rectangle that fits entirely within the original
 * content (no empty corners).
 *
 * @param {number} W — original image width
 * @param {number} H — original image height
 * @param {number} angleDeg — rotation angle in degrees
 * @returns {{ left: number, top: number, width: number, height: number }}
 */
function computeInscribedCrop(W, H, angleDeg) {
  if (angleDeg === 0) {
    return { left: 0, top: 0, width: W, height: H };
  }

  const angleRad = Math.abs((angleDeg * Math.PI) / 180);
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);

  // Rotated bounding box dimensions
  const rotW = W * cosA + H * sinA;
  const rotH = W * sinA + H * cosA;

  // Largest inscribed rectangle: solve for the inscribed rect
  // For a rotated rectangle, the inscribed axis-aligned rectangle has dimensions:
  let cropW, cropH;

  if (W >= H) {
    // Landscape or square
    cropW = (W * cosA - H * sinA) / (cosA * cosA - sinA * sinA + 1e-10);
    cropH = (H * cosA - W * sinA) / (cosA * cosA - sinA * sinA + 1e-10);

    // Fallback if formula gives invalid results
    if (cropW <= 0 || cropH <= 0 || cropW > rotW || cropH > rotH) {
      cropW = W - 2 * H * sinA;
      cropH = H - 2 * W * sinA;
    }
    if (cropW <= 0 || cropH <= 0) {
      cropW = W * cosA;
      cropH = H * cosA;
    }
  } else {
    // Portrait
    cropW = (W * cosA - H * sinA) / (cosA * cosA - sinA * sinA + 1e-10);
    cropH = (H * cosA - W * sinA) / (cosA * cosA - sinA * sinA + 1e-10);

    if (cropW <= 0 || cropH <= 0 || cropW > rotW || cropH > rotH) {
      cropW = W - 2 * H * sinA;
      cropH = H - 2 * W * sinA;
    }
    if (cropW <= 0 || cropH <= 0) {
      cropW = W * cosA;
      cropH = H * cosA;
    }
  }

  cropW = Math.max(1, Math.floor(cropW));
  cropH = Math.max(1, Math.floor(cropH));

  // Center the crop in the rotated bounding box
  const left = Math.max(0, Math.floor((rotW - cropW) / 2));
  const top = Math.max(0, Math.floor((rotH - cropH) / 2));

  return { left, top, width: cropW, height: cropH };
}

// ---------------------------------------------------------------------------
// Deskew a single image
// ---------------------------------------------------------------------------

/**
 * Deskew a single image: rotate by the given angle and optionally crop.
 *
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {object} options
 * @param {number} options.angle — rotation angle in degrees (positive = counter-clockwise)
 * @param {'autoCrop'|'fillWhite'|'fillBlack'|'none'} [options.cropMode='autoCrop']
 * @param {string} [options.outputFormat='original']
 * @returns {Promise<{ ok: boolean, angle: number, cropped: boolean }>}
 */
async function deskewSingleImage(inputPath, outputPath, options = {}) {
  const sharp = getSharp();
  if (!sharp) {
    throw new Error('sharp module is not available. Please reinstall the application.');
  }

  const angle = typeof options.angle === 'number' ? options.angle : 0;
  const cropMode = options.cropMode || 'autoCrop';
  const outputFormat = options.outputFormat || 'original';

  // No rotation needed
  if (Math.abs(angle) < 0.05) {
    if (inputPath !== outputPath) {
      const outDir = path.dirname(outputPath);
      await fs.promises.mkdir(outDir, { recursive: true });
      await fs.promises.copyFile(inputPath, outputPath);
    }
    return { ok: true, angle: 0, cropped: false };
  }

  const inputBuffer = await fs.promises.readFile(inputPath);
  const meta = await sharp(inputBuffer).metadata();
  const W = meta.width || 0;
  const H = meta.height || 0;

  if (W === 0 || H === 0) {
    throw new Error(`Invalid image dimensions for ${path.basename(inputPath)}`);
  }

  // Determine background color based on cropMode
  let background;
  if (cropMode === 'fillWhite') {
    background = { r: 255, g: 255, b: 255, alpha: 1 };
  } else if (cropMode === 'fillBlack') {
    background = { r: 0, g: 0, b: 0, alpha: 1 };
  } else {
    // For autoCrop and none, use white background during rotation
    background = { r: 255, g: 255, b: 255, alpha: 1 };
  }

  // Rotate the image with nohalo interpolator to eliminate blurriness and halos on text/lines
  let pipeline = sharp(inputBuffer).rotate(angle, {
    background,
    interpolator: sharp.interpolators?.nohalo || 'bicubic',
  });

  // Apply crop if mode is autoCrop
  let cropped = false;
  if (cropMode === 'autoCrop' && Math.abs(angle) >= 0.1) {
    const crop = computeInscribedCrop(W, H, angle);
    if (crop.width > 0 && crop.height > 0 && crop.width < W * 2 && crop.height < H * 2) {
      pipeline = pipeline.extract({
        left: crop.left,
        top: crop.top,
        width: crop.width,
        height: crop.height,
      });
      cropped = true;
    }
  }

  // Determine output format
  const srcExt = normalizeExt(path.extname(inputPath));
  const outExt = determineOutputExt(srcExt, outputFormat);

  // Apply output format
  pipeline = applyFormat(pipeline, outExt);

  // Ensure output directory exists
  const outDir = path.dirname(outputPath);
  await fs.promises.mkdir(outDir, { recursive: true });

  await pipeline.toFile(outputPath);

  return { ok: true, angle, cropped };
}

// ---------------------------------------------------------------------------
// Generate preview (data URL) of deskewed image
// ---------------------------------------------------------------------------

/**
 * Generate a preview of the deskewed image as a data URL.
 *
 * @param {string} imagePath
 * @param {number} angle — rotation angle in degrees
 * @param {'autoCrop'|'fillWhite'|'fillBlack'|'none'} [cropMode='autoCrop']
 * @returns {Promise<{ ok: boolean, dataUrl: string }>}
 */
async function previewDeskew(imagePath, angle, cropMode = 'autoCrop') {
  const sharp = getSharp();
  if (!sharp) {
    return { ok: false, error: 'sharp module not available' };
  }

  try {
    const inputBuffer = await fs.promises.readFile(imagePath);
    const meta = await sharp(inputBuffer).metadata();
    const W = meta.width || 0;
    const H = meta.height || 0;

    if (W === 0 || H === 0) {
      return { ok: false, error: 'Invalid image dimensions' };
    }

    // Keep native resolution without downscaling (up to 3840px) so preview is as sharp as original
    const maxPreviewW = 3840;
    const previewScale = Math.min(1, maxPreviewW / W);

    let background;
    if (cropMode === 'fillBlack') {
      background = { r: 0, g: 0, b: 0, alpha: 1 };
    } else {
      background = { r: 255, g: 255, b: 255, alpha: 1 };
    }

    let pipeline = sharp(inputBuffer);

    if (previewScale < 1) {
      pipeline = pipeline.resize(Math.round(W * previewScale), Math.round(H * previewScale), {
        fit: 'fill',
      });
    }

    if (Math.abs(angle) >= 0.05) {
      pipeline = pipeline.rotate(angle, {
        background,
        interpolator: sharp.interpolators?.nohalo || 'bicubic',
      });

      if (cropMode === 'autoCrop' && Math.abs(angle) >= 0.1) {
        const pW = Math.round(W * previewScale);
        const pH = Math.round(H * previewScale);
        const crop = computeInscribedCrop(pW, pH, angle);
        if (crop.width > 0 && crop.height > 0) {
          pipeline = pipeline.extract({
            left: crop.left,
            top: crop.top,
            width: crop.width,
            height: crop.height,
          });
        }
      }
    }

    const buffer = await pipeline.jpeg({
      quality: 96,
      chromaSubsampling: '4:4:4',
      mozjpeg: true,
    }).toBuffer();
    const dataUrl = `data:image/jpeg;base64,${buffer.toString('base64')}`;

    return { ok: true, dataUrl };
  } catch (err) {
    logger.error(`previewDeskew failed for ${path.basename(imagePath)}:`, err.message);
    return { ok: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Scan folder for images and detect skew angles
// ---------------------------------------------------------------------------

/**
 * Scan a directory for images and detect their skew angles.
 *
 * @param {object} options
 * @param {string} options.sourceDir
 * @param {boolean} [options.includeSubfolders=true]
 * @param {number} [options.maxDepth=5]
 * @param {boolean} [options.autoDetect=true] — whether to run auto-detect on each image
 * @returns {Promise<{ ok: boolean, images: Array, stats: object }>}
 */
async function scanForDeskew({
  sourceDir,
  sourceFiles,
  includeSubfolders = true,
  maxDepth = 5,
  autoDetect = true,
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
  let needsDeskewCount = 0;
  let okCount = 0;
  const SKEW_THRESHOLD = 0.5; // degrees — below this is considered "OK"

  for (const absolutePath of sorted) {
    const ext = path.extname(absolutePath);
    if (!isImageExt(ext)) continue;

    const relativePath = isFilesMode ? path.basename(absolutePath) : path.relative(root, absolutePath);
    let width = 0;
    let height = 0;
    let detectedAngle = 0;
    let confidence = 0;

    try {
      if (sharp) {
        const inputBuffer = await fs.promises.readFile(absolutePath);
        const meta = await sharp(inputBuffer).metadata();
        width = meta.width || 0;
        height = meta.height || 0;
      }

      if (autoDetect) {
        const result = await detectSkewAngle(absolutePath);
        detectedAngle = result.angle;
        confidence = result.confidence;
      }
    } catch (e) {
      logger.error(`Failed to process ${relativePath}:`, e.message);
    }

    const needsDeskew = Math.abs(detectedAngle) > SKEW_THRESHOLD;
    if (needsDeskew) needsDeskewCount++;
    else okCount++;

    images.push({
      absolutePath,
      relativePath,
      width,
      height,
      detectedAngle,
      confidence,
      needsDeskew,
    });
  }

  return {
    ok: true,
    images,
    stats: {
      total: images.length,
      needsDeskew: needsDeskewCount,
      ok: okCount,
    },
  };
}

// ---------------------------------------------------------------------------
// Batch deskew
// ---------------------------------------------------------------------------

let deskewCancelled = false;

function requestCancelDeskew() {
  deskewCancelled = true;
}

function resetDeskewCancel() {
  deskewCancelled = false;
}

/**
 * Batch deskew images.
 *
 * @param {object} opts
 * @param {string} opts.sourceDir
 * @param {string|null} opts.outputDir — null means overwrite in-place
 * @param {'autoCrop'|'fillWhite'|'fillBlack'|'none'} [opts.cropMode='autoCrop']
 * @param {string} [opts.outputFormat='original']
 * @param {boolean} [opts.includeSubfolders=true]
 * @param {number} [opts.maxDepth=5]
 * @param {string[]} [opts.excludedPaths=[]] — paths to exclude from processing
 * @param {Object<string, number>} [opts.customAngles={}] — { absolutePath: angle } user overrides
 * @param {(progress: object) => void} [opts.onProgress]
 * @returns {Promise<{ ok: boolean, deskewed: number, skipped: number, failed: number, cancelled: boolean, errors: Array }>}
 */
async function deskewBatch({
  sourceDir,
  sourceFiles,
  outputDir = null,
  cropMode = 'autoCrop',
  outputFormat = 'original',
  includeSubfolders = true,
  maxDepth = 5,
  excludedPaths = [],
  customAngles = {},
  onProgress,
} = {}) {
  resetDeskewCancel();

  const inPlace = !outputDir;
  const scan = await scanForDeskew({
    sourceDir,
    sourceFiles,
    includeSubfolders,
    maxDepth,
    autoDetect: true,
  });

  if (!scan.ok) {
    return { ok: false, deskewed: 0, skipped: 0, failed: 0, cancelled: false, errors: [{ error: scan.error }] };
  }

  const outRoot = inPlace ? null : path.resolve(String(outputDir).trim());
  const excludedSet = new Set(excludedPaths);

  let deskewed = 0;
  let skipped = 0;
  let failed = 0;
  const errors = [];
  const total = scan.images.length;

  for (let i = 0; i < scan.images.length; i++) {
    if (deskewCancelled) {
      return { ok: true, deskewed, skipped, failed, cancelled: true, errors };
    }

    const item = scan.images[i];
    const rel = item.relativePath;

    if (onProgress) {
      onProgress({
        done: i,
        total,
        currentFile: rel,
      });
    }

    // Skip excluded paths
    if (excludedSet.has(item.absolutePath)) {
      skipped++;
      // Copy to output if not in-place
      if (!inPlace) {
        try {
          const outPath = path.join(outRoot, rel);
          await fs.promises.mkdir(path.dirname(outPath), { recursive: true });
          await fs.promises.copyFile(item.absolutePath, outPath);
        } catch (e) {
          logger.error(`Failed to copy excluded ${rel}:`, e.message);
        }
      }
      continue;
    }

    // Determine angle: user override > auto-detected
    const angle = typeof customAngles[item.absolutePath] === 'number'
      ? customAngles[item.absolutePath]
      : item.detectedAngle;

    // Skip if angle is negligible
    if (Math.abs(angle) < 0.1) {
      skipped++;
      if (!inPlace) {
        try {
          const outPath = path.join(outRoot, rel);
          await fs.promises.mkdir(path.dirname(outPath), { recursive: true });
          await fs.promises.copyFile(item.absolutePath, outPath);
        } catch (e) {
          logger.error(`Failed to copy straight ${rel}:`, e.message);
        }
      }
      continue;
    }

    // Determine output path
    const srcExt = normalizeExt(path.extname(item.absolutePath));
    const outExt = determineOutputExt(srcExt, outputFormat);
    const baseName = path.basename(rel, path.extname(rel));
    const outRel = path.join(path.dirname(rel), `${baseName}${outExt}`);
    const outPath = inPlace
      ? path.join(path.dirname(item.absolutePath), `${baseName}${outExt}`)
      : path.join(outRoot, outRel);

    try {
      // If in-place and format changes, we'll write to a temp file first
      if (inPlace && outExt !== srcExt) {
        const tmpPath = `${item.absolutePath}.deskew.tmp`;
        await deskewSingleImage(item.absolutePath, tmpPath, {
          angle,
          cropMode,
          outputFormat,
        });
        // Remove original and rename temp
        await fs.promises.unlink(item.absolutePath);
        await fs.promises.rename(tmpPath, outPath);
      } else if (inPlace) {
        const tmpPath = `${item.absolutePath}.deskew.tmp`;
        await deskewSingleImage(item.absolutePath, tmpPath, {
          angle,
          cropMode,
          outputFormat,
        });
        await fs.promises.unlink(item.absolutePath);
        await fs.promises.rename(tmpPath, item.absolutePath);
      } else {
        await deskewSingleImage(item.absolutePath, outPath, {
          angle,
          cropMode,
          outputFormat,
        });
      }
      deskewed++;
    } catch (e) {
      logger.error(`Failed to deskew ${rel}:`, e.message);
      errors.push({ file: rel, error: e.message });
      failed++;

      // Copy original if not in-place
      if (!inPlace) {
        try {
          await fs.promises.mkdir(path.dirname(outPath), { recursive: true });
          await fs.promises.copyFile(item.absolutePath, outPath);
        } catch (copyErr) {
          logger.error(`Failed to copy fallback ${rel}:`, copyErr.message);
        }
      }
    }
  }

  if (onProgress) {
    onProgress({ done: total, total, currentFile: '' });
  }

  return { ok: true, deskewed, skipped, failed, cancelled: false, errors };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  detectSkewAngle,
  detectSkewAngleFromBuffer,
  computeInscribedCrop,
  deskewSingleImage,
  previewDeskew,
  scanForDeskew,
  deskewBatch,
  requestCancelDeskew,
};
