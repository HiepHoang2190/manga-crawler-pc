const axios = require('axios');
const {
  fetchAvailableModels,
  filterAndFormatGeminiModels,
  filterAndFormatOpenAiModels,
} = require('../../translate/services/modelDiscoveryService');

jest.mock('axios');

describe('modelDiscoveryService — Dynamic Model Fetching', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('filterAndFormatGeminiModels', () => {
    test('filters only generateContent models, strips models/ prefix and sorts flash before pro', () => {
      const rawGoogleModels = [
        {
          name: 'models/gemini-3.1-pro-preview',
          displayName: 'Gemini 3.1 Pro Preview',
          supportedGenerationMethods: ['generateContent'],
          description: 'Pro model',
        },
        {
          name: 'models/gemini-2.5-flash',
          displayName: 'Gemini 2.5 Flash',
          supportedGenerationMethods: ['generateContent'],
          description: 'Obsolete model',
        },
        {
          name: 'models/text-embedding-004',
          displayName: 'Embedding',
          supportedGenerationMethods: ['embedContent'],
        },
        {
          name: 'models/gemini-3.5-flash',
          displayName: 'Gemini 3.5 Flash',
          supportedGenerationMethods: ['generateContent'],
          description: 'Fast model',
        },
        {
          name: 'models/gemini-3.8-flash-tts',
          displayName: 'Gemini 3.8 Flash TTS',
          supportedGenerationMethods: ['generateContent'],
        },
        {
          name: 'models/aqa',
          displayName: 'Attributed Question Answering',
          supportedGenerationMethods: ['generateAnswer'],
        },
      ];

      const result = filterAndFormatGeminiModels(rawGoogleModels);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('gemini-3.5-flash');
      expect(result[0].name).toBe('Gemini 3.5 Flash');
      expect(result[0].description).toBe('Fast model');
      expect(result[1].id).toBe('gemini-3.1-pro-preview');
      expect(result[1].name).toBe('Gemini 3.1 Pro Preview');
    });

    test('handles empty or non-array input', () => {
      expect(filterAndFormatGeminiModels()).toEqual([]);
      expect(filterAndFormatGeminiModels(null)).toEqual([]);
      expect(filterAndFormatGeminiModels({})).toEqual([]);
    });
  });

  describe('filterAndFormatOpenAiModels', () => {
    test('filters out non-chat models and sorts alphabetically', () => {
      const rawOpenAiModels = [
        { id: 'gpt-4o' },
        { id: 'text-embedding-3-small' },
        { id: 'dall-e-3' },
        { id: 'gpt-4o-mini' },
        { id: 'whisper-1' },
        { id: 'tts-1' },
        { id: 'omni-moderation-latest' },
      ];

      const result = filterAndFormatOpenAiModels(rawOpenAiModels);
      expect(result.map((m) => m.id)).toEqual(['gpt-4o', 'gpt-4o-mini']);
    });

    test('supports array of strings', () => {
      const rawModels = ['deepseek-chat', 'deepseek-coder', 'text-embedding-v1'];
      const result = filterAndFormatOpenAiModels(rawModels);
      expect(result.map((m) => m.id)).toEqual(['deepseek-chat', 'deepseek-coder']);
    });

    test('handles empty or non-array input', () => {
      expect(filterAndFormatOpenAiModels()).toEqual([]);
      expect(filterAndFormatOpenAiModels(null)).toEqual([]);
      expect(filterAndFormatOpenAiModels({})).toEqual([]);
    });
  });

  describe('fetchAvailableModels', () => {
    test('returns error when API key is missing for remote providers', async () => {
      const res = await fetchAvailableModels({
        id: 'gemini',
        type: 'gemini',
        credential: '',
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Chưa có API key');
      expect(res.models).toEqual([]);
    });

    test('successfully fetches Gemini models', async () => {
      axios.get.mockResolvedValueOnce({
        data: {
          models: [
            {
              name: 'models/gemini-3.5-flash',
              displayName: 'Gemini 3.5 Flash',
              supportedGenerationMethods: ['generateContent'],
            },
          ],
        },
      });

      const res = await fetchAvailableModels({
        id: 'gemini',
        type: 'gemini',
        credential: 'test-api-key',
      });

      expect(res.success).toBe(true);
      expect(res.models).toHaveLength(1);
      expect(res.models[0].id).toBe('gemini-3.5-flash');
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('https://generativelanguage.googleapis.com/v1beta/models?key=test-api-key'),
        expect.objectContaining({ timeout: 15000 })
      );
    });

    test('successfully fetches Claude models', async () => {
      axios.get.mockResolvedValueOnce({
        data: {
          data: [
            { id: 'claude-3-7-sonnet-20250219', display_name: 'Claude 3.7 Sonnet' },
            { id: 'claude-3-5-haiku-20241022', display_name: 'Claude 3.5 Haiku' },
          ],
        },
      });

      const res = await fetchAvailableModels({
        id: 'claude',
        type: 'claude',
        credential: 'sk-ant-test',
      });

      expect(res.success).toBe(true);
      expect(res.models).toHaveLength(2);
      expect(res.models[0].id).toBe('claude-3-7-sonnet-20250219');
      expect(axios.get).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/models',
        expect.objectContaining({
          headers: {
            'x-api-key': 'sk-ant-test',
            'anthropic-version': '2023-06-01',
          },
          timeout: 15000,
        })
      );
    });

    test('successfully fetches OpenAI-compatible models with custom baseUrl', async () => {
      axios.get.mockResolvedValueOnce({
        data: {
          data: [
            { id: 'deepseek-chat' },
            { id: 'deepseek-reasoner' },
          ],
        },
      });

      const res = await fetchAvailableModels({
        id: 'deepseek',
        type: 'openai_compatible',
        baseUrl: 'https://api.deepseek.com',
        credential: 'sk-test',
      });

      expect(res.success).toBe(true);
      expect(res.models).toHaveLength(2);
      expect(res.models[0].id).toBe('deepseek-chat');
      expect(axios.get).toHaveBeenCalledWith(
        'https://api.deepseek.com/models',
        expect.objectContaining({
          headers: { Authorization: 'Bearer sk-test' },
          timeout: 15000,
        })
      );
    });

    test('allows local engine without API key', async () => {
      axios.get.mockResolvedValueOnce({
        data: {
          data: [{ id: 'llama3:8b' }],
        },
      });

      const res = await fetchAvailableModels({
        id: 'ollama',
        type: 'local',
        credential: '',
      });

      expect(res.success).toBe(true);
      expect(res.models).toHaveLength(1);
      expect(res.models[0].id).toBe('llama3:8b');
      expect(axios.get).toHaveBeenCalledWith(
        'http://localhost:11434/v1/models',
        expect.objectContaining({
          headers: {},
          timeout: 15000,
        })
      );
    });

    test('successfully fetches OpenRouter models even without API key', async () => {
      axios.get.mockResolvedValueOnce({
        data: {
          data: [{ id: 'google/gemini-2.5-flash' }, { id: 'meta-llama/llama-3.3-70b-instruct' }],
        },
      });

      const res = await fetchAvailableModels({
        id: 'openrouter',
        type: 'openai_compatible',
        credential: '',
      });

      expect(res.success).toBe(true);
      expect(res.models).toHaveLength(2);
      expect(axios.get).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/models',
        expect.objectContaining({
          headers: {},
          timeout: 15000,
        })
      );
    });

    test('returns formatted error on 401 Unauthorized', async () => {
      axios.get.mockRejectedValueOnce({
        response: { status: 401, data: { error: { message: 'API key not valid' } } },
      });

      const res = await fetchAvailableModels({
        id: 'gemini',
        type: 'gemini',
        credential: 'bad-key',
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('API Key không hợp lệ');
      expect(res.models).toEqual([]);
    });
  });
});
