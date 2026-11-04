const axios = require('axios');
const GeminiProvider = require('../../translate/providers/GeminiProvider');

jest.mock('axios');

describe('GeminiProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('uses gemini-3.5-flash by default', () => {
    const provider = new GeminiProvider({ apiKey: 'test-key' });
    expect(provider._getModel()).toBe('gemini-3.5-flash');
  });

  test('allows custom model in config', () => {
    const provider = new GeminiProvider({ apiKey: 'test-key', model: 'gemini-3.5-flash-lite' });
    expect(provider._getModel()).toBe('gemini-3.5-flash-lite');
  });

  test('parses multiple keys from newline or comma separated strings', () => {
    const provider = new GeminiProvider({
      apiKey: `AIzaSyKey1
AIzaSyKey2, AIzaSyKey3; AIzaSyKey4`,
    });
    const keys = provider._parseKeys();
    expect(keys).toEqual(['AIzaSyKey1', 'AIzaSyKey2', 'AIzaSyKey3', 'AIzaSyKey4']);
  });

  test('rotates to next key when current key is marked exhausted', () => {
    const provider = new GeminiProvider({
      apiKey: 'Key1\nKey2\nKey3',
    });
    expect(provider._getActiveApiKey()).toBe('Key1');

    // Key 1 exhausted
    provider._markKeyExhausted('Key1', 60_000);
    expect(provider._getActiveApiKey()).toBe('Key2');

    // Key 2 exhausted
    provider._markKeyExhausted('Key2', 60_000);
    expect(provider._getActiveApiKey()).toBe('Key3');
  });

  test('auto-rotates to Key 2 when Key 1 receives 429 quota error', async () => {
    const provider = new GeminiProvider({
      apiKey: 'Key1\nKey2',
    });

    // Mock axios: 1st call fails with 429, 2nd call succeeds
    axios.post
      .mockRejectedValueOnce({
        response: {
          status: 429,
          data: { error: { message: 'Quota exceeded for quota metric...' } },
        },
      })
      .mockResolvedValueOnce({
        data: {
          candidates: [
            {
              content: {
                parts: [{ text: '["Bản dịch tiếng Việt"]' }],
              },
            },
          ],
        },
      });

    const regions = [{ index: 0, text: 'こんにちは' }];
    const results = await provider.translate(regions, 'ja', 'vi');

    expect(results).toHaveLength(1);
    expect(results[0].translatedText).toBe('Bản dịch tiếng Việt');

    // Verify axios was called twice, second time with Key2
    expect(axios.post).toHaveBeenCalledTimes(2);
    expect(axios.post.mock.calls[0][0]).toContain('key=Key1');
    expect(axios.post.mock.calls[1][0]).toContain('key=Key2');
  });

  test('testConnection checks all keys in pool and reports summary', async () => {
    const provider = new GeminiProvider({
      apiKey: 'ValidKey1\nValidKey2',
    });

    axios.post.mockResolvedValue({
      data: { candidates: [{ content: { parts: [{ text: 'pong' }] } }] },
    });

    const result = await provider.testConnection();
    expect(result.success).toBe(true);
    expect(result.count).toBe(2);
    expect(result.message).toContain('Tất cả 2 API key đều hoạt động tốt');
  });

  test('testConnection warns when some keys fail', async () => {
    const provider = new GeminiProvider({
      apiKey: 'GoodKey\nBadKey',
    });

    axios.post
      .mockResolvedValueOnce({ data: {} })
      .mockRejectedValueOnce({ response: { status: 403 } });

    const result = await provider.testConnection();
    expect(result.success).toBe(true);
    expect(result.warning).toBe(true);
    expect(result.count).toBe(1);
    expect(result.total).toBe(2);
  });
});
