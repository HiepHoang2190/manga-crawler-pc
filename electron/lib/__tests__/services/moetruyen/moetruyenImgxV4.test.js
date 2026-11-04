/**
 * MoeTruyen IMGX v4 decode tests.
 *
 * Each fixture is produced by *encrypting* with the same primitives the site
 * uses (node:crypto, @noble/ciphers, libsodium) so the decoder is validated by
 * round-trip for all ten content profiles plus the AES-GCM envelope.
 */
const crypto = require('crypto');
const {
  V4_PROFILES,
  V4_STREAM_CHUNK,
  parseV4Header,
  openV4Envelope,
  decodeV4Body,
  decodeImgxV4,
} = require('../../../download/connector/moetruyenImgxV4');
const { readyFixtures, buildV4Fixture, buildGrant, fakeWebp, IMAGE_ID, STORAGE_KEY } = require('./fixtures/imgxV4Fixtures');

beforeAll(() => readyFixtures());

describe('parseV4Header', () => {
  it('parses magic, version and dimensions', () => {
    const { payload } = buildV4Fixture({ profile: 'p01', plain: fakeWebp(100), v4Key: crypto.randomBytes(32) });
    expect(parseV4Header(payload)).toEqual({ version: 4, width: 1100, height: 1580 });
  });

  it('rejects wrong magic, wrong version and zero dimensions', () => {
    const { payload } = buildV4Fixture({ profile: 'p01', plain: fakeWebp(100), v4Key: crypto.randomBytes(32) });
    const badMagic = Buffer.from(payload);
    badMagic[0] = 0x4a;
    expect(() => parseV4Header(badMagic)).toThrow(/IMGX v4 file invalid/);
    const badVersion = Buffer.from(payload);
    badVersion[4] = 3;
    expect(() => parseV4Header(badVersion)).toThrow(/IMGX v4 file invalid/);
    const badDims = Buffer.from(payload);
    badDims.writeUInt32BE(0, 5);
    expect(() => parseV4Header(badDims)).toThrow(/IMGX v4 dimensions invalid/);
    expect(() => parseV4Header(payload.subarray(0, 78))).toThrow(/IMGX v4 file invalid/);
  });
});

describe('openV4Envelope', () => {
  it('returns profile, plainBytes, contentKey and full AAD', () => {
    const v4Key = crypto.randomBytes(32);
    const plain = fakeWebp(321);
    const { payload, contentKey, aad } = buildV4Fixture({ profile: 'p07', plain, v4Key });
    const env = openV4Envelope(payload, v4Key, { imageId: IMAGE_ID, storageKey: STORAGE_KEY });
    expect(env.profile).toBe('p07');
    expect(env.plainBytes).toBe(321);
    expect(Buffer.from(env.contentKey).equals(contentKey)).toBe(true);
    expect(Buffer.from(env.aad).equals(aad)).toBe(true);
  });

  it('strips leading slashes from storageKey like the reader', () => {
    const v4Key = crypto.randomBytes(32);
    const { payload } = buildV4Fixture({ profile: 'p01', plain: fakeWebp(64), v4Key });
    expect(() => openV4Envelope(payload, v4Key, { imageId: IMAGE_ID, storageKey: `/${STORAGE_KEY}` })).not.toThrow();
  });

  it('fails on wrong key, wrong imageId and wrong storageKey', () => {
    const v4Key = crypto.randomBytes(32);
    const { payload } = buildV4Fixture({ profile: 'p01', plain: fakeWebp(64), v4Key });
    expect(() => openV4Envelope(payload, crypto.randomBytes(32), { imageId: IMAGE_ID, storageKey: STORAGE_KEY })).toThrow();
    expect(() => openV4Envelope(payload, v4Key, { imageId: 'a'.repeat(32), storageKey: STORAGE_KEY })).toThrow();
    expect(() => openV4Envelope(payload, v4Key, { imageId: IMAGE_ID, storageKey: 'other.js' })).toThrow();
    expect(() => openV4Envelope(payload, v4Key, { imageId: 'not-hex', storageKey: STORAGE_KEY })).toThrow(/IMGX v4 context invalid/);
  });

  it('rejects payload whose length does not match the profile layout', () => {
    const v4Key = crypto.randomBytes(32);
    const { payload } = buildV4Fixture({ profile: 'p01', plain: fakeWebp(64), v4Key });
    const truncated = payload.subarray(0, payload.length - 1);
    expect(() => openV4Envelope(truncated, v4Key, { imageId: IMAGE_ID, storageKey: STORAGE_KEY })).toThrow(/IMGX v4 payload length invalid/);
  });
});

