const OCRStep = require('../../translate/pipeline/OCRStep');

describe('OCRStep', () => {
  test('does NOT call cloudProvider when mode is local', async () => {
    const mockCloudProvider = {
      supportsOCR: true,
      ocr: jest.fn().mockResolvedValue('cloud text'),
      ocrBatch: jest.fn().mockResolvedValue(['cloud text']),
    };

    const mockOrt = null; // No local onnx session
    const step = new OCRStep(mockOrt, {}, mockCloudProvider);

    // Mock _localOCR to return local text
    step._localOCR = jest.fn().mockResolvedValue('local manga text');

    const fakeImageBuffer = Buffer.from('fake-image');
    const detections = [{ bbox: [0, 0, 50, 50], confidence: 0.9 }];

    // Mock _cropRegion
    step._cropRegion = jest.fn().mockResolvedValue(Buffer.from('fake-crop'));

    const results = await step.recognize(fakeImageBuffer, detections, {
      mode: 'local',
      language: 'ja',
    });

    expect(step._localOCR).toHaveBeenCalled();
    expect(mockCloudProvider.ocr).not.toHaveBeenCalled();
    expect(mockCloudProvider.ocrBatch).not.toHaveBeenCalled();
    expect(results).toHaveLength(1);
    expect(results[0].text).toBe('local manga text');
  });

  test('calls cloudProvider when mode is cloud', async () => {
    const mockCloudProvider = {
      supportsOCR: true,
      ocr: jest.fn().mockResolvedValue('cloud text'),
      ocrBatch: jest.fn().mockResolvedValue(['batch text 1', 'batch text 2']),
    };

    const step = new OCRStep(null, {}, mockCloudProvider);
    step._cropRegion = jest.fn().mockResolvedValue(Buffer.from('crop'));

    const detections = [
      { bbox: [0, 0, 10, 10], confidence: 0.8 },
      { bbox: [10, 10, 20, 20], confidence: 0.85 },
    ];

    const results = await step.recognize(Buffer.from('fake'), detections, {
      mode: 'cloud',
      language: 'ja',
    });

    expect(mockCloudProvider.ocrBatch).toHaveBeenCalled();
    expect(results).toHaveLength(2);
    expect(results[0].text).toBe('batch text 1');
  });
});
