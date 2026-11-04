const Jimp = require('jimp');
const fs = require('fs');
const os = require('os');
const path = require('path');
const logger = require('../../shared/logger').createLogger('RotateDoublePage');

let _sharp = null;
function getSharp() {
  if (_sharp === null) {
    try {
      _sharp = require('sharp');
    } catch (_) {
      _sharp = false;
    }
  }
  return _sharp || null;
}

/**
 * Phát hiện xem ảnh có phải trang đôi (spread) không dựa trên tỷ lệ khung hình.
 * Trang đôi thường có width > height và tỷ lệ >= 1.2 (landscape).
 *
 * @param {number} width
 * @param {number} height
 * @param {number} [threshold=1.2] - Ngưỡng tỷ lệ width/height để coi là trang đôi
 * @returns {boolean}
 */
function isDoublePage(width, height, threshold = 1.2) {
  if (width <= 0 || height <= 0) return false;
  const ratio = width / height;
  return ratio >= threshold;
}

/**
 * Xoay ảnh 90 độ ngược chiều kim đồng hồ (counter-clockwise) và lưu vào file mới.
 *
 * @param {string} inputPath - Đường dẫn file ảnh gốc
 * @param {string} outputPath - Đường dẫn file ảnh đầu ra
 * @returns {Promise<void>}
 */
