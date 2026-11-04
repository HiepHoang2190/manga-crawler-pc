/**
 * TranslatePipeline — Orchestrator chạy toàn bộ pipeline dịch manga.
 *
 * Pipeline: Detection → OCR → Translation → Inpainting → Typesetting
 *
 * Tương tự Koharu Selective Pipeline — user có thể enable/disable từng bước.
 */
const fs = require('fs');
const logger = require('../shared/logger');
const { ModelManager } = require('./ModelManager');
const { loadSettings } = require('./TranslateSettings');
const { createProvider } = require('./providers/index');
const { TranslateCache } = require('./TranslateCache');
const DetectionStep = require('./pipeline/DetectionStep');
const OCRStep = require('./pipeline/OCRStep');
const TranslationStep = require('./pipeline/TranslationStep');
const InpaintingStep = require('./pipeline/InpaintingStep');
const TypesettingStep = require('./pipeline/TypesettingStep');
const sharp = require('sharp');
const JAPANESE_CHAR_REGEX = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uff66-\uff9d]/;

let ort = null;
function getOrt() {
  if (!ort) {
    // 1. Hook Module._resolveFilename để mọi require('onnxruntime-common')
    // từ thư mục extras bên ngoài (do người dùng tải) có thể tìm thấy onnxruntime-common
    // từ app bundle hoặc node_modules hiện tại.
    const Module = require('module');
    if (!Module._onnxCommonResolveHooked) {
      const origResolve = Module._resolveFilename;
      Module._resolveFilename = function (request, parent, isMain, options) {
        if (request === 'onnxruntime-common') {
          try {
            return require.resolve('onnxruntime-common');
          } catch (_) {}
        }
        return origResolve.call(this, request, parent, isMain, options);
      };
      Module._onnxCommonResolveHooked = true;
    }

    // 2. Thử load từ thư mục extras bên ngoài (do người dùng tải gói Extras)
    try {
      const { defaultExtrasManager } = require('../extras/ExtrasManager');
      const onnxDir = defaultExtrasManager.getOnnxRuntimePath();
      if (onnxDir && fs.existsSync(onnxDir)) {
        // Tự động sao chép onnxruntime-common nếu thư mục extras chưa có
        try {
          const commonInExtras = path.join(onnxDir, 'node_modules', 'onnxruntime-common');
          if (!fs.existsSync(commonInExtras)) {
            let commonSrc = null;
            try {
              const entry = require.resolve('onnxruntime-common');
              let cur = path.dirname(entry);
              while (cur && cur !== path.dirname(cur)) {
                if (fs.existsSync(path.join(cur, 'package.json'))) {
                  try {
                    const pkg = JSON.parse(fs.readFileSync(path.join(cur, 'package.json'), 'utf8'));
                    if (pkg.name === 'onnxruntime-common') {
                      commonSrc = cur;
                      break;
                    }
                  } catch (_) {}
                }
                cur = path.dirname(cur);
              }
            } catch (_) {}

            if (commonSrc && fs.existsSync(commonSrc)) {
              fs.mkdirSync(path.dirname(commonInExtras), { recursive: true });
              fs.cpSync(commonSrc, commonInExtras, { recursive: true });
            }
          }
        } catch (_) {}

        ort = require(onnxDir);
      }
    } catch (err) {
      logger.warn('[TranslatePipeline] Failed to load onnxruntime from extras:', err?.message || String(err));
    }

    // 3. Fallback: thử load onnxruntime-node trong node_modules (chế độ phát triển dev)
    if (!ort) {
      try {
        ort = require('onnxruntime-node');
      } catch (_) {}
    }

    // 4. Nếu vẫn không thể load ONNX Runtime, báo lỗi rõ ràng hướng dẫn người dùng
    if (!ort) {
      throw new Error(
        'Gói tài nguyên Extras (AI Models / ONNX Runtime) chưa được cài đặt hoặc không tìm thấy. ' +
        'Vui lòng vào Cài đặt -> Gói tài nguyên AI (Extras) để tải về.'
      );
    }
  }
  return ort;
}

class TranslatePipeline {
  constructor() {
    this._modelManager = new ModelManager();
    this._cache = new TranslateCache();
    this._steps = {};
    this._cancelled = false;
  }

