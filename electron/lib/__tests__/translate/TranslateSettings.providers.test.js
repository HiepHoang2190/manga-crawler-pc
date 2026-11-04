const path = require('path');
const fs = require('fs');

describe('TranslateSettings — Providers & Auto-Migration', () => {
  let TranslateSettings;
  const testDir = path.join(__dirname, 'tmp_settings_test');
  const testFile = path.join(testDir, 'translate-settings.json');

  beforeAll(() => {
    process.env.NODE_ENV = 'test';
  });

  beforeEach(() => {
    jest.resetModules();
    if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
    if (fs.existsSync(testDir)) fs.rmdirSync(testDir);
    fs.mkdirSync(testDir, { recursive: true });

    // Mock getSettingsPath by mocking electron app or fs if needed
    TranslateSettings = require('../../translate/TranslateSettings');
  });

  afterEach(() => {
    if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
    if (fs.existsSync(testDir)) fs.rmdirSync(testDir);
  });

  test('DEFAULT_SETTINGS contains default providers map and activeModel', () => {
    const defaults = TranslateSettings.DEFAULT_SETTINGS;
    expect(defaults.providers).toBeDefined();
    expect(defaults.providers.gemini).toBeDefined();
    expect(defaults.providers.openai).toBeDefined();
    expect(defaults.providers.claude).toBeDefined();
    expect(defaults.providers.deepseek).toBeDefined();
    expect(defaults.providers.openrouter).toBeDefined();
    expect(defaults.providers.ollama).toBeDefined();
    expect(defaults.providers.lmstudio).toBeDefined();
    expect(defaults.providers.deepl).toBeDefined();

    expect(defaults.providers.gemini.type).toBe('gemini');
    expect(defaults.providers.openai.type).toBe('openai_compatible');
    expect(defaults.providers.claude.type).toBe('claude');
    expect(defaults.providers.deepseek.type).toBe('openai_compatible');

    // Safe modern defaults
    expect(defaults.activeModel).toBe('gemini-3.5-flash');
    expect(defaults.providers.gemini.defaultModel).toBe('gemini-3.5-flash');
    expect(defaults.providers.claude.defaultModel).toBe('claude-3-7-sonnet');
    expect(defaults.providers.openrouter.defaultModel).toBe('google/gemini-2.5-flash');
  });

  test('migrateLegacyApiKeys converts legacy apiKeys into providers', () => {
    const legacy = {
      translationProvider: 'gemini',
      apiKeys: {
        gemini: 'AIzaSyLegacyGeminiKey',
        openai: 'sk-legacy-openai-key',
        deepl: 'legacy-deepl-key',
        openaiCompatible: {
          endpoint: 'http://localhost:11434/v1',
          key: 'ollama',
          model: 'qwen2.5:7b',
        },
      },
    };

    const migrated = TranslateSettings.migrateLegacySettings(legacy);
    expect(migrated.providers).toBeDefined();
    expect(migrated.providers.gemini.credential).toBe('AIzaSyLegacyGeminiKey');
    expect(migrated.providers.openai.credential).toBe('sk-legacy-openai-key');
    expect(migrated.providers.deepl.credential).toBe('legacy-deepl-key');
    expect(migrated.providers.ollama.baseUrl).toBe('http://localhost:11434/v1');
    expect(migrated.providers.ollama.defaultModel).toBe('qwen2.5:7b');
  });

  test('supports custom providers (e.g. ShopAIKey) and keeps both providers and apiKeys', () => {
    const customConfig = {
      translationProvider: 'custom_shopaikey',
      activeModel: 'gpt-4o',
      providers: {
        ...TranslateSettings.DEFAULT_PROVIDERS,
        custom_shopaikey: {
          id: 'custom_shopaikey',
          name: 'ShopAIKey',
          type: 'openai_compatible',
          credential: 'sk-shopaikey-token',
          baseUrl: 'https://api.shopaikey.com/v1',
          defaultModel: 'gpt-4o',
          isCustom: true,
          enabled: true,
        },
      },
    };

    const merged = TranslateSettings.deepMerge(
      structuredClone(TranslateSettings.DEFAULT_SETTINGS),
      customConfig
    );
    expect(merged.providers.custom_shopaikey).toBeDefined();
    expect(merged.providers.custom_shopaikey.baseUrl).toBe('https://api.shopaikey.com/v1');
    expect(merged.providers.custom_shopaikey.credential).toBe('sk-shopaikey-token');
  });

  test('migrateLegacySettings cleans up legacy openai_compatible provider and migrates active to ollama', () => {
    const legacyConfig = {
      translationProvider: 'openai_compatible',
      providers: {
        openai_compatible: {
          id: 'openai_compatible',
          baseUrl: 'http://localhost:11434/v1',
          defaultModel: 'qwen2.5:7b',
          isCustom: false,
        },
      },
    };

    const migrated = TranslateSettings.migrateLegacySettings(legacyConfig);
    expect(migrated.translationProvider).toBe('ollama');
    expect(migrated.providers.openai_compatible).toBeUndefined();
    expect(migrated.providers.ollama).toBeDefined();
    expect(migrated.providers.ollama.defaultModel).toBe('qwen2.5:7b');
  });

  test('migrateLegacySettings migrates obsolete activeModel to modern equivalents', () => {
    // gemini-1.5-flash -> gemini-3.5-flash
    const legacy1 = { activeModel: 'gemini-1.5-flash' };
    expect(TranslateSettings.migrateLegacySettings(legacy1).activeModel).toBe('gemini-3.5-flash');

    // gemini-1.5-pro -> gemini-3.5-flash
    const legacy2 = { activeModel: 'gemini-1.5-pro' };
    expect(TranslateSettings.migrateLegacySettings(legacy2).activeModel).toBe('gemini-3.5-flash');

    // gemini-2.0-flash-exp -> gemini-3.5-flash
    const legacy3 = { activeModel: 'gemini-2.0-flash-exp' };
    expect(TranslateSettings.migrateLegacySettings(legacy3).activeModel).toBe('gemini-3.5-flash');

    // gemini-2.5-flash -> gemini-3.5-flash
    const legacy25 = { activeModel: 'gemini-2.5-flash' };
    expect(TranslateSettings.migrateLegacySettings(legacy25).activeModel).toBe('gemini-3.5-flash');

    // claude-3-5-sonnet-20240620 -> claude-3-7-sonnet
    const legacy4 = { activeModel: 'claude-3-5-sonnet-20240620' };
    expect(TranslateSettings.migrateLegacySettings(legacy4).activeModel).toBe('claude-3-7-sonnet');

    // Non-obsolete model remains untouched
    const current = { activeModel: 'gpt-4o' };
    expect(TranslateSettings.migrateLegacySettings(current).activeModel).toBe('gpt-4o');
  });

  test('migrateLegacySettings migrates obsolete provider default models', () => {
    const legacySettings = {
      providers: {
        gemini: { defaultModel: 'gemini-1.5-flash' },
        claude: { defaultModel: 'claude-3-5-sonnet-20240620' },
        openrouter: { defaultModel: 'google/gemini-2.0-flash-exp:free' },
        openai: { defaultModel: 'gpt-4o' },
      },
    };

    const migrated = TranslateSettings.migrateLegacySettings(legacySettings);
    expect(migrated.providers.gemini.defaultModel).toBe('gemini-3.5-flash');
    expect(migrated.providers.claude.defaultModel).toBe('claude-3-7-sonnet');
    expect(migrated.providers.openrouter.defaultModel).toBe('google/gemini-2.5-flash');
    expect(migrated.providers.openai.defaultModel).toBe('gpt-4o');
  });
});
