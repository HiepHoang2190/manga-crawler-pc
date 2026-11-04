/**
 * MoeTruyen IMGX reader channel — page-key channel (`channelKeys`), inline worker
 * INIT config parsing, grant fetching with `openPageGrant`, and the end-to-end
 * `decodeImgxImage` orchestrator (PNG carrier -> v3 decoy -> IMX4 -> v4).
 *
 * A tiny fake server is implemented in-test with the same WebCrypto primitives
 * (ECDH P-256 + HKDF + AES-GCM) so no network access is required.
 */
const crypto = require('crypto');
const sharp = require('sharp');
const {
  createImgxReaderChannel,
  parseImgxReaderConfig,
  fetchImgxChannelGrants,
  decodeImgxImage,
  bytesToBase64Url,
  base64UrlToBytes,
  CHANNEL_VERSION,
  PAGE_KEY_VERSION,
  RENEWAL_VERSION,
} = require('../../../download/connector/moetruyenImgx');
const { PNG_CARRIER_MARKER } = require('../../../download/connector/moetruyenImgxCarrier');
const { readyFixtures, buildV4Fixture, buildGrant, fakeWebp, IMAGE_ID, STORAGE_KEY } = require('./fixtures/imgxV4Fixtures');

beforeAll(() => readyFixtures());

const subtle = crypto.webcrypto.subtle;
const encoder = new TextEncoder();

// ---------------------------------------------------------------------------
// Fake IMGX server
// ---------------------------------------------------------------------------

async function sealFor(clientPublicKey, proof, payloadObject, { pageKeyItems = [] } = {}) {
  const serverKeyPair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const serverPub = bytesToBase64Url(new Uint8Array(await subtle.exportKey('raw', serverKeyPair.publicKey)));
  const clientKey = await subtle.importKey('raw', base64UrlToBytes(clientPublicKey), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = await subtle.deriveBits({ name: 'ECDH', public: clientKey }, serverKeyPair.privateKey, 256);
  const material = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  const channelKey = await subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: encoder.encode(proof), info: encoder.encode(CHANNEL_VERSION) },
    material, { name: 'AES-GCM', length: 256 }, false, ['encrypt'],
  );
  const binding = [clientPublicKey, serverPub, proof];

  // Seal per-page key material into grant.channelKeys when requested.
  if (pageKeyItems.length) {
    const pageKey = await subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: encoder.encode(proof), info: encoder.encode(PAGE_KEY_VERSION) },
      material, { name: 'AES-GCM', length: 256 }, false, ['encrypt'],
    );
    for (const { page, keys } of pageKeyItems) {
      const iv = crypto.randomBytes(12);
      const aad = encoder.encode(JSON.stringify([
        PAGE_KEY_VERSION, binding, page.pageIndex, page.storageKey,
        page.grant.imageId, page.grant.issuedAt, page.grant.expiresAt, page.grant.nonce, page.grant.signature,
      ]));
      const ct = await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 }, pageKey, encoder.encode(JSON.stringify(keys)));
      page.grant.channelKeys = { version: PAGE_KEY_VERSION, iv: bytesToBase64Url(iv), ciphertext: bytesToBase64Url(new Uint8Array(ct)) };
    }
  }

  const iv = crypto.randomBytes(12);
  const aad = encoder.encode(JSON.stringify([CHANNEL_VERSION, clientPublicKey, serverPub, proof]));
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 }, channelKey, encoder.encode(JSON.stringify(payloadObject)));
  return { version: CHANNEL_VERSION, publicKey: serverPub, iv: bytesToBase64Url(iv), ciphertext: bytesToBase64Url(new Uint8Array(ct)) };
}

/** Grant as returned by the real server: hashes + signature, keys sealed separately. */
function serverGrant(v4Key) {
  const full = buildGrant(v4Key);
  const { wrappedV4Key, ...publicPart } = full;
  return { publicPart: { ...publicPart, v4KeyHash: 'x', channelKeys: null }, keys: { wrappedV4Key, wrappedDecodeKey: 'd', wrappedContentKey: 'c' } };
}

