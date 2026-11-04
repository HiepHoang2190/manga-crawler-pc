const axios = require('axios');
const { createProvider } = require('../../translate/providers');

jest.mock('axios');

describe('Provider Connection Test Handler Logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('successfully pings OpenAI-compatible endpoint (ShopAIKey / Ollama)', async () => {
    axios.get.mockResolvedValueOnce({
      status: 200,
      data: { data: [{ id: 'gpt-4o' }] },
    });

    const providerConfig = {
      id: 'custom_shopaikey',
      type: 'openai_compatible',
      credential: 'sk-test-key',
      baseUrl: 'https://api.shopaikey.com/v1',
      defaultModel: 'gpt-4o',
    };

    const provider = createProvider('custom_shopaikey', {
      providers: { custom_shopaikey: providerConfig },
    });

    const start = Date.now();
    const result = await provider.testConnection();
    const latency = Date.now() - start;

    expect(result.success).toBe(true);
    expect(axios.get).toHaveBeenCalledWith(
      'https://api.shopaikey.com/v1/models',
      expect.objectContaining({
        headers: { Authorization: 'Bearer sk-test-key' },
      })
    );
  });

  test('handles 401 unauthorized error gracefully', async () => {
    const error = new Error('Request failed with status code 401');
    error.response = {
      status: 401,
      data: { error: { message: 'Invalid API Key' } },
    };
    axios.get.mockRejectedValue(error);
    axios.post.mockRejectedValue(error);

    const providerConfig = {
      id: 'custom_shopaikey',
      type: 'openai_compatible',
      credential: 'invalid-key',
      baseUrl: 'https://api.shopaikey.com/v1',
      defaultModel: 'gpt-4o',
    };

    const provider = createProvider('custom_shopaikey', {
      providers: { custom_shopaikey: providerConfig },
    });

    const result = await provider.testConnection();
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('API Key không hợp lệ');
    expect(result.error).toContain('Invalid API Key');
  });

  test('formatProviderError accurately explains various root causes in Vietnamese', () => {
    const { formatProviderError } = require('../../translate/providers');

    // ECONNREFUSED (Ollama / Local engine not started)
    const errConnRefused = new Error('connect ECONNREFUSED 127.0.0.1:11434');
    errConnRefused.code = 'ECONNREFUSED';
    expect(formatProviderError(errConnRefused)).toMatch(/Không thể kết nối đến máy chủ.*ECONNREFUSED/i);

    // ENOTFOUND (Wrong Base URL domain)
    const errNotFound = new Error('getaddrinfo ENOTFOUND invalid-domain.local');
    errNotFound.code = 'ENOTFOUND';
    expect(formatProviderError(errNotFound)).toMatch(/Tên miền máy chủ không tồn tại.*ENOTFOUND/i);

    // Timeout
    const errTimeout = new Error('timeout of 15000ms exceeded');
    errTimeout.code = 'ECONNABORTED';
    expect(formatProviderError(errTimeout)).toMatch(/Quá thời gian kết nối.*Timeout/i);

    // 404 Not Found (Model doesn't exist)
    const err404 = new Error('Request failed with status code 404');
    err404.response = {
      status: 404,
      data: { error: { message: 'The model `nonexistent-model` does not exist' } },
    };
    expect(formatProviderError(err404, { model: 'nonexistent-model' })).toMatch(/Không tìm thấy tài nguyên.*404 Not Found.*nonexistent-model/i);

    // 429 Quota Exceeded
    const err429 = new Error('Request failed with status code 429');
    err429.response = {
      status: 429,
      data: { error: { message: 'You exceeded your current quota' } },
    };
    expect(formatProviderError(err429)).toMatch(/Hết hạn mức.*429.*You exceeded your current quota/i);

    // Cloudflare HTML page instead of JSON API
    const errCloudflare = new Error('Request failed with status code 502');
    errCloudflare.response = {
      status: 502,
      data: '<!DOCTYPE html><html><body>502 Bad Gateway Cloudflare</body></html>',
    };
    expect(formatProviderError(errCloudflare)).toMatch(/Máy chủ trả về trang web HTML thay vì JSON API/i);
  });

  test('successfully pings Claude endpoint with mock axios', async () => {
    axios.post.mockResolvedValueOnce({
      status: 200,
      data: {
        content: [{ type: 'text', text: 'Hello' }],
      },
    });

    const providerConfig = {
      id: 'claude',
      type: 'claude',
      credential: 'sk-ant-test',
      baseUrl: 'https://api.anthropic.com',
      defaultModel: 'claude-3-5-sonnet-20240620',
    };

    const provider = createProvider('claude', {
      providers: { claude: providerConfig },
    });

    const result = await provider.testConnection();
    expect(result.success).toBe(true);
    expect(axios.post).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({ max_tokens: 5 }),
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-key': 'sk-ant-test',
        }),
      })
    );
  });

  test('OpenAIProvider tests the specific custom model configured by user', async () => {
    axios.post.mockResolvedValueOnce({
      status: 200,
      data: { choices: [{ message: { content: 'Hello' } }] },
    });

    const providerConfig = {
      id: 'openai',
      type: 'openai',
      credential: 'sk-openai-custom-key',
      baseUrl: 'https://api.openai.com/v1',
      defaultModel: 'gpt-4o',
    };

    const provider = createProvider('openai', {
      providers: { openai: providerConfig },
    });

    const result = await provider.testConnection();
    expect(result.success).toBe(true);
    expect(axios.post).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        model: 'gpt-4o',
        max_tokens: 5,
      }),
      expect.anything()
    );
  });

  test('OpenAICompatibleProvider reports model failure when model does not exist on server', async () => {
    // 1. GET /models succeeds (server is up)
    axios.get.mockResolvedValueOnce({
      status: 200,
      data: { data: [{ id: 'other-model' }] },
    });
    // 2. POST /chat/completions fails with 404 (model missing)
    const err404 = new Error('Request failed with status code 404');
    err404.response = {
      status: 404,
      data: { error: { message: 'model `qwen2.5:nonexistent` not found, try pulling it first' } },
    };
    axios.post.mockRejectedValueOnce(err404);

    const providerConfig = {
      id: 'ollama',
      type: 'openai_compatible',
      credential: 'ollama',
      baseUrl: 'http://localhost:11434/v1',
      defaultModel: 'qwen2.5:nonexistent',
    };

    const provider = createProvider('ollama', {
      providers: { ollama: providerConfig },
    });

    const result = await provider.testConnection();
    expect(result.success).toBe(false);
    expect(result.error).toContain('qwen2.5:nonexistent');
    expect(result.error).toMatch(/404|not found|không tồn tại/i);
  });
});
