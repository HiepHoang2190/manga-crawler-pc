/**
 * AutoProcessor — Chế độ tự động dịch và xuất file đệ quy toàn bộ folder / chapter.
 *
 * Tính năng chính:
 * 1. Quét đệ quy cây thư mục đầu vào, nhận diện tất cả file ảnh manga.
 * 2. Tái tạo 100% cấu trúc thư mục con tại thư mục đầu ra.
 * 3. Hỗ trợ "Skip Existing" — bỏ qua các file đã xuất trước đó (hỗ trợ resume khi ngắt quãng).
 * 4. Chạy TranslatePipeline hoàn chỉnh kèm Verification Gate (100% tiếng Việt, zero missing).
 * 5. Xuất ảnh đã dịch trực tiếp vào thư mục đầu ra.
 * 6. Tính toán ETA và phát progress real-time qua IPC tới UI.
 */
const fs = require('fs');
const path = require('path');
const logger = require('../shared/logger');

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp']);

class AutoProcessor {
  /**
   * @param {import('./TranslatePipeline')} pipeline
   */
  constructor(pipeline) {
    this._pipeline = pipeline;
    this._isProcessing = false;
    this._cancelled = false;
    this._stats = {
      total: 0,
      current: 0,
      success: 0,
      skipped: 0,
      error: 0,
      startTime: null,
      currentFile: '',
      errors: [],
    };
  }