function makeMedia(count) {
  const media = [];
  for (let i = 0; i < count; i += 1) {
    media.push({
      pageIndex: i,
      pageNumber: i + 1,
      storageKey: `chapters/manga-1/ch-2/${String(i + 1).padStart(3, '0')}_abc.js`,
      downloadUrl: `https://i.truyen.moe/chapters/manga-1/ch-2/${String(i + 1).padStart(3, '0')}_abc.js?t=1`,
      primaryUrl: `https://p21.example/obj/${i}`,
    });
  }
  return media;
}

/**
 * Build a fake fetch implementing bootstrap, /renew and page-access.
 * `options.expireOnce` makes the first page-access reply `reader_instance_expired`.
 */
function createFakeServer({ media, chapterId, initialIndexes, expireOnce = false, v4Key = crypto.randomBytes(32) }) {
  const calls = [];
  const readerInstanceId = 'a'.repeat(48);
  const secret = crypto.randomBytes(32);
  let expired = expireOnce;
  const json = (status, body) => ({ ok: status < 400, status, json: async () => body });

  const pageFor = (index) => {
    const m = media.find((x) => x.pageIndex === index);
    const { publicPart, keys } = serverGrant(v4Key);
    return { page: { pageIndex: m.pageIndex, pageNumber: m.pageNumber, storageKey: m.storageKey, downloadUrl: m.downloadUrl, grant: publicPart }, keys };
  };

  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body, headers: init.headers });
    if (/\/reader-instance\/[^/]+$/.test(url)) {
      const items = (body.initialPageIndexes || []).map(pageFor);
      const sealedCapability = await sealFor(body.readerPublicKey, body.bootstrapProof, [{ readerInstanceId, chapterId, secret: bytesToBase64Url(secret) }]);
      const sealedInitialPages = await sealFor(body.readerPublicKey, body.bootstrapProof, items.map((i) => i.page), { pageKeyItems: items });
      return json(200, { ok: true, readerInstanceId, serverTime: Date.now(), sealedCapability, sealedInitialPages });
    }
    if (/\/renew$/.test(url)) {
      if (body.pageAccessProof?.version !== RENEWAL_VERSION) return json(403, { ok: false, code: 'bad_renewal' });
      expired = false;
      return json(200, { ok: true, serverTime: Date.now() });
    }
    if (/\/page-access$/.test(url)) {
      if (expired) return json(403, { ok: false, code: 'reader_instance_expired' });
      const proof = body.pageAccessProof;
      // Verify the HMAC proof like the server would.
      const payload = JSON.stringify([proof.version, proof.readerInstanceId, chapterId, new URL(url).pathname, '', body.pageIndexes, proof.issuedAt, proof.sequence,
        crypto.createHash('sha256').update(base64UrlToBytes(body.readerPublicKey)).digest('hex')]);
      const expect = bytesToBase64Url(crypto.createHmac('sha256', secret).update(payload).digest());
      if (expect !== proof.proof) return json(403, { ok: false, code: 'reader_proof_invalid' });
      const items = body.pageIndexes.map(pageFor);
      const sealedPages = await sealFor(body.readerPublicKey, proof.proof, items.map((i) => i.page), { pageKeyItems: items });
      return json(200, { ok: true, sealedPages });
    }
    return json(404, { ok: false });
  };
  return { fetchImpl, calls, v4Key, readerInstanceId };
}

// ---------------------------------------------------------------------------

