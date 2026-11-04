const TranslatePipeline = require('../../translate/TranslatePipeline');

describe('TranslatePipeline Granular Logging', () => {
  test('TranslatePipeline emits detailed logItems for detect, ocr, translate, verify, and complete', async () => {
    const pipeline = new TranslatePipeline();

    // Mock internal steps
    pipeline._getDetectionStep = jest.fn().mockResolvedValue({
      detect: jest.fn().mockResolvedValue([
        { bbox: [100, 150, 80, 40], confidence: 0.95, hasBubble: true },
        { bbox: [200, 300, 100, 60], confidence: 0.91, hasBubble: true },
      ]),
    });

    pipeline._getOCRStep = jest.fn().mockResolvedValue({
      recognize: jest.fn().mockResolvedValue([
        { index: 0, text: 'こんにちは', bbox: [100, 150, 80, 40] },
        { index: 1, text: 'さようなら', bbox: [200, 300, 100, 60] },
      ]),
    });

    pipeline._getTranslationStep = jest.fn().mockReturnValue({
      translate: jest.fn().mockResolvedValue([
        { index: 0, translatedText: 'Xin chào', isTranslated: true, sourceText: 'こんにちは' },
        { index: 1, translatedText: 'Tạm biệt', isTranslated: true, sourceText: 'さようなら' },
      ]),
    });

    pipeline._modelManager = {
      ensureModel: jest.fn().mockResolvedValue(true),
    };

    // Create a 100x100 fake image buffer with sharp
    const sharp = require('sharp');
    const testImage = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    }).png().toBuffer();

    const emittedEvents = [];
    const onProgress = (p) => {
      emittedEvents.push(p);
    };

    pipeline._cache = {
      get: jest.fn().mockReturnValue(null),
      set: jest.fn(),
    };

    const res = await pipeline.translateImage(testImage, {
      enableInpainting: false,
      enableTypesetting: false,
      sourceLanguage: 'ja',
      targetLanguage: 'vi',
      forceFresh: true,
    }, onProgress);

    expect(res).toBeDefined();
    expect(res.detections.length).toBe(2);
    expect(res.ocrResults.length).toBe(2);
    expect(res.translations.length).toBe(2);

    // Filter events with logItem
    const logEvents = emittedEvents.filter((e) => Boolean(e.logItem));
    expect(logEvents.length).toBeGreaterThan(5);

    // Check detection logs
    const detectLogs = logEvents.filter((e) => e.logItem.step === 'detect');
    expect(detectLogs.some((e) => e.logItem.text.includes('Khung #1'))).toBe(true);
    expect(detectLogs.some((e) => e.logItem.text.includes('Khung #2'))).toBe(true);

    // Check OCR logs
    const ocrLogs = logEvents.filter((e) => e.logItem.step === 'ocr');
    expect(ocrLogs.some((e) => e.logItem.text.includes('こんにちは'))).toBe(true);
    expect(ocrLogs.some((e) => e.logItem.text.includes('さようなら'))).toBe(true);

    // Check Translate logs
    const transLogs = logEvents.filter((e) => e.logItem.step === 'translate');
    expect(transLogs.some((e) => e.logItem.text.includes('Xin chào'))).toBe(true);
    expect(transLogs.some((e) => e.logItem.text.includes('Tạm biệt'))).toBe(true);

    // Check Verify logs
    const verifyLogs = logEvents.filter((e) => e.logItem.step === 'verify');
    expect(verifyLogs.some((e) => e.logItem.text.includes('Khung #1') && e.logItem.text.includes('100%'))).toBe(true);
    expect(verifyLogs.some((e) => e.logItem.text.includes('Khung #2') && e.logItem.text.includes('100%'))).toBe(true);

    // Check Completed log
    const completedLog = logEvents.find((e) => e.logItem.step === 'completed');
    expect(completedLog).toBeDefined();
    expect(completedLog.logItem.text).toContain('QUY TRÌNH HOÀN TẤT');
  });

  test('translateChapter emits detailed logItems for every bubble in detection, OCR, translate, and verify', async () => {
    const pipeline = new TranslatePipeline();

    pipeline._getDetectionStep = jest.fn().mockResolvedValue({
      detect: jest.fn().mockResolvedValue([
        { bbox: [10, 20, 80, 40], confidence: 0.96, hasBubble: true },
        { bbox: [120, 220, 90, 50], confidence: 0.92, hasBubble: true },
      ]),
    });

    pipeline._getOCRStep = jest.fn().mockResolvedValue({
      recognize: jest.fn().mockResolvedValue([
        { index: 0, text: 'やめて！', bbox: [10, 20, 80, 40] },
        { index: 1, text: '行くぞ！', bbox: [120, 220, 90, 50] },
      ]),
    });

    pipeline._getTranslationStep = jest.fn().mockReturnValue({
      translate: jest.fn().mockResolvedValue([
        { index: 0, translatedText: 'Dừng lại đi!', isTranslated: true, sourceText: 'やめて！' },
        { index: 1, translatedText: 'Đi thôi!', isTranslated: true, sourceText: '行くぞ！' },
      ]),
    });

    pipeline._modelManager = {
      ensureModel: jest.fn().mockResolvedValue(true),
    };

    const sharp = require('sharp');
    const testImage = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    }).png().toBuffer();

    const emittedEvents = [];
    const onProgress = (p) => {
      emittedEvents.push(p);
    };

    const res = await pipeline.translateChapter(
      [{ path: '/fake/page1.png', buffer: testImage }],
      {
        enableInpainting: false,
        enableTypesetting: false,
        sourceLanguage: 'ja',
        targetLanguage: 'vi',
      },
      onProgress
    );

    expect(res).toBeDefined();
    expect(res.length).toBe(1);

    const logEvents = emittedEvents.filter((e) => Boolean(e.logItem));
    expect(logEvents.length).toBeGreaterThan(5);

    // Detection per-bubble log
    const detectLogs = logEvents.filter((e) => e.logItem.step === 'detect');
    expect(detectLogs.some((e) => e.logItem.text.includes('Khung #1') && e.logItem.text.includes('Trang 1'))).toBe(true);
    expect(detectLogs.some((e) => e.logItem.text.includes('Khung #2') && e.logItem.text.includes('Trang 1'))).toBe(true);

    // OCR per-bubble log
    const ocrLogs = logEvents.filter((e) => e.logItem.step === 'ocr');
    expect(ocrLogs.some((e) => e.logItem.text.includes('やめて！'))).toBe(true);
    expect(ocrLogs.some((e) => e.logItem.text.includes('行くぞ！'))).toBe(true);

    // Translate per-bubble log
    const transLogs = logEvents.filter((e) => e.logItem.step === 'translate');
    expect(transLogs.some((e) => e.logItem.text.includes('Dừng lại đi!'))).toBe(true);
    expect(transLogs.some((e) => e.logItem.text.includes('Đi thôi!'))).toBe(true);

    // Verify per-bubble log
    const verifyLogs = logEvents.filter((e) => e.logItem.step === 'verify');
    expect(verifyLogs.some((e) => e.logItem.text.includes('Khung #1') && e.logItem.text.includes('100%'))).toBe(true);
    expect(verifyLogs.some((e) => e.logItem.text.includes('Khung #2') && e.logItem.text.includes('100%'))).toBe(true);

    // Completed log
    const completedLog = logEvents.find((e) => e.logItem.step === 'completed');
    expect(completedLog).toBeDefined();
    expect(completedLog.logItem.text).toContain('Hoàn tất dịch toàn bộ');
  });
});
