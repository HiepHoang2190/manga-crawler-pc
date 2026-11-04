/**
 * Bonus chapters on mfcdn2 reset Node/undici TLS (connection reset).
 * Chromium loads the same bytes (img.naturalWidth > 0). Image download
 * must use session.defaultSession.fetch, not global fetch.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('electron', () => ({
  app: {
    userAgentFallback:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
  },
  BrowserWindow: jest.fn(),
  session: {
    defaultSession: {
      fetch: jest.fn(),
    },
  },
  net: {
    fetch: jest.fn(),
  },
}));

const { session } = require('electron');
const { downloadMangaFireImageToFile } = require('../../../download/connector/mangaFireImageDownload');
const { service } = require('../../../platform/connectors/services/mangaFireService');

const MFCDN2_URL =
  'https://o48.mfcdn2.xyz/mf/12a3db61fa0a4f41a6c0794d91a7e8079436ad445dbda1b34b5a37edf329c58d235ddf1e496423eaff35/h/p.jpg';

describe('mangaFireImageDownload', () => {
  const temp_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mangafire-img-'));
  const original_fetch = global.fetch;

  afterAll(() => {
    fs.rmSync(temp_dir, { recursive: true, force: true });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn(async () => {
      throw new Error('Node fetch must not be used for MangaFire CDN');
    });
  });

  afterEach(() => {
    global.fetch = original_fetch;
  });

  test('downloadMangaFireImageToFile writes bytes from session.defaultSession.fetch', async () => {
    const jpeg_bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    session.defaultSession.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () =>
        jpeg_bytes.buffer.slice(jpeg_bytes.byteOffset, jpeg_bytes.byteOffset + jpeg_bytes.byteLength),
    });

    const file_path = path.join(temp_dir, 'page-001.jpg');
    const result = await downloadMangaFireImageToFile(MFCDN2_URL, file_path, {
      Referer: 'https://mangafire.to/',
    });

    expect(result.ok).toBe(true);
    expect(session.defaultSession.fetch).toHaveBeenCalledWith(
      MFCDN2_URL,
      expect.objectContaining({
        headers: expect.objectContaining({ Referer: 'https://mangafire.to/' }),
        redirect: 'follow',
      }),
    );
    const fetch_init = session.defaultSession.fetch.mock.calls[0][1];
    expect(fetch_init.headers.Cookie).toBeUndefined();
    expect(fetch_init.credentials).not.toBe('include');
    expect(require('electron').net.fetch).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(fs.readFileSync(file_path).slice(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  });

  test('downloadMangaFireImageToFile returns failure on HTTP 403', async () => {
    session.defaultSession.fetch.mockResolvedValue({
      ok: false,
      status: 403,
      arrayBuffer: async () => new ArrayBuffer(0),
    });

    const result = await downloadMangaFireImageToFile(
      MFCDN2_URL,
      path.join(temp_dir, 'fail.jpg'),
      {},
    );
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
  });

  test('MangaFireService.getReferer is origin-only so Chromium session.fetch is not cancelled', () => {
    const referer = service.getReferer({
      chapterUrl: 'https://mangafire.to/title/rjn5n-ase-to-sekkenn/chapter/9052168',
      mangaUrl: 'https://mangafire.to/manga/ase-to-sekkenn.rjn5n',
    });
    expect(referer).toBe('https://mangafire.to/');
  });

  test('downloadMangaFireImageToFile rewrites chapter-path Referer to origin', async () => {
    const jpeg_bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    session.defaultSession.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () =>
        jpeg_bytes.buffer.slice(jpeg_bytes.byteOffset, jpeg_bytes.byteOffset + jpeg_bytes.byteLength),
    });

    const file_path = path.join(temp_dir, 'page-referer.jpg');
    await downloadMangaFireImageToFile(MFCDN2_URL, file_path, {
      Referer: 'https://mangafire.to/title/rjn5n-ase-to-sekkenn/chapter/9052168',
    });

    expect(session.defaultSession.fetch).toHaveBeenCalledWith(
      MFCDN2_URL,
      expect.objectContaining({
        headers: expect.objectContaining({ Referer: 'https://mangafire.to/' }),
      }),
    );
  });

  test('downloadMangaFireImageToFile strips Origin so Chromium fetch is not CORS-blocked', async () => {
    const jpeg_bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    session.defaultSession.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () =>
        jpeg_bytes.buffer.slice(jpeg_bytes.byteOffset, jpeg_bytes.byteOffset + jpeg_bytes.byteLength),
    });

    await downloadMangaFireImageToFile(MFCDN2_URL, path.join(temp_dir, 'page-origin.jpg'), {
      Referer: 'https://mangafire.to/',
      Origin: 'https://mangafire.to',
    });

    const fetch_init = session.defaultSession.fetch.mock.calls[0][1];
    expect(fetch_init.headers.Origin).toBeUndefined();
    expect(fetch_init.headers.origin).toBeUndefined();
    expect(fetch_init.credentials).not.toBe('include');
  });

  test('MangaFireService.downloadImageWithRetry uses Chromium session.fetch', async () => {
    const jpeg_bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    session.defaultSession.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () =>
        jpeg_bytes.buffer.slice(jpeg_bytes.byteOffset, jpeg_bytes.byteOffset + jpeg_bytes.byteLength),
    });

    const file_path = path.join(temp_dir, 'svc-001.jpg');
    const result = await service.downloadImageWithRetry(
      MFCDN2_URL,
      file_path,
      { Referer: 'https://mangafire.to/', Origin: 'https://mangafire.to' },
      3,
      {},
      () => false,
    );

    expect(result.ok).toBe(true);
    expect(session.defaultSession.fetch).toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(fs.existsSync(file_path)).toBe(true);
  });
});