describe('reader channel openPageGrant', () => {
  test('opens channelKeys sealed for a page and merges key fields into the grant', async () => {
    const channel = await createImgxReaderChannel();
    const proof = bytesToBase64Url(crypto.randomBytes(32));
    const { publicPart, keys } = serverGrant(crypto.randomBytes(32));
    const page = { pageIndex: 3, pageNumber: 4, storageKey: STORAGE_KEY, downloadUrl: 'https://i.truyen.moe/x.js', grant: publicPart };
    const sealed = await sealFor(channel.publicKey, proof, [page], { pageKeyItems: [{ page, keys }] });

    const [opened] = await channel.open(sealed, proof);
    expect(opened.grant.channelKeys.version).toBe(PAGE_KEY_VERSION);
    const grant = await channel.openPageGrant(opened);
    expect(grant.wrappedV4Key).toBe(keys.wrappedV4Key);
    expect(grant.wrappedDecodeKey).toBe('d');
    expect(grant.wrappedContentKey).toBe('c');
    expect(grant.channelKeys).toBeUndefined();
    expect(grant.imageId).toBe(IMAGE_ID);
  });

  test('rejects a page that was not opened through this channel or has no channelKeys', async () => {
    const channel = await createImgxReaderChannel();
    await expect(channel.openPageGrant({ pageIndex: 0, grant: { channelKeys: { version: PAGE_KEY_VERSION, iv: 'AAAAAAAAAAAAAAAA', ciphertext: 'AA' } } })).rejects.toThrow(/page key channel required/);
    await expect(channel.openPageGrant({ pageIndex: 0, grant: {} })).rejects.toThrow(/page key channel required/);
  });

  test('fails when page binding fields are tampered (AAD mismatch)', async () => {
    const channel = await createImgxReaderChannel();
    const proof = bytesToBase64Url(crypto.randomBytes(32));
    const { publicPart, keys } = serverGrant(crypto.randomBytes(32));
    const page = { pageIndex: 3, storageKey: STORAGE_KEY, downloadUrl: 'u', grant: publicPart };
    const sealed = await sealFor(channel.publicKey, proof, [page], { pageKeyItems: [{ page, keys }] });
    const [opened] = await channel.open(sealed, proof);
    opened.storageKey = 'chapters/other.js';
    await expect(channel.openPageGrant(opened)).rejects.toThrow();
  });
});

describe('parseImgxReaderConfig with inline worker INIT config', () => {
  const inlineHtml = `
    <html><body class="reader-page">
    <div data-reader-lazy-pages data-reader-total-pages="3" data-reader-imgx-access-url="/manga/1099-gs/chapters/113/page-access" data-reading-chapter-id="76541">
      <img class="page-media" data-page-index="0" data-imgx-page-index="0" src="data:image/svg+xml,x">
      <img class="page-media" data-page-index="1" data-imgx-page-index="1" src="data:image/svg+xml,x">
      <img class="page-media" data-page-index="2" data-imgx-page-index="2" src="data:image/svg+xml,x">
    </div>
    <script nonce="abc">(() => {
      const protectedCanvases = new WeakSet();
      worker = new Worker("/imgx-worker.js?pwa=network", { type: "module" });
      worker.postMessage({
        type: "INIT",
        config: {
          requestPath: "/manga/1099-gs/chapters/113/page-access",
          chapterId: 76541,
          bootstrapUrl: "/manga/1099-gs/chapters/113/reader-instance/deadbeef",
          initialIndexes: [2],
          media: [
            { pageIndex: 2, pageNumber: 1, storageKey: "0.js", downloadUrl: "https://i.truyen.moe/0.js" },
            {
              pageIndex: 0,
              pageNumber: 1,
              storageKey: "chapters/manga-1099/ch-113/001_IxiOy.js",
              downloadUrl: "https://i.truyen.moe/chapters/manga-1099/ch-113/001_IxiOy.js?t=1790740018794",
              primaryUrl:
                "https://p21-ad-sg.ibyteimg.com/obj/tos/286b4370eb4547da8e9f111b8e08b6e2",
            },
            { pageIndex: 1, pageNumber: 2, storageKey: "chapters/manga-1099/ch-113/002_IxiOy.js", downloadUrl: "https://i.truyen.moe/chapters/manga-1099/ch-113/002_IxiOy.js?t=1790740018794", primaryUrl: "https://p21-ad-sg.ibyteimg.com/obj/tos/5fa" },
          ],
          connection: {
            saveData: Boolean(navigator.connection?.saveData),
            effectiveType: navigator.connection?.effectiveType || "",
          },
          viewport: Math.max(innerWidth, innerHeight),
          cores: navigator.hardwareConcurrency || 4,
        },
      });
      lock(globalThis, "__IMGX_RUNTIME__", freeze({}));
    })();</script>
    </body></html>`;

  test('extracts requestPath, bootstrapUrl, chapterId, initialIndexes and media[]', () => {
    const cfg = parseImgxReaderConfig(inlineHtml, 'https://moetruyen.net/manga/1099-gs/chapters/113');
    expect(cfg).not.toBeNull();
    expect(cfg.accessUrl).toBe('https://moetruyen.net/manga/1099-gs/chapters/113/page-access');
    expect(cfg.bootstrapUrl).toBe('https://moetruyen.net/manga/1099-gs/chapters/113/reader-instance/deadbeef');
    expect(cfg.chapterId).toBe(76541);
    expect(cfg.initialIndexes).toEqual([2]);
    expect(cfg.totalPages).toBe(3);
    expect(cfg.media).toHaveLength(3);
    expect(cfg.media[1]).toEqual({
      pageIndex: 0,
      pageNumber: 1,
      storageKey: 'chapters/manga-1099/ch-113/001_IxiOy.js',
      downloadUrl: 'https://i.truyen.moe/chapters/manga-1099/ch-113/001_IxiOy.js?t=1790740018794',
      primaryUrl: 'https://p21-ad-sg.ibyteimg.com/obj/tos/286b4370eb4547da8e9f111b8e08b6e2',
    });
    expect(cfg.locked).toBe(false);
  });

  test('does not execute arbitrary code from the inline script (media parsed as data only)', () => {
    const evil = inlineHtml.replace('media: [', 'media: [ (globalThis.__pwned = 1, {}),');
    const cfg = parseImgxReaderConfig(evil, 'https://moetruyen.net/manga/1099-gs/chapters/113');
    expect(globalThis.__pwned).toBeUndefined();
    // Either media parsing fails safely (empty) or the bogus entry is filtered out.
    expect(Array.isArray(cfg.media)).toBe(true);
    expect(cfg.media.every((m) => m && m.storageKey && m.downloadUrl)).toBe(true);
  });

  test('flags an interaction-locked chapter without a runtime config', () => {
    const lockedHtml = `
      <html><body class="reader-page">
        <h1>Chương 264</h1>
        <p>Chương này đang bật chế độ tăng tương tác. Bạn cần có bình luận ở chương trước để mở đọc.</p>
        <script src="/reader.js"></script>
      </body></html>`;
    const cfg = parseImgxReaderConfig(lockedHtml, 'https://moetruyen.net/manga/214-ww/chapters/264');
    expect(cfg).not.toBeNull();
    expect(cfg.locked).toBe(true);
    expect(cfg.lockedReason).toMatch(/tăng tương tác/);
    expect(cfg.media).toEqual([]);
  });
});

