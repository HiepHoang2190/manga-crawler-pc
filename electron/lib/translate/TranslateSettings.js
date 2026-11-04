/**
 * TranslateSettings — Quản lý cài đặt dịch manga.
 *
 * Persist settings vào disk (JSON).
 * Tương tự Koharu settings panel: user chọn provider, nhập API key, chọn model.
 */
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const logger = require('../shared/logger');

/** Cấu hình các nhà cung cấp AI dịch thuật chuẩn theo phong cách Koharu. */
const DEFAULT_PROVIDERS = {
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    type: 'gemini',
    description: 'Google Gemini API — Free tier 15 req/phút, hỗ trợ dịch thuật & OCR',
    credential: '',
    baseUrl: '',
    defaultModel: 'gemini-3.5-flash',
    enabled: true,
    isCustom: false,
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    type: 'openai_compatible',
    description: 'OpenAI GPT-4o / GPT-4o mini hoặc endpoint trung gian',
    credential: '',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    enabled: true,
    isCustom: false,
  },
  claude: {
    id: 'claude',
    name: 'Anthropic Claude',
    type: 'claude',
    description: 'Anthropic Claude 3.7 Sonnet / 3.5 Haiku chất lượng dịch văn học cao',
    credential: '',
    baseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-3-7-sonnet',
    enabled: true,
    isCustom: false,
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    type: 'openai_compatible',
    description: 'DeepSeek V3 / R1 tốc độ cao, dịch ngữ cảnh tiếng Á xuất sắc',
    credential: '',
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    enabled: true,
    isCustom: false,
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    type: 'openai_compatible',
    description: 'Cổng đa nền tảng kết nối hàng trăm mô hình AI (hỗ trợ Free models)',
    credential: '',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'google/gemini-2.5-flash',
    enabled: true,
    isCustom: false,
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama (Local AI)',
    type: 'openai_compatible',
    description: 'Chạy offline 100% trên máy cá nhân không cần internet',
    credential: 'ollama',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'qwen2.5:7b',
    enabled: true,
    isCustom: false,
  },
  lmstudio: {
    id: 'lmstudio',
    name: 'LM Studio',
    type: 'openai_compatible',
    description: 'Server local phục vụ mô hình ngôn ngữ tải từ LM Studio',
    credential: 'lm-studio',
    baseUrl: 'http://localhost:1234/v1',
    defaultModel: 'local-model',
    enabled: true,
    isCustom: false,
  },
  deepl: {
    id: 'deepl',
    name: 'DeepL Translate',
    type: 'deepl',
    description: 'DeepL API — dịch tự nhiên, miễn phí 500K ký tự/tháng',
    credential: '',
    baseUrl: 'https://api-free.deepl.com/v2',
    defaultModel: '',
    enabled: true,
    isCustom: false,
  },
};

/** Cấu trúc settings mặc định. */
const DEFAULT_SETTINGS = {
  // --- Provider selection (giống Koharu cho chọn provider) ---
  translationProvider: 'gemini',  // gemini | openai | claude | deepseek | openrouter | ollama | lmstudio | deepl | custom_*
  activeModel: 'gemini-3.5-flash',
  ocrProvider: 'local',           // cloud (Gemini/OpenAI Vision) | local (PaddleOCR / Manga OCR)

  // --- Nhà cung cấp & Credentials chuẩn hóa (Koharu-compatible) ---
  providers: structuredClone(DEFAULT_PROVIDERS),

  // --- API keys (backward compatibility cho code cũ) ---
  apiKeys: {
    gemini: '',
    openai: '',
    deepl: '',
    openaiCompatible: { endpoint: 'http://localhost:11434/v1', key: 'ollama', model: 'qwen2.5:7b' },
  },

  // --- Language settings (giống Koharu chọn source/target) ---
  sourceLanguage: 'auto',
  targetLanguage: 'vi',

  // --- Model selection (giống Koharu Pipeline) ---
  detectionModel: 'koharu-rf-detr',
  textThreshold: 'Default',
  bubbleThreshold: 'Default',
  panelThreshold: 'Default',
  ocrModel: 'paddleocr-vl-1.6',
  inpaintingModel: 'lama',

  // --- Typesetting (chuẩn Manga Tiếng Việt & Koharu Font Stack) ---
  fontStack: ['CC Wild Words', 'Adobe 黑体 Std', 'SVN-CCWildWords', 'Patrick Hand SC', 'Shantell Sans', 'Playpen Sans', 'HL Comic', 'Be Vietnam Pro', 'Arial'],

  // --- Pipeline options ---
  enableInpainting: true, // Mặc định: Luôn bật LaMa AI Inpainting để xóa sạch chữ gốc (chuẩn Koharu)
  enableTypesetting: true,

  // --- Advanced (giống Koharu advanced settings) ---
  translationPrompt: '',  // custom prompt cho LLM, rỗng = dùng default
  maxConcurrency: 2,
  outputQuality: 90,       // JPEG quality 1-100
  confidenceThreshold: 0.5, // min confidence cho detection

  // --- Auto-Processing Mode ---
  autoProcessing: {
    enabled: false,
    inputDir: '',
    outputDir: '',
    skipExisting: true,
    outputFormat: 'same',      // 'same' | 'jpg' | 'png' | 'webp'
    outputQuality: 92,
  },
};

