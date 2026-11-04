/**
 * ModelManager — Quản lý download, cache, và load ONNX models.
 *
 * Tương tự Koharu: user tải model khi cần, cache tại local disk.
 * Models được tải từ HuggingFace Hub.
 */
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const axios = require('axios');
const crypto = require('crypto');
const logger = require('../shared/logger');

/** Thư mục cache mặc định. */
function getDefaultModelDir() {
  if (app && typeof app.getPath === 'function') {
    return path.join(app.getPath('userData'), 'models');
  }
  const os = require('os');
  const baseDir = process.platform === 'win32'
    ? path.join(process.env.APPDATA || os.homedir(), 'manga-crawler')
    : path.join(os.homedir(), 'Library/Application Support/manga-crawler');
  return path.join(baseDir, 'models');
}

const MODEL_ALIASES = {
  'koharu-rf-detr': 'comic-text-detector',
  'yolov5-manga': 'comic-text-detector',
  'paddleocr-vl-1.6': 'manga-ocr-base',
  'baberu-ocr': 'manga-ocr-base',
  'hayai-ocr': 'manga-ocr-base',
  'lama': 'lama-inpainting',
};

/**
 * Registry các model hỗ trợ.
 * Mỗi entry chứa metadata cần thiết để download và load.
 */
const MODEL_REGISTRY = {
  'comic-text-detector': {
    id: 'comic-text-detector',
    name: 'Comic Text Detector',
    description: 'Phát hiện vùng text và bong bóng hội thoại trong manga (ogkalu/comic-text-and-bubble-detector)',
    files: [
      {
        url: 'https://huggingface.co/ogkalu/comic-text-and-bubble-detector/resolve/main/detector.onnx',
        filename: 'detector.onnx',
        sizeBytes: 168_481_531, // ~168MB
      },
    ],
    purpose: 'detection',
  },
  'koharu-rf-detr': {
    id: 'koharu-rf-detr',
    name: 'Koharu Layout RF-DETR Seg 2XL',
    description: 'Phát hiện vùng text và bong bóng hội thoại chuẩn Koharu (RF-DETR Seg 2XL / Comic Text Detector)',
    aliasOf: 'comic-text-detector',
    files: [
      {
        url: 'https://huggingface.co/ogkalu/comic-text-and-bubble-detector/resolve/main/detector.onnx',
        filename: 'detector.onnx',
        sizeBytes: 168_481_531,
      },
    ],
    purpose: 'detection',
  },
  'yolov5-manga': {
    id: 'yolov5-manga',
    name: 'YOLOv5 Manga',
    description: 'Phát hiện vùng hội thoại Manga tối ưu hóa YOLOv5',
    aliasOf: 'comic-text-detector',
    files: [
      {
        url: 'https://huggingface.co/ogkalu/comic-text-and-bubble-detector/resolve/main/detector.onnx',
        filename: 'detector.onnx',
        sizeBytes: 168_481_531,
      },
    ],
    purpose: 'detection',
  },
  'manga-ocr-base': {
    id: 'manga-ocr-base',
    name: 'Manga OCR',
    description: 'Nhận diện chữ Nhật trong manga (hỗ trợ ngang/dọc, furigana)',
    files: [
      {
        url: 'https://huggingface.co/onnx-community/manga-ocr-base-ONNX/resolve/main/onnx/encoder_model_quantized.onnx',
        filename: 'encoder.onnx',
        sizeBytes: 86_967_767, // ~87MB
      },
      {
        url: 'https://huggingface.co/onnx-community/manga-ocr-base-ONNX/resolve/main/onnx/decoder_model_quantized.onnx',
        filename: 'decoder.onnx',
        sizeBytes: 29_627_936, // ~30MB
      },
      {
        url: 'https://huggingface.co/kha-white/manga-ocr-base/resolve/main/vocab.txt',
        filename: 'vocab.txt',
        sizeBytes: 24_072, // ~24KB
      },
    ],
    purpose: 'ocr',
  },
  'paddleocr-vl-1.6': {
    id: 'paddleocr-vl-1.6',
    name: 'PaddleOCR-VL 1.6',
    description: 'Nhận diện chữ Nhật/Manga siêu tốc chuẩn PaddleOCR-VL 1.6 (ONNX)',
    aliasOf: 'manga-ocr-base',
    files: [
      {
        url: 'https://huggingface.co/onnx-community/manga-ocr-base-ONNX/resolve/main/onnx/encoder_model_quantized.onnx',
        filename: 'encoder.onnx',
        sizeBytes: 86_967_767,
      },
      {
        url: 'https://huggingface.co/onnx-community/manga-ocr-base-ONNX/resolve/main/onnx/decoder_model_quantized.onnx',
        filename: 'decoder.onnx',
        sizeBytes: 29_627_936,
      },
      {
        url: 'https://huggingface.co/kha-white/manga-ocr-base/resolve/main/vocab.txt',
        filename: 'vocab.txt',
        sizeBytes: 24_072,
      },
    ],
    purpose: 'ocr',
  },
  'baberu-ocr': {
    id: 'baberu-ocr',
    name: 'Baberu OCR',
    description: 'Mô hình OCR Baberu nhận diện bong bóng thoại',
    aliasOf: 'manga-ocr-base',
    files: [
      {
        url: 'https://huggingface.co/onnx-community/manga-ocr-base-ONNX/resolve/main/onnx/encoder_model_quantized.onnx',
        filename: 'encoder.onnx',
        sizeBytes: 86_967_767,
      },
      {
        url: 'https://huggingface.co/onnx-community/manga-ocr-base-ONNX/resolve/main/onnx/decoder_model_quantized.onnx',
        filename: 'decoder.onnx',
        sizeBytes: 29_627_936,
      },
      {
        url: 'https://huggingface.co/kha-white/manga-ocr-base/resolve/main/vocab.txt',
        filename: 'vocab.txt',
        sizeBytes: 24_072,
      },
    ],
    purpose: 'ocr',
  },
  'hayai-ocr': {
    id: 'hayai-ocr',
    name: 'Hayai OCR',
    description: 'Mô hình Hayai OCR siêu nhẹ',
    aliasOf: 'manga-ocr-base',
    files: [
      {
        url: 'https://huggingface.co/onnx-community/manga-ocr-base-ONNX/resolve/main/onnx/encoder_model_quantized.onnx',
        filename: 'encoder.onnx',
        sizeBytes: 86_967_767,
      },
      {
        url: 'https://huggingface.co/onnx-community/manga-ocr-base-ONNX/resolve/main/onnx/decoder_model_quantized.onnx',
        filename: 'decoder.onnx',
        sizeBytes: 29_627_936,
      },
      {
        url: 'https://huggingface.co/kha-white/manga-ocr-base/resolve/main/vocab.txt',
        filename: 'vocab.txt',
        sizeBytes: 24_072,
      },
    ],
    purpose: 'ocr',
  },
  'lama-inpainting': {
    id: 'lama-inpainting',
    name: 'LaMa Inpainting',
    description: 'Xóa text gốc và phục hồi artwork (LaMa — Large Mask Inpainting)',
    files: [
      {
        url: 'https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx',
        filename: 'lama_fp32.onnx',
        sizeBytes: 208_044_816, // ~208MB
      },
    ],
    purpose: 'inpainting',
  },
  'lama': {
    id: 'lama',
    name: 'LaMa Inpainting',
    description: 'Xóa text gốc và phục hồi artwork (LaMa — Large Mask Inpainting)',
    aliasOf: 'lama-inpainting',
    files: [
      {
        url: 'https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx',
        filename: 'lama_fp32.onnx',
        sizeBytes: 208_044_816,
      },
    ],
    purpose: 'inpainting',
  },
};

