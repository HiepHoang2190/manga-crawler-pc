/**
 * TruyenMoe (truyen.moe) — MoeTruyen mirror that allows foreign VPN IPs.
 */
const { listConnectors, detectSiteIdFromUrl, get } = require('../../../platform/connectors');
const truyenMoeConnector = require('../../../platform/connectors/truyenMoe');
const moeTruyenConnector = require('../../../platform/connectors/moetruyen');
const truyenMoeService = require('../../../platform/connectors/services/truyenMoeService');
const { getImageRefererForUrl } = require('../../../download/connector/connectorReferer');

const SAMPLE_MANGA_URL = 'https://truyen.moe/manga/1550-our-guild-s-idol';

describe('TruyenMoe - Basic Tests', () => {
  describe('Connector Registration', () => {
    test('should be registered in connector list', () => {
      const connectors = listConnectors();
      const truyenMoe = connectors.find((c) => c.id === 'truyenmoe');
      expect(truyenMoe).toBeDefined();
      expect(truyenMoe.label).toBe('TruyenMoe');
      expect(truyenMoe.supportsLatestUpdates).toBe(false);
      expect(truyenMoe.supportsLatestUpdatesSearch).toBe(false);
      expect(truyenMoe.supportsBulkScan).toBe(false);
    });

    test('should be resolvable via registry get()', () => {
      const connector = get('truyenmoe');
      expect(connector).toBeDefined();
      expect(connector.id).toBe('truyenmoe');
    });

    test('should have load and download methods', () => {
      expect(typeof truyenMoeConnector.load).toBe('function');
      expect(typeof truyenMoeConnector.downloadChapter).toBe('function');
      expect(typeof truyenMoeConnector.fetchLatestUpdates).toBe('undefined');
      expect(typeof truyenMoeConnector.fetchBulkScanListing).toBe('undefined');
    });
  });

  describe('URL Detection', () => {
    test('should detect truyen.moe manga URLs as truyenmoe', () => {
      expect(detectSiteIdFromUrl(SAMPLE_MANGA_URL)).toBe('truyenmoe');
    });

    test('should keep moetruyen.net URLs on the MoeTruyen connector', () => {
      expect(detectSiteIdFromUrl('https://moetruyen.net/manga/1550-our-guild-s-idol')).toBe(
        'moetruyen',
      );
    });

    test('should detect www.truyen.moe URLs as truyenmoe', () => {
      expect(detectSiteIdFromUrl('https://www.truyen.moe/manga/1550-our-guild-s-idol')).toBe(
        'truyenmoe',
      );
    });

    test('should detect truyen.moe chapter URLs as truyenmoe', () => {
      expect(
        detectSiteIdFromUrl('https://truyen.moe/manga/1550-our-guild-s-idol/chapters/1'),
      ).toBe('truyenmoe');
    });

    test('should not classify truyen.moe page URLs as moetruyen', () => {
      expect(detectSiteIdFromUrl(SAMPLE_MANGA_URL)).not.toBe('moetruyen');
    });

    test('CDN hosts under truyen.moe still resolve to truyenmoe (subdomain of domain)', () => {
      expect(detectSiteIdFromUrl('https://i.truyen.moe/page.webp')).toBe('truyenmoe');
      expect(detectSiteIdFromUrl('https://u.truyen.moe/uploads/covers/x.webp')).toBe('truyenmoe');
    });

    test('MoeTruyen connector should not claim truyen.moe as extra domain', () => {
      expect(moeTruyenConnector.extraDomains || []).not.toContain('https://truyen.moe/');
      expect(moeTruyenConnector.hostIncludes || []).not.toContain('truyen.moe');
    });
  });

  describe('Service Configuration', () => {
    test('should use truyen.moe as origin for listing and referer', () => {
      expect(truyenMoeService.DOMAIN).toBe('https://truyen.moe/');
      expect(truyenMoeService.LABEL).toBe('TruyenMoe');
      expect(truyenMoeService.LISTING_PATH).toBe('https://truyen.moe/manga');
      expect(truyenMoeService.buildMangaCatalogListingUrl(1)).toBe('https://truyen.moe/manga');
      expect(truyenMoeService.buildMangaCatalogListingUrl(2)).toBe(
        'https://truyen.moe/manga?page=2',
      );
    });

    test('should reject empty URL', async () => {
      const result = await truyenMoeService.load('');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Image referer', () => {
    test('should use truyen.moe referer for shared CDN hosts', () => {
      expect(truyenMoeConnector.imageReferer).toBe('https://truyen.moe/');
      expect(getImageRefererForUrl('https://i.truyen.moe/page.webp')).toBe('https://truyen.moe/');
      expect(getImageRefererForUrl('https://u.truyen.moe/uploads/covers/x.webp')).toBe(
        'https://truyen.moe/',
      );
    });
  });
});
