/**
 * GeminiProvider — Google Gemini API cho translation & OCR.
 *
 * Tương tự Koharu: hỗ trợ Gemini cho cả dịch thuật và OCR (multimodal).
 * Free tier: 15 RPM, 1M tokens/day — phù hợp cho manga translation.
 * Hỗ trợ Multi-Key Pool & Tự động luân chuyển khi hết quota (Auto-Failover 429).
 */
const axios = require('axios');
const { BaseProvider } = require('./index');
const { parseApiKeys } = require('../TranslateSettings');
const logger = require('../../shared/logger');

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemini-3.5-flash';

const FALLBACK_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest'];

class GeminiProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    this._activeKeyIdx = 0;
    this._keyCooldowns = new Map();
  }

  get name() { return 'Google Gemini'; }
  get id() { return 'gemini'; }
  get type() { return 'cloud'; }
  get requiresApiKey() { return true; }
  get hasFreeOption() { return true; }
  get supportsOCR() { return true; }

  _parseKeys() {
    const raw = this.config.apiKey || this.config.apiKeys || '';
    return parseApiKeys(raw);
  }

  _maskKey(key) {
    if (!key || key.length < 8) return '***';
    return `${key.slice(0, 4)}...${key.slice(-4)}`;
  }

  _getActiveApiKey() {
    const keys = this._parseKeys();
    if (keys.length === 0) return '';
    if (keys.length === 1) return keys[0];

    const now = Date.now();
    for (let i = 0; i < keys.length; i++) {
      const idx = (this._activeKeyIdx + i) % keys.length;
      const key = keys[idx];
      const cooldownUntil = this._keyCooldowns.get(key) || 0;
      if (now >= cooldownUntil) {
        this._activeKeyIdx = idx;
        return key;
      }
    }

    // Nếu tất cả các key đều đang trong cooldown, lấy key có thời hạn sớm nhất
    let earliestKey = keys[0];
    let earliestTime = Infinity;
    for (const key of keys) {
      const expiry = this._keyCooldowns.get(key) || 0;
      if (expiry < earliestTime) {
        earliestTime = expiry;
        earliestKey = key;
      }
    }
    return earliestKey;
  }

  _markKeyExhausted(key, durationMs = 60_000) {
    if (!key) return;
    this._keyCooldowns.set(key, Date.now() + durationMs);
    const keys = this._parseKeys();
    if (keys.length > 1) {
      this._activeKeyIdx = (this._activeKeyIdx + 1) % keys.length;
    }
  }

  _getApiKey() {
    return this._getActiveApiKey();
  }

  _getModel() {
    return this.config.model || DEFAULT_MODEL;
  }

  /**
   * Thực thi POST request có retry, model fallback và key rotation khi gặp 429 Quota Exceeded.
   */
  async _postWithRetry(urlOrData, dataOrConfig, configOrRetries, maybeRetries) {
    let data;
    let config;
    let retries;

    if (typeof urlOrData === 'string') {
      data = dataOrConfig;
      config = configOrRetries || {};
      retries = typeof maybeRetries === 'number' ? maybeRetries : 3;
    } else {
      data = urlOrData;
      config = dataOrConfig || {};
      retries = typeof configOrRetries === 'number' ? configOrRetries : 3;
    }

    const keys = this._parseKeys();
    if (keys.length === 0) {
      throw new Error('Gemini API key chưa được cấu hình');
    }

    const configuredModel = this._getModel();
    const activeModelsList = [
      configuredModel,
      ...FALLBACK_MODELS.filter((m) => m !== configuredModel),
    ];
    let modelIdx = 0;
    const maxAttempts = Math.max(retries * 2, keys.length * 2);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const activeKey = this._getActiveApiKey();
      const activeModel = activeModelsList[modelIdx] || configuredModel;
      const requestUrl = `${GEMINI_API_BASE}/models/${activeModel}:generateContent?key=${activeKey}`;

      try {
        return await axios.post(requestUrl, data, config);
      } catch (err) {
        const status = err.response?.status;
        const errMsg = err.response?.data?.error?.message || err.message || '';
        const isQuota = status === 429 || /quota|rate\s*limit|resource_exhausted/i.test(errMsg);

        if (isQuota) {
          this._markKeyExhausted(activeKey, 60_000);
          const nextKey = this._getActiveApiKey();
          if (keys.length > 1) {
            logger.warn(`[GeminiProvider] Key ${this._maskKey(activeKey)} hết quota (429), tự động chuyển sang key tiếp theo ${this._maskKey(nextKey)}...`);
          } else {
            modelIdx = (modelIdx + 1) % activeModelsList.length;
            logger.warn(`[GeminiProvider] Quota 429 với model ${activeModel}, chuyển sang model dự phòng ${activeModelsList[modelIdx]}...`);
          }

          if (attempt < maxAttempts - 1) {
            await new Promise((resolve) => setTimeout(resolve, 800));
            continue;
          } else {
            err.isQuota = true;
            err.status = 429;
            err.message = `Gemini Quota Exceeded (429): Tất cả ${keys.length} API key đã hết hạn mức sử dụng (Resource Exhausted). Vui lòng thêm API Key mới vào Cài đặt hoặc đợi Google làm mới quota.`;
          }
        } else if ((status === 503 || status === 500) && attempt < maxAttempts - 1) {
          modelIdx = (modelIdx + 1) % activeModelsList.length;
          logger.warn(`[GeminiProvider] Status ${status}, đổi sang ${activeModelsList[modelIdx]} (lần ${attempt + 1}/${maxAttempts})...`);
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }

        throw err;
      }
    }
  }

  /**
   * Dịch batch text regions bằng Gemini.
   */
  async translate(regions, sourceLang, targetLang, customPrompt) {
    const keys = this._parseKeys();
    if (keys.length === 0) throw new Error('Gemini API key chưa được cấu hình');

    const langNames = {
      auto: 'the source language (auto-detect: Japanese, Chinese, Korean, English, etc.)',
      ja: 'Japanese',
      zh: 'Chinese',
      ko: 'Korean',
      en: 'English',
      vi: 'Vietnamese',
    };
    const srcName = langNames[sourceLang] || sourceLang;
    const tgtName = langNames[targetLang] || targetLang;

    const textList = regions.map((r, i) => `${i + 1}. "${r.text}"`).join('\n');

    const prompt = customPrompt || [
      `You are a professional manga/comic translator specializing in ${srcName} to ${tgtName} translation.`,
      `Translate the following text regions extracted from a manga page.`,
      `Rules:`,
      `- Maintain the original tone, emotion, and character personality.`,
      `- Keep sound effects (onomatopoeia) as transliteration or translate naturally.`,
      `- Keep translations concise to fit speech bubbles.`,
      `- Write every translated text value only in ${tgtName}; do not include source text, notes, explanations, or alternatives.`,
      `- Never preserve or repeat original-language text; translate names, terms, and sound effects using natural ${tgtName} conventions.`,
      `- Return ONLY a JSON array of translations in order, no explanation.`,
      ``,
      `Text regions:`,
      textList,
      ``,
      `Return format: ["translation1", "translation2", ...]`,
    ].join('\n');

    const response = await this._postWithRetry({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
      },
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 45_000,
    });

    const raw = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      // Trích xuất JSON array nếu response có text thừa
      const match = raw.match(/\[[\s\S]*\]/) || raw.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : [];
    }

    if (parsed && Array.isArray(parsed.translations)) {
      const map = new Map(parsed.translations.map((t, idx) => [t.id !== undefined ? t.id : regions[idx]?.index, t.text || t.translatedText]));
      return regions.map((r) => ({
        index: r.index,
        translatedText: map.get(r.index) || r.text,
      }));
    }

    const arr = Array.isArray(parsed) ? parsed : [];
    return regions.map((r, i) => ({
      index: r.index,
      translatedText: (arr[i] && String(arr[i]).trim()) ? String(arr[i]).trim() : r.text,
    }));
  }

  /**
   * OCR một crop ảnh bằng Gemini Vision.
   */
  async ocr(imageBuffer, language) {
    const keys = this._parseKeys();
    if (keys.length === 0) throw new Error('Gemini API key chưa được cấu hình');

    const langPrompt = (language === 'auto' || !language)
      ? 'text in its original language (auto-detect: Japanese, Chinese, Korean, English, etc.)'
      : `${language === 'ja' ? 'Japanese' : (language === 'zh' ? 'Chinese' : (language === 'ko' ? 'Korean' : 'English'))} text`;
    const base64Image = imageBuffer.toString('base64');

    const response = await this._postWithRetry({
      contents: [{
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: base64Image,
            },
          },
          {
            text: `Read and extract all ${langPrompt} from this manga/comic image crop. Return ONLY the raw text, no explanation. If there are multiple lines, join them with spaces.`,
          },
        ],
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024,
      },
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30_000,
    });

    return (response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
  }

  /**
   * Batch OCR: gửi tất cả crops trong 1 request duy nhất.
   */
  async ocrBatch(crops, language) {
    if (!crops || crops.length === 0) return [];
    if (crops.length === 1) {
      const single = await this.ocr(crops[0], language);
      return [single];
    }

    const keys = this._parseKeys();
    if (keys.length === 0) throw new Error('Gemini API key chưa được cấu hình');

    const langPrompt = (language === 'auto' || !language)
      ? 'text in its original language (auto-detect: Japanese, Chinese, Korean, English, etc.)'
      : `${language === 'ja' ? 'Japanese' : (language === 'zh' ? 'Chinese' : (language === 'ko' ? 'Korean' : 'English'))} text`;

    const parts = [];
    crops.forEach((crop, i) => {
      parts.push({ text: `Speech Bubble ${i + 1}:` });
      parts.push({
        inlineData: {
          mimeType: 'image/png',
          data: crop.toString('base64'),
        },
      });
    });

    parts.push({
      text: `Extract ONLY the ${langPrompt} from each Speech Bubble above in sequential order. Do not translate. Output in this exact format:
1. "text"
2. "text"
...`,
    });

    const response = await this._postWithRetry({
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2048,
      },
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 35_000,
    });

    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const results = new Array(crops.length).fill('');

    const lines = text.split('\n');
    for (const line of lines) {
      const match = line.match(/^(\d+)[.:]\s*["「]?([^"」\n]*)["」]?$/);
      if (match) {
        const idx = parseInt(match[1], 10) - 1;
        if (idx >= 0 && idx < crops.length) {
          results[idx] = match[2].trim();
        }
      }
    }

    return results;
  }

  /**
   * Test API key (kiểm tra tất cả các key trong pool nếu có nhiều key).
   */
  async testConnection() {
    const keys = this._parseKeys();
    if (keys.length === 0) return { success: false, error: 'Chưa nhập API key' };

    const model = this._getModel();
    const results = [];

    for (const key of keys) {
      try {
        const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${key}`;
        await axios.post(url, {
          contents: [{ parts: [{ text: 'Hello' }] }],
          generationConfig: { maxOutputTokens: 5 },
        }, { timeout: 12_000 });
        results.push({ key, success: true });
      } catch (err) {
        const { formatProviderError } = require('./index');
        const errMsg = formatProviderError(err, { model });
        results.push({ key, success: false, error: errMsg });
      }
    }

    const validCount = results.filter((r) => r.success).length;
    if (validCount === keys.length) {
      return {
        success: true,
        count: keys.length,
        message: keys.length === 1
          ? '✓ Kết nối Gemini thành công!'
          : `✓ Tất cả ${keys.length} API key đều hoạt động tốt!`,
      };
    } else if (validCount > 0) {
      const failed = results.filter((r) => !r.success);
      return {
        success: true,
        warning: true,
        count: validCount,
        total: keys.length,
        message: `⚠ ${validCount}/${keys.length} key hoạt động (${failed.length} key lỗi: ${failed.map(f => this._maskKey(f.key) + ': ' + f.error).join(', ')})`,
      };
    } else {
      return {
        success: false,
        error: keys.length === 1
          ? results[0]?.error || 'Kết nối thất bại'
          : `Toàn bộ ${keys.length} API key đều không hoạt động: ${results[0]?.error || ''}`,
      };
    }
  }
}

module.exports = GeminiProvider;