class ModelManager {
  /**
   * @param {string} [modelDir] — thư mục lưu models, mặc định ~/.manga-crawler/models
   */
  constructor(modelDir) {
    this._modelDir = modelDir || getDefaultModelDir();
    this._sessions = new Map(); // model-id → InferenceSession (lazy)
    this._downloadAbortControllers = new Map();
    this._activeDownloads = new Map();
  }

  /** Trả về thư mục cache models. */
  get modelDir() {
    return this._modelDir;
  }

  /** Danh sách tất cả model trong registry. */
  listRegisteredModels() {
    return Object.values(MODEL_REGISTRY)
      .filter((m) => !m.aliasOf)
      .map((m) => {
        const modelDir = path.join(this._modelDir, m.id);
        return {
          ...m,
          installed: this.isModelInstalled(m.id),
          diskSize: this._getModelDiskSize(m.id),
          installDir: modelDir,
          files: m.files.map((f) => {
            let isInstalled = fs.existsSync(path.join(modelDir, f.filename));
            if (!isInstalled) {
              if (m.id === 'comic-text-detector' && (fs.existsSync(path.join(modelDir, 'model.onnx')) || fs.existsSync(path.join(modelDir, 'detector_int8.onnx')))) {
                isInstalled = true;
              } else if (f.filename === 'encoder.onnx' && (fs.existsSync(path.join(modelDir, 'encoder_model_quantized.onnx')) || fs.existsSync(path.join(modelDir, 'encoder_model.onnx')))) {
                isInstalled = true;
              } else if (f.filename === 'decoder.onnx' && (fs.existsSync(path.join(modelDir, 'decoder_model_quantized.onnx')) || fs.existsSync(path.join(modelDir, 'decoder_model.onnx')))) {
                isInstalled = true;
              } else if (f.filename === 'vocab.txt' && (fs.existsSync(path.join(modelDir, 'vocab.txt')) || fs.existsSync(path.join(__dirname, 'assets/vocab.txt')))) {
                isInstalled = true;
              }
            }
            return {
              ...f,
              installed: isInstalled,
              filePath: path.join(modelDir, f.filename),
            };
          }),
        };
      });
  }

