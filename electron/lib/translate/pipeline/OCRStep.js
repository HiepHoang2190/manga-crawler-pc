/**
 * OCRStep — Đọc text từ detected regions.
 *
 * Hỗ trợ 2 modes:
 * - Local: dùng manga-ocr ONNX model
 * - Cloud: dùng Gemini/OpenAI Vision API
 *
 * Tương tự Koharu OCR step (PaddleOCR, Manga OCR, etc.).
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const logger = require('../../shared/logger');

/** Manga OCR input size. */
const OCR_INPUT_SIZE = 224;

class OCRStep {
  /**
   * @param {import('onnxruntime-node')} ort — ONNX Runtime module
   * @param {object} modelPaths — { 'encoder.onnx': path, 'decoder.onnx': path }
   * @param {import('../providers/index').BaseProvider} [cloudProvider] — cloud provider cho OCR
   */
  constructor(ort, modelPaths, cloudProvider) {
    this._ort = ort;
    this._modelPaths = modelPaths || {};
    this._cloudProvider = cloudProvider;
    this._encoderSession = null;
    this._decoderSession = null;
    this._vocab = null;
  }

  /**
   * OCR trên tất cả detected regions.
   * @param {Buffer} imageBuffer — ảnh gốc
   * @param {Array<{bbox: number[], confidence: number, label: string}>} detections
   * @param {object} options
   * @param {'local'|'cloud'} options.mode — local ONNX hoặc cloud API
   * @param {string} options.language — ngôn ngữ source
   * @returns {Promise<Array<{bbox: number[], text: string, confidence: number}>>}
   */
  async recognize(imageBuffer, detections, options = {}) {
    const mode = options.mode || 'cloud';
    const language = options.language || 'ja';

    const results = [];

    // 1. Try batch OCR first if supported by provider (single network call, immune to 429 rate limits, 10x faster)
    if (mode === 'cloud' && typeof this._cloudProvider?.ocrBatch === 'function' && detections.length > 1) {
      try {
        const crops = await Promise.all(
          detections.map((d) => this._cropRegion(imageBuffer, d.bbox))
        );
        const batchTexts = await this._cloudProvider.ocrBatch(crops, language);
        for (let i = 0; i < detections.length; i++) {
          const t = batchTexts[i];
          if (t && t.trim()) {
            results.push({
              bbox: detections[i].bbox,
              textBbox: detections[i].textBbox || detections[i].bbox,
              hasBubble: detections[i].hasBubble !== false,
              text: t.trim(),
              confidence: detections[i].confidence,
              index: i,
            });
          }
        }
        if (results.length > 0) {
          logger.info(`[OCRStep] Batch OCR recognized ${results.length}/${detections.length} regions in 1 request.`);
          return results;
        }
      } catch (batchErr) {
        logger.warn('[OCRStep] Batch OCR failed:', batchErr.message);
        const isQuota = Boolean(
          batchErr.isQuota ||
          /quota|429|resource_exhausted/i.test(batchErr.message || '')
        );
        if (isQuota) {
          logger.warn('[OCRStep] All Vision OCR keys exhausted quota (429). Aborting individual OCR fallback to prevent spamming.');
          results.isQuota = true;
          results.quotaError = batchErr.message;
          return results;
        }
        logger.info('[OCRStep] Falling back to individual processing...');
      }
    }

    // 2. Fallback to individual chunked processing
    const CONCURRENCY = 2;
    let quotaExhausted = false;
    let quotaErrorMessage = '';

    const processRegion = async (det, i) => {
      if (quotaExhausted) return null;
      try {
        const cropBuffer = await this._cropRegion(imageBuffer, det.bbox);
        let text = '';
        if (mode === 'cloud') {
          if (this._cloudProvider?.supportsOCR) {
            text = await this._cloudProvider.ocr(cropBuffer, language);
          } else {
            text = await this._localOCR(cropBuffer);
          }
        } else {
          // Local mode: strictly offline, do not call cloud or exhaust cloud quota
          text = await this._localOCR(cropBuffer);
        }

        if (text && text.trim()) {
          return {
            bbox: det.bbox,
            textBbox: det.textBbox || det.bbox,
            hasBubble: det.hasBubble !== false,
            text: text.trim(),
            confidence: det.confidence,
            index: i,
          };
        }
      } catch (err) {
        logger.warn(`[OCRStep] Failed to OCR region ${i}:`, err.message);
        if (err.isQuota || /quota|429|resource_exhausted/i.test(err.message || '')) {
          quotaExhausted = true;
          quotaErrorMessage = err.message;
        }
      }
      return null;
    };

    for (let i = 0; i < detections.length; i += CONCURRENCY) {
      if (quotaExhausted) break;
      const chunk = detections.slice(i, i + CONCURRENCY);
      const chunkResults = await Promise.all(
        chunk.map((det, idx) => processRegion(det, i + idx))
      );
      for (const res of chunkResults) {
        if (res) results.push(res);
      }
    }

    if (quotaExhausted) {
      results.isQuota = true;
      results.quotaError = quotaErrorMessage;
    }

    logger.info(`[OCRStep] Recognized ${results.length}/${detections.length} regions.`);
    return results;
  }

