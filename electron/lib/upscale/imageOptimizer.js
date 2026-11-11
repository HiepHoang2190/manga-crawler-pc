'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { warn, info } = require('../shared/logger');

/**
 * Optimizes an upscaled image (Caesium Engine).
 * Downscales dimensions (e.g. 80%, 75%) and compresses with high-fidelity algorithms (mozjpeg, webp, png9).
 * If sharp fails or file is invalid, safely falls back to standard file copy.
 *
 * @param {string} srcPath - Path to source image file
 * @param {string} destPath - Path to destination file
 * @param {Object} [options]
 * @param {boolean} [options.enabled=true] - Whether compression is enabled
 * @param {number} [options.resizeRatio=0.8] - Scale factor (e.g. 0.8 = 80%, 1.0 = 100% no dimension change)
 * @param {number} [options.quality=85] - Compression quality (1-100, default 85)
 * @param {string} [options.format='original'] - Target format ('original', 'jpg', 'webp', 'png')
 * @returns {Promise<{success: boolean, fallbackCopied?: boolean, originalBytes: number, optimizedBytes: number, savedBytes: number, savedPercent: number, width?: number, height?: number, error?: string}>}
 */
async function optimizeUpscaledImage(srcPath, destPath, options = {}) {
  const enabled = options.enabled !== false;
  const resizeRatio = Number(options.resizeRatio ?? 0.8);
  const quality = Math.max(1, Math.min(100, Number(options.quality ?? 85)));

  let origStat;
  try {
    origStat = await fs.promises.stat(srcPath);
  } catch (err) {
    origStat = { size: 0 };
  }

  // Ensure destination directory exists
  const destDir = path.dirname(destPath);
  if (!fs.existsSync(destDir)) {
    await fs.promises.mkdir(destDir, { recursive: true });
  }

  // If compression is disabled, perform straight copy
  if (!enabled) {
    await fs.promises.copyFile(srcPath, destPath);
    const destStat = await fs.promises.stat(destPath);
    return {
      success: true,
      originalBytes: origStat.size,
      optimizedBytes: destStat.size,
      savedBytes: 0,
      savedPercent: 0,
    };
  }

  const tempDest = `${destPath}.tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  try {
    // Read to buffer first to avoid file-locking on Windows
    const inputBuffer = await fs.promises.readFile(srcPath);
    let pipeline = sharp(inputBuffer);
    const metadata = await pipeline.metadata();

    let targetWidth = metadata.width;
    let targetHeight = metadata.height;

    // Apply Lanczos3 downscaling if ratio is between 0 and 1.0
    if (resizeRatio > 0 && resizeRatio < 1.0 && targetWidth && targetHeight) {
      targetWidth = Math.max(1, Math.round(targetWidth * resizeRatio));
      targetHeight = Math.max(1, Math.round(targetHeight * resizeRatio));

      pipeline = pipeline.resize(targetWidth, targetHeight, {
        kernel: sharp.kernel.lanczos3,
        withoutEnlargement: true,
      });
    }

    // Determine target format from options or destination file extension
    const destExt = path.extname(destPath).toLowerCase();
    const optFormat = String(options.format || 'original').toLowerCase();
    let format = optFormat !== 'original' ? optFormat : destExt.replace('.', '');

    // WebP specification caps maximum dimension at 16383px; fallback to JPEG if exceeded
    if (format === 'webp' && (targetWidth > 16383 || targetHeight > 16383)) {
      format = 'jpg';
    }

    if (format === 'jpg' || format === 'jpeg') {
      pipeline = pipeline.jpeg({
        quality,
        mozjpeg: true,
        chromaSubsampling: '4:4:4',
      });
    } else if (format === 'webp') {
      pipeline = pipeline.webp({
        quality,
        effort: 4,
      });
    } else if (format === 'png') {
      pipeline = pipeline.png({
        compressionLevel: 9,
        effort: 7,
      });
    }

    // Atomic write to temporary file first, then rename to destination
    await pipeline.toFile(tempDest);
    await fs.promises.rename(tempDest, destPath);

    const destStat = await fs.promises.stat(destPath);
    const savedBytes = Math.max(0, origStat.size - destStat.size);
    const savedPercent = origStat.size > 0 ? Math.round((savedBytes / origStat.size) * 100) : 0;

    return {
      success: true,
      originalBytes: origStat.size,
      optimizedBytes: destStat.size,
      savedBytes,
      savedPercent,
      width: targetWidth,
      height: targetHeight,
    };
  } catch (err) {
    try {
      if (fs.existsSync(tempDest)) {
        await fs.promises.unlink(tempDest);
      }
    } catch {}

    warn(`[CaesiumEngine] Failed to optimize image ${srcPath}: ${err.message}. Falling back.`);

    // If optimizing in-place and failed, destPath was never truncated because we wrote to tempDest!
    if (srcPath === destPath) {
      return {
        success: false,
        fallbackCopied: true,
        error: err.message,
        originalBytes: origStat.size,
        optimizedBytes: origStat.size,
        savedBytes: 0,
        savedPercent: 0,
      };
    }

    try {
      await fs.promises.copyFile(srcPath, destPath);
      const destStat = await fs.promises.stat(destPath);
      return {
        success: false,
        fallbackCopied: true,
        error: err.message,
        originalBytes: origStat.size,
        optimizedBytes: destStat.size,
        savedBytes: 0,
        savedPercent: 0,
      };
    } catch (copyErr) {
      return {
        success: false,
        fallbackCopied: false,
        error: copyErr.message,
        originalBytes: origStat.size,
        optimizedBytes: 0,
        savedBytes: 0,
        savedPercent: 0,
      };
    }
  }
}

module.exports = {
  optimizeUpscaledImage,
};

