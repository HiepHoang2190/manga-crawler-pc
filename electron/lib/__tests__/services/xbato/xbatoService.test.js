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

    it('does not support latest updates on PC', () => {
      expect(xbatoConnector.supportsLatestUpdates).toBeFalsy();
      expect(typeof xbatoConnector.fetchLatestUpdates).toBe('undefined');
      const { listConnectors } = require('../../../platform/connectors');
      const listed = listConnectors().find((c) => c.id === 'xbato');
      expect(listed).toBeDefined();
      expect(listed.supportsLatestUpdates).toBe(false);
      expect(listed.supportsLatestUpdatesSearch).toBe(false);
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
