/**
 * @jest-environment node
 */
const xbatoService = require('../../../platform/connectors/services/xbatoService');
const xbatoConnector = require('../../../platform/connectors/xbato');

jest.mock('electron', () => ({
  app: { userAgentFallback: 'Mozilla/5.0 Test' },
}), { virtual: true });

// Mock renderedFetch for BrowserWindow tests
jest.mock('../../../platform/renderedFetch', () => ({
  fetchRenderedHtml: jest.fn(),
}), { virtual: true });

describe('xbatoService', () => {
  describe('load', () => {
    it('returns error for empty URL', async () => {
      const result = await xbatoService.load('');
      expect(result.ok).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('returns error when slug is missing', async () => {
      const result = await xbatoService.load('https://xbato.co.uk/newest');
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/slug/i);
    });
  });

  describe('parseXbatoMangaPage', () => {
    it('parses title, cover, and chapter links from manga HTML', () => {
      const html = `
        <html><body>
          <h1>Runaway in the Present</h1>
          <div class="poster">
            <img class="image-thumb" data-src="https://cdn2.merrypsycho.xyz/thumb/runaway-in-the-present.webp" src="data:image/svg+xml,placeholder" />
          </div>
          <a href="/read/runaway-in-the-present/chapter-1">Chapter 1</a>
          <a href="/read/runaway-in-the-present/chapter-2">Chapter 2</a>
        </body></html>`;

      const parsed = xbatoService.parseXbatoMangaPage(
        html,
        'https://xbato.co.uk/manga/runaway-in-the-present',
      );

      expect(parsed.title).toBe('Runaway in the Present');
      expect(parsed.coverUrl).toContain('cdn2.merrypsycho.xyz/thumb/runaway-in-the-present.webp');
      expect(parsed.chapters).toHaveLength(2);
      expect(parsed.chapters[0].url).toContain('/read/runaway-in-the-present/chapter-1');
    });

    it('parses cover with snapvip CDN correctly', () => {
      const html = `
        <html><body>
          <h1>Eleceed</h1>
          <div class="poster">
            <img class="lazyload image-thumb" src="/assets/images/image-default-bbato.webp" data-src="https://cdnb.snapvip.xyz/thumb/eleceed.webp" data-fallback="https://cdnb.snapvip.xyz/thumb/eleceed.webp" alt="Eleceed" />
          </div>
          <a href="/read/eleceed/chapter-423">Chapter 423</a>
        </body></html>`;

      const parsed = xbatoService.parseXbatoMangaPage(
        html,
        'https://xbato.co.uk/manga/eleceed',
      );

      expect(parsed.title).toBe('Eleceed');
      expect(parsed.coverUrl).toBe('https://cdnb.snapvip.xyz/thumb/eleceed.webp');
      expect(parsed.chapters).toHaveLength(1);
    });
  });

  describe('_parseChapterImagesFromHtml', () => {
    it('extracts chapter images using snapvip CDN and data-number attributes', () => {
      const html = `
        <div class="chapter-images-container">
          <div class="pages longstrip">
            <div class="page fit-w">
              <div class="img"><img data-number="notice" src="/assets/banner/short_720_v2.gif" /></div>
            </div>
            <div class="page fit-w">
              <div class="img"><img data-number="0" class="fit-w image-thumb" src="https://cdnb.snapvip.xyz/eleceed/423/0.webp" data-fallback="https://cdnb.snapvip.xyz/eleceed/423/0.webp" alt="Read Eleceed chapter 423 image 0" /></div>
            </div>
            <div class="page fit-w">
              <div class="img"><img data-number="1" class="fit-w image-thumb" src="https://cdnb.snapvip.xyz/eleceed/423/1.webp" data-fallback="https://cdnb.snapvip.xyz/eleceed/423/1.webp" alt="Read Eleceed chapter 423 image 1" /></div>
            </div>
            <div class="page fit-w">
              <div class="img"><img data-number="2" class="fit-w lazyload image-thumb" src="data:image/svg+xml,placeholder" data-src="https://cdnb.snapvip.xyz/eleceed/423/2.webp" data-fallback="https://cdnb.snapvip.xyz/eleceed/423/2.webp" alt="Read Eleceed chapter 423 image 2" /></div>
            </div>
          </div>
        </div>`;

      const images = xbatoService.parseChapterImagesFromHtml(
        html,
        'https://xbato.co.uk/read/eleceed/chapter-423',
      );

      expect(images).toHaveLength(3);
      expect(images[0]).toEqual({
        imageUrl: 'https://cdnb.snapvip.xyz/eleceed/423/0.webp',
        ext: 'webp',
      });
      expect(images[1]).toEqual({
        imageUrl: 'https://cdnb.snapvip.xyz/eleceed/423/1.webp',
        ext: 'webp',
      });
      expect(images[2]).toEqual({
        imageUrl: 'https://cdnb.snapvip.xyz/eleceed/423/2.webp',
        ext: 'webp',
      });
    });
  });

  describe('isCloudflareBlockedHtml', () => {
    it('detects Cloudflare challenge HTML', () => {
      const challenge_html = `
        <html><head><title>Just a moment...</title></head>
        <body>Performing security verification</body></html>`;
      expect(xbatoService.isCloudflareBlockedHtml(challenge_html)).toBe(true);
    });

    it('does not flag normal manga HTML', () => {
      const manga_html = `
        <html><head><title>Runaway in the Present</title></head>
        <body><h1>Runaway in the Present</h1><a href="/read/runaway-in-the-present/chapter-1">Chapter 1</a></body></html>`;
      expect(xbatoService.isCloudflareBlockedHtml(manga_html)).toBe(false);
    });
  });

  describe('connector metadata', () => {
    it('does not require cookie (BrowserWindow handles Cloudflare)', () => {
      expect(xbatoConnector.requiresCookie).toBe(false);
    });

    it('exposes latest updates and search support on PC', () => {
      expect(xbatoConnector.supportsLatestUpdates).toBe(true);
      expect(typeof xbatoConnector.fetchLatestUpdates).toBe('function');
      const { listConnectors } = require('../../../platform/connectors');
      const listed = listConnectors().find((c) => c.id === 'xbato');
      expect(listed).toBeDefined();
      expect(listed.supportsLatestUpdates).toBe(true);
      expect(listed.supportsLatestUpdatesSearch).toBe(true);
    });
  });

  describe('fetchXbatoHtml', () => {
    it('returns cookie hint when session cookie is missing', async () => {
      const result = await xbatoService.fetchXbatoHtml('https://xbato.co.uk/manga/runaway-in-the-present', {
        cookie: '',
      });
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/cookie/i);
    });
  });

  describe('fetchXbatoHtmlViaBrowser', () => {
    it('calls fetchRenderedHtml and returns HTML on success', async () => {
      const { fetchRenderedHtml } = require('../../../platform/renderedFetch');
      const fake_html = '<html><body><h1>Dragon Ball Super</h1></body></html>';
      fetchRenderedHtml.mockResolvedValueOnce(fake_html);

      const result = await xbatoService.fetchXbatoHtmlViaBrowser('https://xbato.co.uk/manga/dragon-ball-super');

      expect(result.ok).toBe(true);
      expect(result.html).toBe(fake_html);
      expect(fetchRenderedHtml).toHaveBeenCalledWith(
        'https://xbato.co.uk/manga/dragon-ball-super',
        expect.objectContaining({ timeout: 90000 }),
      );
    });

    it('returns error when BrowserWindow returns Cloudflare challenge', async () => {
      const { fetchRenderedHtml } = require('../../../platform/renderedFetch');
      const cf_html = '<html><head><title>Just a moment...</title></head><body>cf-browser-verification</body></html>';
      fetchRenderedHtml.mockResolvedValueOnce(cf_html);

      const result = await xbatoService.fetchXbatoHtmlViaBrowser('https://xbato.co.uk/manga/test');

      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/cloudflare/i);
    });

    it('returns error when fetchRenderedHtml throws', async () => {
      const { fetchRenderedHtml } = require('../../../platform/renderedFetch');
      fetchRenderedHtml.mockRejectedValueOnce(new Error('Timeout after 90000ms'));

      const result = await xbatoService.fetchXbatoHtmlViaBrowser('https://xbato.co.uk/manga/test');

      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/timeout/i);
    });
  });
});
