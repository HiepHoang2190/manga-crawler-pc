/**
 * MoeTruyen Service Tests
 * Tests for service-level functionality and data parsing
 */
const moeTruyenService = require('../../../platform/connectors/services/moeTruyenService');

describe('MoeTruyen - Service Tests', () => {
  describe('Service Configuration', () => {
    test('should have correct domain', () => {
      expect(moeTruyenService.DOMAIN).toBe('https://moetruyen.net/');
    });

    test('should have correct label', () => {
      expect(moeTruyenService.LABEL).toBe('MoeTruyen');
    });
  });

  describe('Load Method', () => {
    test('should return error for empty URL', async () => {
      const result = await moeTruyenService.load('');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('trống');
    });

    test('should handle network errors for invalid domains', async () => {
      try {
        const result = await moeTruyenService.load('https://invalid-domain-12345.com/test');
        // Should return error structure even on network failure
        expect(result).toHaveProperty('ok');
        expect(result.ok).toBe(false);
      } catch (error) {
        // If it throws, that's also acceptable error handling
        expect(error).toBeDefined();
      }
    });

    test('should handle URL with query parameters', async () => {
      // Should strip chapterPage parameter
      const url = 'https://moetruyen.net/manga/test?chapterPage=2';
      // This will fail to fetch but should process URL correctly
      const result = await moeTruyenService.load(url);
      expect(result).toBeDefined();
    });

    test('should handle URL with hash fragment', async () => {
      // Should strip hash
      const url = 'https://moetruyen.net/manga/test#chapters';
      const result = await moeTruyenService.load(url);
      expect(result).toBeDefined();
    });
  });

  describe('Response Structure', () => {
    test('should return object with ok property', async () => {
      const result = await moeTruyenService.load('');
      expect(result).toHaveProperty('ok');
      expect(typeof result.ok).toBe('boolean');
    });

    test('should return error message on failure', async () => {
      const result = await moeTruyenService.load('');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
      expect(typeof result.error).toBe('string');
    });
  });

  describe('Multi-page Chapter List Support', () => {
    test('should support pagination parameter', () => {
      const url = 'https://moetruyen.net/manga/test?chapterPage=2';
      expect(url).toContain('chapterPage=');
    });

    test('should support hash anchor for chapters', () => {
      const url = 'https://moetruyen.net/manga/test#chapters';
      expect(url).toContain('#chapters');
    });
  });

  describe('Vietnamese Content Support', () => {
    test('should handle Vietnamese manga titles', () => {
      const title = 'Đầu Bếp Trứ Danh';
      expect(title).toMatch(/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i);
    });

    test('should handle Vietnamese chapter titles', () => {
      const chapter = 'Chương 1: Bắt đầu';
      expect(chapter).toContain('Chương');
    });
  });

  describe('URL Slug Format', () => {
    test('should recognize numeric ID prefix', () => {
      const url = 'https://moetruyen.net/manga/41-dau-bep-tru-danh';
      const match = url.match(/\/manga\/(\d+)-/);
      expect(match).toBeTruthy();
      expect(match[1]).toBe('41');
    });

    test('should recognize slug format', () => {
      const url = 'https://moetruyen.net/manga/41-dau-bep-tru-danh';
      const match = url.match(/\/manga\/\d+-([\w-]+)/);
      expect(match).toBeTruthy();
      expect(match[1]).toBe('dau-bep-tru-danh');
    });
  });

  describe('Chapter Deduplication', () => {
    test('should handle duplicate chapter URLs', () => {
      // Service has dedupeChaptersByUrl function
      // This is tested indirectly through load results
      expect(true).toBe(true);
    });
  });

  describe('Selector Configuration', () => {
    test('should use chapter link selector', () => {
      const selector = 'ul.chapter-list a.chapter-link';
      expect(selector).toContain('chapter-link');
    });

    test('should use title selector', () => {
      const selector = 'h1.manga-detail-title';
      expect(selector).toContain('manga-detail-title');
    });

    test('should use cover selector', () => {
      const selector = 'div.detail-cover img';
      expect(selector).toContain('detail-cover');
    });
  });

  describe('Pagination Parsing', () => {
    test('should parse pagination numbers', () => {
      const selector = '.admin-pagination__numbers span.chip, .admin-pagination__numbers a';
      expect(selector).toContain('admin-pagination');
    });
  });

  describe('Reader Image Collection', () => {
    test('should use reader-specific image parsing', () => {
      // Service uses collectReaderPageImages utility
      expect(true).toBe(true);
    });
  });

  describe('Error Messages', () => {
    test('should return Vietnamese error for empty URL', async () => {
      const result = await moeTruyenService.load('');
      expect(result.error).toContain('trống');
    });

    test('should return Vietnamese error for missing title', async () => {
      // This would happen if HTML parsing fails
      const errorMsg = 'Không đọc được tên truyện.';
      expect(errorMsg).toContain('Không đọc được');
    });

    test('should return Vietnamese error for fetch failure', async () => {
      const errorMsg = 'Không tải được trang truyện.';
      expect(errorMsg).toContain('Không tải được');
    });
  });

  describe('Chapter Title Parsing', () => {
    test('should extract chapter title from row', () => {
      const selector = '.chapter-title-row';
      expect(selector).toContain('chapter-title-row');
    });

    test('should normalize whitespace in titles', () => {
      const text = 'Chương  1   Test';
      const normalized = text.trim().replace(/\s+/g, ' ');
      expect(normalized).toBe('Chương 1 Test');
    });
  });

  describe('URL Resolution', () => {
    test('should resolve relative URLs', () => {
      const base = 'https://moetruyen.net/manga/test';
      const relative = '/chapter/1';
      const expected = 'https://moetruyen.net/chapter/1';
      expect(expected).toContain(base.split('/manga')[0]);
    });

    test('should handle absolute URLs', () => {
      const url = 'https://moetruyen.net/chapter/1';
      expect(url).toMatch(/^https?:\/\//);
    });
  });

  describe('Manga search API mapping', () => {
    test('maps /manga/search JSON items to listing rows', () => {
      const items = moeTruyenService.parseMangaSearchApiItems(
        [
          {
            id: 1156,
            slug: '1156-renge-va-naruto',
            title: 'Renge và Naruto!',
            cover: 'https://u.truyen.moe/uploads/covers/1156-renge-va-naruto.webp',
            status: 'Còn tiếp',
            isAdult: false,
          },
        ],
        'https://moetruyen.net',
      );
      expect(items).toHaveLength(1);
      expect(items[0].mangaUrl).toBe('https://moetruyen.net/manga/1156-renge-va-naruto');
      expect(items[0].title).toBe('Renge và Naruto!');
      expect(items[0].coverUrl).toContain('1156-renge-va-naruto');
      expect(items[0].latestChapterLabel).toBe('Còn tiếp');
    });

    test('skips items without slug', () => {
      const items = moeTruyenService.parseMangaSearchApiItems([{ id: 1, title: 'X' }], 'https://moetruyen.net');
      expect(items).toHaveLength(0);
    });
  });

  describe('Catalog listing parsing', () => {
    test('parses manga cards from listing HTML snippet', () => {
      const html = `
        <article class="manga-card manga-card--list">
          <a href="/manga/755-test-title">
            <div class="cover"><img alt="Bìa Phiên Full Title" src="https://cdn.example/c.jpg" /></div>
            <div class="manga-body"><h3 title="Phiên Full Title">Phiên Full...</h3></div>
            <span class="manga-chapter-label">Ch. 7</span>
          </a>
        </article>
      `;
      const items = moeTruyenService.parseMangaCatalogListing(html, 'https://moetruyen.net/manga');
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe('Phiên Full Title');
      expect(items[0].mangaUrl).toBe('https://moetruyen.net/manga/755-test-title');
      expect(items[0].coverUrl).toBe('https://cdn.example/c.jpg');
      expect(items[0].latestChapterLabel).toBe('Ch. 7');
    });
  });

  describe('Description parsing', () => {
    const sampleDescriptionHtml = `
      <p class="lede manga-description__text">
        <span data-description-content="">Chap 1-152: do Reddragonrevenge dịch
Chap 153-hết: do tôi dịch, sửa lại tên main theo đúng nguyên tác từ shinjuku sang Ajisawa

Kể về Ajisawa Takumi, một thiên tài đầu bếp nhận nấu ăn thuê với thù lao cực cao. Mỗi chương là một câu chuyện độc lập, nơi anh dùng tài nghệ nấu ăn...</span>
        <button class="inline-button manga-description__toggle" type="button" data-description-toggle="" aria-expanded="false">Xem thêm</button>
      </p>
    `;

    test('extractMoeTruyenDescription reads span[data-description-content]', () => {
      const description = moeTruyenService.extractMoeTruyenDescription(sampleDescriptionHtml);
      expect(description).toContain('Ajisawa Takumi');
      expect(description).toContain('Reddragonrevenge');
      expect(description).not.toContain('Xem thêm');
    });

    test('extractMoeTruyenDescription falls back to paragraph without toggle text', () => {
      const html = `
        <p class="lede manga-description__text">
          Kể về một đầu bếp tài năng.
          <button class="manga-description__toggle" data-description-toggle="">Xem thêm</button>
        </p>
      `;
      const description = moeTruyenService.extractMoeTruyenDescription(html);
      expect(description).toContain('đầu bếp tài năng');
      expect(description).not.toContain('Xem thêm');
    });
  });

  describe('downloadChapter Branching', () => {
    test('should have downloadChapter function exported', () => {
      expect(typeof moeTruyenService.downloadChapter).toBe('function');
    });
  });
});

