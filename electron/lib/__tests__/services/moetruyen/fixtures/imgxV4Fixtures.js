/**
 * Shared IMGX v4 test fixtures: encrypt arbitrary bytes into a v4 payload for
 * any content profile, and build grants whose `wrappedV4Key` unwraps to a key.
 *
 * The encryption side mirrors the site's encoder using the same primitives the
 * decoder relies on (node:crypto, @noble/ciphers, libsodium).
 */
const crypto = require('crypto');
const sodium = require('libsodium-wrappers-sumo');
const { V4_PROFILES, V4_STREAM_CHUNK } = require('../../../../download/connector/moetruyenImgxV4');
const { unwrapGrantKey, bytesToBase64Url } = require('../../../../download/connector/moetruyenImgx');

const IMAGE_ID = 'bee33f45f4976c3b1add54c754f1f17f';
const STORAGE_KEY = 'chapters/manga-1/ch-2/001_abc.js';
const u8 = (b) => new Uint8Array(b.buffer, b.byteOffset, b.byteLength);

let nobleAes = null;

/** Load libsodium and @noble/ciphers (ESM-only, via dynamic import). Call in beforeAll. */
async function readyFixtures() {
  await sodium.ready;
  if (!nobleAes) nobleAes = await import('@noble/ciphers/aes.js');
  return { sodium, nobleAes };
}

function hkdf64(key, salt, info) {
  return Buffer.from(crypto.hkdfSync('sha256', key, salt, Buffer.from(info), 64));
}

/** Random bytes with a RIFF/WEBP header so output looks like a WebP. */
function fakeWebp(size) {
  const buf = crypto.randomBytes(size);
  buf.write('RIFF', 0, 'latin1');
  buf.writeUInt32LE(size - 8, 4);
  buf.write('WEBP', 8, 'latin1');
  return buf;
}

