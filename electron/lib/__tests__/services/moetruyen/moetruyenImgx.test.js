/**
 * MoeTruyen IMGX v2 decode tests.
 *
 * Validates the offline reimplementation of the site's JS-fallback decode
 * pipeline (header strip -> seeded-permutation undo -> repeating XOR) via a
 * round-trip, plus reader-config parsing.
 */
const crypto = require('crypto');
const {
  decodeImgxPayload,
  parseImgxReaderConfig,
  fetchImgxPageGrants,
  fetchImgxChannelGrants,
  buildPageAccessProof,
  buildImgxPageAccessClientProofPayload,
  createImgxReaderChannel,
  isImgxEncrypted,
  PROOF_VERSION,
  PROOF_VERSION_V3,
  CHANNEL_VERSION,
} = require('../../../download/connector/moetruyenImgx');

const GOLDEN = 2654435769;

function xorshift32(state) {
  let value = state >>> 0;
  value ^= (value << 13) >>> 0;
  value ^= value >>> 17;
  value ^= (value << 5) >>> 0;
  return value >>> 0;
}

function permutationSeed(key) {
  const view = new DataView(key.buffer, key.byteOffset, key.byteLength);
  return view.getUint32(0, false) || GOLDEN;
}

/** Build the swap table exactly like the decoder. */
function buildSwaps(length, key) {
  const swaps = new Uint32Array(length);
  let state = permutationSeed(key);
  for (let i = length - 1; i > 0; i -= 1) {
    state = xorshift32(state);
    swaps[i] = state % (i + 1);
  }
  return swaps;
}

/**
 * Encode original bytes into an IMGX payload (inverse of decodeImgxPayload).
 * Decode applies XOR after un-permuting, so encode permutes after XORing, and
 * the permutation is the inverse swap order.
 */
function encodeImgxPayload(original, key) {
  const xored = new Uint8Array(original.length);
  for (let i = 0; i < original.length; i += 1) xored[i] = original[i] ^ key[i % key.byteLength];

  const swaps = buildSwaps(xored.length, key);
  for (let i = xored.length - 1; i >= 1; i -= 1) {
    const target = swaps[i];
    if (target === i) continue;
    const tmp = xored[i];
    xored[i] = xored[target];
    xored[target] = tmp;
  }

  // IMGX magic + version 2 + width(uint32 BE) + height(uint32 BE)
  const header = Buffer.from([73, 77, 71, 88, 2, 0, 0, 0, 1, 0, 0, 0, 1]);
  return Buffer.concat([header, Buffer.from(xored)]);
}