describe('fetchImgxChannelGrants with page-key channel and media[]', () => {
  const chapterId = 76541;
  const accessUrl = 'https://moetruyen.net/manga/1099-gs/chapters/113/page-access';
  const bootstrapUrl = 'https://moetruyen.net/manga/1099-gs/chapters/113/reader-instance/deadbeef';

  test('returns every media page with an opened grant (wrappedV4Key) and primaryUrl', async () => {
    const media = makeMedia(13);
    const server = createFakeServer({ media, chapterId, initialIndexes: [12] });
    const pages = await fetchImgxChannelGrants({
      accessUrl, bootstrapUrl, chapterId, initialIndexes: [12], media,
      referer: 'https://moetruyen.net/manga/1099-gs/chapters/113', userAgent: 'UA', cookie: 'bfang.sid=1', fetchImpl: server.fetchImpl,
    });
    expect(pages).toHaveLength(13);
    expect(pages.map((p) => p.pageIndex)).toEqual([...Array(13).keys()]);
    for (const p of pages) {
      expect(typeof p.grant.wrappedV4Key).toBe('string');
      expect(p.grant.channelKeys).toBeUndefined();
      expect(p.primaryUrl).toBe(`https://p21.example/obj/${p.pageIndex}`);
      expect(p.storageKey).toBe(media[p.pageIndex].storageKey);
    }
    // 1 bootstrap + 2 page-access batches (0-9, 10-11); page 12 came from initial pages.
    const accessCalls = server.calls.filter((c) => c.url === accessUrl);
    expect(accessCalls).toHaveLength(2);
    expect(accessCalls[0].body.pageIndexes).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(accessCalls[1].body.pageIndexes).toEqual([10, 11]);
    expect(accessCalls[0].headers.Cookie).toBe('bfang.sid=1');
  });

  test('renews the reader instance on reader_instance_expired and retries the batch', async () => {
    const media = makeMedia(4);
    const server = createFakeServer({ media, chapterId, initialIndexes: [], expireOnce: true });
    const pages = await fetchImgxChannelGrants({ accessUrl, bootstrapUrl, chapterId, initialIndexes: [], media, fetchImpl: server.fetchImpl });
    expect(pages).toHaveLength(4);
    const urls = server.calls.map((c) => c.url);
    expect(urls.filter((u) => u.endsWith('/renew'))).toHaveLength(1);
    expect(urls.filter((u) => u === accessUrl)).toHaveLength(2);
  });

  test('throws a descriptive error when grants are incomplete', async () => {
    const media = makeMedia(3);
    const server = createFakeServer({ media, chapterId, initialIndexes: [] });
    const failing = async (url, init) => (url === accessUrl ? { ok: false, status: 500, json: async () => ({ ok: false, error: 'boom' }) } : server.fetchImpl(url, init));
    await expect(fetchImgxChannelGrants({ accessUrl, bootstrapUrl, chapterId, initialIndexes: [], media, fetchImpl: failing }))
      .rejects.toThrow(/IMGX access incomplete: 0\/3 pages \(boom\)/);
  });
});