/** Tự động chuyển đổi settings từ schema cũ (apiKeys) sang schema mới (providers). */
function migrateLegacySettings(saved) {
  if (!saved || typeof saved !== 'object') return saved;
  const migrated = structuredClone(saved);
  if (!migrated.providers) {
    migrated.providers = structuredClone(DEFAULT_PROVIDERS);
  }
  // Ensure all default providers exist
  for (const [k, v] of Object.entries(DEFAULT_PROVIDERS)) {
    if (!migrated.providers[k]) {
      migrated.providers[k] = structuredClone(v);
    }
  }

  // Chuyển đổi legacy translationProvider từ openai_compatible sang ollama
  if (migrated.translationProvider === 'openai_compatible') {
    migrated.translationProvider = 'ollama';
  }

  // Dọn sạch provider openai_compatible thừa nếu không phải custom do người dùng tự tạo
  if (migrated.providers && migrated.providers.openai_compatible && !migrated.providers.openai_compatible.isCustom) {
    if (migrated.providers.openai_compatible.baseUrl && migrated.providers.ollama) {
      migrated.providers.ollama.baseUrl = migrated.providers.openai_compatible.baseUrl;
    }
    if (migrated.providers.openai_compatible.defaultModel && migrated.providers.ollama) {
      migrated.providers.ollama.defaultModel = migrated.providers.openai_compatible.defaultModel;
    }
    delete migrated.providers.openai_compatible;
  }

  // Tự động map từ apiKeys cũ nếu có
  if (migrated.apiKeys) {
    if (migrated.apiKeys.gemini && !migrated.providers.gemini.credential) {
      migrated.providers.gemini.credential = migrated.apiKeys.gemini;
    }
    if (migrated.apiKeys.openai && !migrated.providers.openai.credential) {
      migrated.providers.openai.credential = migrated.apiKeys.openai;
    }
    if (migrated.apiKeys.deepl && !migrated.providers.deepl.credential) {
      migrated.providers.deepl.credential = migrated.apiKeys.deepl;
    }
    if (migrated.apiKeys.openaiCompatible) {
      if (migrated.apiKeys.openaiCompatible.endpoint && (!migrated.providers.ollama.baseUrl || migrated.providers.ollama.baseUrl === DEFAULT_PROVIDERS.ollama.baseUrl)) {
        migrated.providers.ollama.baseUrl = migrated.apiKeys.openaiCompatible.endpoint;
      }
      if (migrated.apiKeys.openaiCompatible.model) {
        migrated.providers.ollama.defaultModel = migrated.apiKeys.openaiCompatible.model;
      }
      if (migrated.apiKeys.openaiCompatible.key) {
        migrated.providers.ollama.credential = migrated.apiKeys.openaiCompatible.key;
      }
    }
  }

  // Tự động chuyển đổi các model cũ / đã bị khai tử sang model mới tương đương
  if (typeof migrated.activeModel === 'string') {
    if (/gemini-1\.5|gemini-2\.0|gemini-2\.5/i.test(migrated.activeModel)) {
      migrated.activeModel = 'gemini-3.5-flash';
    } else if (/claude-3-5-sonnet-20240620/i.test(migrated.activeModel)) {
      migrated.activeModel = 'claude-3-7-sonnet';
    }
  }

  if (migrated.providers) {
    for (const [pId, p] of Object.entries(migrated.providers)) {
      if (!p || typeof p !== 'object') continue;
      // Tự động nâng cấp model cũ/bị khai tử trong cả defaultModel và legacy model field
      if (typeof p.model === 'string') {
        if (pId === 'openrouter' && /gemini-2\.0-flash-exp/i.test(p.model)) {
          p.model = 'google/gemini-2.5-flash';
        } else if (/gemini-1\.5|gemini-2\.0|gemini-2\.5/i.test(p.model)) {
          p.model = 'gemini-3.5-flash';
        } else if (/claude-3-5-sonnet-20240620/i.test(p.model)) {
          p.model = 'claude-3-7-sonnet';
        }
      }
      if (typeof p.defaultModel === 'string') {
        if (pId === 'openrouter' && /gemini-2\.0-flash-exp/i.test(p.defaultModel)) {
          p.defaultModel = 'google/gemini-2.5-flash';
        } else if (/gemini-1\.5|gemini-2\.0|gemini-2\.5/i.test(p.defaultModel)) {
          p.defaultModel = 'gemini-3.5-flash';
        } else if (/claude-3-5-sonnet-20240620/i.test(p.defaultModel)) {
          p.defaultModel = 'claude-3-7-sonnet';
        }
      }
      // Đồng bộ trường model theo defaultModel nếu có
      if (p.defaultModel) {
        p.model = p.defaultModel;
      }
    }
  }

  return migrated;
}

