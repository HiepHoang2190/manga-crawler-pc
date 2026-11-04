/**
 * MoeTruyen IMGX v4 content codec (pure Node.js port of the site's imgx-worker.js).
 *
 * Layout of a v4 payload:
 *
 *   0..3   "IMGX"                  4      0x04
 *   5..8   width  (uint32 BE)      9..12  height (uint32 BE)
 *   13..44 HKDF salt (32)          45..56 envelope AES-GCM IV (12)
 *   57..77 encrypted metadata: 5 bytes [profileIndex, plainBytes BE] + 16-byte tag
 *   78..   body, layout depends on the content profile
 *
 * Keys: okm = HKDF-SHA256(ikm = unwrapped `wrappedV4Key`, salt = header[13:45],
 * info = "IMGX-v4.envelope", 64 bytes). okm[0:32] opens the metadata envelope,
 * okm[32:64] is the content key. Both AADs are `header-prefix || JSON(["IMGX-v4",
 * imageId, storageKey])` (57-byte prefix for metadata, full 78-byte header for the body).
 *
 * Content profiles (index 1..10):
 *   p01 AES-256-GCM            p02 ChaCha20-Poly1305 IETF   p03 XChaCha20-Poly1305 IETF
 *   p04 XSalsa20-Poly1305 box  p05 secretstream XChaCha20   p06 HMAC-SHA512/256 + AES-256-CBC
 *   p07 AES-256-GCM-SIV        p08 AES-SIV (RFC 5297)       p09 AEGIS-256
 *   p10 AEGIS-128L
 *
 * node:crypto covers p01/p06 and all HKDF/HMAC/AES-GCM work; @noble/ciphers covers the
 * SIV modes (p07/p08); libsodium covers the NaCl family and AEGIS (p02-p05, p09, p10).
 */

const crypto = require('crypto');
const { unwrapGrantKey } = require('./moetruyenImgx');

const V4_PROFILES = Object.freeze(['p01', 'p02', 'p03', 'p04', 'p05', 'p06', 'p07', 'p08', 'p09', 'p10']);
const V4_HEADER_LENGTH = 78;
const V4_SALT_OFFSET = 13;
const V4_IV_OFFSET = 45;
const V4_META_OFFSET = 57;
const V4_META_LENGTH = 5;
const V4_STREAM_CHUNK = 262144; // secretstream (p05) chunk size used by the site
const V4_STREAM_OVERHEAD = 17; // 1 tag byte + 16-byte MAC per secretstream chunk
const V4_MAX_PLAIN_BYTES = 67108864;
const V4_MAX_FILE_BYTES = 67117056;
const ZERO_SALT_32 = Buffer.alloc(32);

let sodiumPromise = null;
let nobleAesPromise = null;

/** Lazily load libsodium (WASM/asm.js) once per process. */
function getSodium() {
  if (!sodiumPromise) {
    sodiumPromise = (async () => {
      // eslint-disable-next-line global-require
      const sodium = require('libsodium-wrappers-sumo');
      await sodium.ready;
      return sodium;
    })().catch((err) => {
      sodiumPromise = null;
      throw err;
    });
  }
  return sodiumPromise;
}

/**
 * Lazily load @noble/ciphers AES-SIV modes. The package is ESM-only, so it is
 * pulled in through dynamic import() (supported by Electron's CJS main process).
 */
function getNobleAes() {
  if (!nobleAesPromise) {
    nobleAesPromise = import('@noble/ciphers/aes.js').catch((err) => {
      nobleAesPromise = null;
      throw err;
    });
  }
  return nobleAesPromise;
}

const toU8 = (buf) => new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
const toBuffer = (input) => (Buffer.isBuffer(input) ? input : Buffer.from(input.buffer, input.byteOffset, input.byteLength));

function hkdf64(ikm, salt, info) {
  return Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from(info, 'utf-8'), 64));
}