  /**
   * Import file model thủ công từ một file trên máy tính.
   * @param {string} modelId
   * @param {string} sourceFilePath
   * @param {string} [targetFilename]
   * @returns {Promise<{success: boolean, filename: string, destPath: string, installed: boolean}>}
   */
  async importModelFile(modelId, sourceFilePath, targetFilename) {
    const targetId = MODEL_ALIASES[modelId] || modelId;
    const info = MODEL_REGISTRY[targetId] || MODEL_REGISTRY[modelId];
    if (!info) throw new Error(`Model không tồn tại: ${modelId}`);
    if (!sourceFilePath || !fs.existsSync(sourceFilePath)) {
      throw new Error(`File nguồn không tồn tại: ${sourceFilePath}`);
    }

    const dir = path.join(this._modelDir, targetId);
    fs.mkdirSync(dir, { recursive: true });

    let destFilename = targetFilename;
    if (destFilename) {
      if (!info.files.some((f) => f.filename === destFilename)) {
        throw new Error(
          `File ${destFilename} không thuộc model ${info.name}. Các file hợp lệ: ${info.files.map((f) => f.filename).join(', ')}`
        );
      }
    } else {
      if (info.files.length === 1) {
        destFilename = info.files[0].filename;
      } else {
        const base = path.basename(sourceFilePath).toLowerCase();
        const matched = info.files.find((f) =>
          base.includes(f.filename.toLowerCase().replace('.onnx', ''))
        );
        if (matched) {
          destFilename = matched.filename;
        } else {
          const exact = info.files.find((f) => f.filename.toLowerCase() === base);
          if (exact) {
            destFilename = exact.filename;
          } else {
            throw new Error(
              `Không xác định được file đích cho model "${info.name}". Các file yêu cầu: ${info.files.map((f) => f.filename).join(', ')}`
            );
          }
        }
      }
    }

    const destPath = path.join(dir, destFilename);
    fs.copyFileSync(sourceFilePath, destPath);
    logger.info(`[ModelManager] Imported ${destFilename} for ${targetId} from ${sourceFilePath}`);

    return {
      success: true,
      filename: destFilename,
      destPath,
      installed: this.isModelInstalled(targetId),
    };
  }

  /** Kiểm tra model đã tải về chưa. */
  isModelInstalled(modelId) {
    const targetId = MODEL_ALIASES[modelId] || modelId;
    const info = MODEL_REGISTRY[modelId] || MODEL_REGISTRY[targetId];
    if (!info) return false;
    const candidateDirs = [path.join(this._modelDir, modelId)];
    if (targetId !== modelId) {
      candidateDirs.push(path.join(this._modelDir, targetId));
    }
    return candidateDirs.some((dir) => {
      if (!fs.existsSync(dir)) return false;
      return info.files.every((f) => {
        if (fs.existsSync(path.join(dir, f.filename))) return true;
        if (targetId === 'comic-text-detector' || modelId === 'comic-text-detector') {
          if (fs.existsSync(path.join(dir, 'model.onnx')) || fs.existsSync(path.join(dir, 'detector_int8.onnx'))) return true;
        }
        if (f.filename === 'encoder.onnx') {
          if (fs.existsSync(path.join(dir, 'encoder_model_quantized.onnx')) || fs.existsSync(path.join(dir, 'encoder_model.onnx'))) return true;
        }
        if (f.filename === 'decoder.onnx') {
          if (fs.existsSync(path.join(dir, 'decoder_model_quantized.onnx')) || fs.existsSync(path.join(dir, 'decoder_model.onnx'))) return true;
        }
        if (f.filename === 'vocab.txt') {
          if (fs.existsSync(path.join(dir, 'vocab.txt')) || fs.existsSync(path.join(__dirname, 'assets/vocab.txt'))) return true;
        }
        return false;
      });
    });
  }

