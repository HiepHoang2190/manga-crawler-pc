const sharp = require('sharp');
const TypesettingStep = require('../../translate/pipeline/TypesettingStep');

describe('TypesettingStep & Layer Export', () => {
  let sampleImageBuffer;

  beforeAll(async () => {
    // Create a simple 400x600 test image in JPEG
    sampleImageBuffer = await sharp({
      create: {
        width: 400,
        height: 600,
        channels: 3,
        background: { r: 240, g: 240, b: 240 },
      },
    })
      .jpeg({ quality: 90 })
      .toBuffer();
  });

  test('typeset renders layer and returns valid buffer with original format', async () => {
    const step = new TypesettingStep();
    const layers = [
      {
        text: 'Xin chào thế giới!',
        sourceText: 'こんにちは世界',
        bbox: [50, 50, 200, 100],
        fontFamily: 'Comic Neue, sans-serif',
        fontWeight: '700',
        strokeWidth: 2,
        strokeColor: '#ffffff',
        color: '#000000',
        align: 'center',
        fillBackground: true,
      },
    ];

    const result = await step.typeset(sampleImageBuffer, layers, {
      format: 'jpeg',
      quality: 92,
      fillBackground: true,
    });

    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);

    const metadata = await sharp(result).metadata();
    expect(metadata.width).toBe(400);
    expect(metadata.height).toBe(600);
    expect(metadata.format).toBe('jpeg');
  });

  test('typeset respects fillBackground: false', async () => {
    const step = new TypesettingStep();
    const layers = [
      {
        text: 'Không che nền',
        bbox: [20, 20, 100, 80],
        fillBackground: false,
      },
    ];

    const result = await step.typeset(sampleImageBuffer, layers, {
      format: 'jpeg',
      fillBackground: false,
    });

    expect(result).toBeInstanceOf(Buffer);
    const metadata = await sharp(result).metadata();
    expect(metadata.format).toBe('jpeg');
  });

  test('typeset handles empty layers gracefully', async () => {
    const step = new TypesettingStep();
    const result = await step.typeset(sampleImageBuffer, []);
    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBe(sampleImageBuffer.length);
  });
});
