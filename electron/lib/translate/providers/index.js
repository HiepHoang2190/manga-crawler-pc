/**
 * Provider Registry — Quản lý các translation/OCR providers.
 *
 * Tương tự Koharu: hỗ trợ nhiều provider (Gemini, OpenAI, DeepL, Google Translate,
 * và OpenAI-compatible endpoints cho local LLM).
 */
const logger = require('../../shared/logger');

/**
 * Base class cho tất cả providers.
 * Mỗi provider implement translate() và optionally ocr().
 */
class BaseProvider {
  constructor(config = {}) {
    this.config = config;
  }

  /** Tên hiển thị. */
  get name() { return 'Base'; }
  /** ID duy nhất. */
  get id() { return 'base'; }
  /** Provider type: 'cloud' | 'local'. */
  get type() { return 'cloud'; }
  /** Có yêu cầu API key không? */
  get requiresApiKey() { return true; }
  /** Có free tier không? */
  get hasFreeOption() { return false; }
  /** Có hỗ trợ OCR (multimodal vision) không? */
  get supportsOCR() { return false; }

  /**
   * Dịch một batch text regions.
   * @param {Array<{text: string, index: number}>} regions — text đã OCR
   * @param {string} sourceLang — mã ngôn ngữ nguồn (ja, zh, ko, en)
   * @param {string} targetLang — mã ngôn ngữ đích (vi, en, ...)
   * @param {string} [customPrompt] — prompt tùy chỉnh
   * @returns {Promise<Array<{index: number, translatedText: string}>>}
   */
  async translate(regions, sourceLang, targetLang, customPrompt) {
    throw new Error('Not implemented');
  }

  /**
   * OCR: đọc text từ ảnh (chỉ provider hỗ trợ vision).
   * @param {Buffer} imageBuffer — ảnh đã crop vùng text
   * @param {string} language — ngôn ngữ mong đợi
   * @returns {Promise<string>} — text nhận được
   */
  async ocr(imageBuffer, language) {
    throw new Error('OCR not supported by this provider');
  }

  /**
   * Test kết nối / API key.
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async testConnection() {
    throw new Error('Not implemented');
  }
}

/**
 * Provider info cho UI (không chứa logic, chỉ metadata).
 */
const PROVIDER_INFO = {
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    type: 'cloud',
    requiresApiKey: true,
    hasFreeOption: true,
    supportsOCR: true,
    description: 'Google Gemini API — miễn phí 15 req/phút, hỗ trợ OCR + dịch thuật',
    keyPlaceholder: 'AIzaSy...',
    docsUrl: 'https://ai.google.dev/',
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    type: 'cloud',
    requiresApiKey: true,
    hasFreeOption: false,
    supportsOCR: true,
    description: 'OpenAI GPT-4o — chất lượng dịch cao, hỗ trợ OCR Vision',
    keyPlaceholder: 'sk-...',
    docsUrl: 'https://platform.openai.com/',
  },
  claude: {
    id: 'claude',
    name: 'Anthropic Claude',
    type: 'cloud',
    requiresApiKey: true,
    hasFreeOption: false,
    supportsOCR: true,
    description: 'Anthropic Claude 3.5 Sonnet — dịch tự nhiên, ngữ điệu văn học xuất sắc',
    keyPlaceholder: 'sk-ant-...',
    docsUrl: 'https://console.anthropic.com/',
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    type: 'cloud',
    requiresApiKey: true,
    hasFreeOption: false,
    supportsOCR: false,
    description: 'DeepSeek V3 / R1 — chi phí cực rẻ, hiểu sâu ngữ cảnh Đông Á',
    keyPlaceholder: 'sk-...',
    docsUrl: 'https://platform.deepseek.com/',
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    type: 'cloud',
    requiresApiKey: true,
    hasFreeOption: true,
    supportsOCR: true,
    description: 'OpenRouter — định tuyến hàng trăm model AI (có free models)',
    keyPlaceholder: 'sk-or-...',
    docsUrl: 'https://openrouter.ai/',
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama (Local AI)',
    type: 'local',
    requiresApiKey: false,
    hasFreeOption: true,
    supportsOCR: false,
    description: 'Ollama — chạy offline 100% trên GPU/CPU máy tính cá nhân',
    keyPlaceholder: 'ollama',
    docsUrl: 'https://ollama.com/',
  },
  lmstudio: {
    id: 'lmstudio',
    name: 'LM Studio',
    type: 'local',
    requiresApiKey: false,
    hasFreeOption: true,
    supportsOCR: false,
    description: 'LM Studio — local server tương thích OpenAI',
    keyPlaceholder: 'lm-studio',
    docsUrl: 'https://lmstudio.ai/',
  },
  deepl: {
    id: 'deepl',
    name: 'DeepL',
    type: 'cloud',
    requiresApiKey: true,
    hasFreeOption: true,
    supportsOCR: false,
    description: 'DeepL API — chất lượng dịch tốt, free 500K ký tự/tháng',
    keyPlaceholder: '...',
    docsUrl: 'https://www.deepl.com/pro-api',
  },
  openai_compatible: {
    id: 'openai_compatible',
    name: 'OpenAI Compatible',
    type: 'cloud',
    requiresApiKey: true,
    hasFreeOption: false,
    supportsOCR: false,
    description: 'Endpoint tương thích OpenAI (ShopAIKey, vLLM, OneAPI...)',
    keyPlaceholder: 'Endpoint: https://api.shopaikey.com/v1',
    docsUrl: '',
  },
};