  /** Đường dẫn tới file model chính (file đầu tiên). */
  getModelPath(modelId, filename) {
    const targetId = MODEL_ALIASES[modelId] || modelId;
    const info = MODEL_REGISTRY[modelId] || MODEL_REGISTRY[targetId];
    if (!info) throw new Error(`Unknown model: ${modelId}`);
    const fn = filename || info.files[0].filename;

    const candidateDirs = [path.join(this._modelDir, modelId)];
    if (targetId !== modelId) {
      candidateDirs.push(path.join(this._modelDir, targetId));
    }

    for (const dir of candidateDirs) {
      const p = path.join(dir, fn);
      if (fs.existsSync(p)) return p;
      if (targetId === 'comic-text-detector' || modelId === 'comic-text-detector') {
        for (const alt of ['detector.onnx', 'model.onnx', 'detector_int8.onnx']) {
          if (fs.existsSync(path.join(dir, alt))) return path.join(dir, alt);
        }
      }
    }
    return path.join(this._modelDir, targetId, fn);
  }

  /** Trả về tất cả file paths của model. */
  getModelPaths(modelId) {
    const targetId = MODEL_ALIASES[modelId] || modelId;
    const info = MODEL_REGISTRY[modelId] || MODEL_REGISTRY[targetId];
    if (!info) throw new Error(`Unknown model: ${modelId}`);

    const candidateDirs = [path.join(this._modelDir, modelId)];
    if (targetId !== modelId) {
      candidateDirs.push(path.join(this._modelDir, targetId));
    }

    const activeDir = candidateDirs.find((d) => fs.existsSync(d)) || path.join(this._modelDir, targetId);
    const paths = {};
    for (const f of info.files) {
      let resolved = path.join(activeDir, f.filename);
      if (!fs.existsSync(resolved)) {
        for (const dir of candidateDirs) {
          if (fs.existsSync(path.join(dir, f.filename))) {
            resolved = path.join(dir, f.filename);
            break;
          }
          if (f.filename === 'encoder.onnx') {
            for (const alt of ['encoder_model_quantized.onnx', 'encoder_model.onnx']) {
              if (fs.existsSync(path.join(dir, alt))) { resolved = path.join(dir, alt); break; }
            }
          } else if (f.filename === 'decoder.onnx') {
            for (const alt of ['decoder_model_quantized.onnx', 'decoder_model.onnx']) {
              if (fs.existsSync(path.join(dir, alt))) { resolved = path.join(dir, alt); break; }
            }
          }
          if (fs.existsSync(resolved)) break;
        }
      }
      if (f.filename === 'vocab.txt' && !fs.existsSync(resolved)) {
        const bundled = path.join(__dirname, 'assets/vocab.txt');
        if (fs.existsSync(bundled)) resolved = bundled;
      }
      paths[f.filename] = resolved;
    }
    return paths;
  }

  /**
   * Download model nếu chưa có. Trả về khi model sẵn sàng.
   * @param {string} modelId
   * @param {(progress: {modelId: string, file: string, downloaded: number, total: number, percent: number}) => void} [onProgress]
   * @returns {Promise<void>}
   */
  async ensureModel(modelId, onProgress) {
    if (this.isModelInstalled(modelId)) return;
    const targetId = MODEL_ALIASES[modelId] || modelId;
    await this.downloadModel(targetId, onProgress);
  }

  /**
   * Download model (force re-download nếu đã có).
   * Hỗ trợ tải song song nhiều model khác nhau, đồng thời chống duplicate cùng 1 model.
   * @param {string} modelId
   * @param {(progress: object) => void} [onProgress]
   */
  async downloadModel(modelId, onProgress) {
    const targetId = MODEL_ALIASES[modelId] || modelId;
    if (this._activeDownloads.has(targetId)) {
      return this._activeDownloads.get(targetId);
    }
    const p = this._executeDownloadModel(targetId, onProgress);
    this._activeDownloads.set(targetId, p);
    try {
      await p;
    } finally {
      this._activeDownloads.delete(targetId);
    }
  }