  /**
   * Crop vùng text từ ảnh, thêm padding để không bị mất chữ mép.
   */
  async _cropRegion(imageBuffer, bbox) {
    const [x, y, w, h] = bbox;
    const metadata = await sharp(imageBuffer).metadata();

    // Add padding (10% or min 4px) to ensure full characters are captured
    const padX = Math.max(4, Math.round(w * 0.1));
    const padY = Math.max(4, Math.round(h * 0.1));

    const left = Math.max(0, x - padX);
    const top = Math.max(0, y - padY);
    const width = Math.min(w + 2 * padX, metadata.width - left);
    const height = Math.min(h + 2 * padY, metadata.height - top);

    return sharp(imageBuffer)
      .extract({ left, top, width, height })
      .png()
      .toBuffer();
  }

  /**
   * Local OCR bằng manga-ocr ONNX model.
   * Manga OCR = ViT encoder + GPT2 decoder (seq2seq).
   *
   * Simplified approach: Nếu model phức tạp, fallback sang
   * Gemini vision hoặc basic Tesseract.
   */
  async _localOCR(cropBuffer) {
    try {
      await this._ensureLocalSessions();
      if (!this._encoderSession || !this._decoderSession) {
        logger.warn('[OCRStep] Local sessions not initialized (missing encoder/decoder model)');
        return '';
      }

      // Preprocess for encoder
      const inputTensor = await this._preprocessForEncoder(cropBuffer);

      // Run encoder
      const encoderFeeds = { [this._encoderSession.inputNames[0]]: inputTensor };
      const encoderOutput = await this._encoderSession.run(encoderFeeds);
      const outputKey = this._encoderSession.outputNames[0] || Object.keys(encoderOutput)[0];
      const lastHidden = encoderOutput[outputKey];

      // Autoregressive greedy decode
      const text = await this._greedyDecode(lastHidden);
      return text;
    } catch (err) {
      logger.warn('[OCRStep] Local OCR failed, returning empty:', err.message);
      return '';
    }
  }

