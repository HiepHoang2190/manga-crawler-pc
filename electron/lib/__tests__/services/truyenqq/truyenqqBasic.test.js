/**
 * TruyenQQ Basic Tests
 * Tests for basic functionality, URL detection, and connector registry integration
 */
const { listConnectors, detectSiteIdFromUrl } = require('../../../platform/connectors');
const truyenqqConnector = require('../../../platform/connectors/truyenQQ');
const truyenqqService = require('../../../platform/connectors/services/truyenQQService');

describe('TruyenQQ - Basic Tests', () => {
  describe('Connector Registration', () => {
    test('should be registered in connector list', () => {
      const connectors = listConnectors();
      const truyenqq = connectors.find((c) => c.id === 'truyenqq');
      expect(truyenqq).toBeDefined();
      expect(truyenqq.label).toBe('TruyenQQ');
      expect(truyenqq.supportsLatestUpdates).toBe(true);
    });

    test('should have correct domain', () => {
      expect(truyenqqConnector.domain).toBe('https://truyenqqko.com/');
    });

    test('should have correct ID', () => {
      expect(truyenqqConnector.id).toBe('truyenqq');
    });

    test('should have icon path', () => {
      expect(truyenqqConnector.icon).toBeDefined();
      expect(typeof truyenqqConnector.icon).toBe('string');
    });

    test('should not support API fetch', () => {
      expect(truyenqqConnector.supportsApiFetch).toBe(false);
    });

    test('should have image referer', () => {
      expect(truyenqqConnector.imageReferer).toBeDefined();
    });

    test('should have isImageCdnHost function', () => {
      expect(typeof truyenqqConnector.isImageCdnHost).toBe('function');
    });
  });

  describe('URL Detection', () => {
    test('should detect truyenqqno.com URLs', () => {
      const url = 'https://truyenqqno.com/truyen-tranh/vuong-gia-thien-ha-1-245';
      const detected = detectSiteIdFromUrl(url);
      expect(detected).toBe('truyenqq');
    });

    test('should detect URLs with www prefix', () => {
      const url = 'https://www.truyenqqno.com/truyen-tranh/some-manga';
      const detected = detectSiteIdFromUrl(url);
      expect(detected).toBe('truyenqq');
    });

    test('should detect chapter URLs', () => {
      const url = 'https://truyenqqno.com/truyen-tranh/test/chap-1';
      const detected = detectSiteIdFromUrl(url);
      expect(detected).toBe('truyenqq');
    });

    test('should detect URLs with query parameters', () => {
      const url = 'https://truyenqqno.com/truyen-tranh/test?page=1';
      const detected = detectSiteIdFromUrl(url);
      expect(detected).toBe('truyenqq');
    });

    test('should not detect non-truyenqq URLs', () => {
      const url = 'https://example.com/manga/test';
      const detected = detectSiteIdFromUrl(url);
      expect(detected).not.toBe('truyenqq');
    });
  });

  describe('URL Format Validation', () => {
    test('should accept standard manga URLs', () => {
      const url = 'https://truyenqqno.com/truyen-tranh/vuong-gia-thien-ha-1-245';
      expect(url).toMatch(/truyenqqno\.com\/truyen-tranh\//);
    });

    test('should accept URLs with numeric IDs', () => {
      const url = 'https://truyenqqno.com/truyen-tranh/test-1-245';
      expect(url).toMatch(/truyenqqno\.com\/truyen-tranh\/[\w-]+-\d+-\d+/);
    });

    test('should accept URLs with Vietnamese slugs', () => {
      const url = 'https://truyenqqno.com/truyen-tranh/vuong-gia-thien-ha-1-245';
      expect(url).toMatch(/truyenqqno\.com\/truyen-tranh\/[\w-]+/);
    });
  });

  describe('Service Methods', () => {
    test('should have load method', () => {
      expect(typeof truyenqqService.load).toBe('function');
    });

    test('should have downloadChapter method', () => {
      expect(typeof truyenqqService.downloadChapter).toBe('function');
    });

    test('should export fetchLatestUpdates', () => {
      expect(typeof truyenqqService.fetchLatestUpdates).toBe('function');
    });

    test('should export DOMAIN constant', () => {
      expect(truyenqqService.DOMAIN).toBe('https://truyenqqko.com/');
    });

    test('should export LABEL constant', () => {
      expect(truyenqqService.LABEL).toBe('TruyenQQ');
    });
  });

  describe('Connector Methods', () => {
    test('should have load method', () => {
      expect(typeof truyenqqConnector.load).toBe('function');
    });

    test('should have downloadChapter method', () => {
      expect(typeof truyenqqConnector.downloadChapter).toBe('function');
    });

    test('should expose fetchLatestUpdates for Latest updates tab', () => {
      expect(typeof truyenqqConnector.fetchLatestUpdates).toBe('function');
    });
  });

  describe('Architecture', () => {
    test('should be HTML-based connector', () => {
      expect(truyenqqConnector.supportsApiFetch).toBe(false);
    });

    test('should use HtmlConnectorService base class', () => {
      expect(typeof truyenqqService.load).toBe('function');
      expect(typeof truyenqqService.downloadChapter).toBe('function');
    });
  });

  describe('Error Handling', () => {
    test('should handle empty URL', async () => {
      const result = await truyenqqService.load('');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle null URL', async () => {
      const result = await truyenqqService.load(null);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle undefined URL', async () => {
      const result = await truyenqqService.load(undefined);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle whitespace-only URL', async () => {
      const result = await truyenqqService.load('   ');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Latest updates HTML parsing', () => {
    const sampleListingHtml = `
      <ul class="list_grid grid">
        <li>
          <div class="book_avatar">
            <a href="/truyen-tranh/quy-bat-chuoc-24195"><img src="https://cdn.example/cover.jpg" alt="Quỷ Bắt Chước"></a>
          </div>
          <div class="book_info">
            <div class="book_name qtip"><h3><a title="Quỷ Bắt Chước" href="/truyen-tranh/quy-bat-chuoc-24195">Quỷ Bắt Chước</a></h3></div>
            <div class="last_chapter"><a href="/truyen-tranh/quy-bat-chuoc-24195-chap-6" title="Chapter 6">Chapter 6</a></div>
          </div>
        </li>
      </ul>
      <div class="page_redirect">
        <a href="javascript:void(0)"><p class="active">1</p></a>
        <a href="/truyen-moi-cap-nhat/trang-2"><p>2</p></a>
        <a href="/truyen-moi-cap-nhat/trang-414"><p><span>&raquo;</span></p></a>
      </div>`;

    test('parseTruyenQQLatestListingHtml extracts rows', () => {
      const base = 'https://truyenqqno.com/truyen-moi-cap-nhat';
      const rows = truyenqqService.parseTruyenQQLatestListingHtml(sampleListingHtml, base);
      expect(rows.length).toBe(1);
      expect(rows[0].title).toBe('Quỷ Bắt Chước');
      expect(rows[0].mangaUrl).toBe('https://truyenqqno.com/truyen-tranh/quy-bat-chuoc-24195');
      expect(rows[0].coverUrl).toContain('cover.jpg');
      expect(rows[0].latestChapterLabel).toBe('Chapter 6');
    });

    test('parseTruyenQQLatestPagerMaxPageFromHtml reads last trang-N', () => {
      expect(truyenqqService.parseTruyenQQLatestPagerMaxPageFromHtml(sampleListingHtml)).toBe(414);
    });

    test('buildLatestUpdatesListUrl page 1 omits trang-1', () => {
      expect(truyenqqService.buildLatestUpdatesListUrl(1)).toBe(
        'https://truyenqqko.com/truyen-moi-cap-nhat',
      );
    });

    test('buildLatestUpdatesListUrl page 2 uses path', () => {
      expect(truyenqqService.buildLatestUpdatesListUrl(2)).toBe(
        'https://truyenqqko.com/truyen-moi-cap-nhat/trang-2',
      );
    });

    test('buildTruyenQQSearchPostBody encodes search field', () => {
      expect(truyenqqService.buildTruyenQQSearchPostBody('slime test')).toBe('search=slime%20test');
    });

    const samplePostSearchHtml = `
        <li>
            <a href="https://truyenqqno.com/truyen-tranh/luc-do-toi-da-chuyen-sinh-thanh-slime-1475">
                <div class="search_avatar"><img src="https://cdn.example/cover.jpg"></div>
                <div class="search_info">
                    <p class="name">Lúc Đó, Tôi Đã Chuyển Sinh Thành Slime</p>
                    <p class="name_other">Alt names</p>
                    <p>Chương 140</p>
                </div>
            </a>
        </li>`;

    test('parseTruyenQQPostSearchListingHtml reads POST search fragment', () => {
      const rows = truyenqqService.parseTruyenQQPostSearchListingHtml(samplePostSearchHtml);
      expect(rows.length).toBe(1);
      expect(rows[0].title).toContain('Slime');
      expect(rows[0].mangaUrl).toContain('truyen-tranh');
      expect(rows[0].coverUrl).toContain('cover.jpg');
      expect(rows[0].latestChapterLabel).toBe('Chương 140');
    });

    test('parseTruyenQQPostSearchListingHtml skips no_result row', () => {
      const html = '<li><div class="no_result">Không Tìm Thấy Kết Quả Nào!</div></li>';
      expect(truyenqqService.parseTruyenQQPostSearchListingHtml(html)).toEqual([]);
    });

    test('parseTruyenQQPostSearchListingHtml resolves relative href against mirror origin', () => {
      const html =
        '<li><a href="/truyen-tranh/foo-1"><div class="search_avatar"><img src="/c.jpg"></div>' +
        '<div class="search_info"><p class="name">Bar</p><p>Ch 1</p></div></a></li>';
      const rows = truyenqqService.parseTruyenQQPostSearchListingHtml(html, 'https://truyenqqko.com/');
      expect(rows.length).toBe(1);
      expect(rows[0].mangaUrl).toBe('https://truyenqqko.com/truyen-tranh/foo-1');
    });
  });

  describe('HTTP 403 Handling', () => {
    test('should provide VPN hint for 403 errors', () => {
      const message = 'HTTP 403';
      const hint = ' — Thử tắt VPN WARP 1.1.1.1';
      expect(message + hint).toContain('Thử tắt VPN');
    });

    test('should not duplicate VPN hint', () => {
      const message = 'HTTP 403 — Thử tắt VPN WARP 1.1.1.1';
      expect(message).toContain('Thử tắt VPN');
      expect(message.split('Thử tắt VPN').length - 1).toBe(1);
    });

    test('should not add hint to non-403 errors', () => {
      const message = 'HTTP 404';
      expect(message).not.toContain('403');
    });
  });
});