  async _executeDownloadModel(modelId, onProgress) {
    const info = MODEL_REGISTRY[modelId];
    if (!info) throw new Error(`Unknown model: ${modelId}`);

    const dir = path.join(this._modelDir, modelId);
    fs.mkdirSync(dir, { recursive: true });

    for (const fileSpec of info.files) {
      const destPath = path.join(dir, fileSpec.filename);
      const tmpPath = destPath + '.tmp';

      const abortController = new AbortController();
      this._downloadAbortControllers.set(modelId, abortController);

      try {
        logger.info(`[ModelManager] Downloading ${modelId}/${fileSpec.filename}...`);

        const response = await axios.get(fileSpec.url, {
          responseType: 'stream',
          signal: abortController.signal,
          headers: { 'User-Agent': 'MangaCrawler/1.0' },
          timeout: 30_000,
        });

        const total = parseInt(response.headers['content-length'] || fileSpec.sizeBytes, 10);
        let downloaded = 0;

        const writer = fs.createWriteStream(tmpPath);

        await new Promise((resolve, reject) => {
          response.data.on('data', (chunk) => {
            downloaded += chunk.length;
            if (onProgress) {
              onProgress({
                modelId,
                file: fileSpec.filename,
                downloaded,
                total,
                percent: total > 0 ? Math.round((downloaded / total) * 100) : 0,
              });
            }
          });
          response.data.pipe(writer);
          writer.on('finish', resolve);
          writer.on('error', reject);
          response.data.on('error', reject);
        });

        // Rename tmp → final
        fs.renameSync(tmpPath, destPath);
        logger.info(`[ModelManager] Downloaded ${modelId}/${fileSpec.filename} (${(downloaded / 1e6).toFixed(1)}MB)`);
      } catch (err) {
        // Cleanup tmp file on error
        try { fs.unlinkSync(tmpPath); } catch (_) { /* ignore */ }
        this._downloadAbortControllers.delete(modelId);

        if (axios.isCancel(err)) {
          throw new Error(`Download cancelled: ${modelId}`);
        }
        throw new Error(`Failed to download ${modelId}/${fileSpec.filename}: ${err.message}`);
      }
    }

    this._downloadAbortControllers.delete(modelId);
  }

  /** Hủy download đang chạy. */
  cancelDownload(modelId) {
    const targetId = MODEL_ALIASES[modelId] || modelId;
    const ctrl = this._downloadAbortControllers.get(targetId);
    if (ctrl) {
      ctrl.abort();
      this._downloadAbortControllers.delete(targetId);
    }
    this._activeDownloads.delete(targetId);
  }

  /** Xóa model đã cache. */
  async deleteModel(modelId) {
    const targetId = MODEL_ALIASES[modelId] || modelId;
    const dir = path.join(this._modelDir, targetId);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
      logger.info(`[ModelManager] Deleted model: ${targetId}`);
    }
    // Dispose session nếu đang load
    const session = this._sessions.get(targetId);
    if (session) {
      try { await session.release(); } catch (_) { /* ignore */ }
      this._sessions.delete(targetId);
    }
  }

  /** Kích thước model trên disk (bytes). */
  _getModelDiskSize(modelId) {
    const targetId = MODEL_ALIASES[modelId] || modelId;
    const info = MODEL_REGISTRY[modelId] || MODEL_REGISTRY[targetId];
    if (!info) return 0;
    const dir = path.join(this._modelDir, targetId);
    if (!fs.existsSync(dir)) return 0;
    let total = 0;
    try {
      const names = fs.readdirSync(dir);
      for (const fn of names) {
        if (fn.endsWith('.onnx')) {
          try {
            total += fs.statSync(path.join(dir, fn)).size;
          } catch (_) {}
        }
      }
    } catch (_) {}
    return total;
  }

  /** Trả về model info từ registry. */
  getModelInfo(modelId) {
    const targetId = MODEL_ALIASES[modelId] || modelId;
    return MODEL_REGISTRY[modelId] || MODEL_REGISTRY[targetId] || null;
  }

  /** Tổng kích thước tất cả model đã tải (bytes). */
  getTotalDiskUsage() {
    let total = 0;
    for (const [id, m] of Object.entries(MODEL_REGISTRY)) {
      if (!m.aliasOf) {
        total += this._getModelDiskSize(id);
      }
    }
    return total;
  }
}

module.exports = { ModelManager, MODEL_REGISTRY, getDefaultModelDir };