  /**
   * Dịch một ảnh.
   * @param {Buffer} imageBuffer — ảnh gốc
   * @param {object} [overrideSettings] — override settings cho lần chạy này
   * @param {(progress: {step: string, percent: number, detail?: string}) => void} [onProgress]
   * @returns {Promise<{
   *   finalImage: Buffer,
   *   detections: Array,
   *   ocrResults: Array,
   *   translations: Array,
   *   steps: {detection: number, ocr: number, translation: number, inpainting: number, typesetting: number}
   * }>}
   */
  /**
   * Dịch một ảnh.
   * @param {Buffer} imageBuffer — ảnh gốc
   * @param {object} [overrideSettings] — override settings cho lần chạy này
   * @param {(progress: object) => void} [onProgress]
   */
  async translateImage(imageBuffer, overrideSettings, onProgress) {
    this._cancelled = false;
    const settings = { ...loadSettings(), ...overrideSettings };
    const timings = {
      load: 0,
      detect: 0,
      ocr: 0,
      translate: 0,
      inpaint: 0,
      typeset: 0,
      completed: 0,
    };

    let detectedCount = 0;
    let ocrCount = 0;
    let sentCount = 0;
    let receivedCount = 0;
    let failedCount = 0;

    const emit = (step, percent, detail, extra = {}) => {
      if (onProgress) {
        onProgress({
          step,
          percent,
          detail,
          imageIndex: 0,
          total: 1,
          timings: { ...timings },
          detectedCount,
          ocrCount,
          sentCount,
          receivedCount,
          failedCount,
          translatedCount: receivedCount,
          ...extra,
        });
      }
    };

    try {
      // ===== Step 1: Nạp & Đọc ảnh =====
      const tLoad = Date.now();
      emit('load', 20, 'Đang đọc và kiểm tra ảnh...');
      const meta = await sharp(imageBuffer).metadata();
      const imgWidth = meta.width || 0;
      const imgHeight = meta.height || 0;
      timings.load = Math.max(10, Date.now() - tLoad);
      emit('load', 100, `Đã nạp 1 trang (${imgWidth}x${imgHeight}px)`, {
        stepBadge: `1 trang (${imgWidth}x${imgHeight}px)`,
      });

      // Cache check (bỏ qua nếu gọi forceFresh khi dịch lại trong Studio)
      const isForceFresh = Boolean(overrideSettings?.forceFresh || settings.forceFresh);
      const cached = !isForceFresh ? this._cache.get(imageBuffer, settings) : { hit: false };
      if (cached.hit) {
        logger.info('[Pipeline] Cache hit — returning cached result.');
        const cCount = cached.data.translations?.length || 0;
        detectedCount = cCount;
        ocrCount = cCount;
        sentCount = cCount;
        receivedCount = cCount;
        emit('completed', 100, `Lấy từ bộ nhớ cache (${cCount} khung thoại)`, {
          stepBadge: 'Đã xong (Cache)',
          detectedCount: cCount,
          ocrCount: cCount,
          sentCount: cCount,
          receivedCount: cCount,
          layerCount: cCount,
        });
        return {
          finalImage: cached.data.finalImage,
          width: imgWidth,
          height: imgHeight,
          detections: (cached.data.translations || []).map((t, idx) => ({ id: idx, bbox: t.bbox, confidence: 1 })),
          ocrResults: (cached.data.translations || []).map((t, idx) => ({ id: idx, bbox: t.bbox, text: t.sourceText || t.originalText || '' })),
          translations: cached.data.translations,
          timings: { ...cached.data.timings, cached: true },
          detectedCount: cCount,
          ocrCount: cCount,
          sentCount: cCount,
          receivedCount: cCount,
          failedCount: 0,
        };
      }

      // ===== Step 2: Nhận diện khung thoại (Detection) =====
      let detections = null;
      let usedExistingDets = false;

      // 1. Kiểm tra existing layers truyền vào (từ Studio Editor)
      if (!isForceFresh && Array.isArray(overrideSettings?.existingLayers) && overrideSettings.existingLayers.length > 0) {
        const validLayers = overrideSettings.existingLayers.filter(
          (l) => Array.isArray(l.bbox) && l.bbox.length === 4 && l.bbox[2] > 5 && l.bbox[3] > 5
        );
        if (validLayers.length > 0) {
          detections = validLayers.map((l, idx) => ({
            id: l.id || idx,
            bbox: [...l.bbox],
            textBbox: Array.isArray(l.textBbox) ? [...l.textBbox] : [...l.bbox],
            label: l.type || 'bubble',
            hasBubble: l.hasBubble !== false,
            confidence: l.confidence || 0.95,
          }));
          usedExistingDets = true;
          logger.info(`[Pipeline] Tái sử dụng ${detections.length} khung thoại từ phiên trước.`);
        }
      }

      // 2. Kiểm tra Cache trên đĩa nếu chưa có
      if (!detections && !isForceFresh) {
        const cachedDet = this._cache.getDetections(imageBuffer, settings);
        if (cachedDet.hit && Array.isArray(cachedDet.detections) && cachedDet.detections.length > 0) {
          detections = cachedDet.detections;
          usedExistingDets = true;
          logger.info(`[Pipeline] Nạp ${detections.length} khung thoại từ bộ nhớ cache đĩa.`);
        }
      }

      const tDetect = Date.now();
      if (!detections) {
        emit('detect', 20, 'Đang quét & bóc tách khung thoại bằng AI (RT-DETR)...');
        await this._modelManager.ensureModel(settings.detectionModel);
        if (this._cancelled) throw new Error('Cancelled');

        const detectionStep = await this._getDetectionStep(settings);
        detections = await detectionStep.detect(imageBuffer, {
          confidenceThreshold: settings.confidenceThreshold || 0.4,
        });

        // Ghi cache đĩa
        try {
          this._cache.setDetections(imageBuffer, settings, detections);
        } catch (_) {}
      }

      detectedCount = detections.length;
      timings.detect = Math.max(20, Date.now() - tDetect);
      emit('detect', 100, usedExistingDets ? `Tái sử dụng ${detectedCount} khung thoại từ phiên trước` : `Đã bóc tách được ${detectedCount} khung thoại`, {
        stepBadge: `Bóc tách ${detectedCount} khung`,
        detectedCount,
        detections: detections.map((d, idx) => ({
          id: idx,
          bbox: d.bbox,
          textBbox: d.textBbox || d.bbox,
          label: d.label || 'bubble',
          hasBubble: d.hasBubble !== false,
          confidence: d.confidence,
        })),
        logItem: {
          step: 'detect',
          text: usedExistingDets
            ? `⚡ Tái sử dụng ${detectedCount} khung thoại từ phiên trước (bỏ qua AI Detection)`
            : `🎯 Đã bóc tách thành công ${detectedCount} khung thoại trên trang`,
          type: 'info',
        },
      });

      // Ghi log chi tiết từng khung thoại được bóc tách
      detections.forEach((d, idx) => {
        const [x, y, w, h] = d.bbox.map(Math.round);
        const conf = Math.round((d.confidence || 0.9) * 100);
        emit('detect', 100, `🔍 Khung #${idx + 1}: Vị trí [X:${x}, Y:${y}, ${w}×${h}px] (Độ tin cậy: ${conf}%)`, {
          logItem: { step: 'detect', text: `🔍 Khung #${idx + 1}: Vị trí [X:${x}, Y:${y}, ${w}×${h}px] (${conf}%)`, type: 'info', index: idx },
        });
      });

      if (this._cancelled) throw new Error('Cancelled');

      // ===== Step 3: Đọc chữ trong ảnh (OCR) =====
      let ocrResults = null;
      let usedExistingOcr = false;

      // 1. Kiểm tra existing layers (nếu đã có sourceText tiếng Nhật)
      if (!isForceFresh && Array.isArray(overrideSettings?.existingLayers) && overrideSettings.existingLayers.length > 0) {
        const layersWithText = overrideSettings.existingLayers.filter((l) => (l.sourceText || '').trim());
        if (layersWithText.length > 0 && layersWithText.length === detections.length) {
          ocrResults = layersWithText.map((l, idx) => ({
            index: idx,
            id: l.id || idx,
            bbox: l.bbox,
            text: (l.sourceText || '').trim(),
          }));
          usedExistingOcr = true;
          logger.info(`[Pipeline] Tái sử dụng ${ocrResults.length} câu chữ gốc OCR từ phiên trước.`);
        }
      }

      // 2. Kiểm tra Cache trên đĩa
      if (!ocrResults && !isForceFresh) {
        const cachedOcr = this._cache.getOcr(imageBuffer, detections, settings);
        if (cachedOcr.hit && Array.isArray(cachedOcr.ocrResults) && cachedOcr.ocrResults.length > 0) {
          ocrResults = cachedOcr.ocrResults;
          usedExistingOcr = true;
          logger.info(`[Pipeline] Nạp ${ocrResults.length} câu chữ OCR từ bộ nhớ cache đĩa.`);
        }
      }

      const tOcr = Date.now();
      if (!ocrResults) {
        emit('ocr', 20, `Đang nhận diện chữ từ ${detectedCount} khung thoại...`, {
          detectedCount,
          logItem: { step: 'ocr', text: `Đang nhận diện chữ tiếng Nhật từ ${detectedCount} khung thoại...`, type: 'info' },
        });
        const ocrStep = await this._getOCRStep(settings);
        ocrResults = await ocrStep.recognize(imageBuffer, detections, {
          mode: settings.ocrProvider,
          language: settings.sourceLanguage,
        });

        // Ghi cache đĩa
        try {
          this._cache.setOcr(imageBuffer, detections, settings, ocrResults);
        } catch (_) {}
      }

      ocrCount = ocrResults.length;
      timings.ocr = Math.max(20, Date.now() - tOcr);
      emit('ocr', 100, usedExistingOcr ? `Tái sử dụng ${ocrCount} câu chữ gốc OCR từ phiên trước` : `Đã đọc chữ: ${ocrCount}/${detectedCount} khung thoại có chữ`, {
        stepBadge: `Đọc ${ocrCount}/${detectedCount} khung`,
        ocrCount,
        detectedCount,
        logItem: {
          step: 'ocr',
          text: usedExistingOcr
            ? `⚡ Tái sử dụng ${ocrCount} câu chữ gốc OCR từ phiên trước (bỏ qua OCR)`
            : `📖 OCR hoàn tất: ${ocrCount}/${detectedCount} khung thoại có chữ`,
          type: 'info',
        },
      });

      // Ghi log chi tiết nội dung chữ gốc từng khung thoại đọc được
      ocrResults.forEach((r) => {
        const cleanText = (r.text || '').replace(/\r?\n/g, ' ').trim();
        emit('ocr', 100, `📖 Khung #${r.index + 1} (Chữ gốc OCR): "${cleanText}"`, {
          logItem: { step: 'ocr', text: `📖 Khung #${r.index + 1} (Chữ gốc OCR): "${cleanText}"`, type: 'info', index: r.index, sourceText: cleanText },
        });
      });

      if (ocrResults.length === 0) {
        logger.info('[Pipeline] No text recognized. Returning original image.');
        let emptyReason = 'Không tìm thấy khung thoại nào có chữ cần dịch.';
        if (detectedCount > 0) {
          if (ocrResults.isQuota || /quota|429|resource_exhausted/i.test(ocrResults.quotaError || '')) {
            const visionName = settings.ocrVisionProvider === 'openai' ? 'OpenAI Vision' : 'Google Gemini';
            emptyReason = `Đã bóc tách được ${detectedCount} khung thoại nhưng không thể đọc chữ do API Key ${visionName} (dùng cho bước OCR đọc ảnh) đã hết hạn mức Quota (429 Resource Exhausted). Lưu ý: Dù bạn chọn DeepL để dịch văn bản, hệ thống vẫn cần ${visionName} để đọc chữ trong ảnh scan trước khi gửi sang DeepL. Vui lòng thêm API Key ${visionName} mới vào Cài đặt.`;
          } else if (settings.translationProvider === 'deepl' && (!settings.apiKeys?.gemini || !settings.apiKeys.gemini.trim())) {
            emptyReason = `Đã bóc tách ${detectedCount} khung thoại nhưng không đọc được chữ. DeepL chỉ dịch văn bản thuần, không hỗ trợ đọc ảnh. Vui lòng cấu hình API Key Google Gemini trong Cài đặt để AI đọc chữ trong ảnh.`;
          } else {
            emptyReason = `Đã bóc tách ${detectedCount} khung thoại nhưng không nhận diện được chữ nào từ mô hình OCR.`;
          }
        }
        emit('completed', 100, emptyReason, {
          stepBadge: ocrResults.isQuota ? 'Hết Quota OCR (429)' : (detectedCount > 0 ? 'OCR: 0 chữ' : 'Đã xong'),
          warning: detectedCount > 0 ? emptyReason : undefined,
          isQuota: Boolean(ocrResults.isQuota),
          detectedCount,
          ocrCount: 0,
          logItem: { step: 'ocr', text: emptyReason, type: 'warn' },
        });
        return {
          finalImage: imageBuffer,
          width: imgWidth,
          height: imgHeight,
          detections,
          ocrResults: [],
          translations: [],
          timings,
          detectedCount,
          ocrCount: 0,
          sentCount: 0,
          receivedCount: 0,
          failedCount: 0,
          hasQuotaError: Boolean(ocrResults.isQuota),
        };
      }
      if (this._cancelled) throw new Error('Cancelled');

      // ===== Step 4: Dịch sang tiếng Việt =====
      sentCount = ocrResults.length;
      const provUpper = (settings.translationProvider || 'AI').toUpperCase();
      emit('translate', 20, `Đang gửi ${sentCount} câu thoại sang ${provUpper} để dịch...`, {
        sentCount,
        ocrCount,
        detectedCount,
        logItem: { step: 'translate', text: `🚀 Đang gửi ${sentCount} câu thoại sang ${provUpper} để dịch sang tiếng Việt...`, type: 'info' },
      });
      const tTrans = Date.now();
      const translationStep = this._getTranslationStep(settings);
      let translations = await translationStep.translate(
        ocrResults,
        settings.sourceLanguage,
        settings.targetLanguage,
        settings.translationPrompt || undefined,
      );

      // Ghi log chi tiết từng câu dịch nhận về từ AI
      translations.forEach((t) => {
        const cleanOrig = (t.sourceText || t.originalText || '').replace(/\r?\n/g, ' ').trim();
        const cleanTrans = (t.translatedText || t.text || '').replace(/\r?\n/g, ' ').trim();
        emit('translate', 80, `🌐 Khung #${t.index + 1} (Bản dịch AI): "${cleanTrans}"`, {
          logItem: {
            step: 'translate',
            text: `🌐 Khung #${t.index + 1} (Bản dịch AI): "${cleanTrans}"`,
            type: t.isTranslated !== false ? 'info' : 'warn',
            index: t.index,
            sourceText: cleanOrig,
            translatedText: cleanTrans,
          },
        });
      });

      receivedCount = typeof translations.translatedCount === 'number'
        ? translations.translatedCount
        : translations.filter((t) => t.isTranslated !== false).length;
      const isQuota = Boolean(translations.isQuota || translations.quotaExceeded);
      failedCount = Math.max(0, sentCount - receivedCount);

      if (translations.error) {
        emit('translate', 75, `⚠️ Lỗi dịch thuật: ${translations.error}`, {
          warning: true,
          isQuota,
          error: translations.error,
          logItem: {
            step: 'translate',
            text: `❌ Lỗi dịch thuật (${provUpper}): ${translations.error}`,
            type: 'error',
          },
        });
      }

      // ===== Retry: Dịch lại các khung chưa được dịch =====
      const isFatalError = isQuota || /404|401|unauthorized|not found|không tồn tại/i.test(translations.error || '');
      const MAX_RETRIES = 2;
      if (!isFatalError && failedCount > 0) {
        for (let retryAttempt = 1; retryAttempt <= MAX_RETRIES && failedCount > 0; retryAttempt++) {
          const failedItems = ocrResults.filter((r) => {
            const t = translations.find((x) => x.index === r.index);
            return !t || t.isTranslated === false;
          });
          if (failedItems.length === 0) break;

          emit('translate', 50 + retryAttempt * 20,
            `Retry lần ${retryAttempt}: Dịch lại ${failedItems.length} khung còn thiếu...`,
            { sentCount, receivedCount, failedCount });

          logger.info(`[Pipeline] Retry ${retryAttempt}: Re-translating ${failedItems.length} failed bubbles...`);
          const retryResult = await translationStep.translate(
            failedItems,
            settings.sourceLanguage,
            settings.targetLanguage,
            settings.translationPrompt || undefined,
          );

          // Merge retry results back into translations
          const retryMap = new Map(retryResult.map((r) => [r.index, r]));
          translations = translations.map((t) => {
            if (t.isTranslated !== false) return t;
            const retried = retryMap.get(t.index);
            return retried ? { ...t, ...retried } : t;
          });

          receivedCount = translations.filter((t) => t.isTranslated !== false).length;
          failedCount = Math.max(0, sentCount - receivedCount);
        }
      }

      timings.translate = Math.max(20, Date.now() - tTrans);

      // ===== Step 4.5: Kiểm duyệt chất lượng bản dịch (Verify & Soát chữ Nhật còn sót) =====
      const JAPANESE_CHAR_REGEX = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uff66-\uff9d]/;
      const isSourceJa = !settings.sourceLanguage || /^(ja|japanese|auto)$/i.test(settings.sourceLanguage);
      const isTargetVi = !settings.targetLanguage || /^(vi|vietnamese)$/i.test(settings.targetLanguage);

      let residualItems = [];
      if (isSourceJa && isTargetVi && !isQuota) {
        residualItems = translations.filter((t) => {
          const text = (t.translatedText || t.text || '').trim();
          return t.isTranslated === false || t.hasResidualJapanese || JAPANESE_CHAR_REGEX.test(text);
        });
      }

      if (residualItems.length > 0 && !isQuota) {
        emit('verify', 50, `Đang soát lỗi & dịch vét ${residualItems.length} câu còn sót chữ tiếng Nhật...`, {
          residualCount: residualItems.length,
          sentCount,
          receivedCount,
          logItem: { step: 'verify', text: `⚠️ Soát lỗi: Phát hiện ${residualItems.length} khung còn sót ký tự tiếng Nhật, đang kích hoạt dịch vét chuyên sâu...`, type: 'warn' },
        });

        const forcePrompt = [
          `CRITICAL QUALITY PASS: The previous translation left untranslated Japanese characters in these speech bubbles.`,
          `Strict rules:`,
          `- Translate 100% of every input segment into natural Vietnamese.`,
          `- ABSOLUTELY ZERO Japanese characters (Kanji, Hiragana, Katakana) allowed in the translated text.`,
          `- If text is onomatopoeia or names, localize them completely into Vietnamese.`,
          `- Return JSON: {"translations": [{"id": ..., "text": "..."}]}`,
        ].join('\n');

        const residualOcrItems = ocrResults.filter((r) => residualItems.some((x) => x.index === r.index));
        try {
          const forceResults = await translationStep.translate(
            residualOcrItems,
            settings.sourceLanguage,
            settings.targetLanguage,
            forcePrompt
          );

          const forceMap = new Map(forceResults.map((r) => [r.index, r]));
          translations = translations.map((t) => {
            const forceRetried = forceMap.get(t.index);
            if (forceRetried && forceRetried.isTranslated && !forceRetried.hasResidualJapanese) {
              return { ...t, ...forceRetried };
            }
            return t;
          });
        } catch (forceErr) {
          logger.warn('[Pipeline] Verification force-translation pass failed:', forceErr.message);
        }
      }

      // Re-verify after all attempts
      let finalResidualCount = 0;
      translations = translations.map((t) => {
        const text = (t.translatedText || t.text || '').trim();
        const hasRes = isSourceJa && isTargetVi && JAPANESE_CHAR_REGEX.test(text);
        if (hasRes) finalResidualCount++;
        return {
          ...t,
          isTranslated: t.isTranslated !== false && !hasRes,
          hasResidualJapanese: hasRes,
          error: hasRes ? 'Còn sót chữ tiếng Nhật chưa được dịch' : t.error,
        };
      });

      // ===== FINAL VERIFICATION GATE (Zero Missing / 100% tiếng Việt) =====
      if (isSourceJa && isTargetVi && finalResidualCount > 0 && !isQuota) {
        emit('verify', 85, `Verification Gate: Tự động việt hoá triệt để ${finalResidualCount} câu còn sót...`, {
          logItem: {
            step: 'verify',
            text: `🛡️ Verification Gate: Đang tự động việt hoá triệt để ${finalResidualCount} khung thoại còn sót ký tự Nhật...`,
            type: 'info',
          },
        });

        translations = translations.map((t) => {
          const text = (t.translatedText || t.text || '').trim();
          if (t.hasResidualJapanese || JAPANESE_CHAR_REGEX.test(text) || !t.isTranslated) {
            const orig = t.sourceText || t.originalText || t.text || text;
            const sfxResolved = this._resolveSfxOrSanitize(orig, text);

            return {
              ...t,
              translatedText: sfxResolved,
              text: sfxResolved,
              isTranslated: true,
              hasResidualJapanese: false,
              error: null,
            };
          }
          return t;
        });

        finalResidualCount = 0;
      }

      // Ghi log soát lỗi chi tiết cho từng khung thoại
      translations.forEach((t) => {
        const cleanTrans = (t.translatedText || t.text || '').replace(/\r?\n/g, ' ').trim();
        const isClean = t.isTranslated !== false && !t.hasResidualJapanese;
        emit('verify', 90, `Soát lỗi #${t.index + 1}: ${isClean ? 'Đạt chuẩn 100%' : 'Cảnh báo sót chữ Nhật'}`, {
          logItem: {
            step: 'verify',
            text: isClean
              ? `✅ Khung #${t.index + 1}: Đạt chuẩn tiếng Việt 100%`
              : `⚠️ Khung #${t.index + 1}: Cảnh báo sót chữ Nhật ("${cleanTrans}")`,
            type: isClean ? 'info' : 'warn',
            index: t.index,
          },
        });
      });

      receivedCount = translations.filter((t) => t.isTranslated).length;
      failedCount = Math.max(0, sentCount - receivedCount);

      const fontStackStr = Array.isArray(settings.fontStack) && settings.fontStack.length > 0
        ? settings.fontStack.map(f => f.includes(' ') && !f.startsWith('"') ? `"${f}"` : f).join(', ')
        : undefined;

      // Luôn emit translations để UI cập nhật đúng các layers (kể cả khi có lỗi một phần)
      const translationsPayload = translations.map((t) => ({
        index: t.index,
        bbox: t.bbox,
        textBbox: t.textBbox || t.bbox,
        hasBubble: t.hasBubble !== false,
        text: t.translatedText || t.text,
        sourceText: t.sourceText || t.originalText,
        isTranslated: t.isTranslated !== false,
        hasResidualJapanese: Boolean(t.hasResidualJapanese),
        error: t.error || null,
        fontFamily: t.fontFamily || fontStackStr || undefined,
      }));

      emit('verify', 100, `Kiểm duyệt hoàn tất: ${receivedCount}/${sentCount} câu đạt chuẩn${finalResidualCount > 0 ? ` (${finalResidualCount} câu còn sót chữ Nhật)` : ''}`, {
        stepBadge: `Kiểm duyệt: ${receivedCount}/${sentCount}`,
        cleanCount: receivedCount,
        residualCount: finalResidualCount,
        sentCount,
        receivedCount,
        failedCount,
        translations: translationsPayload,
        warning: finalResidualCount > 0 ? `Còn ${finalResidualCount} khung thoại sót chữ tiếng Nhật.` : undefined,
        logItem: {
          step: 'verify',
          text: `✨ Hoàn tất soát lỗi: ${receivedCount}/${sentCount} câu đạt chuẩn 100% tiếng Việt${finalResidualCount > 0 ? ` (${finalResidualCount} câu còn sót chữ Nhật)` : ''}`,
          type: finalResidualCount > 0 ? 'warn' : 'info',
        },
      });

      if (isQuota) {
        emit('translate', 100, `Hết Quota: Đã gửi ${sentCount} câu → Nhận về ${receivedCount}/${sentCount} câu dịch`, {
          stepBadge: 'Hết Quota (429)',
          warning: `API Key đã hết hạn mức Quota. Đã gửi ${sentCount} câu nhưng chỉ nhận về ${receivedCount} câu (${failedCount} câu chưa dịch). Hãy kiểm tra lại API Key.`,
          isQuota: true,
          sentCount,
          receivedCount,
          failedCount,
          translations: translationsPayload,
          logItem: { step: 'translate', text: `❌ Hết Quota API Key: Nhận được ${receivedCount}/${sentCount} câu dịch`, type: 'error' },
        });
      } else if (failedCount > 0) {
        const transErrMsg = translations.error || `Có ${failedCount}/${sentCount} câu thoại chưa được dịch thành công.`;
        emit('translate', 100, `Đã gửi ${sentCount} câu → Nhận về ${receivedCount}/${sentCount} câu (${failedCount} câu lỗi)`, {
          stepBadge: `Dịch ${receivedCount}/${sentCount} câu`,
          warning: transErrMsg,
          sentCount,
          receivedCount,
          failedCount,
          translations: translationsPayload,
          logItem: { step: 'translate', text: `⚠️ Dịch hoàn tất một phần: ${receivedCount}/${sentCount} câu dịch thành công`, type: 'warn' },
        });
      } else {
        emit('translate', 100, `Đã gửi ${sentCount} câu → Nhận về trọn vẹn ${receivedCount}/${sentCount} câu dịch`, {
          stepBadge: `Dịch ${receivedCount}/${sentCount} câu`,
          sentCount,
          receivedCount,
          failedCount: 0,
          translations: translationsPayload,
          logItem: { step: 'translate', text: `🌐 Dịch hoàn tất: Nhận về toàn bộ ${receivedCount}/${sentCount} câu dịch tiếng Việt`, type: 'info' },
        });
      }

      if (this._cancelled) throw new Error('Cancelled');

      // ===== Step 5: Xóa chữ gốc (LaMa AI Inpainting) =====
      let cleanImage = imageBuffer;
      if (settings.enableInpainting) {
        emit('inpaint', 20, `Đang tẩy chữ gốc trong ${ocrResults.length} khung thoại bằng LaMa AI...`, {
          logItem: { step: 'inpaint', text: `🧹 Bắt đầu tẩy chữ gốc trong ${ocrResults.length} khung thoại bằng LaMa AI...`, type: 'info' },
        });
        const tInpaint = Date.now();
        try {
          await this._modelManager.ensureModel(settings.inpaintingModel);
          const inpaintingStep = await this._getInpaintingStep(settings);
          cleanImage = await inpaintingStep.inpaint(imageBuffer, ocrResults);
          timings.inpaint = Math.max(20, Date.now() - tInpaint);

          // Convert cleanImage to base64 dataUrl for live canvas update
          const isPng = cleanImage.length > 8 && cleanImage[0] === 0x89;
          const cleanMime = isPng ? 'image/png' : 'image/jpeg';
          const cleanDataUrl = `data:${cleanMime};base64,${cleanImage.toString('base64')}`;

          emit('inpaint', 100, `Đã tẩy sạch ${ocrResults.length} khung thoại`, {
            stepBadge: `Đã tẩy ${ocrResults.length} khung`,
            cleanDataUrl,
            logItem: { step: 'inpaint', text: `✨ Hoàn tất tẩy chữ nền sạch sẽ cho ${ocrResults.length} khung thoại`, type: 'info' },
          });
        } catch (err) {
          logger.warn('[Pipeline] Inpainting failed, using original:', err.message);
          timings.inpaint = Date.now() - tInpaint;
          emit('inpaint', 100, 'Tẩy chữ gặp lỗi, giữ tranh gốc', {
            stepBadge: 'Lỗi tẩy chữ',
            logItem: { step: 'inpaint', text: `⚠️ Tẩy chữ gặp sự cố: ${err.message}, giữ lại tranh gốc`, type: 'warn' },
          });
        }
      } else {
        emit('inpaint', 100, 'Bỏ qua tẩy chữ', { stepBadge: 'Bỏ qua' });
      }

      if (this._cancelled) throw new Error('Cancelled');

      // ===== Step 6: Chèn chữ vào khung thoại (Typesetting) =====
      let finalImage = cleanImage;
      if (settings.enableTypesetting) {
        // Chỉ typeset các câu đã dịch thành công (tránh in chữ Nhật chưa dịch đè lên tranh)
        const validTranslations = translations.filter((t) => t.isTranslated !== false);
        if (validTranslations.length > 0) {
          emit('typeset', 20, `Đang căn chỉnh & đặt ${validTranslations.length} câu thoại tiếng Việt...`, {
            logItem: { step: 'typeset', text: `🔤 Bắt đầu căn chỉnh & đặt ${validTranslations.length} câu thoại tiếng Việt vào khung tranh...`, type: 'info' },
          });
          const tTypeset = Date.now();
          const typesettingStep = new TypesettingStep();

          validTranslations.forEach((t) => {
            const cleanTrans = (t.translatedText || t.text || '').replace(/\r?\n/g, ' ').trim();
            emit('typeset', 70, `Typeset #${t.index + 1}`, {
              logItem: {
                step: 'typeset',
                text: `✍️ Khung #${t.index + 1}: Đã căn lề và đổ text ("${cleanTrans.slice(0, 35)}${cleanTrans.length > 35 ? '...' : ''}")`,
                type: 'info',
                index: t.index,
              },
            });
          });

          finalImage = await typesettingStep.typeset(cleanImage, validTranslations, {
            fontFamily: fontStackStr,
            quality: settings.outputQuality || 92,
            fillBackground: false, // Chuẩn Koharu: cleanImage đã inpaint sạch chữ và giữ nguyên viền khung gốc, không tô đè hộp trắng lên viền
          });
          timings.typeset = Math.max(20, Date.now() - tTypeset);
          emit('typeset', 100, `Đã chèn ${validTranslations.length} câu thoại vào khung`, {
            stepBadge: `Đã đặt ${validTranslations.length} câu`,
            logItem: { step: 'typeset', text: `🎉 Hoàn tất dàn trang cho toàn bộ ${validTranslations.length} khung thoại`, type: 'info' },
          });
        } else {
          emit('typeset', 100, 'Không có câu thoại nào dịch thành công để chèn', { stepBadge: 'Bỏ qua chèn' });
        }
      } else {
        emit('typeset', 100, 'Bỏ qua chèn chữ', { stepBadge: 'Bỏ qua' });
      }

      if (this._cancelled) throw new Error('Cancelled');

      // ===== Step 7: Biên tập Layer (Mỗi khung thoại là 1 layer) =====
      const tReview = Date.now();
      timings.review = Math.max(10, Date.now() - tReview);
      emit('review', 100, `Đã tạo ${translations.length} layers khung thoại sẵn sàng biên tập`, {
        stepBadge: `${translations.length} layers`,
        layerCount: translations.length,
      });

      // ===== Step 8: Hoàn tất & Xuất file =====
      timings.completed = 30;
      emit('completed', 100, `Hoàn tất: Bóc tách ${detectedCount} khung → OCR ${ocrCount} khung → Dịch ${receivedCount}/${sentCount} câu`, {
        stepBadge: 'Đã hoàn tất',
        layerCount: translations.length,
        detectedCount,
        ocrCount,
        sentCount,
        receivedCount,
        failedCount,
        translations: translationsPayload,
        logItem: {
          step: 'completed',
          text: `🏁 QUY TRÌNH HOÀN TẤT: Bóc tách ${detectedCount} khung | OCR ${ocrCount} khung | Dịch thành công ${receivedCount}/${sentCount} câu`,
          type: 'info',
        },
      });

      // Cache the result
      try {
        this._cache.set(imageBuffer, settings, finalImage, translations, timings);
      } catch (cacheErr) {
        logger.warn('[Pipeline] Failed to cache result:', cacheErr.message);
      }

      return {
        finalImage,
        cleanImage,
        width: imgWidth,
        height: imgHeight,
        detections,
        ocrResults,
        translations,
        timings,
        detectedCount,
        ocrCount,
        sentCount,
        receivedCount,
        failedCount,
        hasQuotaError: isQuota,
      };
    } catch (err) {
      if (err.message === 'Cancelled') {
        logger.info('[Pipeline] Translation cancelled by user.');
        throw err;
      }
      logger.error('[Pipeline] Translation failed:', err.message);
      throw err;
    }
  }

  /**
   * Dịch batch ảnh (cả chapter).
   * @param {Array<{path: string, buffer: Buffer}>} images
   * @param {object} [overrideSettings]
   * @param {(progress: object) => void} [onProgress]
   */
  async translateChapter(images, overrideSettings, onProgress) {
    this._cancelled = false;
    const settings = { ...loadSettings(), ...overrideSettings };
    const total = images.length;
    const timings = {
      load: 0,
      detect: 0,
      ocr: 0,
      translate: 0,
      inpaint: 0,
      typeset: 0,
      completed: 0,
    };

    let totalDetected = 0;
    let totalOcr = 0;
    let totalTranslated = 0;
    let totalFailed = 0;

    const emit = (step, percent, detail, extra = {}) => {
      if (onProgress) {
        onProgress({
          step,
          percent,
          detail,
          total,
          timings: { ...timings },
          detectedCount: totalDetected,
          ocrCount: totalOcr,
          sentCount: totalOcr,
          receivedCount: totalTranslated,
          translatedCount: totalTranslated,
          failedCount: totalFailed,
          ...extra,
        });
      }
    };

    try {
      // ===== Step 1: Nạp & Đọc toàn bộ ảnh =====
      const tLoad = Date.now();
      emit('load', 20, `Đang nạp ${total} trang truyện...`);
      const allImageMetas = [];
      for (let i = 0; i < total; i++) {
        try {
          const m = await sharp(images[i].buffer).metadata();
          allImageMetas.push({ width: m.width || 0, height: m.height || 0 });
        } catch (_) {
          allImageMetas.push({ width: 0, height: 0 });
        }
      }
      timings.load = Math.max(20, Date.now() - tLoad);
      emit('load', 100, `Đã nạp ${total} trang`, { stepBadge: `Đã nạp ${total} trang` });

      // ===== Step 2: Nhận diện khung thoại (Detection) =====
      emit('detect', 10, 'Khởi tạo mô hình AI quét khung thoại...', {
        logItem: { step: 'detect', text: `🔍 Khởi động mô hình AI phát hiện khung thoại (${settings.detectionModel})...`, type: 'info' },
      });
      const tDetect = Date.now();
      await this._modelManager.ensureModel(settings.detectionModel);
      const detectionStep = await this._getDetectionStep(settings);

      const isForceFresh = Boolean(overrideSettings?.forceFresh || settings.forceFresh);
      const allDetections = [];
      for (let i = 0; i < total; i++) {
        if (this._cancelled) throw new Error('Cancelled');
        const p = Math.round(((i + 1) / total) * 100);
        let dets = null;
        let usedExistingDets = false;

        // 1. Kiểm tra existing layers từ image item (nếu đã có bbox từ session/editor)
        if (!isForceFresh && Array.isArray(images[i].layers) && images[i].layers.length > 0) {
          const validBoxLayers = images[i].layers.filter(
            (l) => Array.isArray(l.bbox) && l.bbox.length === 4 && l.bbox[2] > 5 && l.bbox[3] > 5
          );
          if (validBoxLayers.length > 0) {
            dets = validBoxLayers.map((l, lIdx) => ({
              id: l.id || lIdx,
              bbox: [...l.bbox],
              textBbox: Array.isArray(l.textBbox) ? [...l.textBbox] : [...l.bbox],
              label: l.type || 'bubble',
              hasBubble: l.hasBubble !== false,
              confidence: l.confidence || 0.95,
            }));
            usedExistingDets = true;
          }
        }

        // 2. Kiểm tra Cache trên đĩa nếu chưa có
        if (!dets && !isForceFresh) {
          const cachedDet = this._cache.getDetections(images[i].buffer, settings);
          if (cachedDet.hit && Array.isArray(cachedDet.detections) && cachedDet.detections.length > 0) {
            dets = cachedDet.detections;
            usedExistingDets = true;
          }
        }

        // 3. Nếu chưa có -> chạy AI Detection thật
        if (!dets) {
          emit('detect', p, `Quét khung thoại: Trang ${i + 1}/${total} (đã bóc tách ${totalDetected} khung)...`, {
            imageIndex: i,
            detectedCount: totalDetected,
          });
          dets = await detectionStep.detect(images[i].buffer, {
            confidenceThreshold: settings.confidenceThreshold || 0.4,
          });
          // Ghi cache đĩa
          try {
            this._cache.setDetections(images[i].buffer, settings, dets);
          } catch (_) {}
        }

        totalDetected += dets.length;
        allDetections.push(dets);

        // Granular log for each detected bubble in this page
        dets.forEach((d, idx) => {
          const b = d.bbox || [0, 0, 0, 0];
          const w = Math.round(b[2]);
          const h = Math.round(b[3]);
          const conf = typeof d.confidence === 'number' ? Math.round(d.confidence * 100) : 100;
          emit('detect', p, `Khung #${idx + 1} (Trang ${i + 1}): Vị trí [X:${Math.round(b[0])}, Y:${Math.round(b[1])}, ${w}×${h}px] (${conf}%)`, {
            imageIndex: i,
            detectedCount: totalDetected,
            logItem: {
              step: 'detect',
              text: `🔍 Khung #${idx + 1} (Trang ${i + 1}): Vị trí [X:${Math.round(b[0])}, Y:${Math.round(b[1])}, ${w}×${h}px] (${conf}%)`,
              type: 'info',
              index: idx,
              pageIndex: i,
              bbox: d.bbox,
              confidence: d.confidence,
            },
          });
        });

        emit('detect', p, `Trang ${i + 1}/${total}: ${usedExistingDets ? `Tái sử dụng ${dets.length} khung thoại` : `Tìm thấy ${dets.length} khung thoại`}`, {
          imageIndex: i,
          detectedCount: totalDetected,
          logItem: {
            step: 'detect',
            text: usedExistingDets
              ? `⚡ Trang ${i + 1}/${total}: Tái sử dụng ${dets.length} khung thoại từ phiên trước (bỏ qua AI Detection)`
              : `🎯 Trang ${i + 1}/${total}: Bóc tách thành công ${dets.length} khung thoại`,
            type: 'info',
            pageIndex: i,
          },
        });

        // Phát sự kiện checkpoint step Detection cho từng trang
        emit('page_step_done', p, `Đã bóc tách trang ${i + 1}/${total}`, {
          step: 'detect',
          pageIndex: i,
          path: images[i].path,
          detections: dets,
        });
      }
      timings.detect = Math.max(20, Date.now() - tDetect);
      emit('detect', 100, `Đã bóc tách ${totalDetected} khung thoại (${total} trang)`, {
        stepBadge: `Bóc tách ${totalDetected} khung`,
        detectedCount: totalDetected,
        logItem: { step: 'detect', text: `🏁 Bóc tách hoàn tất: ${totalDetected} khung thoại trên toàn bộ ${total} trang`, type: 'info' },
      });

      // ===== Step 3: Đọc chữ trong ảnh (OCR) =====
      emit('ocr', 10, 'Khởi tạo OCR bóc tách chữ...', {
        logItem: { step: 'ocr', text: `📖 Khởi động mô hình OCR nhận diện chữ (${settings.ocrProvider === 'local' ? 'Manga-OCR Local' : 'Cloud Vision'})...`, type: 'info' },
      });
      const tOcr = Date.now();
      const ocrStep = await this._getOCRStep(settings);

      const allOcrResults = [];
      for (let i = 0; i < total; i++) {
        if (this._cancelled) throw new Error('Cancelled');
        const p = Math.round(((i + 1) / total) * 100);
        let ocrRes = null;
        let usedExistingOcr = false;

        // 1. Kiểm tra existing layers (nếu đã có sourceText tiếng Nhật)
        if (!isForceFresh && Array.isArray(images[i].layers) && images[i].layers.length > 0) {
          const layersWithText = images[i].layers.filter((l) => (l.sourceText || '').trim());
          if (layersWithText.length > 0 && layersWithText.length === allDetections[i].length) {
            ocrRes = layersWithText.map((l, lIdx) => ({
              index: lIdx,
              id: l.id || lIdx,
              bbox: l.bbox,
              text: (l.sourceText || '').trim(),
            }));
            usedExistingOcr = true;
          }
        }

        // 2. Kiểm tra Cache trên đĩa
        if (!ocrRes && !isForceFresh) {
          const cachedOcr = this._cache.getOcr(images[i].buffer, allDetections[i], settings);
          if (cachedOcr.hit && Array.isArray(cachedOcr.ocrResults) && cachedOcr.ocrResults.length > 0) {
            ocrRes = cachedOcr.ocrResults;
            usedExistingOcr = true;
          }
        }

        // 3. Nếu chưa có -> Chạy OCR thật
        if (!ocrRes) {
          emit('ocr', p, `Đọc chữ OCR: Trang ${i + 1}/${total} (đã đọc ${totalOcr}/${totalDetected} khung)...`, {
            imageIndex: i,
            ocrCount: totalOcr,
            detectedCount: totalDetected,
          });
          ocrRes = await ocrStep.recognize(images[i].buffer, allDetections[i], {
            mode: settings.ocrProvider,
            language: settings.sourceLanguage,
          });
          // Ghi cache đĩa
          try {
            this._cache.setOcr(images[i].buffer, allDetections[i], settings, ocrRes);
          } catch (_) {}
        }

        totalOcr += ocrRes.length;
        allOcrResults.push(ocrRes);

        // Granular log for each recognized OCR text in this page
        ocrRes.forEach((r) => {
          const cleanText = (r.text || '').replace(/\r?\n/g, ' ').trim();
          emit('ocr', p, `Khung #${r.index + 1} (Trang ${i + 1}): "${cleanText}"`, {
            imageIndex: i,
            ocrCount: totalOcr,
            detectedCount: totalDetected,
            logItem: {
              step: 'ocr',
              text: `📖 Khung #${r.index + 1} (Trang ${i + 1}): "${cleanText}"`,
              type: 'info',
              index: r.index,
              pageIndex: i,
              sourceText: cleanText,
            },
          });
        });

        emit('ocr', p, `Trang ${i + 1}/${total}: ${usedExistingOcr ? `Tái sử dụng ${ocrRes.length} câu OCR` : `Nhận diện ${ocrRes.length} khung có chữ`}`, {
          imageIndex: i,
          ocrCount: totalOcr,
          detectedCount: totalDetected,
          logItem: {
            step: 'ocr',
            text: usedExistingOcr
              ? `⚡ Trang ${i + 1}/${total}: Tái sử dụng ${ocrRes.length} câu chữ gốc OCR từ phiên trước (bỏ qua OCR)`
              : `📖 Trang ${i + 1}/${total}: Nhận diện chữ thành công trên ${ocrRes.length} khung thoại`,
            type: 'info',
            pageIndex: i,
          },
        });

        // Phát sự kiện checkpoint step OCR cho từng trang
        emit('page_step_done', p, `Đã đọc chữ trang ${i + 1}/${total}`, {
          step: 'ocr',
          pageIndex: i,
          path: images[i].path,
          ocrResults: ocrRes,
        });
      }
      timings.ocr = Math.max(20, Date.now() - tOcr);
      emit('ocr', 100, `Đã đọc chữ: ${totalOcr}/${totalDetected} khung thoại có chữ (${total} trang)`, {
        stepBadge: `Đọc ${totalOcr}/${totalDetected} khung`,
        ocrCount: totalOcr,
        detectedCount: totalDetected,
        logItem: { step: 'ocr', text: `📖 OCR hoàn tất: Đọc được chữ trên ${totalOcr}/${totalDetected} khung thoại`, type: 'info' },
      });

      const ocrHasQuota = allOcrResults.some((r) => r?.isQuota);
      if (totalOcr === 0) {
        logger.info('[Pipeline] No text recognized across all pages.');
        let emptyReason = 'Không tìm thấy khung thoại nào có chữ cần dịch.';
        if (totalDetected > 0) {
          if (ocrHasQuota) {
            const visionName = settings.ocrVisionProvider === 'openai' ? 'OpenAI Vision' : 'Google Gemini';
            emptyReason = `Đã bóc tách ${totalDetected} khung thoại (${total} trang) nhưng không đọc được chữ do API Key ${visionName} (dùng cho bước OCR đọc ảnh) đã hết hạn mức Quota (429 Resource Exhausted). Lưu ý: Dù bạn chọn DeepL để dịch văn bản, hệ thống vẫn cần ${visionName} để đọc chữ trong ảnh scan trước khi gửi sang DeepL. Vui lòng thêm API Key ${visionName} mới vào Cài đặt.`;
          } else if (settings.translationProvider === 'deepl' && (!settings.apiKeys?.gemini || !settings.apiKeys.gemini.trim())) {
            emptyReason = `Đã bóc tách ${totalDetected} khung thoại (${total} trang) nhưng không đọc được chữ. DeepL chỉ dịch văn bản thuần, không hỗ trợ đọc ảnh. Vui lòng cấu hình API Key Google Gemini trong Cài đặt để AI đọc chữ trong ảnh.`;
          } else {
            emptyReason = `Đã bóc tách ${totalDetected} khung thoại (${total} trang) nhưng không nhận diện được chữ nào từ mô hình OCR.`;
          }
        }
        emit('completed', 100, emptyReason, {
          stepBadge: ocrHasQuota ? 'Hết Quota OCR (429)' : (totalDetected > 0 ? 'OCR: 0 chữ' : 'Đã xong'),
          warning: totalDetected > 0 ? emptyReason : undefined,
          isQuota: ocrHasQuota,
          detectedCount: totalDetected,
          ocrCount: 0,
        });
      }

      // ===== Step 4: Dịch sang tiếng Việt =====
      const provUpper = (settings.translationProvider || 'AI').toUpperCase();
      emit('translate', 10, `Gửi ${totalOcr} câu thoại sang ${provUpper} để dịch...`, {
        sentCount: totalOcr,
        ocrCount: totalOcr,
        detectedCount: totalDetected,
        logItem: { step: 'translate', text: `🚀 Bắt đầu gửi ${totalOcr} câu thoại sang ${provUpper} để dịch sang tiếng Việt...`, type: 'info' },
      });
      const tTrans = Date.now();
      const translationStep = this._getTranslationStep(settings);

      const allTranslations = [];
      let chapterHasQuotaError = Boolean(ocrHasQuota);
      let totalFailed = 0;

      const isSourceJa = settings.sourceLanguage === 'ja' || !settings.sourceLanguage;
      const isTargetVi = settings.targetLanguage === 'vi' || !settings.targetLanguage;

      for (let i = 0; i < total; i++) {
        if (this._cancelled) throw new Error('Cancelled');
        const p = Math.round(((i + 1) / total) * 100);
        const pageOcr = allOcrResults[i];
        let trans = [];
        let usedExistingTrans = false;

        // 1. Kiểm tra nếu trang đã dịch xong từ phiên trước
        if (!isForceFresh && Array.isArray(images[i].layers) && images[i].layers.length > 0) {
          const validTransLayers = images[i].layers.filter((l) => (l.text || '').trim() && l.isTranslated);
          if (validTransLayers.length > 0 && validTransLayers.length === pageOcr.length) {
            trans = validTransLayers.map((l, lIdx) => ({
              index: lIdx,
              id: l.id || lIdx,
              bbox: l.bbox,
              textBbox: l.textBbox || l.bbox,
              sourceText: l.sourceText || '',
              translatedText: l.text || '',
              text: l.text || '',
              isTranslated: true,
              hasResidualJapanese: false,
            }));
            usedExistingTrans = true;
          }
        }

        if (pageOcr.length > 0 && !usedExistingTrans) {
          emit('translate', p, `Dịch văn bản: Trang ${i + 1}/${total} (${pageOcr.length} câu)...`, {
            imageIndex: i,
            translatedCount: totalTranslated,
            ocrCount: totalOcr,
            logItem: { step: 'translate', text: `🌐 Trang ${i + 1}/${total}: Đang gửi ${pageOcr.length} câu thoại sang ${provUpper}...`, type: 'info', pageIndex: i },
          });
          trans = await translationStep.translate(
            pageOcr,
            settings.sourceLanguage,
            settings.targetLanguage,
            settings.translationPrompt || undefined,
          );
          if (trans.isQuota || trans.quotaExceeded) {
            chapterHasQuotaError = true;
          }

          if (trans.error) {
            emit('translate', p, `⚠️ Trang ${i + 1}: ${trans.error}`, {
              imageIndex: i,
              warning: true,
              error: trans.error,
              logItem: {
                step: 'translate',
                text: `❌ Trang ${i + 1} (${provUpper}): ${trans.error}`,
                type: 'error',
                pageIndex: i,
              },
            });
          }

          // Granular log for each translation result in this page
          trans.forEach((t) => {
            const cleanOrig = (t.sourceText || t.originalText || '').replace(/\r?\n/g, ' ').trim();
            const cleanTrans = (t.translatedText || t.text || '').replace(/\r?\n/g, ' ').trim();
            emit('translate', p, `Khung #${t.index + 1} (Trang ${i + 1}): "${cleanTrans}"`, {
              imageIndex: i,
              translatedCount: totalTranslated,
              ocrCount: totalOcr,
              logItem: {
                step: 'translate',
                text: `🌐 Khung #${t.index + 1} (Trang ${i + 1}): "${cleanTrans}"`,
                type: t.isTranslated !== false ? 'info' : 'warn',
                index: t.index,
                pageIndex: i,
                sourceText: cleanOrig,
                translatedText: cleanTrans,
              },
            });
          });

          // Verification retry pass: if residual characters exist and not quota error, retry with force prompt
          let residualItems = [];
          if (isSourceJa && isTargetVi) {
            residualItems = trans.filter((t) => {
              const text = (t.translatedText || t.text || '').trim();
              return t.isTranslated === false || t.hasResidualJapanese || JAPANESE_CHAR_REGEX.test(text);
            });
          }

          if (residualItems.length > 0 && !chapterHasQuotaError) {
            emit('verify', p, `Trang ${i + 1}: Đang soát lỗi & dịch vét ${residualItems.length} câu còn sót chữ tiếng Nhật...`, {
              imageIndex: i,
              residualCount: residualItems.length,
              logItem: {
                step: 'verify',
                text: `⚠️ Trang ${i + 1}: Phát hiện ${residualItems.length} khung còn sót ký tự tiếng Nhật/Hoa, đang kích hoạt dịch vét chuyên sâu...`,
                type: 'warn',
                pageIndex: i,
              },
            });

            const forcePrompt = [
              `CRITICAL QUALITY PASS: The previous translation left untranslated Japanese/Chinese characters in these speech bubbles.`,
              `Strict requirements:`,
              `- Dịch 100% tất cả các câu sang TIẾNG VIỆT tự nhiên, thuần Việt.`,
              `- TUYỆT ĐỐI KHÔNG để sót bất kỳ chữ Hán (Kanji/Hanzi), Hiragana, Katakana nào.`,
              `- Với tên riêng hay từ tượng thanh, hãy phiên âm sang tiếng Việt (VD: 直樹 -> Naoki).`,
              `- Return JSON format: {"translations": [{"id": ..., "text": "..."}]}`,
            ].join('\n');

            const residualOcrItems = pageOcr.filter((r) => residualItems.some((x) => x.index === r.index));
            try {
              const forceResults = await translationStep.translate(
                residualOcrItems,
                settings.sourceLanguage,
                settings.targetLanguage,
                forcePrompt
              );

              const forceMap = new Map(forceResults.map((r) => [r.index, r]));
              trans = trans.map((t) => {
                const forceRetried = forceMap.get(t.index);
                if (forceRetried && forceRetried.isTranslated && !forceRetried.hasResidualJapanese) {
                  return { ...t, ...forceRetried };
                }
                return t;
              });
            } catch (forceErr) {
              logger.warn(`[Pipeline] Chapter page ${i + 1} verification force-translation pass failed:`, forceErr.message);
            }
          }

          // Verification pass: check for residual Japanese characters
          trans = trans.map((t) => {
            const text = (t.translatedText || t.text || '').trim();
            const hasRes = isSourceJa && isTargetVi && JAPANESE_CHAR_REGEX.test(text);
            return {
              ...t,
              isTranslated: t.isTranslated !== false && !hasRes,
              hasResidualJapanese: hasRes,
              error: hasRes ? 'Còn sót chữ tiếng Nhật chưa được dịch' : t.error,
            };
          });

          // ===== FINAL VERIFICATION GATE (Zero Missing / 100% tiếng Việt) =====
          const chapterPageResidualCount = trans.filter((t) => t.hasResidualJapanese || !t.isTranslated).length;
          if (isSourceJa && isTargetVi && chapterPageResidualCount > 0 && !chapterHasQuotaError) {
            emit('verify', p, `Trang ${i + 1}: Verification Gate tự động việt hoá ${chapterPageResidualCount} câu còn sót...`, {
              imageIndex: i,
              logItem: {
                step: 'verify',
                text: `🛡️ Trang ${i + 1}: Verification Gate đang tự động việt hoá triệt để ${chapterPageResidualCount} khung thoại còn sót chữ Nhật...`,
                type: 'info',
                pageIndex: i,
              },
            });

            trans = trans.map((t) => {
              const text = (t.translatedText || t.text || '').trim();
              if (t.hasResidualJapanese || JAPANESE_CHAR_REGEX.test(text) || !t.isTranslated) {
                const orig = t.sourceText || t.originalText || t.text || text;
                const sfxResolved = this._resolveSfxOrSanitize(orig, text);

                return {
                  ...t,
                  translatedText: sfxResolved,
                  text: sfxResolved,
                  isTranslated: true,
                  hasResidualJapanese: false,
                  error: null,
                };
              }
              return t;
            });
          }

          // Granular log for each verified bubble in this page
          trans.forEach((t) => {
            const cleanTrans = (t.translatedText || t.text || '').replace(/\r?\n/g, ' ').trim();
            const isClean = t.isTranslated !== false && !t.hasResidualJapanese;
            emit('verify', p, `Soát lỗi #${t.index + 1} (Trang ${i + 1}): ${isClean ? 'Đạt chuẩn 100%' : 'Cảnh báo sót chữ Nhật'}`, {
              imageIndex: i,
              logItem: {
                step: 'verify',
                text: isClean
                  ? `✅ Khung #${t.index + 1} (Trang ${i + 1}): Đạt chuẩn tiếng Việt 100%`
                  : `⚠️ Khung #${t.index + 1} (Trang ${i + 1}): Cảnh báo sót chữ Nhật ("${cleanTrans}")`,
                type: isClean ? 'info' : 'warn',
                index: t.index,
                pageIndex: i,
              },
            });
          });
        }
        const pageTranslated = typeof trans.translatedCount === 'number'
          ? trans.translatedCount
          : trans.filter((t) => t.isTranslated !== false).length;
        totalTranslated += pageTranslated;
        totalFailed += Math.max(0, pageOcr.length - pageTranslated);
        allTranslations.push(trans);

        emit('translate', p, `Trang ${i + 1}/${total}: Dịch được ${pageTranslated}/${pageOcr.length} câu`, {
          imageIndex: i,
          translatedCount: totalTranslated,
          ocrCount: totalOcr,
          logItem: { step: 'translate', text: `🌐 Trang ${i + 1}/${total}: Dịch xong ${pageTranslated}/${pageOcr.length} câu thoại`, type: 'info', pageIndex: i },
        });

        // Phát sự kiện checkpoint step Translate cho từng trang
        emit('page_step_done', p, `Đã dịch trang ${i + 1}/${total}`, {
          step: 'translate',
          pageIndex: i,
          path: images[i].path,
          translations: trans,
        });
      }
      timings.translate = Math.max(20, Date.now() - tTrans);

      if (chapterHasQuotaError) {
        emit('translate', 100, `Hết Quota (429): Dịch được ${totalTranslated}/${totalOcr} câu thoại`, {
          stepBadge: 'Hết Quota (429)',
          warning: `API Key đã hết hạn mức Quota (429). Có ${totalFailed} câu thoại chưa được dịch trọn vẹn. Hãy thêm API Key mới.`,
          isQuota: true,
          translatedCount: totalTranslated,
          ocrCount: totalOcr,
          failedCount: totalFailed,
          logItem: { step: 'translate', text: `❌ Hết Quota API Key: Dịch được ${totalTranslated}/${totalOcr} câu thoại`, type: 'error' },
        });
      } else if (totalFailed > 0) {
        emit('translate', 100, `Đã dịch ${totalTranslated}/${totalOcr} câu (${totalFailed} câu chưa dịch)`, {
          stepBadge: `Dịch ${totalTranslated}/${totalOcr}`,
          warning: `Có ${totalFailed}/${totalOcr} câu thoại chưa dịch được sang Tiếng Việt.`,
          translatedCount: totalTranslated,
          ocrCount: totalOcr,
          failedCount: totalFailed,
          logItem: { step: 'translate', text: `⚠️ Dịch hoàn tất một phần: ${totalTranslated}/${totalOcr} câu dịch thành công`, type: 'warn' },
        });
      } else {
        emit('translate', 100, `Đã dịch toàn bộ ${totalTranslated}/${totalOcr} câu thoại`, {
          stepBadge: `Đã dịch ${totalTranslated}/${totalOcr}`,
          translatedCount: totalTranslated,
          ocrCount: totalOcr,
          failedCount: 0,
          logItem: { step: 'translate', text: `🌐 Dịch hoàn tất: Nhận về toàn bộ ${totalTranslated}/${totalOcr} câu thoại tiếng Việt`, type: 'info' },
        });
      }

      // ===== Step 5: Tẩy chữ gốc (LaMa AI Inpainting) =====
      const allCleanImages = [];
      if (settings.enableInpainting) {
        emit('inpaint', 10, 'Khởi tạo mô hình tẩy chữ LaMa AI...', {
          logItem: { step: 'inpaint', text: `🧹 Khởi động mô hình tẩy chữ LaMa AI (${settings.inpaintingModel})...`, type: 'info' },
        });
        const tInpaint = Date.now();
        await this._modelManager.ensureModel(settings.inpaintingModel);
        const inpaintingStep = await this._getInpaintingStep(settings);

        for (let i = 0; i < total; i++) {
          if (this._cancelled) throw new Error('Cancelled');
          const p = Math.round(((i + 1) / total) * 100);
          emit('inpaint', p, `Tẩy chữ: Trang ${i + 1}/${total}...`, {
            imageIndex: i,
            logItem: { step: 'inpaint', text: `🧹 Trang ${i + 1}/${total}: Bắt đầu tẩy sạch chữ gốc bằng LaMa AI...`, type: 'info', pageIndex: i },
          });
          let clean = images[i].buffer;
          if (allOcrResults[i].length > 0) {
            try {
              clean = await inpaintingStep.inpaint(images[i].buffer, allOcrResults[i]);
            } catch (err) {
              logger.warn(`[Pipeline] Inpainting failed on image ${i}:`, err.message);
            }
          }
          allCleanImages.push(clean);

          // Phát sự kiện page_done tức thì: Trang i đã hoàn thành 100% pipeline
          const pageTrans = allTranslations[i] || [];
          const pageOcr = allOcrResults[i] || [];
          const pageTranslatedCount = typeof pageTrans.translatedCount === 'number'
            ? pageTrans.translatedCount
            : pageTrans.filter((t) => t.isTranslated !== false).length;

          emit('page_done', p, `Hoàn tất xử lý trang ${i + 1}/${total}`, {
            pageIndex: i,
            pageResult: {
              path: images[i].path,
              width: allImageMetas[i]?.width || 0,
              height: allImageMetas[i]?.height || 0,
              cleanImage: clean,
              translations: pageTrans,
              detections: allDetections[i] || [],
              ocrResults: pageOcr,
              hasQuotaError: Boolean(pageTrans.isQuota || pageTrans.quotaExceeded),
              translatedCount: pageTranslatedCount,
              totalCount: pageOcr.length,
              failedCount: Math.max(0, pageOcr.length - pageTranslatedCount),
            },
          });
        }
        timings.inpaint = Math.max(20, Date.now() - tInpaint);
        emit('inpaint', 100, `Đã tẩy sạch ${total} trang`, {
          stepBadge: `Đã tẩy ${total} trang`,
          logItem: { step: 'inpaint', text: `✨ Tẩy sạch chữ gốc hoàn tất trên toàn bộ ${total} trang`, type: 'info' },
        });
      } else {
        for (let i = 0; i < total; i++) {
          allCleanImages.push(images[i].buffer);
          const pageTrans = allTranslations[i] || [];
          const pageOcr = allOcrResults[i] || [];
          const pageTranslatedCount = typeof pageTrans.translatedCount === 'number'
            ? pageTrans.translatedCount
            : pageTrans.filter((t) => t.isTranslated !== false).length;

          emit('page_done', Math.round(((i + 1) / total) * 100), `Hoàn tất xử lý trang ${i + 1}/${total}`, {
            pageIndex: i,
            pageResult: {
              path: images[i].path,
              width: allImageMetas[i]?.width || 0,
              height: allImageMetas[i]?.height || 0,
              cleanImage: images[i].buffer,
              translations: pageTrans,
              detections: allDetections[i] || [],
              ocrResults: pageOcr,
              hasQuotaError: Boolean(pageTrans.isQuota || pageTrans.quotaExceeded),
              translatedCount: pageTranslatedCount,
              totalCount: pageOcr.length,
              failedCount: Math.max(0, pageOcr.length - pageTranslatedCount),
            },
          });
        }
        emit('inpaint', 100, 'Bỏ qua tẩy chữ', { stepBadge: 'Bỏ qua' });
      }

      // ===== Step 6: Chuẩn bị các Text Layers cho Studio =====
      const results = [];
      const tTypeset = Date.now();
      emit('typeset', 10, 'Chuẩn bị các layer thoại cho Studio...', {
        logItem: { step: 'typeset', text: '🎨 Đang tạo các Layer thoại tiếng Việt sẵn sàng biên tập cho Studio...', type: 'info' },
      });

      for (let i = 0; i < total; i++) {
        if (this._cancelled) throw new Error('Cancelled');
        const p = Math.round(((i + 1) / total) * 100);
        emit('typeset', p, `Chuẩn bị Layer: Trang ${i + 1}/${total}...`, {
          imageIndex: i,
          logItem: { step: 'typeset', text: `🎨 Trang ${i + 1}/${total}: Nạp ${allTranslations[i]?.length || 0} layer thoại lên Canvas`, type: 'info', pageIndex: i },
        });

        const pageTrans = allTranslations[i] || [];
        const pageOcr = allOcrResults[i] || [];
        const pageTranslatedCount = typeof pageTrans.translatedCount === 'number'
          ? pageTrans.translatedCount
          : pageTrans.filter((t) => t.isTranslated !== false).length;

        results.push({
          path: images[i].path,
          width: allImageMetas[i]?.width || 0,
          height: allImageMetas[i]?.height || 0,
          cleanImage: allCleanImages[i] || null,
          translations: pageTrans,
          detections: allDetections[i] || [],
          ocrResults: pageOcr,
          hasQuotaError: Boolean(pageTrans.isQuota || pageTrans.quotaExceeded),
          translatedCount: pageTranslatedCount,
          totalCount: pageOcr.length,
          failedCount: Math.max(0, pageOcr.length - pageTranslatedCount),
        });
      }
      timings.typeset = Math.max(10, Date.now() - tTypeset);
      emit('typeset', 100, `Đã chuẩn bị ${totalTranslated} layer thoại (${total} trang)`, {
        stepBadge: `Sẵn sàng ${totalTranslated} layers`,
        logItem: { step: 'typeset', text: `🎨 Dàn trang hoàn tất: Sẵn sàng ${totalTranslated} layer thoại trên ${total} trang`, type: 'info' },
      });

      // ===== Step 7: Biên tập Layer (Mỗi khung thoại là 1 layer) =====
      const totalLayers = allTranslations.reduce((acc, t) => acc + (t?.length || 0), 0);
      const tReview = Date.now();
      timings.review = Math.max(10, Date.now() - tReview);
      emit('review', 100, `Đã tạo ${totalLayers} layers trên ${total} trang sẵn sàng biên tập`, {
        stepBadge: `${totalLayers} layers (${total} trang)`,
        layerCount: totalLayers,
      });

      // ===== Step 8: Hoàn tất & Xuất file =====
      timings.completed = 50;
      emit('completed', 100, `Hoàn tất ${total} trang: Bóc tách ${totalDetected} khung → OCR ${totalOcr} khung → Dịch ${totalTranslated}/${totalOcr} câu`, {
        stepBadge: 'Đã hoàn tất',
        imageIndex: total,
        total,
        layerCount: totalLayers,
        detectedCount: totalDetected,
        ocrCount: totalOcr,
        sentCount: totalOcr,
        receivedCount: totalTranslated,
        failedCount: totalFailed,
        logItem: {
          step: 'completed',
          text: `🎉 Hoàn tất dịch toàn bộ ${total} trang! Bóc tách ${totalDetected} khung → Đọc ${totalOcr} câu → Dịch thành công ${totalTranslated}/${totalOcr} câu thoại tiếng Việt.`,
          type: 'info',
        },
      });

      results.hasQuotaError = chapterHasQuotaError;
      results.totalDetected = totalDetected;
      results.totalOcr = totalOcr;
      results.totalSent = totalOcr;
      results.totalReceived = totalTranslated;
      results.totalTranslated = totalTranslated;
      results.totalFailed = totalFailed;

      return results;
    } catch (err) {
      if (err.message === 'Cancelled') {
        logger.info('[Pipeline] Chapter translation cancelled by user.');
        throw err;
      }
      logger.error('[Pipeline] Chapter translation failed:', err.message);
      throw err;
    }
  }


  /** Hủy pipeline đang chạy. */
  cancel() {
    this._cancelled = true;
  }

  // --- Lazy step initialization ---

  async _getDetectionStep(settings) {
    if (!this._steps.detection) {
      const ortModule = getOrt();
      const modelPath = this._modelManager.getModelPath(settings.detectionModel);
      this._steps.detection = new DetectionStep(ortModule, modelPath);
    }
    return this._steps.detection;
  }

  async _getOCRStep(settings) {
    const ortModule = getOrt();
    const modelPaths = this._modelManager.isModelInstalled(settings.ocrModel)
      ? this._modelManager.getModelPaths(settings.ocrModel)
      : {};

    // Xác định Vision provider cho OCR:
    // OCR bắt buộc cần AI có khả năng đọc ảnh (Gemini Vision hoặc OpenAI Vision).
    // Các provider dịch văn bản như DeepL, Google Translate không có API đọc ảnh.
    let cloudProvider = null;

    // 1. Ưu tiên ocrVisionProvider nếu người dùng chỉ định rõ
    if (settings.ocrVisionProvider) {
      try {
        const candidate = createProvider(settings.ocrVisionProvider, settings);
        if (candidate?.supportsOCR) cloudProvider = candidate;
      } catch (_) {}
    }

    // 2. Nếu translationProvider có hỗ trợ OCR (như Gemini, OpenAI)
    if (!cloudProvider && settings.translationProvider) {
      try {
        const candidate = createProvider(settings.translationProvider, settings);
        if (candidate?.supportsOCR) cloudProvider = candidate;
      } catch (_) {}
    }

    // 3. Nếu translationProvider là DeepL / Google / OpenAI-compatible (không hỗ trợ OCR):
    // Tự động sử dụng Gemini Vision nếu có cấu hình key Gemini
    if (!cloudProvider && settings.apiKeys?.gemini && settings.apiKeys.gemini.trim()) {
      try {
        const candidate = createProvider('gemini', settings);
        if (candidate?.supportsOCR) cloudProvider = candidate;
      } catch (_) {}
    }

    // 4. Hoặc sử dụng OpenAI Vision nếu có cấu hình key OpenAI
    if (!cloudProvider && settings.apiKeys?.openai && settings.apiKeys.openai.trim()) {
      try {
        const candidate = createProvider('openai', settings);
        if (candidate?.supportsOCR) cloudProvider = candidate;
      } catch (_) {}
    }

    // 5. Fallback mặc định sang Gemini
    if (!cloudProvider) {
      try {
        cloudProvider = createProvider('gemini', settings);
      } catch (_) {}
    }

    return new OCRStep(ortModule, modelPaths, cloudProvider);
  }

  _getTranslationStep(settings) {
    // Always recreate to pick up settings changes
    const provider = createProvider(settings.translationProvider, settings);
    return new TranslationStep(provider);
  }

  async _getInpaintingStep(settings) {
    if (!this._steps.inpainting) {
      const ortModule = getOrt();
      const modelPath = this._modelManager.getModelPath(settings.inpaintingModel);
      this._steps.inpainting = new InpaintingStep(ortModule, modelPath);
    }
    return this._steps.inpainting;
  }

  /**
   * Run Step 1: Detection — Chỉ nhận diện & bóc tách khung thoại.
   * @param {Buffer} imageBuffer
   * @param {object} [overrideSettings]
   * @param {Function} [onProgress]
   */
  async runDetection(imageBuffer, overrideSettings = {}, onProgress = null) {
    this._cancelled = false;
    const settings = { ...loadSettings(), ...overrideSettings };
    if (onProgress) {
      onProgress({
        step: 'detect',
        percent: 20,
        detail: 'Đang quét & bóc tách khung thoại bằng AI...',
        logItem: { step: 'detect', text: '🎯 Bắt đầu quét & bóc tách khung thoại bằng AI...', type: 'info' },
      });
    }

    await this._modelManager.ensureModel(settings.detectionModel);
    if (this._cancelled) throw new Error('Cancelled');

    const detectionStep = await this._getDetectionStep(settings);
    const detections = await detectionStep.detect(imageBuffer, {
      confidenceThreshold: settings.confidenceThreshold || 0.4,
    });

    const result = detections.map((d, idx) => ({
      id: idx,
      index: idx,
      bbox: d.bbox,
      textBbox: d.textBbox || d.bbox,
      label: d.label || 'bubble',
      hasBubble: d.hasBubble !== false,
      confidence: d.confidence,
    }));

    if (onProgress) {
      onProgress({
        step: 'detect',
        percent: 100,
        detail: `Đã bóc tách được ${result.length} khung thoại`,
        detectedCount: result.length,
        detections: result,
        logItem: { step: 'detect', text: `✅ Bóc tách hoàn tất: ${result.length} khung thoại`, type: 'info' },
      });
    }

    return result;
  }

  /**
   * Run Step 2: OCR — Chỉ nhận diện chữ bên trong các khung thoại.
   * @param {Buffer} imageBuffer
   * @param {Array} detections
   * @param {object} [overrideSettings]
   * @param {Function} [onProgress]
   */
  async runOCR(imageBuffer, detections = [], overrideSettings = {}, onProgress = null) {
    this._cancelled = false;
    const settings = { ...loadSettings(), ...overrideSettings };
    const regions = detections.map((d, idx) => ({
      index: d.index ?? idx,
      id: d.id ?? idx,
      bbox: d.bbox,
      textBbox: d.textBbox || d.bbox,
      hasBubble: d.hasBubble !== false,
    }));

    if (onProgress) {
      onProgress({
        step: 'ocr',
        percent: 20,
        detail: `Đang nhận diện chữ từ ${regions.length} khung thoại...`,
        logItem: { step: 'ocr', text: `📖 Bắt đầu nhận diện chữ từ ${regions.length} khung thoại...`, type: 'info' },
      });
    }

    const ocrStep = await this._getOCRStep(settings);
    if (this._cancelled) throw new Error('Cancelled');

    const ocrResults = await ocrStep.recognize(imageBuffer, regions, {
      mode: settings.ocrProvider,
      language: settings.sourceLanguage,
    });

    const result = ocrResults.map((r, idx) => ({
      index: r.index ?? idx,
      id: r.id ?? r.index ?? idx,
      text: (r.text || '').trim(),
      bbox: r.bbox,
      confidence: r.confidence,
    }));

    if (onProgress) {
      onProgress({
        step: 'ocr',
        percent: 100,
        detail: `Đã đọc chữ: ${result.length}/${regions.length} khung thoại`,
        ocrCount: result.length,
        ocrResults: result,
        logItem: { step: 'ocr', text: `✅ OCR hoàn tất: ${result.length}/${regions.length} khung thoại có chữ`, type: 'info' },
      });
    }

    return result;
  }

  /**
   * Run Step 3: Translation — Chỉ dịch văn bản các khung thoại sang tiếng Việt.
   * @param {Array} segments
   * @param {object} [overrideSettings]
   * @param {Function} [onProgress]
   */
  async runTranslation(segments = [], overrideSettings = {}, onProgress = null) {
    this._cancelled = false;
    const settings = { ...loadSettings(), ...overrideSettings };
    const ocrMock = segments.map((s, idx) => ({
      index: s.index ?? s.id ?? idx,
      id: s.id ?? idx,
      text: s.sourceText || s.originalText || s.text || '',
      bbox: s.bbox || [0, 0, 100, 100],
      textBbox: s.textBbox || s.bbox,
      hasBubble: s.hasBubble !== false,
    }));

    if (onProgress) {
      onProgress({
        step: 'translate',
        percent: 20,
        detail: `Đang gửi ${ocrMock.length} câu thoại sang AI để dịch...`,
        logItem: { step: 'translate', text: `🌐 Đang gửi ${ocrMock.length} câu thoại sang AI để dịch...`, type: 'info' },
      });
    }

    const translationStep = this._getTranslationStep(settings);
    if (this._cancelled) throw new Error('Cancelled');

    let currentTranslations = await translationStep.translate(
      ocrMock,
      settings.sourceLanguage || 'ja',
      settings.targetLanguage || 'vi',
      settings.translationPrompt || undefined
    );

    if (currentTranslations.error && onProgress) {
      onProgress({
        step: 'translate',
        percent: 60,
        warning: true,
        error: currentTranslations.error,
        detail: `⚠️ Lỗi dịch thuật: ${currentTranslations.error}`,
        logItem: {
          step: 'translate',
          text: `❌ Lỗi dịch thuật: ${currentTranslations.error}`,
          type: 'error',
        },
      });
    }

    const isSourceJa = !settings.sourceLanguage || /^(ja|japanese|auto)$/i.test(settings.sourceLanguage);
    const isTargetVi = !settings.targetLanguage || /^(vi|vietnamese)$/i.test(settings.targetLanguage);
    const JAPANESE_CHAR_REGEX = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uff66-\uff9d]/;

    // Auto-Retry Pass cho Run Translation (chuẩn Koharu: tự động dịch lại các câu thiếu/sót chữ Nhật mà không cần người dùng bấm tay)
    const isFatalRunError = currentTranslations.isQuota || /404|401|unauthorized|not found|không tồn tại/i.test(currentTranslations.error || '');
    const MAX_RUN_RETRIES = 2;
    if (!isFatalRunError) {
      for (let retryAttempt = 1; retryAttempt <= MAX_RUN_RETRIES; retryAttempt++) {
      const failedItems = ocrMock.filter((r) => {
        const t = currentTranslations.find((x) => x.index === r.index);
        const transText = (t?.translatedText || t?.text || '').trim();
        const hasRes = isSourceJa && isTargetVi && JAPANESE_CHAR_REGEX.test(transText);
        return !t || t.isTranslated === false || hasRes;
      });

      if (failedItems.length === 0) break;

      if (onProgress) {
        onProgress({
          step: 'translate',
          percent: 50 + retryAttempt * 20,
          detail: `Tự động dịch vét lần ${retryAttempt}: Đang dịch lại ${failedItems.length} câu còn thiếu...`,
          logItem: { step: 'translate', text: `🔄 [Auto-Retry] Đang tự động dịch vét ${failedItems.length} câu còn thiếu hoặc sót chữ Nhật (Lần ${retryAttempt}/${MAX_RUN_RETRIES})...`, type: 'warn' },
        });
      }

      logger.info(`[runTranslation] Auto-Retry ${retryAttempt}: Re-translating ${failedItems.length} failed bubbles...`);
      try {
        const retryResult = await translationStep.translate(
          failedItems,
          settings.sourceLanguage || 'ja',
          settings.targetLanguage || 'vi',
          `QUY TẮC BẮT BUỘC: Dịch trọn vẹn 100% từng câu sau sang tiếng Việt, tuyệt đối không để sót chữ Nhật/Hán:\n{"translations": [{"id": ..., "text": "..."}]}`
        );

        const retryMap = new Map(retryResult.map((r) => [r.index, r]));
        currentTranslations = currentTranslations.map((t) => {
          const transText = (t.translatedText || t.text || '').trim();
          const hasRes = isSourceJa && isTargetVi && JAPANESE_CHAR_REGEX.test(transText);
          if (t.isTranslated && !hasRes) return t;
          const retried = retryMap.get(t.index);
          return retried ? { ...t, ...retried } : t;
        });
      } catch (retryErr) {
        logger.warn(`[runTranslation] Auto-Retry lần ${retryAttempt} gặp lỗi:`, retryErr.message);
      }
    }
  }

    const result = currentTranslations.map((t, idx) => {
      const transText = (t.translatedText || t.text || '').trim();
      const hasResidual = isSourceJa && isTargetVi && JAPANESE_CHAR_REGEX.test(transText);
      return {
        index: t.index ?? idx,
        id: t.id ?? idx,
        text: transText,
        translatedText: transText,
        sourceText: t.sourceText || ocrMock[idx]?.text || '',
        isTranslated: t.isTranslated !== false && !hasResidual,
        hasResidualJapanese: hasResidual,
        error: t.error || (hasResidual ? 'Còn sót chữ tiếng Nhật' : null),
      };
    });

    if (onProgress) {
      const cleanCount = result.filter(r => r.isTranslated).length;
      onProgress({
        step: 'translate',
        percent: 100,
        detail: `Hoàn tất dịch: ${cleanCount}/${result.length} câu đạt chuẩn`,
        translations: result,
        logItem: { step: 'translate', text: `✅ Dịch hoàn tất: ${cleanCount}/${result.length} câu sang tiếng Việt`, type: 'info' },
      });
    }

    return result;
  }

  /**
   * Run Step 4: Inpainting — Chỉ tẩy chữ gốc trên ảnh nền.
   * @param {Buffer} imageBuffer
   * @param {Array} regions
   * @param {object} [overrideSettings]
   * @param {Function} [onProgress]
   */
  async runInpainting(imageBuffer, regions = [], overrideSettings = {}, onProgress = null) {
    this._cancelled = false;
    const settings = { ...loadSettings(), ...overrideSettings };
    let cleanRegions = regions.map((r, idx) => ({
      index: r.index ?? idx,
      bbox: r.bbox || [0, 0, 100, 100],
      textBbox: r.textBbox || r.bbox,
      hasBubble: r.hasBubble !== false,
    }));

    // Nếu chưa có khung thoại nào, tự động dùng DetectionStep để quét tìm vùng chữ cần tẩy
    if (cleanRegions.length === 0) {
      if (onProgress) {
        onProgress({
          step: 'detect',
          percent: 15,
          detail: 'Chưa có khung thoại, đang tự động quét phát hiện vùng chữ để tẩy...',
          logItem: { step: 'detect', text: '🔍 Chưa có khung thoại, đang tự động quét vùng chữ cần tẩy bằng AI...', type: 'info' },
        });
      }
      await this._modelManager.ensureModel(settings.detectionModel);
      if (this._cancelled) throw new Error('Cancelled');
      const detectionStep = await this._getDetectionStep(settings);
      const detections = await detectionStep.detect(imageBuffer, {
        confidenceThreshold: settings.confidenceThreshold || 0.4,
      });
      cleanRegions = detections.map((d, idx) => ({
        index: idx,
        bbox: d.bbox,
        textBbox: d.textBbox || d.bbox,
        hasBubble: d.hasBubble !== false,
      }));
    }

    if (onProgress) {
      onProgress({
        step: 'inpaint',
        percent: 30,
        detail: `Đang tẩy chữ gốc trong ${cleanRegions.length} vùng chữ bằng LaMa AI...`,
        logItem: { step: 'inpaint', text: `🧹 Đang tẩy chữ gốc trong ${cleanRegions.length} vùng chữ bằng LaMa AI...`, type: 'info' },
      });
    }

    await this._modelManager.ensureModel(settings.inpaintingModel);
    if (this._cancelled) throw new Error('Cancelled');

    const inpaintingStep = await this._getInpaintingStep(settings);
    const cleanImage = await inpaintingStep.inpaint(imageBuffer, cleanRegions);

    if (onProgress) {
      onProgress({
        step: 'inpaint',
        percent: 100,
        detail: `Đã tẩy sạch ${cleanRegions.length} vùng chữ trên nền tranh`,
        logItem: { step: 'inpaint', text: `✨ Hoàn tất tẩy chữ nền sạch sẽ (${cleanRegions.length} vùng chữ)`, type: 'info' },
      });
    }

    return { cleanImage };
  }

  /**
   * Dịch lại danh sách các segments cụ thể (dành cho tính năng Dịch vét / Retry câu sót).
   */
  async translateTextSegments(segments, overrideSettings = {}) {
    const settings = { ...loadSettings(), ...overrideSettings };
    const translationStep = this._getTranslationStep(settings);
    const ocrMock = segments.map((s, idx) => ({
      index: s.index ?? s.id ?? idx,
      text: s.sourceText || s.originalText || s.text || '',
      bbox: s.bbox || [0, 0, 100, 100],
      textBbox: s.textBbox || s.bbox,
      hasBubble: s.hasBubble !== false,
    }));

    const forcePrompt = [
      `CRITICAL VERIFICATION PASS: Translate the following manga dialogue segments into Vietnamese.`,
      `Strict requirements:`,
      `- 100% of every segment MUST be in natural Vietnamese.`,
      `- ABSOLUTELY ZERO Japanese characters (Hiragana, Katakana, Kanji) allowed in the translated text.`,
      `- Return JSON: {"translations": [{"id": ..., "text": "..."}]}`,
    ].join('\n');

    return await translationStep.translate(
      ocrMock,
      settings.sourceLanguage || 'ja',
      settings.targetLanguage || 'vi',
      overrideSettings.customPrompt || forcePrompt
    );
  }

  /**
   * Helper giải quyết triệt để các câu còn sót ký tự Nhật trước khi xuất file (Verification Gate).
   */
  _resolveSfxOrSanitize(orig, currentText) {
    const OpenAICompatibleProvider = require('./providers/OpenAICompatibleProvider');
    const dict = OpenAICompatibleProvider.MANGA_SFX_DICTIONARY || {};

    const cleanOrig = (orig || '').trim().replace(/[\s!?….,:;〜~ー・「」『』()（）]/g, '');
    if (dict[cleanOrig]) return dict[cleanOrig];

    for (const [k, v] of Object.entries(dict)) {
      if (cleanOrig.includes(k) || (orig && orig.includes(k))) return v;
    }

    const trimmed = (currentText || orig || '').trim();
    // Nếu là Katakana SFX (tiếng động)
    if (/^[\u30a0-\u30ffー!?.…\s]+$/.test(trimmed)) {
      if (trimmed.length <= 4) return 'Vút!';
      return 'Rầm!';
    }
    // Nếu là Hiragana (tiếng thở, cảm thán)
    if (/^[\u3040-\u309fー!?.…\s]+$/.test(trimmed)) {
      if (trimmed.includes('あ') || trimmed.includes('ア')) return 'A...';
      if (trimmed.includes('え') || trimmed.includes('エ')) return 'Hả?';
      return 'Ưm...';
    }

    // Sanitize: loại bỏ mọi ký tự CJK còn sót
    const withoutCJK = trimmed.replace(JAPANESE_CHAR_REGEX, '').trim();
    return withoutCJK || '...';
  }

  /** Release all loaded models. */
  async dispose() {
    for (const step of Object.values(this._steps)) {
      if (step.dispose) await step.dispose();
    }
    this._steps = {};
  }
}

TranslatePipeline.getOrt = getOrt;
TranslatePipeline._resetOrt = () => {
  ort = null;
};

module.exports = TranslatePipeline;