/** Encrypt `plain` as an IMGX v4 payload with the given profile. */
function buildV4Fixture({ profile, plain, v4Key, imageId = IMAGE_ID, storageKey = STORAGE_KEY, width = 1100, height = 1580 }) {
  if (!nobleAes) throw new Error('call readyFixtures() first');
  const { gcmsiv, aessiv } = nobleAes;
  const header = Buffer.alloc(78);
  header.write('IMGX', 0, 'latin1');
  header[4] = 4;
  header.writeUInt32BE(width, 5);
  header.writeUInt32BE(height, 9);
  crypto.randomBytes(32).copy(header, 13);
  crypto.randomBytes(12).copy(header, 45);
  const okm = hkdf64(v4Key, header.subarray(13, 45), 'IMGX-v4.envelope');
  const envKey = okm.subarray(0, 32);
  const contentKey = okm.subarray(32);
  const ctx = Buffer.from(JSON.stringify(['IMGX-v4', imageId, storageKey]));

  const meta = Buffer.alloc(5);
  meta[0] = V4_PROFILES.indexOf(profile) + 1;
  meta.writeUInt32BE(plain.length, 1);
  const envCipher = crypto.createCipheriv('aes-256-gcm', envKey, header.subarray(45, 57));
  envCipher.setAAD(Buffer.concat([header.subarray(0, 57), ctx]));
  Buffer.concat([envCipher.update(meta), envCipher.final()]).copy(header, 57);
  envCipher.getAuthTag().copy(header, 62);

  const aad = Buffer.concat([header, ctx]);
  let body;
  switch (profile) {
    case 'p01': {
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv('aes-256-gcm', contentKey, iv);
      c.setAAD(aad);
      body = Buffer.concat([iv, c.update(plain), c.final(), c.getAuthTag()]);
      break;
    }
    case 'p02': {
      const n = crypto.randomBytes(12);
      body = Buffer.concat([n, Buffer.from(sodium.crypto_aead_chacha20poly1305_ietf_encrypt(u8(plain), u8(aad), null, u8(n), u8(contentKey)))]);
      break;
    }
    case 'p03': {
      const n = crypto.randomBytes(24);
      body = Buffer.concat([n, Buffer.from(sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(u8(plain), u8(aad), null, u8(n), u8(contentKey)))]);
      break;
    }
    case 'p04': {
      const n = crypto.randomBytes(24);
      const inner = Buffer.concat([crypto.createHash('sha256').update(aad).digest(), plain]);
      body = Buffer.concat([n, Buffer.from(sodium.crypto_secretbox_easy(u8(inner), u8(n), u8(contentKey)))]);
      break;
    }
    case 'p05': {
      const { state, header: streamHeader } = sodium.crypto_secretstream_xchacha20poly1305_init_push(u8(contentKey));
      const parts = [Buffer.from(streamHeader)];
      for (let pos = 0; pos < plain.length; pos += V4_STREAM_CHUNK) {
        const chunk = plain.subarray(pos, Math.min(plain.length, pos + V4_STREAM_CHUNK));
        const tag = pos + chunk.length === plain.length
          ? sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL
          : sodium.crypto_secretstream_xchacha20poly1305_TAG_MESSAGE;
        parts.push(Buffer.from(sodium.crypto_secretstream_xchacha20poly1305_push(state, u8(chunk), u8(aad), tag)));
      }
      body = Buffer.concat(parts);
      break;
    }
    case 'p06': {
      const sub = hkdf64(contentKey, Buffer.alloc(32), 'IMGX-v4.p06');
      const iv = crypto.randomBytes(16);
      const c = crypto.createCipheriv('aes-256-cbc', sub.subarray(32), iv);
      const ct = Buffer.concat([c.update(plain), c.final()]);
      const lenBE = Buffer.alloc(8);
      lenBE.writeBigUInt64BE(BigInt(aad.length) * 8n);
      const mac = crypto.createHmac('sha512', sub.subarray(0, 32)).update(Buffer.concat([aad, iv, ct, lenBE])).digest().subarray(0, 32);
      body = Buffer.concat([iv, ct, mac]);
      break;
    }
    case 'p07': {
      const n = crypto.randomBytes(12);
      body = Buffer.concat([n, Buffer.from(gcmsiv(u8(contentKey), u8(n), u8(aad)).encrypt(u8(plain)))]);
      break;
    }
    case 'p08': {
      const sub = hkdf64(contentKey, Buffer.alloc(32), 'IMGX-v4.p08');
      body = Buffer.from(aessiv(u8(sub), u8(aad)).encrypt(u8(plain)));
      break;
    }
    case 'p09': {
      const n = crypto.randomBytes(32);
      body = Buffer.concat([n, Buffer.from(sodium.crypto_aead_aegis256_encrypt(u8(plain), u8(aad), null, u8(n), u8(contentKey)))]);
      break;
    }
    case 'p10': {
      const n = crypto.randomBytes(16);
      body = Buffer.concat([n, Buffer.from(sodium.crypto_aead_aegis128l_encrypt(u8(plain), u8(aad), null, u8(n), u8(contentKey.subarray(0, 16))))]);
      break;
    }
    default:
      throw new Error(`fixture profile ${profile}`);
  }
  return { payload: Buffer.concat([header, body]), header, contentKey, aad };
}

/** Build a grant whose wrappedV4Key unwraps to `v4Key` (the XOR wrap is symmetric). */
function buildGrant(v4Key, storageKey = STORAGE_KEY) {
  const grant = {
    version: 1,
    algorithm: 'IMGX-GRANT-WRAP-v1',
    imageId: IMAGE_ID,
    issuedAt: 1791513582121,
    expiresAt: 1791513642121,
    nonce: '8sVEAWM_fAR63skEvmQomg',
    keyNonce: 'ebyNP6YZrUKxfV5UJa07aQ',
    signature: '0SkWwYA7zxzDZrGIwteA4z4JTbHkFEjV_kdBcEqMKM0',
  };
  const keystream = unwrapGrantKey({ ...grant, wrappedV4Key: bytesToBase64Url(Buffer.alloc(32)) }, storageKey, 'wrappedV4Key', 'IMGX v4 grant');
  const wrapped = Buffer.alloc(32);
  for (let i = 0; i < 32; i += 1) wrapped[i] = v4Key[i] ^ keystream[i];
  grant.wrappedV4Key = bytesToBase64Url(wrapped);
  return grant;
}

module.exports = { readyFixtures, buildV4Fixture, buildGrant, fakeWebp, hkdf64, IMAGE_ID, STORAGE_KEY };
