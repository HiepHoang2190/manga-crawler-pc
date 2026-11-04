const sharp = require('sharp');
const InpaintingStep = require('../../translate/pipeline/InpaintingStep');

describe('InpaintingStep — Koharu Text-Stroke Mask & Local Patch Inpainting', () => {
  let inpaintingStep;
  let mockOrt;

  beforeEach(() => {
    mockOrt = {
      Tensor: class MockTensor {
        constructor(type, data, dims) {
          this.type = type;
          this.data = data;
          this.dims = dims;
        }
      },
      InferenceSession: {
        create: jest.fn().mockResolvedValue({
          run: jest.fn().mockImplementation(async (feeds) => {
            // Return dummy 512x512 output (all white)
            const pixels = 512 * 512;
            const data = new Float32Array(3 * pixels);
            for (let i = 0; i < pixels * 3; i++) data[i] = 255.0;
            return { output: { data } };
          }),
          release: jest.fn(),
        }),
      },
    };

    inpaintingStep = new InpaintingStep(mockOrt, '/path/to/lama_fp32.onnx');
  });

  test('trả về nguyên ảnh gốc khi detections rỗng', async () => {
    const dummyImage = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 255, b: 255 } },
    }).png().toBuffer();

    const result = await inpaintingStep.inpaint(dummyImage, []);
    expect(result).toBe(dummyImage);
  });

  test('bảo toàn viền bóng thoại: mask không che đè lên viền ngoài', async () => {
    const w = 120;
    const h = 160;

    // Tạo ảnh giả lập: nền trắng (255), viền đen oval (0), chữ đen ở giữa (0)
    const svg = `
      <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${w}" height="${h}" fill="white" />
        <!-- Viền đen của bóng thoại -->
        <ellipse cx="60" cy="80" rx="50" ry="70" fill="none" stroke="black" stroke-width="4" />
        <!-- Chữ đen ở giữa lòng bóng thoại -->
        <rect x="50" y="60" width="20" height="40" fill="black" />
      </svg>
    `;

    const imgBuffer = await sharp(Buffer.from(svg)).png().toBuffer();

    const detections = [
      {
        bbox: [10, 10, 100, 140],
        textBbox: [50, 60, 20, 40],
        hasBubble: true,
      },
    ];

    const mask = await inpaintingStep._createSmartMask(imgBuffer, w, h, detections);

    // Điểm tại tâm chữ (x=60, y=80) phải được đánh dấu inpaint (255)
    expect(mask[80 * w + 60]).toBe(255);

    // Điểm tại viền ngoài của bóng thoại (x=10, y=80) tuyệt đối KHÔNG được đánh dấu (0)
    expect(mask[80 * w + 10]).toBe(0);

    // Điểm ngoài bóng thoại (x=2, y=2) tuyệt đối KHÔNG được đánh dấu (0)
    expect(mask[2 * w + 2]).toBe(0);
  });

  test('_buildClusters gom cụm các box gần nhau chính xác', () => {
    const detections = [
      { bbox: [10, 10, 50, 50] },
      { bbox: [30, 30, 60, 60] }, // overlap
      { bbox: [300, 300, 50, 50] }, // xa rời
    ];

    const clusters = inpaintingStep._buildClusters(detections, 1000, 1000);
    // Phải gom thành 2 cụm: cụm 1 (box 0 & 1), cụm 2 (box 2)
    expect(clusters.length).toBe(2);
    expect(clusters[0].cropW).toBeGreaterThan(60);
    expect(clusters[1].cropW).toBeGreaterThan(50);
  });
});
