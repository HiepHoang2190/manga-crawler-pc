/**
 * MoeTruyen IMGX transport carriers:
 *  - PNG pixel carrier ("IMGXPNG2") served by the primary CDN.
 *  - `IMX4` RIFF chunk embedded in the decoy WebP produced by the v3 layer.
 */
const crypto = require('crypto');
const sharp = require('sharp');
const {
  PNG_CARRIER_MARKER,
  isPngCarrier,
  unwrapPngCarrier,
  extractImx4Chunk,
} = require('../../../download/connector/moetruyenImgxCarrier');

/** Pack payload into RGB pixels exactly like the site's encoder, then encode as PNG via sharp. */
async function buildPngCarrier(payload, { corruptDigest = false, width = 0 } = {}) {
  const digest = crypto.createHash('sha256').update(payload).digest();
  if (corruptDigest) digest[0] ^= 0xff;
  const lenBE = Buffer.alloc(4);
  lenBE.writeUInt32BE(payload.length);
  const stream = Buffer.concat([Buffer.from(PNG_CARRIER_MARKER, 'latin1'), lenBE, digest, payload]);
  const pixels = Math.ceil(stream.length / 3);
  const w = width || Math.ceil(Math.sqrt(pixels));
  const h = Math.ceil(pixels / w);
  const rgb = Buffer.alloc(w * h * 3);
  stream.copy(rgb, 0);
  return sharp(rgb, { raw: { width: w, height: h, channels: 3 } }).png({ compressionLevel: 1 }).toBuffer();
}

function riffWebp(chunks) {
  const parts = [];
  for (const [fourcc, data] of chunks) {
    const head = Buffer.alloc(8);
    head.write(fourcc, 0, 'latin1');
    head.writeUInt32LE(data.length, 4);
    parts.push(head, data);
    if (data.length & 1) parts.push(Buffer.alloc(1));
  }
  const body = Buffer.concat(parts);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(body.length + 4, 4);
  header.write('WEBP', 8, 'latin1');
  return Buffer.concat([header, body]);
}

describe('isPngCarrier', () => {
  it('detects PNG magic only', () => {
    expect(isPngCarrier(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]))).toBe(true);
    expect(isPngCarrier(Buffer.from('IMGX\u0004abcdefgh', 'latin1'))).toBe(false);
    expect(isPngCarrier(Buffer.alloc(2))).toBe(false);
  });
});

describe('unwrapPngCarrier', () => {
  it('returns non-PNG input untouched', async () => {
    const raw = Buffer.from('IMGX\u0003not-a-png', 'latin1');
    expect(await unwrapPngCarrier(raw)).toBe(raw);
  });

  it('extracts the embedded payload from RGB pixels and verifies sha256', async () => {
    const payload = crypto.randomBytes(5003);
    payload.write('IMGX', 0, 'latin1');
    const png = await buildPngCarrier(payload);
    const out = await unwrapPngCarrier(png);
    expect(Buffer.isBuffer(out)).toBe(true);
    expect(out.equals(payload)).toBe(true);
  });

  it('handles non-square carriers with trailing padding pixels', async () => {
    const payload = crypto.randomBytes(1000);
    const png = await buildPngCarrier(payload, { width: 17 });
    expect((await unwrapPngCarrier(png)).equals(payload)).toBe(true);
  });

  it('rejects checksum mismatch and missing marker', async () => {
    const payload = crypto.randomBytes(256);
    await expect(unwrapPngCarrier(await buildPngCarrier(payload, { corruptDigest: true }))).rejects.toThrow(/checksum mismatch/);
    const blank = await sharp(Buffer.alloc(64 * 64 * 3), { raw: { width: 64, height: 64, channels: 3 } }).png().toBuffer();
    await expect(unwrapPngCarrier(blank)).rejects.toThrow(/marker is missing/);
  });

  it('rejects a declared length larger than the pixel capacity', async () => {
    const payload = crypto.randomBytes(100);
    const png = await buildPngCarrier(payload);
    // Re-encode with a bogus length by rebuilding the stream manually.
    const digest = crypto.createHash('sha256').update(payload).digest();
    const lenBE = Buffer.alloc(4);
    lenBE.writeUInt32BE(10_000_000);
    const stream = Buffer.concat([Buffer.from(PNG_CARRIER_MARKER, 'latin1'), lenBE, digest, payload]);
    const w = 32;
    const h = Math.ceil(stream.length / 3 / w);
    const rgb = Buffer.alloc(w * h * 3);
    stream.copy(rgb, 0);
    const bogus = await sharp(rgb, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
    await expect(unwrapPngCarrier(bogus)).rejects.toThrow(/length is invalid/);
    expect(png.length).toBeGreaterThan(0);
  });
});

describe('extractImx4Chunk', () => {
  it('returns null for non-WebP input or WebP without IMX4', () => {
    expect(extractImx4Chunk(Buffer.from('not webp at all!!'))).toBeNull();
    expect(extractImx4Chunk(riffWebp([['VP8 ', Buffer.alloc(31)]]))).toBeNull();
  });

  it('returns the IMX4 payload, honoring odd-size chunk padding', () => {
    const inner = Buffer.alloc(100, 7);
    inner.write('IMGX', 0, 'latin1');
    inner[4] = 4;
    const webp = riffWebp([['VP8X', Buffer.alloc(10)], ['VP8 ', Buffer.alloc(31)], ['IMX4', inner]]);
    const out = extractImx4Chunk(webp);
    expect(out && out.equals(inner)).toBe(true);
  });

  it('rejects an IMX4 chunk that is not an IMGX v4 payload', () => {
    const webp = riffWebp([['IMX4', Buffer.alloc(100)]]);
    expect(() => extractImx4Chunk(webp)).toThrow(/protected chunk invalid/);
  });

  it('rejects a RIFF size that disagrees with the buffer', () => {
    const webp = riffWebp([['VP8 ', Buffer.alloc(31)]]);
    webp.writeUInt32LE(9999, 4);
    expect(() => extractImx4Chunk(webp)).toThrow(/container invalid/);
  });
});