  async _ensureLocalSessions() {
    if (!this._ort) return;

    if (!this._encoderSession && this._modelPaths['encoder.onnx'] && fs.existsSync(this._modelPaths['encoder.onnx'])) {
      this._encoderSession = await this._ort.InferenceSession.create(
        this._modelPaths['encoder.onnx'],
        { executionProviders: ['cpu'] }
      );
    }
    if (!this._decoderSession && this._modelPaths['decoder.onnx'] && fs.existsSync(this._modelPaths['decoder.onnx'])) {
      this._decoderSession = await this._ort.InferenceSession.create(
        this._modelPaths['decoder.onnx'],
        { executionProviders: ['cpu'] }
      );
    }
    if (!this._vocab) {
      let vocabPath = this._modelPaths['vocab.txt'];
      if (!vocabPath || !fs.existsSync(vocabPath)) {
        vocabPath = path.join(__dirname, '../assets/vocab.txt');
      }
      if (fs.existsSync(vocabPath)) {
        try {
          this._vocab = fs.readFileSync(vocabPath, 'utf8').split(/\r?\n/);
        } catch (_) {
          this._vocab = null;
        }
      }
    }
  }

  async _preprocessForEncoder(cropBuffer) {
    // Resize to 224x224, normalize with ImageNet mean/std
    const resized = await sharp(cropBuffer)
      .resize(OCR_INPUT_SIZE, OCR_INPUT_SIZE, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer();

    const mean = [0.5, 0.5, 0.5];
    const std = [0.5, 0.5, 0.5];
    const pixels = OCR_INPUT_SIZE * OCR_INPUT_SIZE;
    const float32 = new Float32Array(3 * pixels);

    for (let i = 0; i < pixels; i++) {
      float32[i] = (resized[i * 3] / 255.0 - mean[0]) / std[0];
      float32[pixels + i] = (resized[i * 3 + 1] / 255.0 - mean[1]) / std[1];
      float32[2 * pixels + i] = (resized[i * 3 + 2] / 255.0 - mean[2]) / std[2];
    }

    return new this._ort.Tensor('float32', float32, [1, 3, OCR_INPUT_SIZE, OCR_INPUT_SIZE]);
  }

  async _greedyDecode(lastHiddenState) {
    if (!this._decoderSession || !this._vocab || this._vocab.length === 0) return '';

    // Decoder start token: 2 ([CLS]), EOS token: 3 ([SEP]), PAD: 0 ([PAD])
    let tokens = [2n];
    const maxLen = 100; // Manga bubbles usually have <= 100 tokens

    try {
      for (let step = 0; step < maxLen; step++) {
        const inputIdsTensor = new this._ort.Tensor('int64', new BigInt64Array(tokens), [1, tokens.length]);
        const decOut = await this._decoderSession.run({
          input_ids: inputIdsTensor,
          encoder_hidden_states: lastHiddenState,
        });

        const logits = decOut.logits; // shape [1, seq_len, vocab_size]
        const vocabSize = logits.dims[2];
        const lastTokenOffset = (tokens.length - 1) * vocabSize;
        const data = logits.data;

        let maxVal = -Infinity;
        let nextId = 0;
        for (let v = 0; v < vocabSize; v++) {
          const val = data[lastTokenOffset + v];
          if (val > maxVal) {
            maxVal = val;
            nextId = v;
          }
        }

        // Stop on EOS (3) or PAD (0)
        if (nextId === 3 || nextId === 0) {
          break;
        }
        tokens.push(BigInt(nextId));
      }

      // Convert tokens to characters
      const decodedChars = [];
      for (let i = 1; i < tokens.length; i++) {
        const tokenStr = this._vocab[Number(tokens[i])];
        if (!tokenStr || tokenStr.startsWith('[') || tokenStr.startsWith('<')) {
          continue;
        }
        if (tokenStr.startsWith('##')) {
          decodedChars.push(tokenStr.slice(2));
        } else {
          decodedChars.push(tokenStr);
        }
      }

      return decodedChars.join('').trim();
    } catch (decodeErr) {
      logger.warn('[OCRStep] Greedy decode error:', decodeErr.message);
      return '';
    }
  }

  /** Release sessions. */
  async dispose() {
    if (this._encoderSession) { await this._encoderSession.release(); this._encoderSession = null; }
    if (this._decoderSession) { await this._decoderSession.release(); this._decoderSession = null; }
    this._vocab = null;
  }
}

module.exports = OCRStep;