function toBase64Url(bytes) {
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('MoeTruyen IMGX decode', () => {
  test('round-trips an encoded payload back to the original bytes', () => {
    const key = new Uint8Array(32);
    for (let i = 0; i < 32; i += 1) key[i] = (i * 37 + 11) & 255;

    const original = Buffer.from('RIFF\x00\x00\x00\x00WEBPVP8 fake-image-payload-1234567890', 'latin1');
    const blob = encodeImgxPayload(original, key);
    const grant = { decodeKey: toBase64Url(key) };

    const decoded = decodeImgxPayload(blob, grant, 'chapters/manga-1/ch-1/001_X.js');
    expect(Buffer.compare(decoded, original)).toBe(0);
    expect(decoded.slice(0, 4).toString()).toBe('RIFF');
    expect(decoded.slice(8, 12).toString()).toBe('WEBP');
  });

  test('rejects payloads with an invalid magic header', () => {
    const bad = Buffer.from([1, 2, 3, 4, 2, 0, 0, 0, 0, 0, 0, 0, 0, 9, 9, 9]);
    expect(() => decodeImgxPayload(bad, { decodeKey: toBase64Url(new Uint8Array(32)) }, 'k')).toThrow(/magic/i);
  });

  test('rejects payloads with an unsupported version', () => {
    const bad = Buffer.from([73, 77, 71, 88, 9, 0, 0, 0, 0, 0, 0, 0, 0, 9, 9, 9]);
    expect(() => decodeImgxPayload(bad, { decodeKey: toBase64Url(new Uint8Array(32)) }, 'k')).toThrow(/version/i);
  });
});

describe('MoeTruyen IMGX v3 (AES-256-GCM) decode', () => {
  const storageKey = 'chapters/manga-1362/ch-6/001_X.js';
  const imageId = 'img-123';
  const width = 1262;
  const height = 1800;

  /** Build a v3 IMGX payload (inverse of decodeImgxV3) using a raw content key. */
  function encodeImgxV3(original, key) {
    const header = Buffer.alloc(13);
    header.set([73, 77, 71, 88, 3]);
    header.writeUInt32BE(width, 5);
    header.writeUInt32BE(height, 9);
    const iv = crypto.randomBytes(12);
    const aad = Buffer.from(['IMGX-v3', imageId, storageKey, width, height].join('.'), 'utf-8');
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([cipher.update(original), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([header, iv, ciphertext, tag]);
  }

  test('round-trips an AES-GCM payload using grant.contentKey', () => {
    const key = crypto.randomBytes(32);
    const original = Buffer.from('RIFF\x00\x00\x00\x00WEBPVP8 v3-fake-image-payload', 'latin1');
    const blob = encodeImgxV3(original, key);
    const grant = {
      imageId,
      contentKey: Buffer.from(key).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
    };

    const decoded = decodeImgxPayload(blob, grant, storageKey);
    expect(Buffer.compare(decoded, original)).toBe(0);
    expect(decoded.slice(0, 4).toString()).toBe('RIFF');
  });

  test('fails AES-GCM auth when the storage key (AAD) is wrong', () => {
    const key = crypto.randomBytes(32);
    const blob = encodeImgxV3(Buffer.from('payload-bytes'), key);
    const grant = {
      imageId,
      contentKey: Buffer.from(key).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
    };
    expect(() => decodeImgxPayload(blob, grant, 'chapters/wrong/key.js')).toThrow();
  });

  test('rejects a v3 payload that is too short to hold iv + tag', () => {
    const tiny = Buffer.alloc(20);
    tiny.set([73, 77, 71, 88, 3]);
    tiny.writeUInt32BE(width, 5);
    tiny.writeUInt32BE(height, 9);
    expect(() => decodeImgxPayload(tiny, { imageId, contentKey: toBase64Url(new Uint8Array(32)) }, storageKey)).toThrow(/empty/i);
  });
});

describe('MoeTruyen IMGX reader config parsing', () => {
  const initialPages = [
    { pageIndex: 0, pageNumber: 1, storageKey: 'chapters/m-1/ch-1/001.js', downloadUrl: 'https://i.truyen.moe/a.js', grant: { wrappedDecodeKey: 'x' } },
  ];
  const proofToken = 'imgx-page-access-proof-v1.39090.1780643484083.7bd29284.QzeHlPIppa';
  const html = `
    <div data-reader-lazy-pages
         data-reader-imgx-access-url="/manga/1-foo/chapters/30/page-access"
         data-reader-imgx-render-mode="single"
         data-reader-imgx-proof-token="${proofToken}"
         data-reader-imgx-initial-pages="${encodeURIComponent(JSON.stringify(initialPages))}">
      <img class="page-media" data-page-index="0" data-imgx-page-index="0" data-imgx-access-url="/manga/1-foo/chapters/30/page-access" />
      <img class="page-media" data-page-index="1" data-imgx-page-index="1" data-imgx-access-url="/manga/1-foo/chapters/30/page-access" />
      <img class="page-media" data-page-index="2" data-imgx-page-index="2" data-imgx-access-url="/manga/1-foo/chapters/30/page-access" />
    </div>`;

  test('detects IMGX chapters and resolves the access URL', () => {
    const config = parseImgxReaderConfig(html, 'https://moetruyen.net/manga/1-foo/chapters/30');
    expect(config).not.toBeNull();
    expect(config.accessUrl).toBe('https://moetruyen.net/manga/1-foo/chapters/30/page-access');
    expect(config.totalPages).toBe(3);
    expect(config.initialPages).toHaveLength(1);
  });

  test('extracts the reader proof token', () => {
    const config = parseImgxReaderConfig(html, 'https://moetruyen.net/manga/1-foo/chapters/30');
    expect(config.proofToken).toBe(proofToken);
  });

  test('returns null for non-IMGX chapters', () => {
    const plain = '<div data-reader-lazy-pages><img class="page-media" src="https://i.truyen.moe/x.webp" data-page-index="0" /></div>';
    expect(parseImgxReaderConfig(plain, 'https://moetruyen.net/x')).toBeNull();
  });

  test('uses data-reader-total-pages and unique imgx indexes, not duplicate attribute matches', () => {
    const chapterHtml = `
      <div data-reader-lazy-pages
           data-reader-total-pages="14"
           data-reader-imgx-access-url="/manga/898-foo/chapters/196/page-access"
           data-reader-imgx-proof-token="${proofToken}"
           data-reader-imgx-initial-pages="${encodeURIComponent(JSON.stringify([grantPage(13)]))}">
        <img class="page-media" data-imgx-page-index="13" />
        <img class="page-media" data-imgx-page-index="0" />
        <img class="page-media" data-imgx-page-index="1" />
        <img class="page-media" data-imgx-page-index="2" />
        <img class="page-media" data-imgx-page-index="3" />
        <img class="page-media" data-imgx-page-index="4" />
        <img class="page-media" data-imgx-page-index="5" />
        <img class="page-media" data-imgx-page-index="6" />
        <img class="page-media" data-imgx-page-index="7" />
        <img class="page-media" data-imgx-page-index="8" />
        <img class="page-media" data-imgx-page-index="9" />
        <img class="page-media" data-imgx-page-index="10" />
        <img class="page-media" data-imgx-page-index="11" />
        <img class="page-media" data-imgx-page-index="12" />
        <img class="page-media" data-imgx-page-index="13" />
      </div>`;
    const config = parseImgxReaderConfig(chapterHtml, 'https://moetruyen.net/manga/898-foo/chapters/196');
    expect(config.totalPages).toBe(14);
  });

  test('counts unique imgx indexes when data-reader-total-pages is absent', () => {
    const chapterHtml = `
      <div data-reader-lazy-pages
           data-reader-imgx-access-url="/manga/898-foo/chapters/196/page-access"
           data-reader-imgx-proof-token="${proofToken}">
        <img class="page-media" data-imgx-page-index="13" />
        <img class="page-media" data-imgx-page-index="0" />
        <img class="page-media" data-imgx-page-index="1" />
        <img class="page-media" data-imgx-page-index="13" />
      </div>`;
    const config = parseImgxReaderConfig(chapterHtml, 'https://moetruyen.net/manga/898-foo/chapters/196');
    expect(config.totalPages).toBe(3);
  });
});

describe('MoeTruyen IMGX page-access proof', () => {
  const token = 'imgx-page-access-proof-v1.39090.1780643484083.abc123.sigsig';
  const accessUrl = 'https://moetruyen.net/manga/1-foo/chapters/30/page-access';
  const userAgent = 'Mozilla/5.0 test-agent';

  test('throws when the proof token is missing', () => {
    expect(() => buildPageAccessProof({ accessUrl, userAgent, pageIndexes: [0] })).toThrow(/token/i);
  });

  test('produces a verifiable SHA-256 proof matching the reader algorithm', () => {
    const result = buildPageAccessProof({ token, accessUrl, userAgent, pageIndexes: [0, 1, 2] });
    expect(result.version).toBe(PROOF_VERSION);
    expect(result.token).toBe(token);
    expect(typeof result.issuedAt).toBe('number');
    expect(result.nonce).toMatch(/^[0-9a-f]{32}$/);

    // Recompute exactly as the server would (reader.js gn/_n) and compare.
    const tuple = [
      PROOF_VERSION,
      token,
      '/manga/1-foo/chapters/30/page-access',
      userAgent,
      '0,1,2',
      result.issuedAt,
      result.nonce,
    ].join('\n');
    const expected = crypto
      .createHash('sha256')
      .update(Buffer.from(tuple, 'utf-8'))
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(result.proof).toBe(expected);
  });

  test('hashes only the access URL pathname, not the full URL', () => {
    const withQuery = buildPageAccessProof({ token, accessUrl: `${accessUrl}?x=1`, userAgent, pageIndexes: [0] });
    const tuple = [PROOF_VERSION, token, '/manga/1-foo/chapters/30/page-access', userAgent, '0', withQuery.issuedAt, withQuery.nonce].join('\n');
    const expected = crypto.createHash('sha256').update(Buffer.from(tuple, 'utf-8')).digest('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(withQuery.proof).toBe(expected);
  });
});

function grantPage(pageIndex) {
  return {
    pageIndex,
    pageNumber: pageIndex + 1,
    storageKey: `${pageIndex}.js`,
    downloadUrl: `https://i.truyen.moe/${pageIndex}.js`,
    grant: { wrappedDecodeKey: 'x' },
  };
}

describe('MoeTruyen IMGX page-access grant batches', () => {
  const accessUrl = 'https://moetruyen.net/manga/898-foo/chapters/196/page-access';
  const userAgent = 'Mozilla/5.0 test-agent';
  const proofToken = 'imgx-page-access-proof-v1.60725.token';
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('does not re-request an already-granted initial page (avoids 403 that drops the rest of the batch)', async () => {
    const requestedBatches = [];
    global.fetch = jest.fn(async (_url, init) => {
      const body = JSON.parse(init.body);
      requestedBatches.push(body.pageIndexes);
      // Live server: re-requesting a page already in initial-pages returns
      // 403 "Reader JS proof required." and rejects the whole batch.
      if (body.pageIndexes.includes(13)) {
        return {
          ok: false,
          status: 403,
          json: async () => ({ ok: false, error: 'Reader JS proof required.' }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          pages: body.pageIndexes.map((pageIndex) => grantPage(pageIndex)),
        }),
      };
    });

    const pages = await fetchImgxPageGrants({
      accessUrl,
      totalPages: 14,
      initialPages: [grantPage(13)],
      referer: 'https://moetruyen.net/manga/898-foo/chapters/196',
      userAgent,
      proofToken,
      cookie: 'bfang.sid=test',
    });

    expect(requestedBatches).toEqual([
      [0, 1, 2, 3, 4],
      [5, 6, 7, 8, 9],
      [10, 11, 12],
    ]);
    expect(requestedBatches.some((batch) => batch.includes(13))).toBe(false);
    expect(pages.map((p) => p.pageIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  });

  test('skips the initial page when it sits in the first batch', async () => {
    const requestedBatches = [];
    global.fetch = jest.fn(async (_url, init) => {
      const body = JSON.parse(init.body);
      requestedBatches.push(body.pageIndexes);
      if (body.pageIndexes.includes(0)) {
        return {
          ok: false,
          status: 403,
          json: async () => ({ ok: false, error: 'Reader JS proof required.' }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          pages: body.pageIndexes.map((pageIndex) => grantPage(pageIndex)),
        }),
      };
    });

    const pages = await fetchImgxPageGrants({
      accessUrl,
      totalPages: 3,
      initialPages: [grantPage(0)],
      userAgent,
      proofToken,
      cookie: 'bfang.sid=test',
    });

    expect(requestedBatches).toEqual([[1, 2]]);
    expect(pages.map((p) => p.pageIndex)).toEqual([0, 1, 2]);
  });

  test('throws when grants stay short of the site-declared page count', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 403,
      json: async () => ({ ok: false, error: 'Reader JS proof required.' }),
    }));

    await expect(
      fetchImgxPageGrants({
        accessUrl,
        totalPages: 14,
        initialPages: [grantPage(13)],
        userAgent,
        proofToken,
        cookie: 'bfang.sid=test',
      })
    ).rejects.toThrow(/1\/14.*proof required/i);
  });
});

describe('MoeTruyen IMGX modern reader config parsing', () => {
  const modernHtml = `
    <div data-reader-lazy-pages
         data-reader-total-pages="23"
         data-reader-imgx-access-url="/manga/2061-mihara/chapters/9/page-access"
         data-reading-chapter-id="74240">
      <script>
        readerAccess = createImgxReaderAccess({
          requestPath: "/manga/2061-mihara/chapters/9/page-access",
          chapterId: 74240,
          bootstrapUrl: "/manga/2061-mihara/chapters/9/reader-instance/test-uuid-12345",
          initialIndexes: [22]
        });
      </script>
    </div>
  `;

  test('parses modern reader config with bootstrapUrl, chapterId, initialIndexes', () => {
    const config = parseImgxReaderConfig(modernHtml, 'https://moetruyen.net/manga/2061-mihara/chapters/9');
    expect(config).not.toBeNull();
    expect(config.accessUrl).toBe('https://moetruyen.net/manga/2061-mihara/chapters/9/page-access');
    expect(config.bootstrapUrl).toBe('https://moetruyen.net/manga/2061-mihara/chapters/9/reader-instance/test-uuid-12345');
    expect(config.chapterId).toBe(74240);
    expect(config.totalPages).toBe(23);
    expect(config.initialIndexes).toEqual([22]);
  });
});

describe('MoeTruyen IMGX reader channel v1', () => {
  test('creates a valid ECDH P-256 reader channel and can decrypt sealed payload', async () => {
    const channel = await createImgxReaderChannel();
    expect(channel.publicKey).toBeTruthy();
    expect(typeof channel.open).toBe('function');

    // Simulate server encrypting a payload to the client channel public key
    const subtle = crypto.subtle || crypto.webcrypto?.subtle || globalThis.crypto?.subtle;
    const serverKeyPair = await subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits']
    );
    const serverPubRaw = await subtle.exportKey('raw', serverKeyPair.publicKey);
    const serverPubKeyStr = Buffer.from(serverPubRaw).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const clientPubBytes = Buffer.from(channel.publicKey.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    const clientKey = await subtle.importKey('raw', clientPubBytes, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const sharedBits = await subtle.deriveBits({ name: 'ECDH', public: clientKey }, serverKeyPair.privateKey, 256);
    const hkdfKey = await subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);

    const proof = 'test-bootstrap-proof-string';
    const encoder = new TextEncoder();
    const aesKey = await subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: encoder.encode(proof), info: encoder.encode(CHANNEL_VERSION) },
      hkdfKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );

    const testPages = [{ pageIndex: 0, pageNumber: 1, downloadUrl: 'https://i.truyen.moe/1.js', grant: { test: true } }];
    const plainBytes = encoder.encode(JSON.stringify(testPages));
    const iv = crypto.randomBytes(12);
    const aad = encoder.encode(JSON.stringify([CHANNEL_VERSION, channel.publicKey, serverPubKeyStr, proof]));
    const cipherBuffer = await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 }, aesKey, plainBytes);

    const sealed = {
      version: CHANNEL_VERSION,
      publicKey: serverPubKeyStr,
      iv: Buffer.from(iv).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
      ciphertext: Buffer.from(cipherBuffer).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
    };

    const decrypted = await channel.open(sealed, proof);
    expect(decrypted).toEqual(testPages);
  });

  test('buildImgxPageAccessClientProofPayload formats JSON tuple correctly', () => {
    const payload = buildImgxPageAccessClientProofPayload({
      readerInstanceId: 'inst-1',
      chapterId: 100,
      requestPath: '/path',
      pageIndexes: [0, 1],
      issuedAt: 1234567,
      sequence: 1,
      publicKeyHash: 'abc',
    });
    expect(JSON.parse(payload)).toEqual([
      PROOF_VERSION_V3,
      'inst-1',
      100,
      '/path',
      '',
      [0, 1],
      1234567,
      1,
      'abc',
    ]);
  });

  describe('isImgxEncrypted detection', () => {
    test('returns false for falsy or invalid HTML input', () => {
      expect(isImgxEncrypted(null)).toBe(false);
      expect(isImgxEncrypted('')).toBe(false);
      expect(isImgxEncrypted(123)).toBe(false);
    });

    test('returns false for unencrypted chapter with direct image URLs', () => {
      const unencryptedHtml = `
        <div data-reader-lazy-pages>
          <img class="page-media" data-page-index="0" src="https://i.truyen.moe/chapters/manga-69/ch-1/001.webp" />
          <img class="page-media" data-page-index="1" src="https://i.truyen.moe/chapters/manga-69/ch-1/002.webp" />
        </div>
      `;
      expect(isImgxEncrypted(unencryptedHtml, 'https://moetruyen.net/manga/69/chapters/1')).toBe(false);
    });

    test('returns true for encrypted chapter with accessUrl and placeholder SVGs', () => {
      const encryptedHtml = `
        <div data-reader-imgx-access-url="/manga/69/chapters/41/page-access"
             data-reader-imgx-initial-pages="%5B%7B%22pageIndex%22%3A33%2C%22downloadUrl%22%3A%22https%3A%2F%2Fi.truyen.moe%2F0.js%22%7D%5D">
          <img class="page-media" data-page-index="0" src="data:image/svg+xml,%3Csvg%3E%3C/svg%3E" />
          <img class="page-media" data-page-index="1" src="data:image/svg+xml,%3Csvg%3E%3C/svg%3E" />
        </div>
      `;
      expect(isImgxEncrypted(encryptedHtml, 'https://moetruyen.net/manga/69/chapters/41')).toBe(true);
    });

    test('returns true when HTML has imgx-reader.js script and 0 static images', () => {
      const encryptedHtml = `
        <html>
          <head><script src="https://cdn.jsdelivr.net/npm/imgx-reader.js"></script></head>
          <body><div class="reader-container"></div></body>
        </html>
      `;
      expect(isImgxEncrypted(encryptedHtml, 'https://moetruyen.net/manga/69/chapters/41')).toBe(true);
    });

    test('returns false for regular manga site without IMGX protection', () => {
      const regularHtml = `
        <html>
          <body>
            <img src="https://example.com/ch1/01.jpg" />
            <img src="https://example.com/ch1/02.jpg" />
          </body>
        </html>
      `;
      expect(isImgxEncrypted(regularHtml, 'https://example.com/ch1')).toBe(false);
    });
  });
});


