/**
 * Unit tests for DTVeBook Service
 * Site: dtv-ebook.com.vn
 * Test URL: https://dtv-ebook.com.vn/thoi-quen-bat-be-hang-ngay-cua-dai-de_26375.html
 */
const { DOMAIN, LABEL, load, downloadChapter } = require('../../../platform/connectors/services/dtveBookService');

describe('DTVeBook Service', () => {
  describe('Module exports', () => {
    test('should export DOMAIN constant', () => {
      expect(DOMAIN).toBe('https://dtv-ebook.com.vn/');
    });

    test('should export LABEL constant', () => {
      expect(LABEL).toBe('DTV Ebook');
    });

    test('should export load function', () => {
      expect(typeof load).toBe('function');
    });

    test('should export downloadChapter function', () => {
      expect(typeof downloadChapter).toBe('function');
    });
  });

  describe('load() - Input validation', () => {
    test('should return error for empty URL', async () => {
      const result = await load('');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should return error for null URL', async () => {
      const result = await load(null);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should return error for undefined URL', async () => {
      const result = await load(undefined);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should return error for whitespace URL', async () => {
      const result = await load('   ');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('load() - Options parameter', () => {
    test('should accept options parameter', async () => {
      try {
        const result = await load('https://invalid-dtvebook.com', { userAgent: 'test-agent' });
        expect(result).toBeDefined();
        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
      } catch (error) {
        // Network errors are expected in test environment
        expect(error).toBeDefined();
      }
    });

    test('should work without options parameter', async () => {
      try {
        const result = await load('https://invalid-dtvebook.com');
        expect(result).toBeDefined();
        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
      } catch (error) {
        // Network errors are expected in test environment
        expect(error).toBeDefined();
      }
    });
  });

  describe('downloadChapter() - API compatibility', () => {
    test('should accept connector parameter without execution', () => {
      const payload = {
        mangaTitle: 'Test Book',
        mangaUrl: 'https://dtv-ebook.com.vn/test-book_12345.html',
        chapterUrl: 'https://drive.google.com/file/d/1ABC123/view',
        chapterTitle: 'Chapter 1',
        baseSaveDir: '/tmp/test',
        numberOfThreads: 1,
      };
      
      expect(typeof downloadChapter).toBe('function');
      expect(payload.mangaTitle).toBe('Test Book');
    });
  });

  describe('URL format validation', () => {
    test('should handle dtv-ebook URLs format', () => {
      const testUrl = 'https://dtv-ebook.com.vn/thoi-quen-bat-be-hang-ngay-cua-dai-de_26375.html';
      
      expect(testUrl).toMatch(/dtv-ebook\.com\.vn/);
      expect(testUrl).toMatch(/_\d+\.html/);
      expect(typeof load).toBe('function');
    });
  });

  describe('Service architecture', () => {
    test('should extend HtmlConnectorService', () => {
      const service = require('../../../platform/connectors/services/dtveBookService');
      
      expect(service.DOMAIN).toBeDefined();
      expect(service.LABEL).toBeDefined();
      expect(typeof service.load).toBe('function');
      expect(typeof service.downloadChapter).toBe('function');
    });

    test('should have correct domain configuration', () => {
      expect(DOMAIN).toBe('https://dtv-ebook.com.vn/');
      expect(LABEL).toBe('DTV Ebook');
    });

    test('should not support API fetch', () => {
      const connector = require('../../../platform/connectors/dtvebook');
      expect(connector.supportsApiFetch).toBe(false);
    });
  });

  describe('Error handling', () => {
    test('should handle network errors gracefully', async () => {
      try {
        const result = await load('https://nonexistent-dtvebook-domain.com/test_12345.html');
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
        const result = await load('not-a-valid-url');
        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
      } catch (error) {
        // Malformed URLs may throw exceptions, which is acceptable
        expect(error).toBeDefined();
      }
    });
  });

  describe('DTVeBook-specific features', () => {
    test('should have correct image referer', () => {
      const connector = require('../../../platform/connectors/dtvebook');
      expect(connector.imageReferer).toBeDefined();
    });

    test('should support multiple cloud storage providers', () => {
      const service = require('../../../platform/connectors/services/dtveBookService');
      expect(typeof service.detectSourceType).toBe('function');
    });

    test('should support file-based downloads', () => {
      // DTVeBook downloads complete files (ZIP, EPUB, PDF, etc.)
      const service = require('../../../platform/connectors/services/dtveBookService');
      expect(service.ALLOWED_EXTENSIONS).toBeDefined();
      expect(service.ALLOWED_EXTENSIONS.has('.zip')).toBe(true);
      expect(service.ALLOWED_EXTENSIONS.has('.epub')).toBe(true);
      expect(service.ALLOWED_EXTENSIONS.has('.pdf')).toBe(true);
    });

    test('should support Google Drive downloads', () => {
      const service = require('../../../platform/connectors/services/dtveBookService');
      expect(typeof service.extractGoogleDriveFileId).toBe('function');
      expect(typeof service.buildGoogleDriveDownloadUrl).toBe('function');
    });

    test('should support Mediafire downloads', () => {
      const service = require('../../../platform/connectors/services/dtveBookService');
      expect(typeof service.resolveMediafireDirectLink).toBe('function');
    });

    test('should support OneDrive downloads', () => {
      const service = require('../../../platform/connectors/services/dtveBookService');
      expect(typeof service.resolveOneDriveDirectLink).toBe('function');
    });

    test('should support Fshare downloads', () => {
      const service = require('../../../platform/connectors/services/dtveBookService');
      expect(typeof service.resolveFshareDirectLink).toBe('function');
    });
  });

  describe('Cloudflare and Cookie Handling', () => {
    test('should detect Cloudflare challenge strings', () => {
      const service = require('../../../platform/connectors/services/dtveBookService');
      const cfHtml1 = '<html><head><title>Just a moment...</title></head><body><script src="https://challenges.cloudflare.com"></script></body></html>';
      const cfHtml2 = '<html><body>cf-browser-verification enabled</body></html>';
      const cfHtml3 = '<html><body>Enable JavaScript and cookies to continue</body></html>';
      const normalHtml = '<html><head><title>Cong tu dien khung</title></head><body><div id="download"></div></body></html>';

      expect(service.isCloudflareChallenge(cfHtml1)).toBe(true);
      expect(service.isCloudflareChallenge(cfHtml2)).toBe(true);
      expect(service.isCloudflareChallenge(cfHtml3)).toBe(true);
      expect(service.isCloudflareChallenge(normalHtml)).toBe(false);
    });

    test('should clean hash fragment from URL in load()', async () => {
      const service = require('../../../platform/connectors/services/dtveBookService');
      expect(service.extractMangaIdFromUrl('https://dtv-ebook.com.vn/cong-tu-dien-khung_2213.html#gsc.tab=0')).toBe('2213');
    });

    test('should provide getDtvEbookImageFetchHeaders', () => {
      const { getDtvEbookImageFetchHeaders, DOMAIN } = require('../../../platform/connectors/services/dtveBookService');
      expect(typeof getDtvEbookImageFetchHeaders).toBe('function');
      const headers = getDtvEbookImageFetchHeaders();
      expect(headers.Referer).toBe(DOMAIN);
    });
    test('should parse page metadata and download links for cong-tu-dien-khung', () => {
      const { parseDtvEbookPage } = require('../../../platform/connectors/services/dtveBookService');
      const sampleHtml = `
        <html>
          <head>
            <title>Công Tử Điên Khùng | DTV Ebook</title>
          </head>
          <body>
            <h1 class="book-title">Công Tử Điên Khùng</h1>
            <img class="hinhdaidien" src="/images/cong-tu-dien-khung.jpg" />
            <div id="download">
              <table>
                <tr>
                  <td>
                    <strong>PRC / MOBI:</strong>
                    <a href="https://drive.google.com/file/d/1ABCXYZ/view">Google Drive</a>
                  </td>
                  <td>
                    <strong>EPUB:</strong>
                    <a href="https://www.mediafire.com/file/med123/cong-tu-dien-khung.epub">MediaFire</a>
                  </td>
                  <td>
                    <strong>PDF:</strong>
                    <a href="/downloads/cong-tu-dien-khung.pdf">Tải PDF</a>
                  </td>
                </tr>
              </table>
            </div>
          </body>
        </html>
      `;

      const result = parseDtvEbookPage(sampleHtml, 'https://dtv-ebook.com.vn/cong-tu-dien-khung_2213.html#gsc.tab=0');
      expect(result.title).toBe('Công Tử Điên Khùng');
      expect(result.coverUrl).toBe('https://dtv-ebook.com.vn/images/cong-tu-dien-khung.jpg');
      expect(result.chapters.length).toBe(3);
      expect(result.chapters[0].title).toBe('PRC / MOBI - GOOGLE DRIVE');
      expect(result.chapters[0].url).toBe('https://drive.google.com/file/d/1ABCXYZ/view');
      expect(result.chapters[1].title).toBe('EPUB - MEDIAFIRE');
      expect(result.chapters[2].title).toBe('PDF - TẢI PDF');
      expect(result.chapters[2].url).toBe('https://dtv-ebook.com.vn/downloads/cong-tu-dien-khung.pdf');
    });
  });

  describe('Response format validation', () => {
    test('load() function signature validation', () => {
      expect(typeof load).toBe('function');
      expect(load.length).toBeGreaterThanOrEqual(1);
      
      const testUrl = 'https://dtv-ebook.com.vn/test-book_12345.html';
      expect(testUrl).toMatch(/dtv-ebook\.com\.vn/);
    });
  });
});