/**
 * Tạo provider instance từ ID và settings.
 * Lazy-require để tránh load tất cả providers cùng lúc.
 */
function createProvider(providerId, settings = {}) {
  const provider = settings.providers?.[providerId];
  const activeModel = (settings.translationProvider === providerId && settings.activeModel)
    ? settings.activeModel
    : (provider?.defaultModel || provider?.model || settings.activeModel);

  // 1. Kiểm tra cấu hình provider trong settings.providers (Schema mới Koharu)
  if (provider) {
    const pType = provider.type;
    if (pType === 'gemini') {
      const GeminiProvider = require('./GeminiProvider');
      return new GeminiProvider({
        apiKey: provider.credential,
        baseUrl: provider.baseUrl,
        model: activeModel,
      });
    }
    if (pType === 'openai') {
      const OpenAIProvider = require('./OpenAIProvider');
      return new OpenAIProvider({
        apiKey: provider.credential,
        baseUrl: provider.baseUrl,
        model: activeModel,
      });
    }
    if (pType === 'claude') {
      const ClaudeProvider = require('./ClaudeProvider');
      return new ClaudeProvider({
        apiKey: provider.credential,
        baseUrl: provider.baseUrl,
        model: activeModel,
      });
    }
    if (pType === 'deepl') {
      const DeepLProvider = require('./DeepLProvider');
      return new DeepLProvider({
        apiKey: provider.credential,
        baseUrl: provider.baseUrl,
      });
    }
    if (
      pType === 'openai_compatible' ||
      pType === 'local' ||
      providerId === 'ollama' ||
      providerId === 'lmstudio' ||
      provider.id === 'ollama' ||
      provider.id === 'lmstudio' ||
      provider.isCustom
    ) {
      const OpenAICompatibleProvider = require('./OpenAICompatibleProvider');
      let defaultEndpoint = 'http://localhost:11434/v1';
      let defaultKey = 'ollama';
      let defaultModel = 'qwen2.5:7b';
      if (providerId === 'lmstudio' || provider.id === 'lmstudio') {
        defaultEndpoint = 'http://localhost:1234/v1';
        defaultKey = 'lm-studio';
        defaultModel = 'local-model';
      }
      return new OpenAICompatibleProvider({
        endpoint: provider.baseUrl || defaultEndpoint,
        key: provider.credential || defaultKey,
        model: activeModel || defaultModel,
      });
    }
  }

  // 2. Fallback sang schema cũ (apiKeys) nếu chưa có trong providers
  const apiKeys = settings.apiKeys || {};
  switch (providerId) {
    case 'gemini': {
      const GeminiProvider = require('./GeminiProvider');
      return new GeminiProvider({ apiKey: apiKeys.gemini, model: activeModel });
    }
    case 'openai': {
      const OpenAIProvider = require('./OpenAIProvider');
      return new OpenAIProvider({ apiKey: apiKeys.openai, model: activeModel });
    }
    case 'claude': {
      const ClaudeProvider = require('./ClaudeProvider');
      return new ClaudeProvider({ apiKey: apiKeys.claude || '', model: activeModel });
    }
    case 'deepl': {
      const DeepLProvider = require('./DeepLProvider');
      return new DeepLProvider({ apiKey: apiKeys.deepl });
    }
    case 'google': {
      const logger = require('../../shared/logger');
      logger.warn('[createProvider] Google Translate provider đã bị gỡ bỏ. Tự động chuyển sang Gemini.');
      const GeminiProvider = require('./GeminiProvider');
      return new GeminiProvider({ apiKey: apiKeys.gemini });
    }
    case 'ollama': {
      const OpenAICompatibleProvider = require('./OpenAICompatibleProvider');
      return new OpenAICompatibleProvider({
        endpoint: settings.ollamaEndpoint || apiKeys.openaiCompatible?.endpoint || 'http://localhost:11434/v1',
        key: apiKeys.ollama || apiKeys.openaiCompatible?.key || 'ollama',
        model: activeModel || settings.ollamaModel || apiKeys.openaiCompatible?.model || 'qwen2.5:7b',
      });
    }
    case 'lmstudio': {
      const OpenAICompatibleProvider = require('./OpenAICompatibleProvider');
      return new OpenAICompatibleProvider({
        endpoint: settings.lmStudioEndpoint || 'http://localhost:1234/v1',
        key: apiKeys.lmstudio || 'lm-studio',
        model: activeModel || settings.lmStudioModel || 'local-model',
      });
    }
    case 'deepseek':
    case 'openrouter':
    case 'openai_compatible': {
      const OpenAICompatibleProvider = require('./OpenAICompatibleProvider');
      return new OpenAICompatibleProvider(apiKeys.openaiCompatible || {
        endpoint: providerId === 'deepseek' ? 'https://api.deepseek.com' : (providerId === 'openrouter' ? 'https://openrouter.ai/api/v1' : 'http://localhost:11434/v1'),
        key: apiKeys[providerId] || '',
        model: activeModel,
      });
    }
    default:
      throw new Error(`Unknown provider: ${providerId}`);
  }
}