describe('decodeImgxImage orchestrator', () => {
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

  /** v3 layer encoder (AES-256-GCM) around arbitrary bytes, keyed by grant.contentKey. */
  function encodeV3(original, key, imageId, storageKey, width = 1100, height = 1580) {
    const header = Buffer.alloc(13);
    header.set([73, 77, 71, 88, 3]);
    header.writeUInt32BE(width, 5);
    header.writeUInt32BE(height, 9);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(['IMGX-v3', imageId, storageKey, width, height].join('.'), 'utf-8'));
    return Buffer.concat([header, iv, cipher.update(original), cipher.final(), cipher.getAuthTag()]);
  }

  async function pngCarrier(payload) {
    const digest = crypto.createHash('sha256').update(payload).digest();
    const lenBE = Buffer.alloc(4);
    lenBE.writeUInt32BE(payload.length);
    const stream = Buffer.concat([Buffer.from(PNG_CARRIER_MARKER, 'latin1'), lenBE, digest, payload]);
    const w = Math.ceil(Math.sqrt(Math.ceil(stream.length / 3)));
    const h = Math.ceil(stream.length / 3 / w);
    const rgb = Buffer.alloc(w * h * 3);
    stream.copy(rgb, 0);
    return sharp(rgb, { raw: { width: w, height: h, channels: 3 } }).png({ compressionLevel: 1 }).toBuffer();
  }

  test('PNG carrier -> v3 decoy WebP -> IMX4 chunk -> v4 (p10) -> original WebP', async () => {
    const v4Key = crypto.randomBytes(32);
    const v3Key = crypto.randomBytes(32);
    const original = fakeWebp(3000);
    const { payload: v4Payload } = buildV4Fixture({ profile: 'p10', plain: original, v4Key });
    const decoy = riffWebp([['VP8X', Buffer.alloc(10)], ['VP8 ', Buffer.alloc(200)], ['IMX4', v4Payload]]);
    const v3Blob = encodeV3(decoy, v3Key, IMAGE_ID, STORAGE_KEY);
    const grant = { ...buildGrant(v4Key), contentKey: bytesToBase64Url(v3Key) };

    const fromBinary = await decodeImgxImage(v3Blob, grant, STORAGE_KEY);
    expect(fromBinary.equals(original)).toBe(true);
    const fromPng = await decodeImgxImage(await pngCarrier(v3Blob), grant, STORAGE_KEY);
    expect(fromPng.equals(original)).toBe(true);
  });

  test('plain v3 WebP without IMX4 is returned as-is; direct v4 payload is decoded', async () => {
    const v4Key = crypto.randomBytes(32);
    const v3Key = crypto.randomBytes(32);
    const plainWebp = riffWebp([['VP8 ', Buffer.alloc(200)]]);
    const grant = { ...buildGrant(v4Key), contentKey: bytesToBase64Url(v3Key) };
    expect((await decodeImgxImage(encodeV3(plainWebp, v3Key, IMAGE_ID, STORAGE_KEY), grant, STORAGE_KEY)).equals(plainWebp)).toBe(true);

    const original = fakeWebp(1234);
    const { payload } = buildV4Fixture({ profile: 'p01', plain: original, v4Key });
    expect((await decodeImgxImage(payload, grant, STORAGE_KEY)).equals(original)).toBe(true);
  });
});