describe('decodeV4Body round-trips every profile', () => {
  const sizes = { p05: V4_STREAM_CHUNK * 2 + 1234 }; // multi-chunk secretstream
  for (const profile of V4_PROFILES) {
    it(`decodes ${profile}`, async () => {
      const v4Key = crypto.randomBytes(32);
      const plain = fakeWebp(sizes[profile] || 5000 + Math.floor(Math.random() * 100));
      const { payload } = buildV4Fixture({ profile, plain, v4Key });
      const env = openV4Envelope(payload, v4Key, { imageId: IMAGE_ID, storageKey: STORAGE_KEY });
      expect(env.profile).toBe(profile);
      const out = await decodeV4Body(env.profile, payload.subarray(78), env.contentKey, env.aad, env.plainBytes);
      expect(Buffer.from(out).equals(plain)).toBe(true);
    });

    it(`rejects tampered ciphertext for ${profile}`, async () => {
      const v4Key = crypto.randomBytes(32);
      const plain = fakeWebp(sizes[profile] ? 3000 : 2048);
      const { payload } = buildV4Fixture({ profile, plain, v4Key });
      const env = openV4Envelope(payload, v4Key, { imageId: IMAGE_ID, storageKey: STORAGE_KEY });
      const tampered = Buffer.from(payload.subarray(78));
      tampered[tampered.length - 5] ^= 0x01;
      await expect(decodeV4Body(env.profile, tampered, env.contentKey, env.aad, env.plainBytes)).rejects.toThrow();
    });
  }

  it('rejects unsupported profile', async () => {
    await expect(decodeV4Body('p11', Buffer.alloc(10), Buffer.alloc(32), Buffer.alloc(1), 1)).rejects.toThrow(/profile unsupported/);
  });
});

describe('decodeImgxV4 (grant -> wrappedV4Key -> WebP)', () => {
  it('unwraps the grant key and returns the original bytes', async () => {
    const v4Key = crypto.randomBytes(32);
    const plain = fakeWebp(4096);
    const { payload } = buildV4Fixture({ profile: 'p10', plain, v4Key });
    const out = await decodeImgxV4(payload, buildGrant(v4Key), STORAGE_KEY);
    expect(Buffer.isBuffer(out)).toBe(true);
    expect(out.equals(plain)).toBe(true);
  });

  it('throws when the grant has no wrappedV4Key', async () => {
    const v4Key = crypto.randomBytes(32);
    const { payload } = buildV4Fixture({ profile: 'p01', plain: fakeWebp(64), v4Key });
    const grant = buildGrant(v4Key);
    delete grant.wrappedV4Key;
    await expect(decodeImgxV4(payload, grant, STORAGE_KEY)).rejects.toThrow(/IMGX v4 grant missing/);
  });

  it('fails when plaintext length disagrees with metadata', async () => {
    const v4Key = crypto.randomBytes(32);
    const plain = fakeWebp(300);
    const { payload } = buildV4Fixture({ profile: 'p08', plain, v4Key });
    // Re-encrypt with a different plainBytes in metadata but same body is impossible without the key, so
    // simulate by truncating the body and asserting an error is thrown (length guard or auth failure).
    await expect(decodeImgxV4(payload.subarray(0, payload.length - 16), buildGrant(v4Key), STORAGE_KEY)).rejects.toThrow();
  });
});

