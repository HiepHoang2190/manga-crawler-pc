/**
 * DeepLProvider — DeepL API cho translation.
 *
 * Tương tự Koharu: hỗ trợ DeepL. Free tier: 500K ký tự/tháng.
 */
const axios = require('axios');
const { BaseProvider } = require('./index');

const DEEPL_FREE_API = 'https://api-free.deepl.com/v2';
const DEEPL_PRO_API = 'https://api.deepl.com/v2';

/** Map ngôn ngữ sang mã DeepL. */
const DEEPL_LANG_MAP = {
  ja: 'JA', zh: 'ZH', ko: 'KO', en: 'EN', vi: 'VI',
  fr: 'FR', de: 'DE', es: 'ES', pt: 'PT', ru: 'RU',
};

class DeepLProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    this._activeKeyIdx = 0;
  }

  get name() { return 'DeepL'; }
  get id() { return 'deepl'; }
  get requiresApiKey() { return true; }
  get hasFreeOption() { return true; }
  get supportsOCR() { return false; }

  _parseKeys() {
    const raw = this.config.apiKey || this.config.apiKeys || '';
    if (typeof raw !== 'string') return [];
    return raw
      .split(/[\r\n,;]+/)
      .map((k) => k.trim())
      .filter(Boolean);
  }

  _getApiKey() {
    const keys = this._parseKeys();
    if (keys.length === 0) return '';
    return keys[this._activeKeyIdx % keys.length] || '';
  }

  /** DeepL free keys end with ':fx'. */
  _getBaseUrl(key) {
    const k = (key || this._getApiKey()).trim();
    return k.endsWith(':fx') ? DEEPL_FREE_API : DEEPL_PRO_API;
  }

  async translate(regions, sourceLang, targetLang, _customPrompt) {
    const keys = this._parseKeys();
    if (keys.length === 0) {
      throw new Error('DeepL API key chưa được cấu hình. Vui lòng nhập API Key trong Cài đặt.');
    }

    const srcLang = sourceLang === 'auto' ? undefined : DEEPL_LANG_MAP[sourceLang];
    const tgtLang = DEEPL_LANG_MAP[targetLang];
    if (!tgtLang) throw new Error(`DeepL không hỗ trợ ngôn ngữ đích: ${targetLang}`);

    const texts = regions.map((r) => r.text);
    let lastError = null;

    const postData = {
      text: texts,
      target_lang: tgtLang,
    };
    if (srcLang) postData.source_lang = srcLang;

    // Thử luân phiên các keys nếu có nhiều keys
    for (let attempt = 0; attempt < keys.length; attempt++) {
      const activeKey = keys[(this._activeKeyIdx + attempt) % keys.length];
      const baseUrl = this._getBaseUrl(activeKey);

      try {
        const response = await axios.post(`${baseUrl}/translate`, postData, {
          headers: {
            'Authorization': `DeepL-Auth-Key ${activeKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 35_000,
        });

        this._activeKeyIdx = (this._activeKeyIdx + attempt) % keys.length;
        const translations = response.data?.translations || [];

        return regions.map((r, i) => ({
          index: r.index,
          translatedText: translations[i]?.text || r.text,
        }));
      } catch (err) {
        const status = err.response?.status;
        const isQuota = status === 456 || status === 429;
        
        let msg = err.message;
        if (status === 456) {
          msg = 'DeepL Quota Exceeded (456): Đã hết hạn mức ký tự tháng (500.000 ký tự với gói Free).';
        } else if (status === 429) {
          msg = 'DeepL Rate Limit (429): Quá nhiều yêu cầu gửi cùng lúc.';
        } else if (status === 403) {
          msg = 'DeepL Auth Error (403): API key không hợp lệ hoặc sai loại (Free key cần có đuôi :fx).';
        }

        const formattedErr = new Error(msg);
        formattedErr.status = status;
        formattedErr.isQuota = isQuota;
        lastError = formattedErr;

        // Nếu còn key khác trong pool và gặp lỗi quota/auth, thử key tiếp theo
        if (keys.length > 1 && attempt < keys.length - 1) {
          continue;
        }
        throw formattedErr;
      }
    }

    throw lastError || new Error('DeepL translation failed');
  }

  async testConnection() {
    const keys = this._parseKeys();
    if (keys.length === 0) return { success: false, error: 'API key trống' };

    const activeKey = keys[0];
    const baseUrl = this._getBaseUrl(activeKey);

    try {
      const res = await axios.get(`${baseUrl}/usage`, {
        headers: { 'Authorization': `DeepL-Auth-Key ${activeKey}` },
        timeout: 10_000,
      });
      const data = res.data;
      let info = 'Kết nối DeepL thành công';
      if (typeof data?.character_count === 'number' && typeof data?.character_limit === 'number') {
        const percent = Math.round((data.character_count / data.character_limit) * 100);
        info += ` (Đã dùng ${data.character_count.toLocaleString()}/${data.character_limit.toLocaleString()} ký tự - ${percent}%)`;
      }
      return { success: true, message: info };
    } catch (err) {
      const status = err.response?.status;
      if (status === 403) return { success: false, error: 'API key không hợp lệ hoặc sai loại (Free key cần có đuôi :fx)' };
      if (status === 456) return { success: false, error: 'DeepL Quota Exceeded (456): Đã dùng hết hạn mức ký tự tháng' };
      const { formatProviderError } = require('./index');
      return { success: false, error: formatProviderError(err) };
    }
  }
}

module.exports = DeepLProvider;

