const axios = require('axios');
const logger = require('../../shared/logger');
const { formatProviderError } = require('../providers');
const { parseApiKeys } = require('../TranslateSettings');

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// Các pattern model đã bị khai tử hoặc là modality chuyên biệt không phù hợp cho dịch văn bản truyện tranh
const GEMINI_EXCLUDED_PATTERNS = /gemini-1\.5|gemini-2\.0|gemini-2\.5|tts|transcribe|audio|image|banana|lyria|robotics|computer-use|embedding|aqa|antigravity|deep-research/i;

/**
 * Lọc và chuẩn hóa danh sách model từ Google Gemini API
 * @param {Array} models
 * @returns {Array<{ id: string, name: string, description?: string }>}
 */
function filterAndFormatGeminiModels(models = []) {
  if (!Array.isArray(models)) return [];
  return models
    .filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
    .map((m) => {
      const cleanId = (m.name || '').replace(/^models\//, '');
      return {
        id: cleanId,
        name: m.displayName || cleanId,
        description: m.description || '',
      };
    })
    .filter((m) => m.id && !GEMINI_EXCLUDED_PATTERNS.test(m.id))
    .sort((a, b) => {
      // Đánh trọng số ưu tiên các model đã xác thực hoạt động ổn định và có Free Tier
      const getPriority = (id) => {
        if (id === 'gemini-3.5-flash') return 100;
        if (id === 'gemini-3.5-flash-lite') return 90;
        if (id === 'gemini-3.6-flash') return 80;
        if (id === 'gemini-flash-lite-latest') return 75;
        if (id === 'gemini-3.1-flash-lite') return 70;
        if (id.includes('flash')) return 50;
        if (id.includes('gemma')) return 30;
        if (id.includes('pro')) return 20;
        return 10;
      };
      const diff = getPriority(b.id) - getPriority(a.id);
      if (diff !== 0) return diff;
      return a.id.localeCompare(b.id);
    });
}

/**
 * Lọc và chuẩn hóa danh sách model cho các engine chuẩn OpenAI / OpenRouter / DeepSeek / Local
 * @param {Array} models
 * @returns {Array<{ id: string, name: string }>}
 */
function filterAndFormatOpenAiModels(models = []) {
  if (!Array.isArray(models)) return [];
  const excludedPatterns = /dall-e|whisper|tts|embedding|embed|moderation|babbage|davinci|audio|realtime/i;
  return models
    .map((m) => (typeof m === 'string' ? { id: m, name: m } : { id: m.id, name: m.id }))
    .filter((m) => m.id && !excludedPatterns.test(m.id))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Truy vấn danh sách model khả dụng từ API nhà cung cấp
 * @param {Object} config
 * @param {string} [config.id] - ID nhà cung cấp (gemini, openai, deepseek, ...)
 * @param {string} [config.type] - Loại provider (gemini, claude, openai_compatible, local, ...)
 * @param {string} [config.credential] - API key hoặc danh sách key
 * @param {string} [config.baseUrl] - Base URL tùy chỉnh
 * @returns {Promise<{ success: boolean, models: Array<{ id: string, name: string }>, error?: string }>}
 */
async function fetchAvailableModels(config = {}) {
  const { id, type, credential, baseUrl } = config;
  const keys = parseApiKeys(credential);
  const apiKey = keys[0] || '';

  const isNoKeyRequired = id === 'openrouter' || id === 'ollama' || id === 'lmstudio' || type === 'local';
  if (!apiKey && !isNoKeyRequired) {
    return { success: false, error: 'Chưa có API key để kiểm tra danh sách model', models: [] };
  }

  try {
    if (id === 'gemini' || type === 'gemini') {
      const url = `${GEMINI_API_BASE}/models?key=${apiKey}`;
      const res = await axios.get(url, { timeout: 15_000 });
      const rawModels = res.data?.models || [];
      const models = filterAndFormatGeminiModels(rawModels);
      return { success: true, models };
    }

    if (id === 'claude' || type === 'claude') {
      const url = 'https://api.anthropic.com/v1/models';
      const res = await axios.get(url, {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        timeout: 15_000,
      });
      const rawModels = res.data?.data || [];
      const models = rawModels.map((m) => ({
        id: m.id,
        name: m.display_name || m.id,
      }));
      return { success: true, models };
    }

    // OpenAI, DeepSeek, OpenRouter & OpenAI-compatible
    let targetBase = baseUrl;
    if (!targetBase) {
      if (id === 'openai') targetBase = 'https://api.openai.com/v1';
      else if (id === 'deepseek') targetBase = 'https://api.deepseek.com';
      else if (id === 'openrouter') targetBase = 'https://openrouter.ai/api/v1';
      else if (id === 'ollama') targetBase = 'http://localhost:11434/v1';
      else if (id === 'lmstudio') targetBase = 'http://localhost:1234/v1';
      else targetBase = 'https://api.openai.com/v1';
    }
    const cleanBase = targetBase.replace(/\/+$/, '');
    const url = cleanBase.endsWith('/models') ? cleanBase : `${cleanBase}/models`;

    const res = await axios.get(url, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      timeout: 15_000,
    });
    const rawData = res.data?.data || res.data || [];
    const models = filterAndFormatOpenAiModels(Array.isArray(rawData) ? rawData : []);
    return { success: true, models };
  } catch (err) {
    logger.warn(`[modelDiscoveryService] Failed to fetch models for ${id}:`, err.message);
    return {
      success: false,
      error: formatProviderError(err, { provider: id }),
      models: [],
    };
  }
}

module.exports = {
  fetchAvailableModels,
  filterAndFormatGeminiModels,
  filterAndFormatOpenAiModels,
};