/**
 * Validate the fixed 78-byte header and return dimensions.
 *
 * @param {Buffer|Uint8Array} bytes
 * @returns {{version: 4, width: number, height: number}}
 */
function parseV4Header(bytes) {
  const buf = toBuffer(bytes);
  if (
    buf.length <= V4_HEADER_LENGTH ||
    buf.length > V4_MAX_FILE_BYTES ||
    buf[0] !== 0x49 || buf[1] !== 0x4d || buf[2] !== 0x47 || buf[3] !== 0x58 ||
    buf[4] !== 4
  ) {
    throw new Error('IMGX v4 file invalid');
  }
  const width = buf.readUInt32BE(5);
  const height = buf.readUInt32BE(9);
  if (
    !Number.isInteger(width) || !Number.isInteger(height) ||
    width < 1 || height < 1 || width > 65535 || height > 65535 || width * height > 1e8
  ) {
    throw new Error('IMGX v4 dimensions invalid');
  }
  return { version: 4, width, height };
}

/**
 * Build the JSON context bound into both AADs.
 *
 * @param {string} imageId - 32 hex chars from the grant.
 * @param {string} storageKey
 * @returns {Buffer}
 */
function buildV4Context(imageId, storageKey) {
  const key = String(storageKey || '').trim().replace(/^\/+/, '');
  if (!/^[a-f0-9]{32}$/.test(String(imageId || '')) || !key || key.length > 2048) {
    throw new Error('IMGX v4 context invalid');
  }
  return Buffer.from(JSON.stringify(['IMGX-v4', imageId, key]), 'utf-8');
}

/**
 * Expected body length for a profile, given the plaintext length (mirrors the reader's `M`).
 */
function expectedBodyLength(profile, plainBytes) {
  switch (profile) {
    case 'p01': return 12 + plainBytes + 16;
    case 'p02': return 12 + plainBytes + 16;
    case 'p03': return 24 + plainBytes + 16;
    case 'p04': return 24 + plainBytes + 16 + 32;
    case 'p05': return 24 + plainBytes + V4_STREAM_OVERHEAD * Math.ceil(plainBytes / V4_STREAM_CHUNK);
    case 'p06': return 16 + (Math.floor(plainBytes / 16) + 1) * 16 + 32;
    case 'p07': return 12 + plainBytes + 16;
    case 'p08': return 16 + plainBytes;
    case 'p09': return 32 + plainBytes + 32;
    case 'p10': return 16 + plainBytes + 32;
    default: throw new Error('IMGX v4 profile unsupported');
  }
}

/**
 * Decrypt the metadata envelope and derive the content key.
 *
 * @param {Buffer|Uint8Array} bytes - Full v4 payload.
 * @param {Buffer|Uint8Array} v4Key - 32-byte unwrapped key.
 * @param {{imageId: string, storageKey: string}} context
 * @returns {{profile: string, plainBytes: number, contentKey: Buffer, aad: Buffer, width: number, height: number}}
 */
function openV4Envelope(bytes, v4Key, context) {
  const buf = toBuffer(bytes);
  const { width, height } = parseV4Header(buf);
  const key = toBuffer(v4Key);
  if (key.length !== 32) throw new Error('IMGX v4 key invalid');
  const ctx = buildV4Context(context && context.imageId, context && context.storageKey);
  const header = buf.subarray(0, V4_HEADER_LENGTH);

  const okm = hkdf64(key, header.subarray(V4_SALT_OFFSET, V4_IV_OFFSET), 'IMGX-v4.envelope');
  const envelopeKey = okm.subarray(0, 32);
  const contentKey = okm.subarray(32);

  const decipher = crypto.createDecipheriv('aes-256-gcm', envelopeKey, header.subarray(V4_IV_OFFSET, V4_META_OFFSET));
  decipher.setAAD(Buffer.concat([header.subarray(0, V4_META_OFFSET), ctx]));
  decipher.setAuthTag(header.subarray(V4_META_OFFSET + V4_META_LENGTH, V4_HEADER_LENGTH));
  const meta = Buffer.concat([
    decipher.update(header.subarray(V4_META_OFFSET, V4_META_OFFSET + V4_META_LENGTH)),
    decipher.final(),
  ]);
  if (meta.length !== V4_META_LENGTH) throw new Error('IMGX v4 metadata invalid');

  const profile = V4_PROFILES[meta[0] - 1];
  if (!profile) throw new Error('IMGX v4 profile unsupported');
  const plainBytes = meta.readUInt32BE(1);
  if (!plainBytes || plainBytes > V4_MAX_PLAIN_BYTES) throw new Error('IMGX v4 size invalid');
  if (buf.length !== V4_HEADER_LENGTH + expectedBodyLength(profile, plainBytes)) {
    throw new Error('IMGX v4 payload length invalid');
  }

  return { profile, plainBytes, contentKey, aad: Buffer.concat([header, ctx]), width, height };
}

