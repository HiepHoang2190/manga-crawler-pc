/**
 * MutualHeights connector wiring — no network.
 * Live site: https://mutualheights.net/ (WordPress, branded TruyenQQ).
 */
const { describe, test, expect } = require('@jest/globals');
const { detectSiteIdFromUrl, get } = require('../../../platform/connectors');
const mutualheightsConnector = require('../../../platform/connectors/mutualheights');
const mutualheightsService = require('../../../platform/connectors/services/mutualheightsService');
const { parseMangaPage } = require('../../../download/connector/htmlConnectorUtils');
const {
  TRUYENQQNO_IMAGE_REFERER,
  getImageRefererForUrl,
} = require('../../../download/connector/connectorReferer');

const TEST_MANGA_URL = 'https://mutualheights.net/truyen-tranh/thien-tai-nhin-thau-the-gioi';
const TEST_CHAPTER_URL =
  'https://mutualheights.net/truyen-tranh/thien-tai-nhin-thau-the-gioi/chuong-38/';

const MANGA_HTML = `
<html><body>
  <h1 class="tieu-de-truyen">Thiên Tài Nhìn Thấu Thế Giới</h1>
  <div class="thumb-main">
    <img src="https://mutualheights.net/wp-content/uploads/2025/09/cover.jpg" alt="cover">
  </div>
  <div class="chapter-list" id="chapterList">
    <div class="cl-body" id="chapterListBody">
      <div class="cl-row" data-title="chương 38">
        <div class="cl-cell ten-chapter">
          <a href="/truyen-tranh/thien-tai-nhin-thau-the-gioi/chuong-38/">Chương 38</a>
        </div>
      </div>
    </div>
  </div>
</body></html>
`;

const CHAPTER_HTML = `
<html><body>
  <div class="chapter-images text-center">
    <p><img class="lazy" src="data:image/svg+xml,%3Csvg/%3E"
      data-src="https://mutualheights.net/storage/?url=https%3A%2F%2Fs135.hinhhinh.com%2F17219%2F38%2F0.jpg"
      data-cdn="https://111.tintruyen.net/17219/38/0.jpg"></p>
    <p><img class="lazy" src="data:image/svg+xml,%3Csvg/%3E"
      data-src="https://mutualheights.net/storage/?url=https%3A%2F%2Fs135.hinhhinh.com%2F17219%2F38%2F1.jpg"
      data-cdn="https://111.tintruyen.net/17219/38/1.jpg"></p>
  </div>
</body></html>
`;

describe('MutualHeights connector basics', () => {
  describe('URL Detection and Registry', () => {
    test('detects only mutualheights hosts', () => {
      const test_urls = [
        TEST_MANGA_URL,
        TEST_CHAPTER_URL,
        'https://www.mutualheights.net/truyen-tranh/keijo',
      ];
      test_urls.forEach((url) => {
        expect(detectSiteIdFromUrl(url)).toBe('mutualheights');
      });
    });

    test('is registered with MutualHeights metadata', () => {
      const connector = get('mutualheights');
      expect(connector).not.toBeNull();
      expect(connector.id).toBe('mutualheights');
      expect(connector.label).toBe('MutualHeights');
      expect(connector.domain).toBe('https://mutualheights.net/');
    });
  });

  describe('Connector Configuration', () => {
    test('renames the connector and marks VPN required', () => {
      expect(mutualheightsConnector.id).toBe('mutualheights');
      expect(mutualheightsConnector.label).toBe('MutualHeights');
      expect(mutualheightsConnector.domain).toBe('https://mutualheights.net/');
      expect(mutualheightsConnector.requiresVpn).toBe(true);
      expect(mutualheightsConnector.supportsApiFetch).toBe(false);
      expect(typeof mutualheightsConnector.load).toBe('function');
      expect(typeof mutualheightsConnector.downloadChapter).toBe('function');
    });

    test('uses only the MutualHeights domain', () => {
      expect(mutualheightsConnector.extraDomains || []).toEqual([]);
      expect(mutualheightsConnector.hostIncludes || []).toEqual([]);
    });

    test('treats proxy and TruyenQQ CDN hosts as image CDNs', () => {
      expect(mutualheightsConnector.imageReferer).toBe(TRUYENQQNO_IMAGE_REFERER);
      expect(mutualheightsConnector.isImageCdnHost('mutualheights.net')).toBe(true);
      expect(mutualheightsConnector.isImageCdnHost('s135.hinhhinh.com')).toBe(true);
      expect(mutualheightsConnector.isImageCdnHost('111.tintruyen.net')).toBe(true);
      expect(getImageRefererForUrl('https://mutualheights.net/storage/?url=https://x/0.jpg')).toBe(
        TRUYENQQNO_IMAGE_REFERER,
      );
    });
  });

  describe('Service Configuration', () => {
    test('exports MutualHeights domain and label', () => {
      expect(mutualheightsService.DOMAIN).toBe('https://mutualheights.net/');
      expect(mutualheightsService.LABEL).toBe('MutualHeights');
      expect(typeof mutualheightsService.load).toBe('function');
      expect(typeof mutualheightsService.downloadChapter).toBe('function');
      expect(typeof mutualheightsService.collectChapterImages).toBe('function');
    });
  });

  describe('HTML parse', () => {
    test('parses title, cover, and chapter links from MutualHeights HTML', () => {
      const parsed = parseMangaPage(MANGA_HTML, TEST_MANGA_URL, mutualheightsService.SELECTORS);
      expect(parsed.title).toBe('Thiên Tài Nhìn Thấu Thế Giới');
      expect(parsed.coverUrl).toBe('https://mutualheights.net/wp-content/uploads/2025/09/cover.jpg');
      expect(parsed.chapters).toHaveLength(1);
      expect(parsed.chapters[0].title).toBe('Chương 38');
      expect(parsed.chapters[0].url).toBe(TEST_CHAPTER_URL);
    });

    test('reads lazy data-src proxy URLs from chapter-images', () => {
      const images = mutualheightsService.collectChapterImages(CHAPTER_HTML, TEST_CHAPTER_URL);
      expect(images).toHaveLength(2);
      expect(images[0].imageUrl).toContain('mutualheights.net/storage/');
      expect(images[0].imageUrl).toContain('0.jpg');
      expect(images[1].imageUrl).toContain('1.jpg');
      expect(images[0].ext).toBe('jpg');
    });
  });
});