/**
 * Định dạng lỗi kết nối / API thành thông điệp tiếng Việt rõ ràng,
 * giải thích chính xác nguyên nhân (sai key, hết hạn mức, sai endpoint, timeout...).
 */
function formatProviderError(err, context = {}) {
  if (!err) return 'Lỗi không xác định';
  if (typeof err === 'string') return err;

  const status = err.response?.status;
  const data = err.response?.data;
  let serverMsg = '';

  if (typeof data === 'string') {
    if (data.includes('<html') || data.includes('<!DOCTYPE')) {
      serverMsg = 'Máy chủ trả về trang web HTML thay vì JSON API (có thể do Base URL sai hoặc bị Cloudflare chặn).';
    } else {
      serverMsg = data.slice(0, 200);
    }
  } else if (data && typeof data === 'object') {
    serverMsg = (typeof data.error === 'string' ? data.error : data.error?.message) || data.message || '';
  }

  const code = err.code || '';
  const model = context.model || '';

  // 1. Lỗi mạng / Network / Connection
  if (code === 'ECONNREFUSED') {
    return `Không thể kết nối đến máy chủ (${code}). Vui lòng kiểm tra lại URL hoặc đảm bảo server local (Ollama / LM Studio) đã được bật.`;
  }
  if (code === 'ENOTFOUND') {
    return `Tên miền máy chủ không tồn tại (${code}). Vui lòng kiểm tra lại địa chỉ Base URL.`;
  }
  if (code === 'ETIMEDOUT' || code === 'ECONNABORTED' || err.message?.toLowerCase().includes('timeout')) {
    return 'Quá thời gian kết nối (Timeout). Máy chủ phản hồi quá chậm hoặc mạng chập chờn.';
  }
  if (code === 'CERT_HAS_EXPIRED' || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
    return `Lỗi chứng chỉ SSL máy chủ (${code}). Kết nối bảo mật HTTPS không thành công.`;
  }

  // 2. HTTP Status Codes
  if (status === 401) {
    return serverMsg
      ? `API Key không hợp lệ (401 Unauthorized): ${serverMsg}`
      : 'API Key không hợp lệ hoặc đã bị thu hồi (401 Unauthorized). Vui lòng kiểm tra lại Key.';
  }
  if (status === 403) {
    return serverMsg
      ? `Không có quyền truy cập (403 Forbidden): ${serverMsg}`
      : 'Không có quyền truy cập API hoặc bị chặn bởi tường lửa/Cloudflare (403 Forbidden).';
  }
  if (status === 404) {
    return serverMsg
      ? `Không tìm thấy tài nguyên (404 Not Found): ${serverMsg}`
      : `Đường dẫn API hoặc model "${model || 'đang chọn'}" không tồn tại trên máy chủ (404 Not Found).`;
  }
  if (status === 429) {
    return serverMsg
      ? `Hết hạn mức / Giới hạn tần suất (429): ${serverMsg}`
      : 'Tài khoản đã hết hạn mức sử dụng (Quota Exceeded) hoặc bị giới hạn số lượt gọi (Rate Limit 429).';
  }
  if (status >= 500) {
    return serverMsg
      ? `Lỗi máy chủ API (${status}): ${serverMsg}`
      : `Máy chủ API trả về lỗi hệ thống (${status} Internal Server Error). Vui lòng thử lại sau.`;
  }

  return serverMsg || err.message || 'Kết nối thất bại';
}

module.exports = { BaseProvider, PROVIDER_INFO, createProvider, formatProviderError };
