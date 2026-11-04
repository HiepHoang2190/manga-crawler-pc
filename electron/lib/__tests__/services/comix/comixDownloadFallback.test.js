/**
 * Tests for ComixService image download fallback and cookie isolation.
 */
const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');
const fs = require('fs');
const path = require('path');

// Mock electron
jest.mock('electron', () => ({
  app: {
    userAgentFallback:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
  },
  net: { fetch: jest.fn() },
  BrowserWindow: jest.fn(),
  session: {
    defaultSession: {
      fetch: jest.fn(),
      cookies: {
        get: jest.fn(async () => [
          { name: 'session', value: 'comix_session_val', domain: 'comix.to' },
          { name: 'cf_clearance', value: 'clearance_val', domain: '.comix.to' },
        ]),
        set: jest.fn(async () => {}),
      },
    },
  },
}));

const { BrowserWindow, session } = require('electron');
const { service, ComixService } = require('../../../platform/connectors/services/comixService');

describe('ComixService Download Fallback & Cookie Handling', () => {
  const tmpDir = path.join(__dirname, 'tmp_test_download');
  const tmpFilePath = path.join(tmpDir, 'page_01.webp');

  beforeEach(() => {
    jest.clearAllMocks();
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('should strip comix.to cookies when downloading from third-party CDN domain', async () => {
    const cdnUrl = 'https://1xx.meganwrites.site/hi/test-image.webp';
    let capturedHeaders = null;

    session.defaultSession.fetch.mockImplementation(async (url, init) => {
      capturedHeaders = init.headers;
      return {
        ok: true,
        status: 200,
        headers: new Map(),
        arrayBuffer: async () => Buffer.from('RIFF_FAKE_WEBP_DATA'),
      };
    });

    const result = await service.downloadImageWithRetry(cdnUrl, tmpFilePath, { Referer: 'https://comix.to/' }, 1);
    expect(result.ok).toBe(true);
    expect(capturedHeaders).toBeDefined();
    expect(capturedHeaders.Cookie).toBeUndefined();
    expect(capturedHeaders.cookie).toBeUndefined();
    expect(capturedHeaders.Referer).toBeUndefined();
    expect(capturedHeaders.referer).toBeUndefined();
  });

  test('should retain comix.to cookies when downloading from comix.to domain', async () => {
    const comixUrl = 'https://comix.to/images/banner.webp';
    let capturedHeaders = null;

    session.defaultSession.fetch.mockImplementation(async (url, init) => {
      capturedHeaders = init.headers;
      return {
        ok: true,
        status: 200,
        headers: new Map(),
        arrayBuffer: async () => Buffer.from('RIFF_FAKE_WEBP_DATA'),
      };
    });

    const result = await service.downloadImageWithRetry(comixUrl, tmpFilePath, { Referer: 'https://comix.to/' }, 1);
    expect(result.ok).toBe(true);
    expect(capturedHeaders).toBeDefined();
    expect(capturedHeaders.Cookie).toMatch(/session=comix_session_val/);
  });

  test('should fallback to downloadImageViaBrowser when direct fetch fails with HTTP 403', async () => {
    const cdnUrl = 'https://1xx.meganwrites.site/hi/cf-blocked.webp';

    // Direct fetch fails with 403 Cloudflare block
    session.defaultSession.fetch.mockImplementation(async () => ({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      headers: new Map(),
    }));

    // Mock downloadImageViaBrowser
    const fakeBase64 = Buffer.from('RIFF_DOWNLOADED_VIA_BROWSER').toString('base64');
    const spyBrowser = jest.spyOn(service, 'downloadImageViaBrowser').mockResolvedValue({
      rawBuf: Buffer.from('RIFF_DOWNLOADED_VIA_BROWSER'),
      scrambleHeaders: {},
    });

    const result = await service.downloadImageWithRetry(cdnUrl, tmpFilePath, {}, 1);
    expect(result.ok).toBe(true);
    expect(spyBrowser).toHaveBeenCalledWith(cdnUrl, expect.any(String));
    expect(fs.existsSync(tmpFilePath)).toBe(true);
    expect(fs.readFileSync(tmpFilePath).toString()).toBe('RIFF_DOWNLOADED_VIA_BROWSER');

    spyBrowser.mockRestore();
  });

  test('downloadChapter should close download window in finally block', async () => {
    const testService = new ComixService();
    const spyClose = jest.spyOn(testService, 'closeDownloadWindow');
    jest.spyOn(testService, 'fetchChapterImages').mockResolvedValue([]);

    const payload = {
      mangaTitle: 'Test Manga',
      mangaUrl: 'https://comix.to/title/test',
      chapterUrl: 'https://comix.to/title/test/ch1',
      chapterTitle: 'Ch 1',
      baseSaveDir: tmpDir,
    };

    await testService.downloadChapter(payload, 'Comix');
    expect(spyClose).toHaveBeenCalledTimes(1);
  });
});
