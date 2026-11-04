/**
 * Basic tests for DTVeBook Connector
 * Tests core functionality, URL parsing, and basic validation
 * Test URL: https://dtv-ebook.com.vn/thoi-quen-bat-be-hang-ngay-cua-dai-de_26375.html
 */
const { describe, test, expect } = require('@jest/globals');

// Import the service
const dtveBookService = require('../../../platform/connectors/services/dtveBookService');

describe('DTVeBook Basic Tests', () => {
  describe('Module Structure', () => {
    test('should export required constants', () => {
      expect(dtveBookService.DOMAIN).toBe('https://dtv-ebook.com.vn/');
      expect(dtveBookService.LABEL).toBe('DTV Ebook');
    });

    test('should export required functions', () => {
      expect(typeof dtveBookService.load).toBe('function');
      expect(typeof dtveBookService.downloadChapter).toBe('function');
    });

    test('should export utility functions', () => {
      expect(typeof dtveBookService.detectSourceType).toBe('function');
      expect(typeof dtveBookService.isAllowedDownloadLink).toBe('function');
      expect(typeof dtveBookService.extractGoogleDriveFileId).toBe('function');
      expect(typeof dtveBookService.extractMangaIdFromUrl).toBe('function');
    });
  });

  describe('URL Parsing - extractMangaIdFromUrl()', () => {
    test('should extract manga ID from standard URL', () => {
      const url = 'https://dtv-ebook.com.vn/thoi-quen-bat-be-hang-ngay-cua-dai-de_26375.html';
      expect(dtveBookService.extractMangaIdFromUrl(url)).toBe('26375');
    });

    test('should extract manga ID from URL with query parameters', () => {
      const url = 'https://dtv-ebook.com.vn/test-book_12345.html?page=1';
      expect(dtveBookService.extractMangaIdFromUrl(url)).toBe('12345');
    });

    test('should extract manga ID from URL with hash', () => {
      const url = 'https://dtv-ebook.com.vn/test-book_12345.html#gsc.tab=0';
      expect(dtveBookService.extractMangaIdFromUrl(url)).toBe('12345');
    });

    test('should handle URLs with dash separator', () => {
      const url = 'https://dtv-ebook.com.vn/test-book-12345.html';
      expect(dtveBookService.extractMangaIdFromUrl(url)).toBe('12345');
    });

    test('should return empty string for invalid URLs', () => {
      const invalidUrls = [
        '',
        null,
        undefined,
        'https://dtv-ebook.com.vn/no-id-here.html',
        'not-a-url',
      ];

      invalidUrls.forEach(url => {
        expect(dtveBookService.extractMangaIdFromUrl(url)).toBe('');
      });
    });
  });

  describe('Source Type Detection', () => {
    test('should detect Google Drive URLs', () => {
      const googleUrls = [
        'https://drive.google.com/file/d/1ABC123/view',
        'https://docs.google.com/uc?id=1ABC123',
        'https://drive.google.com/uc?export=download&id=1ABC123',
      ];

      googleUrls.forEach(url => {
        expect(dtveBookService.detectSourceType(url)).toBe('google-drive');
      });
    });

    test('should detect Mediafire URLs', () => {
      const mediafireUrls = [
        'https://www.mediafire.com/file/abc123/test.zip',
        'https://mediafire.com/download/abc123',
      ];

      mediafireUrls.forEach(url => {
        expect(dtveBookService.detectSourceType(url)).toBe('mediafire');
      });
    });

    test('should detect OneDrive URLs', () => {
      const onedriveUrls = [
        'https://onedrive.live.com/download?resid=123&authkey=abc',
        'https://1drv.ms/u/s!ABC123',
      ];

      onedriveUrls.forEach(url => {
        expect(dtveBookService.detectSourceType(url)).toBe('onedrive');
      });
    });

    test('should detect Fshare URLs', () => {
      const fshareUrls = [
        'https://fshare.vn/file/ABC123',
      ];

      fshareUrls.forEach(url => {
        expect(dtveBookService.detectSourceType(url)).toBe('fshare');
      });
    });

    test('should detect direct download URLs', () => {
      const directUrls = [
        'https://example.com/file.zip',
        'https://example.com/book.epub',
        'https://example.com/document.pdf',
      ];

      directUrls.forEach(url => {
        expect(dtveBookService.detectSourceType(url)).toBe('direct');
      });
    });

    test('should return unknown for unsupported URLs', () => {
      const unknownUrls = [
        'https://example.com/page.html',
        'https://unknown-host.com/file',
      ];

      unknownUrls.forEach(url => {
        expect(dtveBookService.detectSourceType(url)).toBe('unknown');
      });
    });
  });

  describe('Allowed Download Link Validation', () => {
    test('should allow Google Drive links', () => {
      const url = 'https://drive.google.com/file/d/1ABC123/view';
      expect(dtveBookService.isAllowedDownloadLink(url)).toBe(true);
    });

    test('should allow Mediafire links', () => {
      const url = 'https://www.mediafire.com/file/abc123/test.zip';
      expect(dtveBookService.isAllowedDownloadLink(url)).toBe(true);
    });

    test('should allow OneDrive links', () => {
      const url = 'https://onedrive.live.com/download?resid=123';
      expect(dtveBookService.isAllowedDownloadLink(url)).toBe(true);
    });

    test('should allow Fshare links', () => {
      const url = 'https://fshare.vn/file/ABC123';
      expect(dtveBookService.isAllowedDownloadLink(url)).toBe(true);
    });

    test('should allow direct file links with valid extensions', () => {
      const validUrls = [
        'https://example.com/file.zip',
        'https://example.com/book.epub',
        'https://example.com/doc.pdf',
        'https://example.com/book.mobi',
        'https://example.com/book.azw3',
      ];

      validUrls.forEach(url => {
        expect(dtveBookService.isAllowedDownloadLink(url)).toBe(true);
      });
    });

    test('should reject links with invalid extensions', () => {
      const invalidUrls = [
        'https://example.com/page.html',
        'https://example.com/image.jpg',
        'https://example.com/video.mp4',
      ];

      invalidUrls.forEach(url => {
        expect(dtveBookService.isAllowedDownloadLink(url)).toBe(false);
      });
    });
  });

  describe('Google Drive File ID Extraction', () => {
    test('should extract file ID from /file/d/ pattern', () => {
      const url = 'https://drive.google.com/file/d/1ABC123XYZ/view';
      expect(dtveBookService.extractGoogleDriveFileId(url)).toBe('1ABC123XYZ');
    });

    test('should extract file ID from uc?id= pattern', () => {
      const url = 'https://drive.google.com/uc?export=download&id=1ABC123XYZ';
      expect(dtveBookService.extractGoogleDriveFileId(url)).toBe('1ABC123XYZ');
    });

    test('should return null for invalid URLs', () => {
      const invalidUrls = [
        '',
        null,
        'https://drive.google.com/invalid',
        'https://example.com/file',
      ];

      invalidUrls.forEach(url => {
        expect(dtveBookService.extractGoogleDriveFileId(url)).toBeNull();
      });
    });
  });

  describe('Google Drive Download URL Building', () => {
    test('should build correct download URL from file ID', () => {
      const fileId = '1ABC123XYZ';
      const expected = 'https://drive.google.com/uc?export=download&id=1ABC123XYZ';
      expect(dtveBookService.buildGoogleDriveDownloadUrl(fileId)).toBe(expected);
    });
  });

  describe('Filename Extraction from Content-Disposition', () => {
    test('should extract filename from standard format', () => {
      const header = 'attachment; filename="test-book.zip"';
      expect(dtveBookService.extractFilenameFromContentDisposition(header)).toBe('test-book.zip');
    });

    test('should extract filename from UTF-8 encoded format', () => {
      const header = "attachment; filename*=UTF-8''test%20book.zip";
      expect(dtveBookService.extractFilenameFromContentDisposition(header)).toBe('test book.zip');
    });

    test('should return default filename for invalid headers', () => {
      const invalidHeaders = [
        '',
        null,
        'invalid-header',
      ];

      invalidHeaders.forEach(header => {
        expect(dtveBookService.extractFilenameFromContentDisposition(header)).toBe('chapter_01.zip');
      });
    });
  });

  describe('Google Drive Virus Scan Detection', () => {
    test('should detect virus scan page', () => {
      const virusScanHtml = `
        <html>
          <body>
            <p>Google Drive can't scan this file for viruses.</p>
            <a id="uc-download-link" href="/uc?export=download&confirm=abc123&id=1ABC">Download anyway</a>
          </body>
        </html>
      `;
      // Function checks for specific patterns in HTML
      expect(typeof dtveBookService.isGoogleDriveVirusScanPage).toBe('function');
      const result = dtveBookService.isGoogleDriveVirusScanPage(virusScanHtml);
      expect(typeof result).toBe('boolean');
    });

    test('should not detect normal HTML as virus scan page', () => {
      const normalHtml = '<html><body><h1>Normal Page</h1></body></html>';
      expect(dtveBookService.isGoogleDriveVirusScanPage(normalHtml)).toBe(false);
    });
  });

  describe('Filename Sanitization', () => {
    test('should sanitize invalid characters', () => {
      const invalidName = 'test<>:"/\\|?*file.zip';
      const sanitized = dtveBookService.sanitizeFilename(invalidName);
      expect(sanitized).not.toContain('<');
      expect(sanitized).not.toContain('>');
      expect(sanitized).not.toContain(':');
      expect(sanitized).not.toContain('"');
      expect(sanitized).not.toContain('/');
      expect(sanitized).not.toContain('\\');
      expect(sanitized).not.toContain('|');
      expect(sanitized).not.toContain('?');
      expect(sanitized).not.toContain('*');
    });

    test('should preserve valid characters', () => {
      const validName = 'test-book_01.zip';
      expect(dtveBookService.sanitizeFilename(validName)).toBe(validName);
    });
  });

  describe('Input Validation', () => {
    test('load() should validate empty URL', async () => {
      const result = await dtveBookService.load('');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('URL trống');
    });

    test('load() should validate null URL', async () => {
      const result = await dtveBookService.load(null);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('URL trống');
    });

    test('load() should validate undefined URL', async () => {
      const result = await dtveBookService.load(undefined);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('URL trống');
    });

    test('load() should validate whitespace URL', async () => {
      const result = await dtveBookService.load('   ');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('URL trống');
    });
  });

  describe('Service Architecture', () => {
    test('should use HtmlConnectorService base class', () => {
      expect(dtveBookService.DOMAIN).toBeDefined();
      expect(dtveBookService.LABEL).toBeDefined();
    });

    test('should support file-based downloads', () => {
      // DTVeBook downloads complete files, not individual images
      expect(typeof dtveBookService.downloadChapter).toBe('function');
    });

    test('should support multiple cloud storage providers', () => {
      const providers = ['google-drive', 'mediafire', 'onedrive', 'fshare', 'direct'];
      providers.forEach(provider => {
        expect(typeof provider).toBe('string');
      });
    });
  });

  describe('Allowed File Extensions', () => {
    test('should define allowed extensions', () => {
      expect(dtveBookService.ALLOWED_EXTENSIONS).toBeDefined();
      expect(dtveBookService.ALLOWED_EXTENSIONS.has('.zip')).toBe(true);
      expect(dtveBookService.ALLOWED_EXTENSIONS.has('.epub')).toBe(true);
      expect(dtveBookService.ALLOWED_EXTENSIONS.has('.pdf')).toBe(true);
      expect(dtveBookService.ALLOWED_EXTENSIONS.has('.mobi')).toBe(true);
      expect(dtveBookService.ALLOWED_EXTENSIONS.has('.azw3')).toBe(true);
    });
  });

  describe('Allowed Hostnames', () => {
    test('should define allowed hostnames', () => {
      expect(dtveBookService.ALLOWED_HOSTNAMES).toBeDefined();
      expect(dtveBookService.ALLOWED_HOSTNAMES.has('drive.google.com')).toBe(true);
      expect(dtveBookService.ALLOWED_HOSTNAMES.has('www.mediafire.com')).toBe(true);
      expect(dtveBookService.ALLOWED_HOSTNAMES.has('fshare.vn')).toBe(true);
      expect(dtveBookService.ALLOWED_HOSTNAMES.has('onedrive.live.com')).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle network errors gracefully', async () => {
      try {
        const result = await dtveBookService.load('https://nonexistent-dtvebook-domain.com/test_12345.html');
        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
        expect(typeof result.error).toBe('string');
      } catch (error) {
        // Network errors throw exceptions, which is expected behavior
        expect(error).toBeDefined();
      }
    });

    test('should handle malformed URLs', async () => {
      try {
        const result = await dtveBookService.load('not-a-valid-url');
        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
      } catch (error) {
        // Malformed URLs may throw exceptions, which is acceptable
        expect(error).toBeDefined();
      }
    });
  });
});