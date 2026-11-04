const axios = require('axios');
const OpenAICompatibleProvider = require('../../translate/providers/OpenAICompatibleProvider');

jest.mock('axios');

describe('OpenAICompatibleProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('translates regions with structured ID format and strips residual Japanese', async () => {
    const provider = new OpenAICompatibleProvider({
      endpoint: 'http://localhost:11434/v1',
      model: 'qwen2.5:7b',
    });

    axios.post.mockResolvedValueOnce({
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                translations: [
                  { id: 0, text: 'Xin chào (こんにちは)' },
                  { id: 1, text: 'Hôm nay trời đẹp thật' },
                ],
              }),
            },
          },
        ],
      },
    });

    const regions = [
      { index: 0, text: 'こんにちは' },
      { index: 1, text: '今日はいい天気ですね' },
    ];

    const results = await provider.translate(regions, 'ja', 'vi');

    expect(results).toHaveLength(2);
    expect(results[0].translatedText).toBe('Xin chào'); // Stripped parenthetical Japanese!
    expect(results[1].translatedText).toBe('Hôm nay trời đẹp thật');

    // Verify request payload contained json_object and segments
    expect(axios.post).toHaveBeenCalledTimes(1);
    const postBody = axios.post.mock.calls[0][1];
    expect(postBody.response_format).toEqual({ type: 'json_object' });
    const userMessage = JSON.parse(postBody.messages[1].content);
    expect(userMessage.segments).toEqual([
      { id: 0, text: 'こんにちは' },
      { id: 1, text: '今日はいい天気ですね' },
    ]);
  });

  test('handles out-of-order IDs correctly without index mismatch', async () => {
    const provider = new OpenAICompatibleProvider({
      endpoint: 'http://localhost:11434/v1',
      model: 'qwen2.5:7b',
    });

    // Model returns ID 1 first, then ID 0
    axios.post.mockResolvedValueOnce({
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                translations: [
                  { id: 1, text: 'Câu thứ hai' },
                  { id: 0, text: 'Câu thứ nhất' },
                ],
              }),
            },
          },
        ],
      },
    });

    const regions = [
      { index: 0, text: 'First' },
      { index: 1, text: 'Second' },
    ];

    const results = await provider.translate(regions, 'en', 'vi');

    expect(results[0].translatedText).toBe('Câu thứ nhất');
    expect(results[1].translatedText).toBe('Câu thứ hai');
  });

  test('falls back to original text if translation for an ID is missing', async () => {
    const provider = new OpenAICompatibleProvider({
      endpoint: 'http://localhost:11434/v1',
      model: 'qwen2.5:7b',
    });

    // Model returns only ID 0, omits ID 1
    axios.post.mockResolvedValueOnce({
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                translations: [
                  { id: 0, text: 'Câu 0 đã dịch' },
                ],
              }),
            },
          },
        ],
      },
    });

    const regions = [
      { index: 0, text: 'First' },
      { index: 1, text: 'Second' },
    ];

    const results = await provider.translate(regions, 'en', 'vi');

    expect(results[0].translatedText).toBe('Câu 0 đã dịch');
    expect(results[1].translatedText).toBe('Second'); // Original fallback
  });

  test('auto-fallbacks to qwen2.5:7b when configured model throws HTTP 500 model error', async () => {
    const provider = new OpenAICompatibleProvider({
      endpoint: 'http://localhost:11434/v1',
      model: 'gemma4:12b',
    });

    // First call with gemma4:12b fails with 500
    const err500 = new Error('Request failed with status code 500');
    err500.response = { status: 500, data: { error: { message: 'unable to load model' } } };
    axios.post.mockRejectedValueOnce(err500);

    // Second call with qwen2.5:7b succeeds
    axios.post.mockResolvedValueOnce({
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                translations: [{ id: 0, text: 'Thành công sau fallback!' }],
              }),
            },
          },
        ],
      },
    });

    const regions = [{ index: 0, text: 'こんにちは' }];
    const results = await provider.translate(regions, 'ja', 'vi');

    expect(results[0].translatedText).toBe('Thành công sau fallback!');
    expect(axios.post).toHaveBeenCalledTimes(2);
    expect(axios.post.mock.calls[1][1].model).toBe('qwen2.5:7b');
  });

  test('auto-retries missing segments on pass 1 and successfully fills translations', async () => {
    const provider = new OpenAICompatibleProvider({
      endpoint: 'http://localhost:11434/v1',
      model: 'gemma4:12b',
    });

    // Call 1: model drops ID 1
    axios.post.mockResolvedValueOnce({
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                translations: [{ id: 0, text: 'Câu 0 xong' }],
              }),
            },
          },
        ],
      },
    });

    // Call 2 (Auto-Retry Pass 1): model successfully translates ID 1
    axios.post.mockResolvedValueOnce({
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                translations: [{ id: 1, text: 'Câu 1 xong sau retry' }],
              }),
            },
          },
        ],
      },
    });

    const regions = [
      { index: 0, text: 'Hello' },
      { index: 1, text: 'World' },
    ];

    const results = await provider.translate(regions, 'en', 'vi');

    expect(results).toHaveLength(2);
    expect(results[0].translatedText).toBe('Câu 0 xong');
    expect(results[1].translatedText).toBe('Câu 1 xong sau retry');
    expect(axios.post).toHaveBeenCalledTimes(2);
  });

  test('Tier 3: automatically converts SFX into Vietnamese via dictionary when LLM leaves Japanese intact', async () => {
    const provider = new OpenAICompatibleProvider({
      endpoint: 'http://localhost:11434/v1',
      model: 'qwen2.5:7b',
    });

    // Model returns raw Japanese "ドキドキ" (untranslated SFX)
    axios.post.mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                translations: [
                  { id: 0, text: 'Chào em' },
                  { id: 1, text: 'ドキドキ' },
                ],
              }),
            },
          },
        ],
      },
    });

    const regions = [
      { index: 0, text: 'こんにちは' },
      { index: 1, text: 'ドキドキ' },
    ];

    const results = await provider.translate(regions, 'ja', 'vi');

    expect(results).toHaveLength(2);
    expect(results[0].translatedText).toBe('Chào em');
    // ドキドキ should be resolved to 'Thình thịch' via Tier 3 SFX dictionary
    expect(results[1].translatedText).toBe('Thình thịch');
  });

  test('Tier 3: guarantees zero CJK remaining for Katakana SFX fallback', async () => {
    const provider = new OpenAICompatibleProvider({
      endpoint: 'http://localhost:11434/v1',
      model: 'qwen2.5:7b',
    });

    // Model completely drops or returns Katakana SFX that is not in dictionary
    axios.post.mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                translations: [],
              }),
            },
          },
        ],
      },
    });

    const regions = [
      { index: 0, text: 'バキッ' },
    ];

    const results = await provider.translate(regions, 'ja', 'vi');

    expect(results).toHaveLength(1);
    // Must be translated to Vietnamese and contain 0 CJK characters
    const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/;
    expect(CJK.test(results[0].translatedText)).toBe(false);
    expect(results[0].translatedText.length).toBeGreaterThan(0);
  });
});