async function decodeSecretStream(sodium, body, contentKey, aad, plainBytes) {
  const state = sodium.crypto_secretstream_xchacha20poly1305_init_pull(toU8(body.subarray(0, 24)), toU8(contentKey));
  const out = Buffer.alloc(plainBytes);
  let offset = 24;
  for (let pos = 0; pos < plainBytes; pos += V4_STREAM_CHUNK) {
    const size = Math.min(V4_STREAM_CHUNK, plainBytes - pos);
    const chunk = body.subarray(offset, offset + size + V4_STREAM_OVERHEAD);
    const result = sodium.crypto_secretstream_xchacha20poly1305_pull(state, toU8(chunk), toU8(aad));
    const expectedTag = pos + size === plainBytes
      ? sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL
      : sodium.crypto_secretstream_xchacha20poly1305_TAG_MESSAGE;
    if (!result || result.tag !== expectedTag || result.message.byteLength !== size) {
      throw new Error('IMGX v4 stream authentication failed');
    }
    out.set(result.message, pos);
    offset += size + V4_STREAM_OVERHEAD;
  }
  return out;
}

/**
 * Decrypt the body for a given profile (mirrors the reader's `I` + libsodium branches).
 *
 * @param {string} profile
 * @param {Buffer|Uint8Array} bodyInput - bytes after the 78-byte header.
 * @param {Buffer|Uint8Array} contentKeyInput - 32 bytes.
 * @param {Buffer|Uint8Array} aadInput - header || context.
 * @param {number} plainBytes
 * @returns {Promise<Buffer>}
 */
