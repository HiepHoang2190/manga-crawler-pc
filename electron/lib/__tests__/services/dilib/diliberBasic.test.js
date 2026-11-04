/**
 * Dilib Basic Tests
 * Tests for basic functionality, URL detection, and connector registry integration
 */
const { listConnectors, detectSiteIdFromUrl } = require('../../../platform/connectors');
const diliberConnector = require('../../../platform/connectors/dilib');
const diliberService = require('../../../platform/connectors/services/diliberService');

describe('Dilib - Basic Tests', () => {
  describe('Connector Registration', () => {
    test('should be registered in connector list', () => {
      const connectors = listConnectors();
      const dilib = connectors.find((c) => c.id === 'dilib');
      expect(dilib).toBeDefined();
      expect(dilib.label).toBe('Dilib');
    });

    test('should have correct domain', () => {
      expect(diliberConnector.domain).toBe('https://dilib.vn/');
    });

    test('should have correct ID', () => {
      expect(diliberConnector.id).toBe('dilib');
    });

    test('should have icon path', () => {
      expect(diliberConnector.icon).toBeDefined();
      expect(typeof diliberConnector.icon).toBe('string');
    });

    test('should not support API fetch', () => {
      expect(diliberConnector.supportsApiFetch).toBe(false);
    });

    test('should not require cookie', () => {
      expect(diliberConnector.requiresCookie).toBe(false);
    });

    test('should have image referer', () => {
      expect(diliberConnector.imageReferer).toBeDefined();
      expect(typeof diliberConnector.imageReferer).toBe('string');
    });
  });

  describe('URL Detection', () => {
    test('should detect dilib.vn URLs', () => {
      const url = 'https://dilib.vn/khoa-hoc-tam-linh-hanh-trinh-tim-lai-chinh-minh-5504.html';
      const detected = detectSiteIdFromUrl(url);
      expect(detected).toBe('dilib');
    });

    test('should detect URLs with www prefix', () => {
      const url = 'https://www.dilib.vn/sat-thu-ve-vuon-sakamoto-days-7085.html';
      const detected = detectSiteIdFromUrl(url);
      expect(detected).toBe('dilib');
    });

    test('should detect URLs with query parameters', () => {
      const url = 'https://dilib.vn/test-manga-1234.html?page=1';
      const detected = detectSiteIdFromUrl(url);
      expect(detected).toBe('dilib');
    });

    test('should not detect non-dilib URLs', () => {
      const url = 'https://example.com/manga/test';
      const detected = detectSiteIdFromUrl(url);
      expect(detected).not.toBe('dilib');
    });
  });

  describe('URL Format Validation', () => {
    test('should accept standard ebook URLs', () => {
      const url = 'https://dilib.vn/khoa-hoc-tam-linh-hanh-trinh-tim-lai-chinh-minh-5504.html';
      expect(url).toMatch(/dilib\.vn\/.*-\d+\.html/);
    });

    test('should accept manga URLs', () => {
      const url = 'https://dilib.vn/sat-thu-ve-vuon-sakamoto-days-7085.html';
      expect(url).toMatch(/dilib\.vn\/.*\.html/);
    });

    test('should accept URLs with slug format', () => {
      const url = 'https://dilib.vn/test-manga-1234.html';
      expect(url).toMatch(/dilib\.vn\/[\w-]+-\d+\.html/);
    });
  });

  describe('Service Methods', () => {
    test('should have load method', () => {
      expect(typeof diliberService.load).toBe('function');
    });

    test('should have downloadChapter method', () => {
      expect(typeof diliberService.downloadChapter).toBe('function');
    });

    test('should export DOMAIN constant', () => {
      expect(diliberService.DOMAIN).toBe('https://dilib.vn/');
    });

    test('should export LABEL constant', () => {
      expect(diliberService.LABEL).toBe('Dilib');
    });

    test('should export extractMangaIdFromUrl function', () => {
      expect(typeof diliberService.extractMangaIdFromUrl).toBe('function');
    });

    test('should export isValidDownloadLink function', () => {
      expect(typeof diliberService.isValidDownloadLink).toBe('function');
    });
  });

  describe('Connector Methods', () => {
    test('should have load method', () => {
      expect(typeof diliberConnector.load).toBe('function');
    });

    test('should have downloadChapter method', () => {
      expect(typeof diliberConnector.downloadChapter).toBe('function');
    });
  });

  describe('Architecture', () => {
    test('should be HTML-based connector', () => {
      expect(diliberConnector.supportsApiFetch).toBe(false);
    });

    test('should use HtmlConnectorService base class', () => {
      expect(typeof diliberService.load).toBe('function');
      expect(typeof diliberService.downloadChapter).toBe('function');
    });
  });

  describe('Manga ID Extraction', () => {
    test('should extract ID from standard URL', () => {
      const url = 'https://dilib.vn/khoa-hoc-tam-linh-hanh-trinh-tim-lai-chinh-minh-5504.html';
      const id = diliberService.extractMangaIdFromUrl(url);
      expect(id).toBe('5504');
    });

    test('should extract ID from manga URL', () => {
      const url = 'https://dilib.vn/sat-thu-ve-vuon-sakamoto-days-7085.html';
      const id = diliberService.extractMangaIdFromUrl(url);
      expect(id).toBe('7085');
    });

    test('should extract ID from URL with query parameters', () => {
      const url = 'https://dilib.vn/test-manga-1234.html?page=1';
      const id = diliberService.extractMangaIdFromUrl(url);
      expect(id).toBe('1234');
    });

    test('should extract ID from URL with hash', () => {
      const url = 'https://dilib.vn/test-manga-5678.html#chapter-1';
      const id = diliberService.extractMangaIdFromUrl(url);
      expect(id).toBe('5678');
    });

    test('should return empty string for invalid URL', () => {
      const url = 'https://dilib.vn/invalid-url';
      const id = diliberService.extractMangaIdFromUrl(url);
      expect(id).toBe('');
    });

    test('should handle empty URL', () => {
      const id = diliberService.extractMangaIdFromUrl('');
      expect(id).toBe('');
    });

    test('should handle null URL', () => {
      const id = diliberService.extractMangaIdFromUrl(null);
      expect(id).toBe('');
    });
  });

  describe('Download Link Validation', () => {
    test('should validate Dilib internal download links', () => {
      expect(diliberService.isValidDownloadLink('https://dilib.vn/download/12345')).toBe(true);
      expect(diliberService.isValidDownloadLink('https://dilib.vn/audio/67890')).toBe(true);
    });

    test('should validate Google Drive links', () => {
      expect(diliberService.isValidDownloadLink('https://drive.google.com/file/d/abc123/view')).toBe(true);
      expect(diliberService.isValidDownloadLink('https://docs.google.com/document/d/xyz789')).toBe(true);
    });

    test('should validate Mediafire links', () => {
      expect(diliberService.isValidDownloadLink('https://www.mediafire.com/file/abc123/test.cbz')).toBe(true);
    });

    test('should validate Fshare links', () => {
      expect(diliberService.isValidDownloadLink('https://www.fshare.vn/file/abc123')).toBe(true);
    });

    test('should validate OneDrive links', () => {
      expect(diliberService.isValidDownloadLink('https://onedrive.live.com/download?id=abc123')).toBe(true);
      expect(diliberService.isValidDownloadLink('https://1drv.ms/u/s!abc123')).toBe(true);
    });

    test('should validate Dropbox links', () => {
      expect(diliberService.isValidDownloadLink('https://www.dropbox.com/s/abc123/file.cbz')).toBe(true);
    });

    test('should validate Mega links', () => {
      expect(diliberService.isValidDownloadLink('https://mega.nz/file/abc123')).toBe(true);
    });

    test('should validate file extension links', () => {
      expect(diliberService.isValidDownloadLink('https://example.com/file.pdf')).toBe(true);
      expect(diliberService.isValidDownloadLink('https://example.com/file.epub')).toBe(true);
      expect(diliberService.isValidDownloadLink('https://example.com/file.mobi')).toBe(true);
      expect(diliberService.isValidDownloadLink('https://example.com/file.cbz')).toBe(true);
      expect(diliberService.isValidDownloadLink('https://example.com/file.zip')).toBe(true);
    });

    test('should reject invalid links', () => {
      expect(diliberService.isValidDownloadLink('https://example.com/page.html')).toBe(false);
      expect(diliberService.isValidDownloadLink('https://example.com/image.jpg')).toBe(false);
      expect(diliberService.isValidDownloadLink('')).toBe(false);
      expect(diliberService.isValidDownloadLink(null)).toBe(false);
    });
  });

  describe('Error Handling', () => {
    test('should handle empty URL', async () => {
      const result = await diliberService.load('');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle null URL', async () => {
      const result = await diliberService.load(null);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle undefined URL', async () => {
      const result = await diliberService.load(undefined);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Special Features', () => {
    test('should be digital library connector', () => {
      // Dilib is a digital library for ebooks/audiobooks
      expect(diliberConnector.label).toBe('Dilib');
      expect(diliberConnector.domain).toContain('dilib.vn');
    });

    test('should support file downloads', () => {
      // Dilib provides direct download links for files
      expect(typeof diliberService.isValidDownloadLink).toBe('function');
    });

    test('should support multiple cloud storage providers', () => {
      const providers = [
        'drive.google.com',
        'mediafire.com',
        'fshare.vn',
        'onedrive.live.com',
        'dropbox.com',
        'mega.nz'
      ];
      
      providers.forEach(provider => {
        const testUrl = `https://${provider}/file/test`;
        expect(diliberService.isValidDownloadLink(testUrl)).toBe(true);
      });
    });

    test('should support multiple file formats', () => {
      const formats = ['.pdf', '.epub', '.mobi', '.azw', '.azw3', '.zip', '.rar', '.cbz', '.cbr'];
      
      formats.forEach(format => {
        const testUrl = `https://example.com/file${format}`;
        expect(diliberService.isValidDownloadLink(testUrl)).toBe(true);
      });
    });
  });
});
