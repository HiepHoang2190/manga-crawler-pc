/**
 * Unit test for fetchRemoteImageForUi
 */
const { fetchRemoteImageAsDataUrl } = require('../../export/image/fetchRemoteImageForUi');
const { USER_AGENT } = require('../../download/connector/htmlConnectorUtils');

describe('fetchRemoteImageForUi', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('should use MangaCrawler UA and MangaDex Referer for MangaDex CDN cover URLs', async () => {
    let capturedHeaders = null;
    global.fetch = jest.fn().mockImplementation(async (url, init) => {
      capturedHeaders = init?.headers;
      return {
        ok: true,
        headers: new Map([['content-type', 'image/jpeg']]),
        arrayBuffer: async () => Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      };
    });

    const coverUrl = 'https://uploads.mangadex.org/covers/a96676e5-8ae2-425e-b549-7f15dd34a6d8/f8f44329-1dd7-4301-9ec7-a4a76182e8eb.jpg.512.jpg';
    const result = await fetchRemoteImageAsDataUrl(coverUrl);

    expect(result).toMatch(/^data:image\/jpeg;base64,/);
    expect(capturedHeaders).toBeDefined();
    // MangaDex rejects standard browser User-Agent with 403 bot challenge
    expect(capturedHeaders['User-Agent']).not.toBe(USER_AGENT);
    expect(capturedHeaders['User-Agent']).toBe('MangaCrawler/3.0');
    expect(capturedHeaders.Referer).toBe('https://mangadex.org/');
  });

  test('should use standard browser USER_AGENT for normal remote images', async () => {
    let capturedHeaders = null;
    global.fetch = jest.fn().mockImplementation(async (url, init) => {
      capturedHeaders = init?.headers;
      return {
        ok: true,
        headers: new Map([['content-type', 'image/png']]),
        arrayBuffer: async () => Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      };
    });

    const normalUrl = 'https://example.com/sample.png';
    const result = await fetchRemoteImageAsDataUrl(normalUrl);

    expect(result).toMatch(/^data:image\/png;base64,/);
    expect(capturedHeaders['User-Agent']).toBe(USER_AGENT);
  });
});

