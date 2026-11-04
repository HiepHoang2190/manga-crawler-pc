/**
 * MoeTruyen IMGX transport carriers.
 *
 * The protected page binary can reach the client through two wrappers:
 *
 *  1. PNG pixel carrier ("IMGXPNG2") on the primary image CDN. The IMGX payload is
 *     written sequentially into the RGB channels of an opaque PNG:
 *     `marker(8) | length(uint32 BE) | sha256(32) | payload(length)`.
 *  2. `IMX4` RIFF chunk inside the decoy WebP produced by the v3 layer: the real
 *     IMGX v4 payload is stored as an extra chunk after the placeholder VP8 data.
 */

const crypto = require('crypto');

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_CARRIER_MARKER = 'IMGXPNG2';
const PNG_CARRIER_HEADER_LENGTH = PNG_CARRIER_MARKER.length + 4 + 32;
const WEBP_MAX_BYTES = 68157440;
const WEBP_MAX_CHUNKS = 1024;
const IMX4_MIN_PAYLOAD = 78;

const toBuffer = (input) => {
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof Uint8Array) return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  return Buffer.from(input);
};

/**
 * @param {Buffer|Uint8Array} bytes
 * @returns {boolean}
 */
function isPngCarrier(bytes) {
  const buf = toBuffer(bytes || Buffer.alloc(0));
  if (buf.length < PNG_MAGIC.length) return false;
  for (let i = 0; i < PNG_MAGIC.length; i += 1) if (buf[i] !== PNG_MAGIC[i]) return false;
  return true;
}

/**
 * Extract the IMGX payload embedded in a PNG pixel carrier. Non-PNG input is
 * returned unchanged so callers can pass any CDN response through this step.
 *
 * @param {Buffer|Uint8Array} bytes
 * @returns {Promise<Buffer>}
 */
async function unwrapPngCarrier(bytes) {
  const buf = toBuffer(bytes);
  if (!isPngCarrier(buf)) return buf;

  // eslint-disable-next-line global-require
  const sharp = require('sharp');
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  const capacity = info.width * info.height * 3;
  if (capacity < PNG_CARRIER_HEADER_LENGTH) throw new Error('IMGX pixel PNG payload is too small');

  // Read the i-th RGB byte, skipping alpha when present.
  const rgbAt = channels === 3
    ? (i) => data[i]
    : (i) => data[Math.floor(i / 3) * channels + (i % 3)];

  for (let i = 0; i < PNG_CARRIER_MARKER.length; i += 1) {
    if (rgbAt(i) !== PNG_CARRIER_MARKER.charCodeAt(i)) throw new Error('IMGX pixel PNG marker is missing');
  }
  const lenOffset = PNG_CARRIER_MARKER.length;
  const length = (((rgbAt(lenOffset) << 24) >>> 0) | (rgbAt(lenOffset + 1) << 16) | (rgbAt(lenOffset + 2) << 8) | rgbAt(lenOffset + 3)) >>> 0;
  if (PNG_CARRIER_HEADER_LENGTH + length > capacity) throw new Error('IMGX pixel PNG payload length is invalid');

  const digest = Buffer.alloc(32);
  for (let i = 0; i < 32; i += 1) digest[i] = rgbAt(lenOffset + 4 + i);

  const payload = Buffer.alloc(length);
  if (channels === 3) {
    data.copy(payload, 0, PNG_CARRIER_HEADER_LENGTH, PNG_CARRIER_HEADER_LENGTH + length);
  } else {
    for (let i = 0; i < length; i += 1) payload[i] = rgbAt(PNG_CARRIER_HEADER_LENGTH + i);
  }
  const actual = crypto.createHash('sha256').update(payload).digest();
  if (!crypto.timingSafeEqual(actual, digest)) throw new Error('IMGX pixel PNG payload checksum mismatch');
  return payload;
}

/**
 * Walk the RIFF container of a WebP and return the `IMX4` chunk payload, or null
 * when the WebP is a plain image (no protected chunk).
 *
 * @param {Buffer|Uint8Array} bytes
 * @returns {Buffer|null}
 */
function extractImx4Chunk(bytes) {
  const buf = toBuffer(bytes);
  if (buf.length < 12 || buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WEBP') return null;
  if (buf.length > WEBP_MAX_BYTES || buf.readUInt32LE(4) + 8 !== buf.length) throw new Error('IMGX WebP container invalid');

  let found = null;
  let count = 0;
  for (let offset = 12; offset < buf.length;) {
    count += 1;
    if (count > WEBP_MAX_CHUNKS || offset + 8 > buf.length) throw new Error('IMGX WebP chunks invalid');
    const size = buf.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + size;
    const next = dataEnd + (size & 1);
    if (next > buf.length) throw new Error('IMGX WebP chunk truncated');
    if (buf.toString('latin1', offset, offset + 4) === 'IMX4') {
      if (
        found ||
        size <= IMX4_MIN_PAYLOAD ||
        buf.toString('latin1', dataStart, dataStart + 4) !== 'IMGX' ||
        buf[dataStart + 4] !== 4
      ) {
        throw new Error('IMGX protected chunk invalid');
      }
      found = Buffer.from(buf.subarray(dataStart, dataEnd));
    }
    offset = next;
  }
  return found;
}

module.exports = {
  PNG_CARRIER_MARKER,
  isPngCarrier,
  unwrapPngCarrier,
  extractImx4Chunk,
};
