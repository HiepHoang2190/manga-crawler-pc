const DetectionStep = require('../../translate/pipeline/DetectionStep');

describe('DetectionStep Bubble & Text Matching', () => {
  let step;

  beforeEach(() => {
    // Mock minimal DetectionStep instance without loading onnx runtime
    step = new DetectionStep(null, null);
  });

  test('prioritizes speech bubble bbox over narrow text_bubble bbox', () => {
    const rawDetections = [
      // Khung thoại oval lớn (bubble)
      {
        bbox: [100, 200, 160, 260],
        confidence: 0.92,
        label: 'bubble',
        isBubble: true,
        isText: false,
      },
      // Cột chữ hẹp tiếng Nhật bên trong bubble (text_bubble)
      {
        bbox: [150, 230, 45, 180],
        confidence: 0.88,
        label: 'text_bubble',
        isBubble: false,
        isText: true,
      },
    ];

    const results = step._matchBubblesAndTexts(rawDetections, 1000, 1500);

    expect(results).toHaveLength(1);
    const item = results[0];
    // Bbox phải lấy theo khung thoại gốc (bubble), không được lấy theo cột chữ hẹp 45px!
    expect(item.bbox).toEqual([100, 200, 160, 260]);
    expect(item.textBbox).toEqual([150, 230, 45, 180]);
    expect(item.hasBubble).toBe(true);
    expect(item.label).toBe('bubble');
  });

  test('merges multiple text columns inside the same bubble into one dialogue region', () => {
    const rawDetections = [
      {
        bbox: [50, 50, 200, 300],
        confidence: 0.95,
        label: 'bubble',
        isBubble: true,
        isText: false,
      },
      // Cột 1
      {
        bbox: [150, 80, 40, 220],
        confidence: 0.9,
        label: 'text_bubble',
        isBubble: false,
        isText: true,
      },
      // Cột 2
      {
        bbox: [90, 80, 40, 220],
        confidence: 0.89,
        label: 'text_bubble',
        isBubble: false,
        isText: true,
      },
    ];

    const results = step._matchBubblesAndTexts(rawDetections, 1000, 1500);

    expect(results).toHaveLength(1);
    expect(results[0].bbox).toEqual([50, 50, 200, 300]);
    // textBbox phải bao trọn cả 2 cột [90, 80, 100, 220]
    expect(results[0].textBbox).toEqual([90, 80, 100, 220]);
  });

  test('preserves free-floating text (SFX) with comfortable padding when no bubble exists', () => {
    const rawDetections = [
      {
        bbox: [400, 500, 60, 100],
        confidence: 0.85,
        label: 'text_free',
        isBubble: false,
        isText: true,
      },
    ];

    const results = step._matchBubblesAndTexts(rawDetections, 1000, 1500);

    expect(results).toHaveLength(1);
    expect(results[0].hasBubble).toBe(false);
    // Bbox được thêm padding để không bị quá chật
    expect(results[0].bbox[2]).toBeGreaterThan(60);
    expect(results[0].bbox[3]).toBeGreaterThan(100);
    expect(results[0].textBbox).toEqual([400, 500, 60, 100]);
  });
});