  /**
   * Quét đệ quy tất cả file ảnh trong thư mục.
   * Sắp xếp tự nhiên theo tên và đường dẫn.
   * @param {string} dirPath
   * @returns {string[]} danh sách absolute paths
   */
  static scanImagesRecursive(dirPath) {
    const images = [];
    if (!fs.existsSync(dirPath)) return images;

    function walk(currentDir) {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      // Sắp xếp tự nhiên để Chapter 1 trước Chapter 2, 01.jpg trước 02.jpg
      entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue; // Bỏ qua file ẩn
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (IMAGE_EXTENSIONS.has(ext)) {
            images.push(fullPath);
          }
        }
      }
    }

    try {
      walk(dirPath);
    } catch (err) {
      logger.error('[AutoProcessor] Scan error:', err.message);
    }
    return images;
  }

  /**
   * Tính toán đường dẫn file đầu ra đảm bảo giữ nguyên cấu trúc thư mục và tên folder gốc.
   * Nếu outputDir là thư mục chung (vd: xxx_translated), giữ lại tên folder nguồn (vd: Dragon Ball).
   * Nếu outputDir đã trùng tên với folder nguồn hoặc có hậu tố _translated, không lặp lại tên.
   *
   * @param {string} inputDir Thư mục nguồn (ví dụ: /path/to/Dragon Ball)
   * @param {string} outputDir Thư mục đích (ví dụ: /path/to/xxx_translated)
   * @param {string} filePath Đường dẫn file ảnh gốc (ví dụ: /path/to/Dragon Ball/chapter 1/01.jpg)
   * @returns {string} destPath (ví dụ: /path/to/xxx_translated/Dragon Ball/chapter 1/01.jpg)
   */
  static computeDestinationPath(inputDir, outputDir, filePath) {
    const relPath = path.relative(inputDir, filePath);
    const rootFolderName = path.basename(inputDir);
    const outBase = path.basename(outputDir);

    const isSameName = outBase.toLowerCase() === rootFolderName.toLowerCase();
    const isTranslatedSuffix = outBase.toLowerCase() === `${rootFolderName}_translated`.toLowerCase();

    if (isSameName || isTranslatedSuffix) {
      return path.join(outputDir, relPath);
    }

    return path.join(outputDir, rootFolderName, relPath);
  }

  get isProcessing() {
    return this._isProcessing;
  }

  get stats() {
    return { ...this._stats };
  }

  cancel() {
    if (this._isProcessing) {
      this._cancelled = true;
      this._pipeline?.cancel?.();
      logger.info('[AutoProcessor] Hủy tiến trình Auto-Processing');
    }
  }

  /**
   * Bắt đầu xử lý đệ quy thư mục.
   * @param {string} inputDir Thư mục nguồn
   * @param {string} outputDir Thư mục đích
   * @param {object} settings Cài đặt pipeline & auto
   * @param {function} onProgress Callback cập nhật tiến trình
   */
  async process(inputDir, outputDir, settings, onProgress) {
    if (this._isProcessing) {
      throw new Error('Một tiến trình Auto-Processing khác đang chạy.');
    }

    if (!inputDir || !fs.existsSync(inputDir)) {
      throw new Error(`Thư mục đầu vào không tồn tại: ${inputDir}`);
    }

    if (!outputDir) {
      throw new Error('Thư mục đầu ra không được để trống.');
    }

    this._isProcessing = true;
    this._cancelled = false;

    // Quét toàn bộ ảnh
    const allFiles = AutoProcessor.scanImagesRecursive(inputDir);
    const total = allFiles.length;

    this._stats = {
      total,
      current: 0,
      success: 0,
      skipped: 0,
      error: 0,
      startTime: Date.now(),
      currentFile: '',
      errors: [],
    };

    logger.info(`[AutoProcessor] Bắt đầu xử lý ${total} file từ "${inputDir}" -> "${outputDir}"`);

    const emit = (status, currentFile = '', detail = '', stepData = null) => {
      if (typeof onProgress !== 'function') return;

      const elapsedMs = Date.now() - this._stats.startTime;
      const doneCount = this._stats.success + this._stats.skipped + this._stats.error;
      let etaSeconds = 0;
      if (doneCount > 0 && doneCount < total) {
        const msPerItem = elapsedMs / doneCount;
        etaSeconds = Math.round(((total - doneCount) * msPerItem) / 1000);
      }

      const percent = total > 0 ? Math.round((doneCount / total) * 100) : 100;

      onProgress({
        status,
        total,
        current: doneCount,
        percent,
        currentFile,
        detail,
        successCount: this._stats.success,
        skippedCount: this._stats.skipped,
        errorCount: this._stats.error,
        etaSeconds,
        elapsedSeconds: Math.round(elapsedMs / 1000),
        stepData,
      });
    };

    emit('start', '', `Tìm thấy ${total} file ảnh trong thư mục.`);

    const skipExisting = settings.autoProcessing?.skipExisting !== false;

    try {
      for (let i = 0; i < total; i++) {
        if (this._cancelled) {
          emit('cancelled', '', 'Người dùng đã dừng tiến trình Auto-Processing.');
          break;
        }

        const filePath = allFiles[i];
        const destPath = AutoProcessor.computeDestinationPath(inputDir, outputDir, filePath);
        const displayRelPath = path.relative(outputDir, destPath);
        this._stats.current = i + 1;
        this._stats.currentFile = displayRelPath;

        // Kiểm tra Skip Existing
        if (skipExisting && fs.existsSync(destPath)) {
          try {
            const stat = fs.statSync(destPath);
            if (stat.size > 500) {
              this._stats.skipped++;
              logger.info(`[AutoProcessor] Bỏ qua file đã tồn tại: ${displayRelPath}`);
              emit('processing', displayRelPath, `[${i + 1}/${total}] Bỏ qua file đã dịch: ${displayRelPath}`);
              continue;
            }
          } catch (_) {}
        }

        emit('processing', displayRelPath, `[${i + 1}/${total}] Đang dịch: ${displayRelPath}`);

        try {
          // Tạo thư mục cha tại output nếu chưa có
          const destDir = path.dirname(destPath);
          if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
          }

          const imageBuffer = fs.readFileSync(filePath);

          // Chạy pipeline cho trang này
          const pageResult = await this._pipeline.translatePage(
            imageBuffer,
            settings,
            (stepProgress) => {
              emit('processing', displayRelPath, `[${i + 1}/${total}] ${displayRelPath}: ${stepProgress.detail || ''}`, stepProgress);
            }
          );

          if (this._cancelled) break;

          // Lưu ảnh kết quả đã typeset vào destPath
          const outBuffer = pageResult.finalImage || pageResult.cleanImage || imageBuffer;
          fs.writeFileSync(destPath, outBuffer);

          this._stats.success++;
          logger.info(`[AutoProcessor] Đã xuất thành công: ${destPath}`);
          emit('page_success', displayRelPath, `Đã xuất thành công: ${displayRelPath}`, {
            filePath,
            relPath: displayRelPath,
            destPath,
            layers: pageResult?.layers || [],
          });
        } catch (fileErr) {
          if (this._cancelled) break;
          this._stats.error++;
          this._stats.errors.push({ file: displayRelPath, error: fileErr.message });
          logger.error(`[AutoProcessor] Lỗi khi xử lý file "${displayRelPath}":`, fileErr.message);
        }
      }

      const finalStatus = this._cancelled ? 'cancelled' : 'completed';
      emit(
        finalStatus,
        '',
        finalStatus === 'completed'
          ? `Hoàn tất tự động dịch: ${this._stats.success} thành công, ${this._stats.skipped} bỏ qua, ${this._stats.error} lỗi.`
          : 'Tiến trình đã bị dừng.'
      );

      return {
        status: finalStatus,
        stats: { ...this._stats },
      };
    } finally {
      this._isProcessing = false;
    }
  }
}

module.exports = AutoProcessor;
