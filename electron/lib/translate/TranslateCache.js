/**
 * TranslateCache — Cache kết quả dịch.
 *
 * Tránh dịch lại cùng một ảnh với cùng settings.
 * Key: sha256(imageBuffer) + settingsHash → cached result.
 *
 * Tương tự cách Koharu cache intermediate results.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');
const logger = require('../shared/logger');

function getCacheDir() {
  if (app && typeof app.getPath === 'function') {
    return path.join(app.getPath('userData'), 'translate-cache');
  }
  const os = require('os');
  const baseDir = process.platform === 'win32'
    ? path.join(process.env.APPDATA || os.homedir(), 'manga-crawler')
    : path.join(os.homedir(), 'Library/Application Support/manga-crawler');
  return path.join(baseDir, 'translate-cache');
}

class TranslateCache {
  constructor(cacheDir) {
    this._dir = cacheDir || getCacheDir();
    if (!fs.existsSync(this._dir)) {
      fs.mkdirSync(this._dir, { recursive: true });
    }
  }

  /**
   * Tạo cache key từ image hash + settings liên quan.
   * Chỉ hash các settings ảnh hưởng output (không hash api keys).
   */
  _makeKey(imageBuffer, settings) {
    const CACHE_VERSION = 'v5_bubble_box';
    const imageHash = crypto.createHash('sha256').update(imageBuffer).digest('hex').slice(0, 16);
    const settingsSig = [
      CACHE_VERSION,
      settings.detectionModel || 'koharu-rf-detr',
      settings.translationProvider,
      settings.ocrProvider,
      settings.sourceLanguage,
      settings.targetLanguage,
      settings.enableInpainting ? '1' : '0',
      settings.enableTypesetting ? '1' : '0',
      settings.confidenceThreshold || 0.4,
    ].join('|');
    const settingsHash = crypto.createHash('md5').update(settingsSig).digest('hex').slice(0, 8);
    return `${imageHash}_${settingsHash}`;
  }

  /**
   * Kiểm tra cache hit.
   * @param {Buffer} imageBuffer
   * @param {object} settings
   * @returns {{hit: boolean, data?: {finalImage: Buffer, translations: Array, timings: object}}}
   */
  get(imageBuffer, settings) {
    const key = this._makeKey(imageBuffer, settings);
    const metaPath = path.join(this._dir, `${key}.json`);
    const imgPath = path.join(this._dir, `${key}.png`);

    if (!fs.existsSync(metaPath) || !fs.existsSync(imgPath)) {
      return { hit: false };
    }

    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      const finalImage = fs.readFileSync(imgPath);
      return {
        hit: true,
        data: {
          finalImage,
          translations: meta.translations || [],
          timings: meta.timings || {},
          cachedAt: meta.cachedAt,
        },
      };
    } catch (err) {
      logger.warn('[TranslateCache] Failed to read cache:', err.message);
      return { hit: false };
    }
  }

  /**
   * Lưu kết quả vào cache.
   * @param {Buffer} imageBuffer — ảnh gốc (để tạo key)
   * @param {object} settings
   * @param {Buffer} finalImage — ảnh đã dịch
   * @param {Array} translations
   * @param {object} timings
   */
  set(imageBuffer, settings, finalImage, translations, timings) {
    const key = this._makeKey(imageBuffer, settings);
    const metaPath = path.join(this._dir, `${key}.json`);
    const imgPath = path.join(this._dir, `${key}.png`);

    try {
      fs.writeFileSync(imgPath, finalImage);
      fs.writeFileSync(metaPath, JSON.stringify({
        translations,
        timings,
        cachedAt: new Date().toISOString(),
      }), 'utf-8');
    } catch (err) {
      logger.warn('[TranslateCache] Failed to write cache:', err.message);
    }
  }

  /**
   * Tạo key cache riêng cho bước Detection (bóc tách khung thoại).
   */
  _makeDetectionKey(imageBuffer, settings = {}) {
    const imageHash = crypto.createHash('sha256').update(imageBuffer).digest('hex').slice(0, 16);
    const sig = `det|${settings.detectionModel || 'koharu-rf-detr'}|${settings.confidenceThreshold || 0.4}`;
    const detHash = crypto.createHash('md5').update(sig).digest('hex').slice(0, 8);
    return `${imageHash}_det_${detHash}`;
  }

  /**
   * Kiểm tra cache kết quả Detection.
   * @param {Buffer} imageBuffer
   * @param {object} settings
   * @returns {{hit: boolean, detections?: Array}}
   */
  getDetections(imageBuffer, settings = {}) {
    const key = this._makeDetectionKey(imageBuffer, settings);
    const filePath = path.join(this._dir, `${key}.json`);
    if (!fs.existsSync(filePath)) return { hit: false };
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return { hit: true, detections: data.detections || [] };
    } catch (_) {
      return { hit: false };
    }
  }

  /**
   * Lưu cache kết quả Detection.
   */
  setDetections(imageBuffer, settings = {}, detections = []) {
    const key = this._makeDetectionKey(imageBuffer, settings);
    const filePath = path.join(this._dir, `${key}.json`);
    try {
      fs.writeFileSync(filePath, JSON.stringify({
        detections,
        cachedAt: new Date().toISOString(),
      }), 'utf-8');
    } catch (err) {
      logger.warn('[TranslateCache] Failed to write detection cache:', err.message);
    }
  }

  /**
   * Tạo key cache riêng cho bước OCR.
   */
  _makeOcrKey(imageBuffer, detections = [], settings = {}) {
    const imageHash = crypto.createHash('sha256').update(imageBuffer).digest('hex').slice(0, 16);
    const boxSig = detections.map(d => (d.bbox ? d.bbox.map(Math.round).join(',') : '')).join(';');
    const sig = `ocr|${settings.ocrProvider || 'local'}|${settings.sourceLanguage || 'ja'}|${boxSig}`;
    const ocrHash = crypto.createHash('md5').update(sig).digest('hex').slice(0, 8);
    return `${imageHash}_ocr_${ocrHash}`;
  }

  /**
   * Kiểm tra cache kết quả OCR.
   * @param {Buffer} imageBuffer
   * @param {Array} detections
   * @param {object} settings
   * @returns {{hit: boolean, ocrResults?: Array}}
   */
  getOcr(imageBuffer, detections = [], settings = {}) {
    const key = this._makeOcrKey(imageBuffer, detections, settings);
    const filePath = path.join(this._dir, `${key}.json`);
    if (!fs.existsSync(filePath)) return { hit: false };
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return { hit: true, ocrResults: data.ocrResults || [] };
    } catch (_) {
      return { hit: false };
    }
  }

  /**
   * Lưu cache kết quả OCR.
   */
  setOcr(imageBuffer, detections = [], settings = {}, ocrResults = []) {
    const key = this._makeOcrKey(imageBuffer, detections, settings);
    const filePath = path.join(this._dir, `${key}.json`);
    try {
      fs.writeFileSync(filePath, JSON.stringify({
        ocrResults,
        cachedAt: new Date().toISOString(),
      }), 'utf-8');
    } catch (err) {
      logger.warn('[TranslateCache] Failed to write ocr cache:', err.message);
    }
  }

  /**
   * Xóa toàn bộ cache.
   * @returns {{deletedFiles: number, freedBytes: number}}
   */
  clear() {
    let deletedFiles = 0;
    let freedBytes = 0;

    try {
      const files = fs.readdirSync(this._dir);
      for (const file of files) {
        const fp = path.join(this._dir, file);
        try {
          const stat = fs.statSync(fp);
          freedBytes += stat.size;
          fs.unlinkSync(fp);
          deletedFiles++;
        } catch (_) { /* ignore */ }
      }
    } catch (_) { /* ignore */ }

    logger.info(`[TranslateCache] Cleared ${deletedFiles} files, freed ${(freedBytes / 1e6).toFixed(1)}MB`);
    return { deletedFiles, freedBytes };
  }

  /**
   * Xóa cache của 1 ảnh cụ thể (theo buffer hoặc filePath).
   * @param {Buffer|string} imageBufferOrPath
   * @returns {number} số file cache đã xóa
   */
  deleteImage(imageBufferOrPath) {
    try {
      let buffer = null;
      if (Buffer.isBuffer(imageBufferOrPath)) {
        buffer = imageBufferOrPath;
      } else if (typeof imageBufferOrPath === 'string' && fs.existsSync(imageBufferOrPath)) {
        buffer = fs.readFileSync(imageBufferOrPath);
      }
      if (!buffer) return 0;
      const imageHash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16);
      const files = fs.readdirSync(this._dir);
      let deleted = 0;
      for (const file of files) {
        if (file.startsWith(imageHash)) {
          try {
            fs.unlinkSync(path.join(this._dir, file));
            deleted++;
          } catch (_) {}
        }
      }
      if (deleted > 0) {
        logger.info(`[TranslateCache] Deleted ${deleted} cache files for image`);
      }
      return deleted;
    } catch (_) {
      return 0;
    }
  }

  /**
   * Tổng dung lượng cache (bytes).
   */
  getDiskUsage() {
    let total = 0;
    try {
      const files = fs.readdirSync(this._dir);
      for (const file of files) {
        try {
          total += fs.statSync(path.join(this._dir, file)).size;
        } catch (_) { /* ignore */ }
      }
    } catch (_) { /* ignore */ }
    return total;
  }
}

module.exports = { TranslateCache, getCacheDir };
