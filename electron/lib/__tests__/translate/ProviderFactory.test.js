const { createProvider, PROVIDER_INFO } = require('../../translate/providers');
const GeminiProvider = require('../../translate/providers/GeminiProvider');
const DeepLProvider = require('../../translate/providers/DeepLProvider');
const OpenAICompatibleProvider = require('../../translate/providers/OpenAICompatibleProvider');
const ClaudeProvider = require('../../translate/providers/ClaudeProvider');
const OpenAIProvider = require('../../translate/providers/OpenAIProvider');

describe('Provider Factory & Multi-Provider Support', () => {
  test('creates standard Gemini provider from settings.providers', () => {
    const settings = {
      translationProvider: 'deepl',
      activeModel: 'qwen2.5:7b',
      providers: {
        gemini: {
          id: 'gemini',
          type: 'gemini',
          credential: 'AIzaSyTestKey',
          defaultModel: 'gemini-3.5-flash',
        },
      },
    };
    const provider = createProvider('gemini', settings);
    expect(provider).toBeInstanceOf(GeminiProvider);
    expect(provider._getActiveApiKey()).toBe('AIzaSyTestKey');
    expect(provider._getModel()).toBe('gemini-3.5-flash');
  });

  test('creates Claude provider from settings.providers', () => {
    const settings = {
      providers: {
        claude: {
          id: 'claude',
          type: 'claude',
          credential: 'sk-ant-api-key',
          baseUrl: 'https://api.anthropic.com',
          defaultModel: 'claude-3-5-sonnet-20240620',
        },
      },
    };
    const provider = createProvider('claude', settings);
    expect(provider).toBeInstanceOf(ClaudeProvider);
    expect(provider.name).toBe('Anthropic Claude');
  });

  test('creates OpenAICompatibleProvider for custom ShopAIKey provider', () => {
    const settings = {
      activeModel: 'gpt-4o',
      providers: {
        custom_shopaikey: {
          id: 'custom_shopaikey',
          name: 'ShopAIKey',
          type: 'openai_compatible',
          credential: 'sk-shopaikey-user-key',
          baseUrl: 'https://api.shopaikey.com/v1',
          defaultModel: 'gpt-4o',
          isCustom: true,
        },
      },
    };
    const provider = createProvider('custom_shopaikey', settings);
    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
    expect(provider._getEndpoint()).toBe('https://api.shopaikey.com/v1');
    expect(provider._getApiKey()).toBe('sk-shopaikey-user-key');
    expect(provider._getModel()).toBe('gpt-4o');
  });

  test('creates OpenAICompatibleProvider for DeepSeek and OpenRouter', () => {
    const settings = {
      providers: {
        deepseek: {
          id: 'deepseek',
          type: 'openai_compatible',
          credential: 'sk-deepseek-key',
          baseUrl: 'https://api.deepseek.com',
          defaultModel: 'deepseek-chat',
        },
      },
    };
    const provider = createProvider('deepseek', settings);
    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
    expect(provider._getEndpoint()).toBe('https://api.deepseek.com');
  });

  test('creates OpenAICompatibleProvider for Ollama with type: local', () => {
    const settings = {
      providers: {
        ollama: {
          id: 'ollama',
          name: 'Ollama',
          type: 'local',
          baseUrl: 'http://localhost:11434/v1',
          defaultModel: 'qwen2.5:7b',
        },
      },
    };
    const provider = createProvider('ollama', settings);
    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
    expect(provider._getEndpoint()).toBe('http://localhost:11434/v1');
    expect(provider._getModel()).toBe('qwen2.5:7b');
  });

  test('creates OpenAICompatibleProvider for LM Studio with type: local', () => {
    const settings = {
      providers: {
        lmstudio: {
          id: 'lmstudio',
          name: 'LM Studio',
          type: 'local',
          baseUrl: 'http://localhost:1234/v1',
          defaultModel: 'local-model',
        },
      },
    };
    const provider = createProvider('lmstudio', settings);
    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
    expect(provider._getEndpoint()).toBe('http://localhost:1234/v1');
    expect(provider._getModel()).toBe('local-model');
  });

  test('creates OpenAIProvider from settings.providers with type: openai', () => {
    const settings = {
      providers: {
        openai: {
          id: 'openai',
          name: 'OpenAI',
          type: 'openai',
          credential: 'sk-test-openai-key',
          defaultModel: 'gpt-4o',
        },
      },
    };
    const provider = createProvider('openai', settings);
    expect(provider).toBeInstanceOf(OpenAIProvider);
    expect(provider._getActiveApiKey()).toBe('sk-test-openai-key');
  });

  test('falls back gracefully to legacy or defaults for ollama and lmstudio', () => {
    const pOllama = createProvider('ollama', {});
    expect(pOllama).toBeInstanceOf(OpenAICompatibleProvider);
    expect(pOllama._getEndpoint()).toBe('http://localhost:11434/v1');

    const pLmStudio = createProvider('lmstudio', {});
    expect(pLmStudio).toBeInstanceOf(OpenAICompatibleProvider);
    expect(pLmStudio._getEndpoint()).toBe('http://localhost:1234/v1');
  });

  test('falls back gracefully to legacy apiKeys if providers map is missing', () => {
    const legacySettings = {
      apiKeys: {
        gemini: 'AIzaSyLegacyKey',
        deepl: 'legacy-deepl-key',
      },
    };
    const p1 = createProvider('gemini', legacySettings);
    expect(p1).toBeInstanceOf(GeminiProvider);
    expect(p1._getActiveApiKey()).toBe('AIzaSyLegacyKey');

    const p2 = createProvider('deepl', legacySettings);
    expect(p2).toBeInstanceOf(DeepLProvider);
  });

  test('supports multiple keys and rotation for ClaudeProvider', () => {
    const claude = new ClaudeProvider({
      credential: 'key-claude-1\nkey-claude-2\nkey-claude-3',
    });
    expect(claude._parseKeys()).toEqual(['key-claude-1', 'key-claude-2', 'key-claude-3']);
    expect(claude._getApiKey()).toBe('key-claude-1');
    claude._rotateKey();
    expect(claude._getApiKey()).toBe('key-claude-2');
    claude._rotateKey();
    expect(claude._getApiKey()).toBe('key-claude-3');
    claude._rotateKey();
    expect(claude._getApiKey()).toBe('key-claude-1');
  });

  test('supports multiple keys and rotation for OpenAICompatibleProvider (ShopAIKey)', () => {
    const openaiComp = new OpenAICompatibleProvider({
      credential: 'sk-key-1\nsk-key-2',
      endpoint: 'https://api.shopaikey.com/v1',
    });
    expect(openaiComp._parseKeys()).toEqual(['sk-key-1', 'sk-key-2']);
    expect(openaiComp._getApiKey()).toBe('sk-key-1');
    openaiComp._rotateKey();
    expect(openaiComp._getApiKey()).toBe('sk-key-2');
    openaiComp._rotateKey();
    expect(openaiComp._getApiKey()).toBe('sk-key-1');
  });
});
