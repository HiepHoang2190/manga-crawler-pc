/**
 * ClaudeProvider — Anthropic Claude API cho Manga Translation.
 *
 * Hỗ trợ các mô hình Claude 3.5 Sonnet, Claude 3 Opus, Claude 3.5 Haiku.
 * Hoạt động với endpoint chính hãng https://api.anthropic.com hoặc proxy tương thích.
 */
const axios = require('axios');
const { BaseProvider } = require('./index');
const logger = require('../../shared/logger');

const ANTHROPIC_API_BASE = 'https://api.anthropic.com';
const DEFAULT_MODEL = 'claude-3-5-sonnet-20240620';
const BATCH_SIZE = 25;

class ClaudeProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    this._activeKeyIdx = 0;
  }

  get name() { return 'Anthropic Claude'; }
  get id() { return 'claude'; }
  get type() { return 'cloud'; }
  get requiresApiKey() { return true; }
  get hasFreeOption() { return false; }
  get supportsOCR() { return true; }

  _getBaseUrl() {
    return (this.config.baseUrl || ANTHROPIC_API_BASE).replace(/\/$/, '');
  }

  _parseKeys() {
    const raw = this.config.apiKey || this.config.credential || '';
    if (Array.isArray(raw)) return raw.filter(Boolean);
    return String(raw).split(/[\r\n,]+/).map((k) => k.trim()).filter(Boolean);
  }

  _getApiKey() {
    const keys = this._parseKeys();
    if (keys.length === 0) return '';
    return keys[this._activeKeyIdx % keys.length];
  }

  _rotateKey() {
    const keys = this._parseKeys();
    if (keys.length > 1) {
      this._activeKeyIdx = (this._activeKeyIdx + 1) % keys.length;
    }
  }

  _getModel() {
    return this.config.model || DEFAULT_MODEL;
  }

  _getHeaders() {
    return {
      'x-api-key': this._getApiKey(),
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    };
  }

  async translate(regions, sourceLang, targetLang, customPrompt) {
    if (!regions || regions.length === 0) return [];

    const langNames = { ja: 'Japanese', zh: 'Chinese', ko: 'Korean', en: 'English', vi: 'Vietnamese', auto: 'Japanese' };
    const srcName = langNames[sourceLang] || sourceLang;
    const tgtName = langNames[targetLang] || targetLang;
    const isTargetVi = !targetLang || /^(vi|vietnamese)$/i.test(targetLang);

    const systemPrompt = customPrompt || (isTargetVi ? [
      `Bạn là một dịch giả manga chuyên nghiệp hàng đầu dịch từ tiếng Nhật sang tiếng Việt.`,
      `Nhiệm vụ: Dịch TOÀN BỘ các câu thoại tiếng Nhật (${srcName}) sang tiếng Việt (${tgtName}) tự nhiên, biểu cảm, đúng văn phong manga.`,
      `QUY TẮC:`,
      `1. ĐẦU RA 100% TIẾNG VIỆT: Tuyệt đối không giữ chữ Hán, chữ Nhật, tiếng Trung hay Hàn.`,
      `2. Giữ nguyên tính cách, ngữ điệu nhân vật và vừa vặn khung thoại manga.`,
      `3. Định dạng đầu ra: JSON duy nhất có dạng:`,
      `{"translations": [{"id": <id_tương_ứng>, "text": "<câu_dịch_tiếng_Việt>"}, ...]}`,
    ].join('\n') : [
      `You are a professional manga translator translating from ${srcName} to ${tgtName}.`,
      `Return ONLY a JSON object: {"translations": [{"id": 0, "text": "..."}, ...]}.`,
    ].join('\n'));

    const allTranslations = new Map();

    for (let i = 0; i < regions.length; i += BATCH_SIZE) {
      const batch = regions.slice(i, i + BATCH_SIZE);
      const segments = batch.map((r) => ({ id: r.index, text: r.text }));

      try {
        const response = await axios.post(
          `${this._getBaseUrl()}/v1/messages`,
          {
            model: this._getModel(),
            max_tokens: 4096,
            system: systemPrompt,
            messages: [
              {
                role: 'user',
                content: `Translate these ${segments.length} dialogue segments:\n${JSON.stringify({ segments })}`,
              },
            ],
            temperature: 0.2,
          },
          {
            headers: this._getHeaders(),
            timeout: 60_000,
          }
        );

        const contentBlocks = response.data?.content || [];
        const textBlock = contentBlocks.find((b) => b.type === 'text')?.text || '';
        const cleaned = textBlock.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        const list = parsed.translations || [];

        list.forEach((item) => {
          if (item && item.id !== undefined && item.text) {
            allTranslations.set(Number(item.id), item.text.trim());
          }
        });
      } catch (err) {
        logger.warn(`[ClaudeProvider] Lỗi dịch batch: ${err.message}`);
      }
    }

    return regions.map((r) => ({
      index: r.index,
      translatedText: allTranslations.get(r.index) || r.text,
    }));
  }

  async testConnection() {
    const key = this._getApiKey();
    if (!key) {
      return { success: false, error: 'Chưa cấu hình API Key cho Claude.' };
    }

    try {
      await axios.post(
        `${this._getBaseUrl()}/v1/messages`,
        {
          model: this._getModel(),
          max_tokens: 5,
          messages: [{ role: 'user', content: 'Hi' }],
        },
        {
          headers: this._getHeaders(),
          timeout: 10_000,
        }
      );
      return { success: true };
    } catch (err) {
      const { formatProviderError } = require('./index');
      return { success: false, error: formatProviderError(err, { model: this._getModel() }) };
    }
  }
}

module.exports = ClaudeProvider;
