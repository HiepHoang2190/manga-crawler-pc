/**
 * MangaFire Basic Tests
 *
 * Tests basic functionality of the MangaFire connector:
 * - URL detection
 * - Manga HID extraction
 * - Chapter ID extraction
 */

const {
  extractMangaHid,
  extractNumericChapterId,
  inferImageExt,
} = require('../../../platform/connectors/api-clients/mangaFireClient');
const connectorRegistry = require('../../../platform/connectors');

describe('MangaFire Basic Tests', () => {
  describe('URL Detection', () => {
    test('should detect MangaFire URLs (new /title/ format)', () => {
      const urls = [
        'https://mangafire.to/title/20wk0-full-time-awakening',
        'https://mangafire.to/title/20wk0-full-time-awakening/chapter/7516452',
      ];

      urls.forEach((url) => {
        const detected = connectorRegistry.detectSiteIdFromUrl(url);
        expect(detected).toBe('mangafire');
      });
    });

    test('should detect MangaFire URLs (old /manga/ format)', () => {
      const urls = [
        'https://mangafire.to/manga/ase-to-sekkenn.rjn5n',
        'https://mangafire.to/read/ase-to-sekkenn.rjn5n/en/chapter-1',
      ];

      urls.forEach((url) => {
        const detected = connectorRegistry.detectSiteIdFromUrl(url);
        expect(detected).toBe('mangafire');
      });
    });

    test('should not detect non-MangaFire URLs', () => {
      const urls = [
        'https://mangadex.org/title/123',
        'https://example.com/manga/test',
      ];

      urls.forEach((url) => {
        const detected = connectorRegistry.detectSiteIdFromUrl(url);
        expect(detected).not.toBe('mangafire');
      });
    });
  });

  describe('Manga HID Extraction', () => {
    test('should extract HID from new /title/ URL', () => {
      expect(extractMangaHid('https://mangafire.to/title/20wk0-full-time-awakening'))
        .toBe('20wk0');
      expect(extractMangaHid('https://mangafire.to/title/5xmm0-morino-san-darugaramu'))
        .toBe('5xmm0');
    });

    test('should extract HID from new chapter URL', () => {
      expect(extractMangaHid('https://mangafire.to/title/20wk0-full-time-awakening/chapter/7516452'))
        .toBe('20wk0');
    });

    test('should extract HID from old /manga/ URL', () => {
      expect(extractMangaHid('https://mangafire.to/manga/ase-to-sekkenn.rjn5n'))
        .toBe('rjn5n');
    });

    test('should extract HID from old /read/ URL', () => {
      expect(extractMangaHid('https://mangafire.to/read/ase-to-sekkenn.rjn5n/en/chapter-1'))
        .toBe('rjn5n');
    });

    test('should return null for invalid URL', () => {
      expect(extractMangaHid('https://example.com/invalid')).toBeNull();
      expect(extractMangaHid('')).toBeNull();
      expect(extractMangaHid(null)).toBeNull();
    });
  });

  describe('Numeric Chapter ID Extraction', () => {
    test('should extract numeric ID from new chapter URL', () => {
      expect(extractNumericChapterId('https://mangafire.to/title/20wk0-full-time-awakening/chapter/7516452'))
        .toBe('7516452');
    });

    test('should return null for manga URL (no chapter)', () => {
      expect(extractNumericChapterId('https://mangafire.to/title/20wk0-full-time-awakening'))
        .toBeNull();
    });

    test('should return null for invalid URL', () => {
      expect(extractNumericChapterId('https://example.com/invalid')).toBeNull();
    });
  });

  describe('inferImageExt', () => {
    test('should infer jpg extension', () => {
      expect(inferImageExt('https://cdn.example.com/img.jpg')).toBe('jpg');
      expect(inferImageExt('https://cdn.example.com/img.jpeg')).toBe('jpg');
    });

    test('should infer png extension', () => {
      expect(inferImageExt('https://cdn.example.com/img.png')).toBe('png');
    });

    test('should infer webp extension', () => {
      expect(inferImageExt('https://cdn.example.com/img.webp')).toBe('webp');
    });

    test('should default to jpg for unknown', () => {
      expect(inferImageExt('https://cdn.example.com/h/p')).toBe('jpg');
      expect(inferImageExt('')).toBe('jpg');
    });
  });

  describe('Connector Registration', () => {
    test('should have mangafire connector registered', () => {
      const connector = connectorRegistry.get('mangafire');
      expect(connector).toBeDefined();
      expect(connector.id).toBe('mangafire');
      expect(connector.label).toBe('MangaFire');
      expect(connector.domain).toBe('https://mangafire.to/');
    });

    test('should list mangafire in connectors', () => {
      const connectors = connectorRegistry.listConnectors();
      const mangafire = connectors.find((c) => c.id === 'mangafire');
      expect(mangafire).toBeDefined();
      expect(mangafire.supportsApiFetch).toBe(true);
      expect(mangafire.requiresCookie).toBe(false);
    });

    test('does not require a saved user cookie', () => {
      const connector = connectorRegistry.get('mangafire');
      expect(connector.requiresCookie).toBe(false);
    });
  });
});
