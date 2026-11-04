const sharp = require('sharp');
const { resolveOutputExt, encodeFrame } = require('../../../export/image/pipeline/encodeOutput');
const { frameFromInput } = require('../../../export/image/pipeline/frame');
const { borderedPagePng } = require('./fixtures');

describe('encodeOutput', () => {
  test('resolveOutputExt keeps original extension case and maps formats', () => {
    expect(resolveOutputExt('.JPG', 'original')).toBe('.JPG');
    expect(resolveOutputExt('png', 'original')).toBe('.png');
    expect(resolveOutputExt('.png', 'webp')).toBe('.webp');
    expect(resolveOutputExt('.webp', 'jpg')).toBe('.jpg');
  });

  test('encodes to the requested format and applies resizePercent', async () => {
    const frame = await frameFromInput(await borderedPagePng({ width: 600, height: 800 }));
    const { buffer, ext } = await encodeFrame(frame, { format: 'webp', quality: 70, resizePercent: 50 }, '.png');
    expect(ext).toBe('.webp');
    const meta = await sharp(buffer).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(300);
  });

  test('original jpg source is encoded as jpeg and 4-channel frames are flattened', async () => {
    const frame = await frameFromInput(await sharp({ create: { width: 10, height: 10, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer());
    const { buffer, ext } = await encodeFrame({ ...frame }, { format: 'original' }, '.jpg');
    expect(ext).toBe('.jpg');
    expect((await sharp(buffer).metadata()).format).toBe('jpeg');
  });

  test('auto-grayscale encodes 1-channel output when source frame is grayscale', async () => {
    const grayBuf = await sharp({
      create: { width: 50, height: 50, channels: 3, background: { r: 128, g: 128, b: 128 } }
    }).toColourspace('b-w').jpeg().toBuffer();
    const frame = await frameFromInput(grayBuf);
    expect(frame.isGrayscale).toBe(true);

    const { buffer } = await encodeFrame(frame, { format: 'jpg', quality: 85 }, '.jpg');
    const meta = await sharp(buffer).metadata();
    expect(meta.channels).toBe(1);
    expect(meta.space).toBe('b-w');
  });

  test('smart size capping reduces quality when output exceeds originalSize', async () => {
    // Generate a noise-like pattern
    const raw = Buffer.alloc(300 * 300 * 3);
    for (let i = 0; i < raw.length; i++) raw[i] = (i * 37) % 256;
    const baseBuf = await sharp(raw, { raw: { width: 300, height: 300, channels: 3 } })
      .jpeg({ quality: 60 })
      .toBuffer();
    const frame = await frameFromInput(baseBuf);

    // Encode with Q=95 and originalSize = baseBuf.length
    const { buffer: cappedBuf } = await encodeFrame(
      frame,
      { format: 'jpg', quality: 95, capToOriginalSize: true },
      '.jpg',
      baseBuf.length
    );
    // Capped buffer must not exceed the original size or must have lowered quality significantly
    const uncapped = await sharp(frame.data, { raw: { width: 300, height: 300, channels: 3 } })
      .jpeg({ quality: 95 })
      .toBuffer();
    expect(cappedBuf.length).toBeLessThan(uncapped.length);
  });
});