/** Đồng bộ ngược lại apiKeys từ providers để giữ tương thích ngược 100%. */
function syncApiKeysFromProviders(settings) {
  if (!settings.providers) return;
  if (!settings.apiKeys) settings.apiKeys = {};
  if (settings.providers.gemini) settings.apiKeys.gemini = settings.providers.gemini.credential || '';
  if (settings.providers.openai) settings.apiKeys.openai = settings.providers.openai.credential || '';
  if (settings.providers.deepl) settings.apiKeys.deepl = settings.providers.deepl.credential || '';
  if (settings.providers.ollama) {
    settings.apiKeys.openaiCompatible = {
      endpoint: settings.providers.ollama.baseUrl || 'http://localhost:11434/v1',
      key: settings.providers.ollama.credential || 'ollama',
      model: settings.providers.ollama.defaultModel || 'qwen2.5:7b',
    };
  }
}

/** Đường dẫn file settings. */
function getSettingsPath() {
  if (app && typeof app.getPath === 'function') {
    return path.join(app.getPath('userData'), 'translate-settings.json');
  }
  const os = require('os');
  const baseDir = process.platform === 'win32'
    ? path.join(process.env.APPDATA || os.homedir(), 'manga-crawler')
    : path.join(os.homedir(), 'Library/Application Support/manga-crawler');
  return path.join(baseDir, 'translate-settings.json');
}

/** Đọc settings từ disk, merge với defaults và migrate. */
function loadSettings() {
  const filePath = getSettingsPath();
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const saved = JSON.parse(raw);
      const migrated = migrateLegacySettings(saved);
      // Deep merge: saved values override defaults, nhưng giữ mọi key mới từ DEFAULT_SETTINGS
      const merged = deepMerge(structuredClone(DEFAULT_SETTINGS), migrated);
      if (merged.translationProvider === 'google') {
        merged.translationProvider = 'gemini';
      }
      syncApiKeysFromProviders(merged);
      return merged;
    }
  } catch (err) {
    logger.warn('[TranslateSettings] Failed to load settings, using defaults:', err.message);
  }
  return structuredClone(DEFAULT_SETTINGS);
}

/** Lưu settings ra disk. */
function saveSettings(settings) {
  const filePath = getSettingsPath();
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    syncApiKeysFromProviders(settings);
    fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf-8');
    logger.info('[TranslateSettings] Settings saved.');
  } catch (err) {
    logger.error('[TranslateSettings] Failed to save settings:', err.message);
    throw err;
  }
}

/** Cập nhật một phần settings (partial merge). */
function updateSettings(partial) {
  const current = loadSettings();
  const merged = deepMerge(current, partial);
  saveSettings(merged);
  return merged;
}

/** Deep merge hai objects. Source overrides target. */
function deepMerge(target, source) {
  if (!source || typeof source !== 'object') return target;
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      target[key] = deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

/** Danh sách ngôn ngữ nguồn hỗ trợ. */
const SOURCE_LANGUAGES = [
  { code: 'auto', name: 'Tự động nhận diện (Khuyên dùng)', nameEn: 'Auto Detect' },
  { code: 'ja', name: 'Tiếng Nhật', nameEn: 'Japanese' },
  { code: 'zh', name: 'Tiếng Trung', nameEn: 'Chinese' },
  { code: 'ko', name: 'Tiếng Hàn', nameEn: 'Korean' },
  { code: 'en', name: 'Tiếng Anh', nameEn: 'English' },
];

/** Danh sách ngôn ngữ đích hỗ trợ. */
const TARGET_LANGUAGES = [
  { code: 'vi', name: 'Tiếng Việt', nameEn: 'Vietnamese' },
  { code: 'en', name: 'Tiếng Anh', nameEn: 'English' },
  { code: 'zh', name: 'Tiếng Trung', nameEn: 'Chinese' },
  { code: 'ko', name: 'Tiếng Hàn', nameEn: 'Korean' },
  { code: 'ja', name: 'Tiếng Nhật', nameEn: 'Japanese' },
];

/**
 * Tách và chuẩn hóa danh sách API keys từ string hoặc array.
 * Hỗ trợ phân cách bằng dấu xuống dòng, dấu phẩy (,), hoặc chấm phẩy (;).
 * @param {string|string[]} input
 * @returns {string[]}
 */
function parseApiKeys(input) {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input.map((k) => (typeof k === 'string' ? k.trim() : '')).filter(Boolean);
  }
  if (typeof input !== 'string') return [];
  return input
    .split(/[\r\n,;]+/)
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}

function resetSettings(keepApiKeys = true) {
  const current = loadSettings();
  const reset = structuredClone(DEFAULT_SETTINGS);
  if (keepApiKeys && current.providers) {
    reset.providers = structuredClone(current.providers);
  }
  if (keepApiKeys && current.apiKeys) {
    reset.apiKeys = structuredClone(current.apiKeys);
  }
  saveSettings(reset);
  return reset;
}

module.exports = {
  DEFAULT_SETTINGS,
  DEFAULT_PROVIDERS,
  migrateLegacySettings,
  loadSettings,
  saveSettings,
  updateSettings,
  resetSettings,
  deepMerge,
  parseApiKeys,
  SOURCE_LANGUAGES,
  TARGET_LANGUAGES,
};