async function rotateImage90Clockwise(inputPath, outputPath) {
  const sharp = getSharp();
  if (sharp) {
    await sharp(inputPath).rotate(270).toFile(outputPath);
    return;
  }
  const image = await Jimp.read(inputPath);
  image.rotate(90);
  await new Promise((resolve, reject) => {
    image.write(outputPath, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

const SUPPORTED_IMAGE_EXTS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.bmp', '.tiff', '.tif'
]);

function isSupportedImageFile(filePath) {
  if (!filePath || typeof filePath !== 'string') return false;
  const ext = path.extname(filePath).toLowerCase();
  return SUPPORTED_IMAGE_EXTS.has(ext);
}

/**
 * Kiểm tra và xoay ảnh nếu là trang đôi.
 * Trả về true nếu đã xoay, false nếu không xoay.
 *
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {object} [options]
 * @param {number} [options.threshold=1.2] - Ngưỡng tỷ lệ để coi là trang đôi
 * @returns {Promise<boolean>} - true nếu đã xoay
 */
async function processImageForDoublePageRotation(inputPath, outputPath, options = {}) {
  if (!isSupportedImageFile(inputPath)) {
    if (inputPath !== outputPath) {
      try {
        fs.copyFileSync(inputPath, outputPath);
      } catch (_) {}
    }
    return false;
  }

  const threshold = options.threshold || 1.2;
  const sharp = getSharp();

  if (sharp) {
    try {
      const meta = await sharp(inputPath).metadata();
      const width = meta.width || 0;
      const height = meta.height || 0;
      const ratio = width / height;

      logger.debug(` ${path.basename(inputPath)}: ${width}×${height} (ratio: ${ratio.toFixed(2)})`);

      if (isDoublePage(width, height, threshold)) {
        logger.debug(`  → Rotating 90° counter-clockwise (threshold: ${threshold}) via sharp`);
        await sharp(inputPath).rotate(270).toFile(outputPath);
        return true;
      }

      if (inputPath !== outputPath) {
        fs.copyFileSync(inputPath, outputPath);
      }
      return false;
    } catch (error) {
      logger.error(`Error processing ${path.basename(inputPath)} with sharp:`, error.message);
      if (inputPath !== outputPath) {
        try {
          fs.copyFileSync(inputPath, outputPath);
        } catch (_) {}
      }
      throw new Error(`Lỗi xử lý ảnh ${path.basename(inputPath)}: ${error.message}`);
    }
  }

  // Fallback to Jimp (for environments without sharp)
  try {
    const image = await Jimp.read(inputPath);
    const width = image.bitmap.width;
    const height = image.bitmap.height;
    const ratio = width / height;

    logger.debug(` ${path.basename(inputPath)}: ${width}×${height} (ratio: ${ratio.toFixed(2)})`);

    if (isDoublePage(width, height, threshold)) {
      logger.debug(`  → Rotating 90° counter-clockwise (threshold: ${threshold}) via Jimp`);
      image.rotate(90);

      await new Promise((resolve, reject) => {
        image.write(outputPath, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      return true;
    }

    if (inputPath !== outputPath) {
      fs.copyFileSync(inputPath, outputPath);
    }
    return false;
  } catch (error) {
    logger.error(`Error processing ${path.basename(inputPath)}:`, error.message);
    if (inputPath !== outputPath) {
      try {
        fs.copyFileSync(inputPath, outputPath);
      } catch (copyErr) {
        logger.error(`Failed to copy fallback:`, copyErr.message);
      }
    }
    throw new Error(`Lỗi xử lý ảnh ${path.basename(inputPath)}: ${error.message}`);
  }
}

/**
 * Tạo thư mục tạm để xử lý xoay trang đôi.
 */
function createTempProcessingDir(prefix = 'manga-rotate-') {
  const baseDir = path.join(os.tmpdir(), 'manga-rotate-temp');
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }
  return fs.mkdtempSync(path.join(baseDir, prefix));
}

/**
 * Xử lý xoay trang đôi cho danh sách ảnh (dùng chung cho CBZ, PDF, EPUB, MOBI).
 *
 * @param {Array<{full?: string, path?: string, title?: string, baseName?: string, ext?: string}>} allItems
 * @param {boolean} rotateDoublePage
 * @param {number} [rotateThreshold=1.2]
 * @param {Function} [onProgress]
 * @returns {Promise<{processedItems: Array, tempDir: string|null, rotatedCount: number}>}
 */
async function processRotateDoublePage(allItems, rotateDoublePage, rotateThreshold = 1.2, onProgress) {
  if (!rotateDoublePage || !Array.isArray(allItems) || !allItems.length) {
    return { processedItems: allItems, tempDir: null, rotatedCount: 0 };
  }

  logger.debug(`Rotate double-page enabled (threshold: ${rotateThreshold})`);
  const tempDir = createTempProcessingDir();
  const processedItems = [];
  let rotatedCount = 0;

  for (let i = 0; i < allItems.length; i++) {
    const item = allItems[i];
    const srcPath = item.full || item.path || '';

    if (!isSupportedImageFile(srcPath)) {
      processedItems.push(item);
      continue;
    }

    const ext = item.ext || path.extname(srcPath).toLowerCase() || '.jpg';
    const tempOutput = path.join(tempDir, `${i}${ext}`);

    try {
      const wasRotated = await processImageForDoublePageRotation(srcPath, tempOutput, { threshold: rotateThreshold });
      if (wasRotated) rotatedCount++;
      processedItems.push({
        ...item,
        full: tempOutput,
        path: tempOutput,
      });
      onProgress?.({
        done: i + 1,
        total: allItems.length,
        label: `${item.title || path.basename(srcPath)} (${i + 1}/${allItems.length})`,
        rotated: rotatedCount,
      });
    } catch (e) {
      logger.error(`Failed to process ${path.basename(srcPath)}:`, e.message);
      processedItems.push(item);
    }
  }

  return { processedItems, tempDir, rotatedCount };
}

/**
 * Xử lý batch nhiều ảnh với callback tiến độ.
 *
 * @param {Array<{input: string, output: string}>} items
 * @param {object} [options]
 * @param {number} [options.threshold=1.2]
 * @param {(progress: {done: number, total: number, rotated: number}) => void} [options.onProgress]
 * @returns {Promise<{total: number, rotated: number}>}
 */
async function processBatchImages(items, options = {}) {
  const threshold = options.threshold || 1.2;
  const onProgress = options.onProgress;

  let rotatedCount = 0;
  const total = items.length;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const wasRotated = await processImageForDoublePageRotation(
      item.input,
      item.output,
      { threshold }
    );

    if (wasRotated) {
      rotatedCount++;
    }

    if (onProgress) {
      onProgress({ done: i + 1, total, rotated: rotatedCount });
    }
  }

  return { total, rotated: rotatedCount };
}

module.exports = {
  isDoublePage,
  rotateImage90Clockwise,
  processImageForDoublePageRotation,
  processBatchImages,
  processRotateDoublePage,
  createTempProcessingDir,
};
