/**
 * MoeTruyen service integration for the pure-HTTP IMGX v4 pipeline:
 * grants carry `primaryUrl`, images are decoded via `decodeImgxImage`,
 * locked chapters surface a clear error, and browser capture is only a fallback.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('../../../download/connector/htmlConnectorUtils', () => {
  const actual = jest.requireActual('../../../download/connector/htmlConnectorUtils');
  return { ...actual, fetchHtml: jest.fn(), getChromiumFetch: jest.fn(() => null) };
});
jest.mock('../../../download/connector/moetruyenImgx', () => {
  const actual = jest.requireActual('../../../download/connector/moetruyenImgx');
  return { ...actual, fetchImgxPageGrants: jest.fn(), decodeImgxImage: jest.fn() };
});
jest.mock('../../../platform/connectors/services/moetruyenBrowserCapture', () => ({
  downloadChapterWithBrowserCapture: jest.fn(),
}));

const { fetchHtml } = require('../../../download/connector/htmlConnectorUtils');
const { fetchImgxPageGrants, decodeImgxImage } = require('../../../download/connector/moetruyenImgx');
const { downloadChapterWithBrowserCapture } = require('../../../platform/connectors/services/moetruyenBrowserCapture');
const { HtmlConnectorService } = require('../../../platform/connectors/base/HtmlConnectorService');
const moeTruyenService = require('../../../platform/connectors/services/moeTruyenService');

const CHAPTER_URL = 'https://moetruyen.net/manga/1099-gs/chapters/113';

const imgxHtml = `
  <html><body class="reader-page">
  <div data-reader-lazy-pages data-reader-total-pages="3" data-reader-imgx-access-url="/manga/1099-gs/chapters/113/page-access" data-reading-chapter-id="76541">
    <img class="page-media" data-page-index="0" data-imgx-page-index="0" src="data:image/svg+xml,x">
    <img class="page-media" data-page-index="1" data-imgx-page-index="1" src="data:image/svg+xml,x">
    <img class="page-media" data-page-index="2" data-imgx-page-index="2" src="data:image/svg+xml,x">
  </div>
  <script src="/imgx-reader.js"></script>
  <script nonce="abc">(() => {
    worker.postMessage({
      type: "INIT",
      config: {
        requestPath: "/manga/1099-gs/chapters/113/page-access",
        chapterId: 76541,
        bootstrapUrl: "/manga/1099-gs/chapters/113/reader-instance/deadbeef",
        initialIndexes: [2],
        media: [
          { pageIndex: 2, pageNumber: 3, storageKey: "chapters/manga-1099/ch-113/003_IxiOy.js", downloadUrl: "https://i.truyen.moe/chapters/manga-1099/ch-113/003_IxiOy.js" },
          { pageIndex: 0, pageNumber: 1, storageKey: "chapters/manga-1099/ch-113/001_IxiOy.js", downloadUrl: "https://i.truyen.moe/chapters/manga-1099/ch-113/001_IxiOy.js", primaryUrl: "https://p21.ibyteimg.com/obj/tos/aaa" },
          { pageIndex: 1, pageNumber: 2, storageKey: "chapters/manga-1099/ch-113/002_IxiOy.js", downloadUrl: "https://i.truyen.moe/chapters/manga-1099/ch-113/002_IxiOy.js", primaryUrl: "https://p21.ibyteimg.com/obj/tos/bbb" },
        ],
      },
    });
  })();</script>
  </body></html>`;

const lockedHtml = `
  <html><body class="reader-page">
    <h1>Chương 264</h1>
    <p>Chương này đang bật chế độ tăng tương tác. Bạn cần có bình luận ở chương trước để mở đọc.</p>
    <script src="/reader.js"></script>
  </body></html>`;

function grantPage(pageIndex, storageKey, primaryUrl) {
  return {
    pageIndex,
    storageKey,
    downloadUrl: `https://i.truyen.moe/${storageKey}`,
    ...(primaryUrl ? { primaryUrl } : {}),
    grant: { wrappedV4Key: `k${pageIndex}`, imageId: `img${pageIndex}` },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  fetchHtml.mockResolvedValue({ ok: true, html: imgxHtml, cookie: 'bfang.sid=1' });
});

describe('fetchChapterImages (IMGX v4, pure HTTP)', () => {
  test('passes media to the grant fetcher and exposes primaryUrl on each page', async () => {
    fetchImgxPageGrants.mockResolvedValue([
      grantPage(0, 'chapters/manga-1099/ch-113/001_IxiOy.js', 'https://p21.ibyteimg.com/obj/tos/aaa'),
      grantPage(1, 'chapters/manga-1099/ch-113/002_IxiOy.js', 'https://p21.ibyteimg.com/obj/tos/bbb'),
      grantPage(2, 'chapters/manga-1099/ch-113/003_IxiOy.js'),
    ]);

    const images = await moeTruyenService.fetchChapterImages(CHAPTER_URL, 'https://moetruyen.net/');

    expect(fetchImgxPageGrants).toHaveBeenCalledTimes(1);
    const call = fetchImgxPageGrants.mock.calls[0][0];
    expect(call.media).toHaveLength(3);
    expect(call.cookie).toBe('bfang.sid=1');
    expect(call.bootstrapUrl).toBe('https://moetruyen.net/manga/1099-gs/chapters/113/reader-instance/deadbeef');

    expect(images).toHaveLength(3);
    expect(images[0]).toEqual({
      imageUrl: 'https://i.truyen.moe/chapters/manga-1099/ch-113/001_IxiOy.js',
      ext: 'webp',
      imgx: {
        grant: { wrappedV4Key: 'k0', imageId: 'img0' },
        storageKey: 'chapters/manga-1099/ch-113/001_IxiOy.js',
        primaryUrl: 'https://p21.ibyteimg.com/obj/tos/aaa',
      },
    });
    expect(images[2].imgx.primaryUrl).toBeUndefined();
  });

  test('throws a descriptive error for interaction-locked chapters', async () => {
    fetchHtml.mockResolvedValue({ ok: true, html: lockedHtml, cookie: '' });
    await expect(moeTruyenService.fetchChapterImages('https://moetruyen.net/manga/214-ww/chapters/264', 'https://moetruyen.net/'))
      .rejects.toThrow(/tăng tương tác/);
    expect(fetchImgxPageGrants).not.toHaveBeenCalled();
  });
});

describe('downloadImageWithRetry (IMGX v4)', () => {
  const service = moeTruyenService;
  let tmpDir;
  const originalFetch = global.fetch;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'moe-imgx-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    global.fetch = originalFetch;
  });

  function response(ok, bytes) {
    return { ok, status: ok ? 200 : 500, arrayBuffer: async () => Uint8Array.from(bytes).buffer };
  }

  test('decodes with decodeImgxImage and writes the result', async () => {
    global.fetch = jest.fn(async () => response(true, [1, 2, 3]));
    decodeImgxImage.mockResolvedValue(Buffer.from('RIFFwebp'));
    const filePath = path.join(tmpDir, '001.webp');
    const imageInfo = { imgx: { grant: { wrappedV4Key: 'k' }, storageKey: 'sk', primaryUrl: 'https://p21.ibyteimg.com/a' } };

    const result = await service.downloadImageWithRetry('https://i.truyen.moe/sk', filePath, {}, 3, imageInfo);

    expect(result).toEqual({ ok: true, fileSize: 8 });
    expect(fs.readFileSync(filePath, 'utf8')).toBe('RIFFwebp');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(decodeImgxImage).toHaveBeenCalledWith(expect.anything(), { wrappedV4Key: 'k' }, 'sk');
  });

  test('falls back to primaryUrl when the fallback CDN fails', async () => {
    global.fetch = jest.fn(async (url) => (url.startsWith('https://i.truyen.moe') ? response(false, []) : response(true, [9])));
    decodeImgxImage.mockResolvedValue(Buffer.from('ok'));
    const filePath = path.join(tmpDir, '002.webp');
    const imageInfo = { imgx: { grant: {}, storageKey: 'sk', primaryUrl: 'https://p21.ibyteimg.com/b' } };

    const result = await service.downloadImageWithRetry('https://i.truyen.moe/sk', filePath, {}, 3, imageInfo);

    expect(result.ok).toBe(true);
    expect(global.fetch.mock.calls.map((c) => c[0])).toEqual(['https://i.truyen.moe/sk', 'https://p21.ibyteimg.com/b']);
  });

  test('reports the decode error when every source fails', async () => {
    global.fetch = jest.fn(async () => response(true, [1]));
    decodeImgxImage.mockRejectedValue(new Error('IMGX v4 grant missing'));
    const filePath = path.join(tmpDir, '003.webp');
    const imageInfo = { imgx: { grant: {}, storageKey: 'sk', primaryUrl: 'https://p21.ibyteimg.com/c' } };

    const result = await service.downloadImageWithRetry('https://i.truyen.moe/sk', filePath, {}, 3, imageInfo);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/IMGX v4 grant missing/);
    expect(fs.existsSync(filePath)).toBe(false);
  });
});

describe('downloadChapter (IMGX branching)', () => {
  let baseSpy;
  beforeEach(() => {
    baseSpy = jest.spyOn(HtmlConnectorService.prototype, 'downloadChapter');
  });
  afterEach(() => baseSpy.mockRestore());

  test('uses the pure HTTP pipeline first and skips browser capture on success', async () => {
    baseSpy.mockResolvedValue({ ok: true, downloaded: 3 });
    const logs = [];
    const result = await moeTruyenService.downloadChapter({ chapterUrl: CHAPTER_URL, onLog: (m) => logs.push(m) }, 'MoeTruyen');
    expect(result).toEqual({ ok: true, downloaded: 3 });
    expect(baseSpy).toHaveBeenCalledTimes(1);
    expect(downloadChapterWithBrowserCapture).not.toHaveBeenCalled();
    expect(logs.join('\n')).toMatch(/IMGX/);
  });

  test('falls back to browser capture when the HTTP pipeline fails', async () => {
    baseSpy.mockResolvedValue({ ok: false, error: 'Failed to fetch images — IMGX access incomplete: 0/3 pages' });
    downloadChapterWithBrowserCapture.mockResolvedValue({ ok: true, captured: true });
    const result = await moeTruyenService.downloadChapter({ chapterUrl: CHAPTER_URL }, 'MoeTruyen');
    expect(result).toEqual({ ok: true, captured: true });
    expect(downloadChapterWithBrowserCapture).toHaveBeenCalledTimes(1);
    expect(downloadChapterWithBrowserCapture.mock.calls[0][1]).toMatchObject({ cookie: 'bfang.sid=1', connectorLabel: 'MoeTruyen' });
  });

  test('does not fall back when the user aborted', async () => {
    baseSpy.mockResolvedValue({ ok: false, aborted: true });
    const result = await moeTruyenService.downloadChapter({ chapterUrl: CHAPTER_URL }, 'MoeTruyen');
    expect(result).toEqual({ ok: false, aborted: true });
    expect(downloadChapterWithBrowserCapture).not.toHaveBeenCalled();
  });

  test('does not fall back for locked chapters', async () => {
    fetchHtml.mockResolvedValue({ ok: true, html: lockedHtml, cookie: '' });
    baseSpy.mockResolvedValue({ ok: false, error: 'Failed to fetch images — Chương bị khoá' });
    const result = await moeTruyenService.downloadChapter({ chapterUrl: CHAPTER_URL }, 'MoeTruyen');
    expect(result.ok).toBe(false);
    expect(downloadChapterWithBrowserCapture).not.toHaveBeenCalled();
  });
});
