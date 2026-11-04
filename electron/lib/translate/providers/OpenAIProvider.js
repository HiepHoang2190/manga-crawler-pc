/**
 * OpenAIProvider — OpenAI API cho translation & OCR.
 *
 * Tương tự Koharu: hỗ trợ OpenAI GPT-4o cho dịch thuật và OCR vision.
 * Hỗ trợ Multi-Key Pool & Tự động đổi key khi hết quota (429 Rate Limit).
 */
const axios = require('axios');
const { BaseProvider } = require('./index');
const { parseApiKeys } = require('../TranslateSettings');
const logger = require('../../shared/logger');

const OPENAI_API_BASE = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';

class OpenAIProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    this._activeKeyIdx = 0;
    this._keyCooldowns = new Map();
  }

  get name() { return 'OpenAI'; }
  get id() { return 'openai'; }
  get type() { return 'cloud'; }
  get requiresApiKey() { return true; }
  get hasFreeOption() { return false; }
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

    return keys[0];
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

  async _postWithRetry(endpoint, data, retries = 3) {
    const keys = this._parseKeys();
    if (keys.length === 0) throw new Error('OpenAI API key chưa được cấu hình');

    const maxAttempts = Math.max(retries * 2, keys.length * 2);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const activeKey = this._getActiveApiKey();
      try {
        return await axios.post(`${OPENAI_API_BASE}${endpoint}`, data, {
          headers: {
            'Authorization': `Bearer ${activeKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 60_000,
        });
      } catch (err) {
        const status = err.response?.status;
        const errMsg = err.response?.data?.error?.message || err.message || '';
        const isQuota = status === 429 || /quota|insufficient_quota|rate_limit/i.test(errMsg);

        if (isQuota) {
          this._markKeyExhausted(activeKey, 60_000);
          const nextKey = this._getActiveApiKey();
          if (keys.length > 1) {
            logger.warn(`[OpenAIProvider] Key ${this._maskKey(activeKey)} hết quota (429), đổi sang key tiếp theo ${this._maskKey(nextKey)}...`);
          }

          if (attempt < maxAttempts - 1) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            continue;
          }
        }

        throw err;
      }
    }
  }

  async translate(regions, sourceLang, targetLang, customPrompt) {
    const keys = this._parseKeys();
    if (keys.length === 0) throw new Error('OpenAI API key chưa được cấu hình');

    const langNames = { ja: 'Japanese', zh: 'Chinese', ko: 'Korean', en: 'English', vi: 'Vietnamese' };
    const srcName = langNames[sourceLang] || sourceLang;
    const tgtName = langNames[targetLang] || targetLang;

    const segments = regions.map((r) => ({ id: r.index, text: r.text }));

    const systemPrompt = customPrompt || [
      `You are a professional manga translator specializing in ${srcName} to ${tgtName} translation.`,
      `Translation requirements:`,
      `- Translate every input segment from ${srcName} into natural ${tgtName}.`,
      `- Preserve meaning, character voice, emotional tone, relationship nuance, emphasis, and sound effects.`,
      `- Localize idioms and sound effects naturally while keeping wording concise enough for speech bubbles.`,
      `- Use surrounding segments only for disambiguation and continuity; never merge or split segments.`,
      `- Write every translated \`text\` value only in ${tgtName}; do not include source text, notes, explanations, or alternatives.`,
      `- Never preserve or repeat original-language text; translate names, terms, and sound effects using natural ${tgtName} conventions.`,
      ``,
      `Output requirements:`,
      `- Each input segment has a numeric \`id\`.`,
      `- Return only a JSON object whose \`translations\` array contains one object with \`id\` and translated \`text\` for every input segment.`,
      `- Copy every input ID exactly once; order does not matter.`,
      `- Never merge, split, omit, duplicate, or add segments.`,
      `Example format:`,
      `{"translations": [{"id": 0, "text": "..."}, {"id": 1, "text": "..."}]}`,
    ].join('\n');

    const response = await this._postWithRetry('/chat/completions', {
      model: this._getModel(),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify({ segments }) },
      ],
      temperature: 0.3,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
    });

    const text = response.data?.choices?.[0]?.message?.content || '{}';
    const translationMap = new Map();
    try {
      const parsed = JSON.parse(text);
      const list = Array.isArray(parsed)
        ? parsed
        : (parsed.translations || (typeof parsed === 'object' ? Object.entries(parsed).map(([k, v]) => ({ id: Number(k), text: v })) : []));

      list.forEach((item, idx) => {
        if (item && typeof item === 'object') {
          const id = item.id !== undefined ? Number(item.id) : segments[idx]?.id;
          const trans = typeof item.text === 'string' ? item.text : (item.translatedText || '');
          if (id !== undefined && trans) translationMap.set(id, trans);
        } else if (typeof item === 'string' && segments[idx]) {
          translationMap.set(segments[idx].id, item);
        }
      });
    } catch {
      const match = text.match(/\[[\s\S]*\]/);
      const arr = match ? JSON.parse(match[0]) : [];
      arr.forEach((trans, idx) => {
        if (segments[idx]) translationMap.set(segments[idx].id, trans);
      });
    }

    return regions.map((r) => {
      const trans = translationMap.get(r.index);
      return {
        index: r.index,
        translatedText: (trans && String(trans).trim()) ? String(trans).trim() : r.text,
      };
    });
  }

  async ocr(imageBuffer, language) {
    const keys = this._parseKeys();
    if (keys.length === 0) throw new Error('OpenAI API key chưa được cấu hình');

    const langNames = { ja: 'Japanese', zh: 'Chinese', ko: 'Korean', en: 'English' };
    const langName = langNames[language] || language;
    const base64Image = imageBuffer.toString('base64');

    const response = await this._postWithRetry('/chat/completions', {
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Image}` } },
          { type: 'text', text: `Read and extract all ${langName} text from this manga image crop. Return ONLY the raw text.` },
        ],
      }],
      max_tokens: 1024,
      temperature: 0.1,
    });

    return (response.data?.choices?.[0]?.message?.content || '').trim();
  }

  async testConnection() {
    const keys = this._parseKeys();
    if (keys.length === 0) return { success: false, error: 'API key trống' };

    const model = this._getModel();
    const results = [];
    for (const key of keys) {
      try {
        await axios.post(`${OPENAI_API_BASE}/chat/completions`, {
          model,
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 5,
        }, {
          headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
          timeout: 12_000,
        });
        results.push({ key, success: true });
      } catch (err) {
        const { formatProviderError } = require('./index');
        const msg = formatProviderError(err, { model });
        results.push({ key, success: false, error: msg });
      }
    }

    const validCount = results.filter((r) => r.success).length;
    if (validCount === keys.length) {
      return {
        success: true,
        count: keys.length,
        message: keys.length === 1 ? '✓ Kết nối OpenAI thành công!' : `✓ Tất cả ${keys.length} API key OpenAI đều hoạt động tốt!`,
      };
    } else if (validCount > 0) {
      return {
        success: true,
        warning: true,
        count: validCount,
        total: keys.length,
        message: `⚠ ${validCount}/${keys.length} key OpenAI hoạt động.`,
      };
    } else {
      return { success: false, error: results[0]?.error || 'Kết nối thất bại' };
    }
  }
}

module.exports = OpenAIProvider;
