/**
 * TranslationStep — Dịch text đã OCR sang ngôn ngữ đích.
 *
 * Dùng provider system để dịch. Gom context toàn trang
 * giống Koharu gửi full page context cho LLM.
 */
const logger = require('../../shared/logger');

class TranslationStep {
  /**
   * @param {import('../providers/index').BaseProvider} provider
   */
  constructor(provider) {
    this._provider = provider;
  }

  /**
   * Dịch tất cả OCR results.
   * @param {Array<{bbox: number[], text: string, index: number}>} ocrResults
   * @param {string} sourceLang
   * @param {string} targetLang
   * @param {string} [customPrompt]
   * @returns {Promise<Array<{bbox: number[], originalText: string, translatedText: string, index: number}>>}
   */
  async translate(ocrResults, sourceLang, targetLang, customPrompt) {
    if (!ocrResults || ocrResults.length === 0) return [];

    logger.info(`[TranslationStep] Translating ${ocrResults.length} regions (${sourceLang} → ${targetLang})...`);

    // Gửi batch tới provider
    const regions = ocrResults.map((r) => ({ text: r.text, index: r.index }));

    try {
      const translations = await this._provider.translate(regions, sourceLang, targetLang, customPrompt);

const JAPANESE_CHAR_REGEX = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uff66-\uff9d]/;

      // Merge kết quả
      const translationMap = new Map(translations.map((t) => [t.index, t.translatedText]));

      const isSourceJapanese = !sourceLang || /^(ja|japanese|auto)$/i.test(sourceLang);
      const isTargetNotJapanese = !/^(ja|japanese)$/i.test(targetLang || 'vi');

      let actualTranslatedCount = 0;
      let residualCount = 0;
      const results = ocrResults.map((r) => {
        const trans = translationMap.get(r.index);
        const isPresent = translationMap.has(r.index) && typeof trans === 'string' && trans.trim().length > 0;
        const rawTrans = isPresent ? trans.trim() : '';

        // Kiểm tra sót chữ Nhật khi dịch sang tiếng Việt
        const hasResidual = isSourceJapanese && isTargetNotJapanese && JAPANESE_CHAR_REGEX.test(rawTrans);
        const isIdenticalToSource = rawTrans.toLowerCase() === (r.text || '').trim().toLowerCase();
        const hasTranslation = isPresent && !isIdenticalToSource && !hasResidual;

        if (hasTranslation) actualTranslatedCount++;
        if (hasResidual) residualCount++;

        // Giữ nguyên bản dịch của AI (kèm cờ cảnh báo hasResidualJapanese) thay vì xóa trắng về tiếng Nhật
        const transText = (isPresent && !isIdenticalToSource) ? rawTrans : r.text;
        let errorMsg = null;
        if (!hasTranslation) {
          if (hasResidual) {
            errorMsg = 'Còn sót chữ tiếng Nhật chưa được dịch';
          } else if (isIdenticalToSource) {
            errorMsg = 'AI chưa dịch (vẫn giữ nguyên câu gốc)';
          } else {
            errorMsg = 'Chưa nhận được kết quả dịch từ AI';
          }
        }

        return {
          bbox: r.bbox,
          textBbox: r.textBbox || r.bbox,
          hasBubble: r.hasBubble !== false,
          originalText: r.text,
          translatedText: transText,
          sourceText: r.text,
          text: transText,
          index: r.index,
          isTranslated: hasTranslation,
          hasResidualJapanese: Boolean(hasResidual),
          error: errorMsg,
        };
      });

      results.translatedCount = actualTranslatedCount;
      results.totalCount = ocrResults.length;
      results.failedCount = ocrResults.length - actualTranslatedCount;
      results.residualCount = residualCount;
      results.isQuota = false;
      results.quotaExceeded = false;

      logger.info(`[TranslationStep] Translation complete: ${actualTranslatedCount}/${ocrResults.length} regions translated (${residualCount} residual).`);
      return results;
    } catch (err) {
      const { formatProviderError } = require('../providers');
      const model = typeof this._provider?._getModel === 'function'
        ? this._provider._getModel()
        : (this._provider?.config?.model || '');
      const errMsg = formatProviderError(err, { model });

      const isQuota = Boolean(
        err.isQuota ||
        err.status === 429 ||
        err.response?.status === 429 ||
        /quota|rate\s*limit|resource_exhausted/i.test(err.message || err.response?.data?.error?.message || '')
      );

      logger.error(`[TranslationStep] Translation failed (isQuota=${isQuota}, model=${model || 'default'}):`, errMsg);

      // Fallback: trả về text gốc nhưng đánh dấu rõ ràng trạng thái chưa dịch và thông tin lỗi
      const fallbackResults = ocrResults.map((r) => ({
        bbox: r.bbox,
        textBbox: r.textBbox || r.bbox,
        hasBubble: r.hasBubble !== false,
        originalText: r.text,
        translatedText: r.text,
        sourceText: r.text,
        text: r.text,
        index: r.index,
        isTranslated: false,
        hasResidualJapanese: JAPANESE_CHAR_REGEX.test(r.text || ''),
        error: errMsg,
      }));

      fallbackResults.isQuota = isQuota;
      fallbackResults.quotaExceeded = isQuota;
      fallbackResults.error = errMsg;
      fallbackResults.translatedCount = 0;
      fallbackResults.totalCount = ocrResults.length;
      fallbackResults.failedCount = ocrResults.length;
      fallbackResults.residualCount = fallbackResults.filter(r => r.hasResidualJapanese).length;

      return fallbackResults;
    }
  }
}

module.exports = TranslationStep;
