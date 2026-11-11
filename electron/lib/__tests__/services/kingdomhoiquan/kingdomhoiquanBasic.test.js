const { describe, test, expect } = require('@jest/globals');
const {
  getImageRefererForUrl,
  KINGDOMHOIQUAN_IMAGE_REFERER,
  isKingdomHoiQuanImageCdnHost,
} = require('../../../download/connector/connectorReferer');

describe('KingdomHoiQuan Basic Tests', () => {
  describe('Referer & CDN Resolution', () => {
    test('should export KINGDOMHOIQUAN_IMAGE_REFERER constant', () => {
      expect(KINGDOMHOIQUAN_IMAGE_REFERER).toBe('https://kingdomhoiquan.com/');
    });

    test('should identify kingdomhoiquan host as CDN host', () => {
      expect(typeof isKingdomHoiQuanImageCdnHost).toBe('function');
      expect(isKingdomHoiQuanImageCdnHost('kingdomhoiquan.com')).toBe(true);
      expect(isKingdomHoiQuanImageCdnHost('cdn.kingdomhoiquan.com')).toBe(true);
      expect(isKingdomHoiQuanImageCdnHost('other.com')).toBe(false);
    });

    test('should resolve correct referer for kingdomhoiquan image URLs', () => {
      const imageUrl = 'https://kingdomhoiquan.com/wp-content/uploads/kq/887/01.webp';
      expect(getImageRefererForUrl(imageUrl)).toBe('https://kingdomhoiquan.com/');
    });
  });

  describe('Service & Connector Structure', () => {
    test('kingdomhoiquanService should export DOMAIN, LABEL and methods', () => {
      const kingdomhoiquanService = require('../../../platform/connectors/services/kingdomhoiquanService');
      expect(kingdomhoiquanService.DOMAIN).toBe('https://kingdomhoiquan.com/');
      expect(kingdomhoiquanService.LABEL).toBe('Kingdom Hội Quán');
      expect(typeof kingdomhoiquanService.load).toBe('function');
      expect(typeof kingdomhoiquanService.downloadChapter).toBe('function');
    });

    test('kingdomhoiquan connector should implement standard connector interface', () => {
      const kingdomhoiquan = require('../../../platform/connectors/kingdomhoiquan');
      expect(kingdomhoiquan.id).toBe('kingdomhoiquan');
      expect(kingdomhoiquan.label).toBe('Kingdom Hội Quán');
      expect(kingdomhoiquan.domain).toBe('https://kingdomhoiquan.com/');
      expect(kingdomhoiquan.imageReferer).toBe('https://kingdomhoiquan.com/');
      expect(kingdomhoiquan.supportsApiFetch).toBe(false);
      expect(kingdomhoiquan.requiresCookie).toBe(false);
      expect(typeof kingdomhoiquan.load).toBe('function');
      expect(typeof kingdomhoiquan.downloadChapter).toBe('function');
    });
  });

  describe('Registry & Catalog Integration', () => {
    test('detectSiteIdFromUrl should detect kingdomhoiquan from homepage and chapter URLs', () => {
      const { detectSiteIdFromUrl } = require('../../../platform/connectors');
      expect(detectSiteIdFromUrl('https://kingdomhoiquan.com/')).toBe('kingdomhoiquan');
      expect(detectSiteIdFromUrl('https://kingdomhoiquan.com/chap/887/')).toBe('kingdomhoiquan');
      expect(detectSiteIdFromUrl('https://www.kingdomhoiquan.com/chap/893/')).toBe('kingdomhoiquan');
    });

    test('get() and listConnectors() should include kingdomhoiquan', () => {
      const { get, listConnectors } = require('../../../platform/connectors');
      const connector = get('kingdomhoiquan');
      expect(connector).toBeDefined();
      expect(connector.id).toBe('kingdomhoiquan');

      const connectors = listConnectors();
      const found = connectors.find(c => c.id === 'kingdomhoiquan');
      expect(found).toBeDefined();
      expect(found.label).toBe('Kingdom Hội Quán');
    });

    test('getIconPath should return correct icon path', () => {
      const { getIconPath } = require('../../../platform/connectors/iconPath');
      expect(getIconPath('kingdomhoiquan')).toBe('data/site-icons/kingdomhoiquan.png');
    });

    test('catalog should contain kingdomhoiquan entry', () => {
      const { getCatalogEntry } = require('../../../platform/connectors/tester/catalog');
      const entry = getCatalogEntry('kingdomhoiquan');
      expect(entry).toBeDefined();
      expect(entry.testUrl).toBe('/');
    });
  });
});
