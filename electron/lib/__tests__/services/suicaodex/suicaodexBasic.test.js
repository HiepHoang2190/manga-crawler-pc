/**
 * SuicaoDex Basic Tests
 */
const { listConnectors, detectSiteIdFromUrl } = require('../../../platform/connectors');
const suicaodexConnector = require('../../../platform/connectors/suicaodex');
const suicaodexService = require('../../../platform/connectors/services/suicaodexService');
const { extractMangaId, extractChapterId } = require('../../../platform/connectors/services/suicaodexApiClient');

const TEST_MANGA_URL = 'https://suicaodex.com/manga/irivh10nic/darwin-jihen';

describe('SuicaoDex - Basic Tests', () => {
  describe('Connector Registration', () => {
    test('should be registered in connector list', () => {
      const connectors = listConnectors();
      const suicaodex = connectors.find((c) => c.id === 'suicaodex');
      expect(suicaodex).toBeDefined();
      expect(suicaodex.label).toBe('SuicaoDex');
    });

    test('should have correct domain', () => {
      expect(suicaodexConnector.domain).toBe('https://suicaodex.com/');
    });

    test('should support API fetch', () => {
      expect(suicaodexConnector.supportsApiFetch).toBe(true);
    });
  });

  describe('URL Detection', () => {
    test('should detect suicaodex.com manga URLs', () => {
      expect(detectSiteIdFromUrl(TEST_MANGA_URL)).toBe('suicaodex');
    });

    test('should detect suicaodex.com chapter URLs', () => {
      expect(detectSiteIdFromUrl('https://suicaodex.com/chapter/glwlhuo8qr')).toBe('suicaodex');
    });
  });

  describe('ID extraction', () => {
    test('should extract manga ID from URL', () => {
      expect(extractMangaId(TEST_MANGA_URL)).toBe('irivh10nic');
    });

    test('should extract chapter ID from URL', () => {
      expect(extractChapterId('https://suicaodex.com/chapter/glwlhuo8qr')).toBe('glwlhuo8qr');
    });
  });

  describe('Chapter URL resolution', () => {
    test('should resolve manga URL from chapter URL', async () => {
      const { resolveMangaUrl } = require('../../../platform/connectors/services/suicaodexApiClient');
      const resolved = await resolveMangaUrl('https://suicaodex.com/chapter/glwlhuo8qr');
      expect(resolved).toBe('https://suicaodex.com/manga/irivh10nic');
    });
  });

  describe('Service exports', () => {
    test('should expose load and downloadChapter', () => {
      expect(typeof suicaodexService.load).toBe('function');
      expect(typeof suicaodexService.downloadChapter).toBe('function');
    });
  });
});
