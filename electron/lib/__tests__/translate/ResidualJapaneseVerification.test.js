const TranslationStep = require('../../translate/pipeline/TranslationStep');

describe('Residual Japanese Verification', () => {
  const JAPANESE_CHAR_REGEX = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uff66-\uff9d]/;

  test('JAPANESE_CHAR_REGEX correctly distinguishes Japanese from Vietnamese', () => {
    // Japanese text samples
    expect(JAPANESE_CHAR_REGEX.test('ありがとう')).toBe(true); // Hiragana
    expect(JAPANESE_CHAR_REGEX.test('ラーメン')).toBe(true); // Katakana
    expect(JAPANESE_CHAR_REGEX.test('俺は誰だ')).toBe(true); // Kanji + Hiragana
    expect(JAPANESE_CHAR_REGEX.test('ｱﾘｶﾞﾄｳ')).toBe(true); // Halfwidth Katakana
    expect(JAPANESE_CHAR_REGEX.test('Xin chào (こんにちは)')).toBe(true); // Mixed Vietnamese + Japanese
    expect(JAPANESE_CHAR_REGEX.test('Tôi... 何をやってるんだ？')).toBe(true); // Mixed

    // Clean Vietnamese / English samples
    expect(JAPANESE_CHAR_REGEX.test('Xin chào bạn, hôm nay thế nào?')).toBe(false);
    expect(JAPANESE_CHAR_REGEX.test('Tôi là ai? Tôi đang làm cái gì thế này?!')).toBe(false);
    expect(JAPANESE_CHAR_REGEX.test('Cậu ổn chứ?! Mau chạy đi! (123)')).toBe(false);
    expect(JAPANESE_CHAR_REGEX.test('Hello, are you okay?')).toBe(false);
  });

  test('TranslationStep detects residual Japanese characters and marks isTranslated accordingly', async () => {
    const mockProvider = {
      name: 'MockProvider',
      translate: jest.fn().mockResolvedValue([
        { index: 0, translatedText: 'Xin chào mọi người!' }, // Clean
        { index: 1, translatedText: 'Tôi... 何をやってるんだ？' }, // Residual Japanese
        { index: 2, translatedText: 'ありがとう' }, // Completely untranslated
      ]),
    };

    const step = new TranslationStep(mockProvider);
    const ocrResults = [
      { index: 0, text: 'みなさん、こんにちは！', bbox: [0, 0, 10, 10] },
      { index: 1, text: '俺は... 何をやってるんだ？', bbox: [10, 10, 20, 20] },
      { index: 2, text: 'ありがとう', bbox: [20, 20, 30, 30] },
    ];

    const results = await step.translate(ocrResults, 'ja', 'vi');

    // Index 0: Clean Vietnamese
    expect(results[0].isTranslated).toBe(true);
    expect(results[0].hasResidualJapanese).toBe(false);

    // Index 1: Residual Japanese
    expect(results[1].isTranslated).toBe(false);
    expect(results[1].hasResidualJapanese).toBe(true);

    // Index 2: Completely untranslated
    expect(results[2].isTranslated).toBe(false);
    expect(results[2].hasResidualJapanese).toBe(true);

    // Summary counts
    expect(results.translatedCount).toBe(1);
    expect(results.failedCount).toBe(2);
    expect(results.residualCount).toBe(2);
  });
});