async function decodeV4Body(profile, bodyInput, contentKeyInput, aadInput, plainBytes) {
  if (!V4_PROFILES.includes(profile)) throw new Error('IMGX v4 profile unsupported');
  const body = toBuffer(bodyInput);
  const contentKey = toBuffer(contentKeyInput);
  const aad = toBuffer(aadInput);
  let out;

  switch (profile) {
    case 'p01': {
      const decipher = crypto.createDecipheriv('aes-256-gcm', contentKey, body.subarray(0, 12));
      decipher.setAAD(aad);
      decipher.setAuthTag(body.subarray(body.length - 16));
      out = Buffer.concat([decipher.update(body.subarray(12, body.length - 16)), decipher.final()]);
      break;
    }
    case 'p06': {
      const sub = hkdf64(contentKey, ZERO_SALT_32, 'IMGX-v4.p06');
      const iv = body.subarray(0, 16);
      const ciphertext = body.subarray(16, body.length - 32);
      const mac = body.subarray(body.length - 32);
      const aadBits = Buffer.alloc(8);
      aadBits.writeBigUInt64BE(BigInt(aad.length) * 8n);
      const expected = crypto
        .createHmac('sha512', sub.subarray(0, 32))
        .update(Buffer.concat([aad, iv, ciphertext, aadBits]))
        .digest()
        .subarray(0, 32);
      if (!crypto.timingSafeEqual(expected, mac)) throw new Error('IMGX v4 authentication failed');
      const decipher = crypto.createDecipheriv('aes-256-cbc', sub.subarray(32), iv);
      out = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      break;
    }
    case 'p07': {
      const { gcmsiv } = await getNobleAes();
      out = Buffer.from(gcmsiv(toU8(contentKey), toU8(body.subarray(0, 12)), toU8(aad)).decrypt(toU8(body.subarray(12))));
      break;
    }
    case 'p08': {
      const { aessiv } = await getNobleAes();
      const sub = hkdf64(contentKey, ZERO_SALT_32, 'IMGX-v4.p08');
      out = Buffer.from(aessiv(toU8(sub), toU8(aad)).decrypt(toU8(body)));
      break;
    }
    case 'p02':
    case 'p03':
    case 'p04':
    case 'p05':
    case 'p09':
    case 'p10': {
      const sodium = await getSodium();
      if (profile === 'p02') {
        out = Buffer.from(sodium.crypto_aead_chacha20poly1305_ietf_decrypt(null, toU8(body.subarray(12)), toU8(aad), toU8(body.subarray(0, 12)), toU8(contentKey)));
      } else if (profile === 'p03') {
        out = Buffer.from(sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, toU8(body.subarray(24)), toU8(aad), toU8(body.subarray(0, 24)), toU8(contentKey)));
      } else if (profile === 'p04') {
        const opened = Buffer.from(sodium.crypto_secretbox_open_easy(toU8(body.subarray(24)), toU8(body.subarray(0, 24)), toU8(contentKey)));
        const digest = crypto.createHash('sha256').update(aad).digest();
        if (opened.length < 32 || !crypto.timingSafeEqual(opened.subarray(0, 32), digest)) {
          throw new Error('IMGX v4 context authentication failed');
        }
        out = opened.subarray(32);
      } else if (profile === 'p05') {
        out = await decodeSecretStream(sodium, body, contentKey, aad, plainBytes);
      } else if (profile === 'p09') {
        out = Buffer.from(sodium.crypto_aead_aegis256_decrypt(null, toU8(body.subarray(32)), toU8(aad), toU8(body.subarray(0, 32)), toU8(contentKey)));
      } else {
        out = Buffer.from(sodium.crypto_aead_aegis128l_decrypt(null, toU8(body.subarray(16)), toU8(aad), toU8(body.subarray(0, 16)), toU8(contentKey.subarray(0, 16))));
      }
      break;
    }
    default:
      throw new Error('IMGX v4 profile unsupported');
  }

  if (out.length !== plainBytes) throw new Error('IMGX v4 plaintext length invalid');
  return out;
}

/**
 * Decode a full IMGX v4 payload using the page grant (unwraps `wrappedV4Key`).
 *
 * @param {Buffer|Uint8Array|ArrayBuffer} input
 * @param {object} grant - Page grant after `openPageGrant` (must contain `wrappedV4Key`).
 * @param {string} storageKey
 * @returns {Promise<Buffer>} Original image bytes (WebP).
 */
async function decodeImgxV4(input, grant, storageKey) {
  const bytes = input instanceof Uint8Array ? toBuffer(input) : Buffer.from(input);
  if (!grant || !grant.wrappedV4Key) throw new Error('IMGX v4 grant missing');
  const v4Key = unwrapGrantKey(grant, storageKey, 'wrappedV4Key', 'IMGX v4 grant');
  const envelope = openV4Envelope(bytes, v4Key, { imageId: grant.imageId, storageKey });
  return decodeV4Body(envelope.profile, bytes.subarray(V4_HEADER_LENGTH), envelope.contentKey, envelope.aad, envelope.plainBytes);
}

module.exports = {
  V4_PROFILES,
  V4_HEADER_LENGTH,
  V4_STREAM_CHUNK,
  parseV4Header,
  buildV4Context,
  openV4Envelope,
  decodeV4Body,
  decodeImgxV4,
};
