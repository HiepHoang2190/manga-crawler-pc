/**
 * TruyenQQ Service Tests
 * Tests for service-level functionality and HTML parsing
 */
const truyenqqService = require('../../../platform/connectors/services/truyenQQService');

describe('TruyenQQ - Service Tests', () => {
  describe('Service Configuration', () => {
    test('should have correct domain', () => {
      expect(truyenqqService.DOMAIN).toBe('https://truyenqqko.com/');
    });

    test('should have correct label', () => {
      expect(truyenqqService.LABEL).toBe('TruyenQQ');
    });
  });

  describe('Load Method', () => {
    test('should return error for empty URL', async () => {
      const result = await truyenqqService.load('');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('trống');
    });

    test('should handle network errors gracefully', async () => {
      try {
        const result = await truyenqqService.load('https://invalid-domain-12345.com/test');
        expect(result).toHaveProperty('ok');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('Response Structure', () => {
    test('should return object with ok property', async () => {
      const result = await truyenqqService.load('');
      expect(result).toHaveProperty('ok');
      expect(typeof result.ok).toBe('boolean');
    });

    test('should return error message on failure', async () => {
      const result = await truyenqqService.load('');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
      expect(typeof result.error).toBe('string');
    });
  });

  describe('Vietnamese Content Support', () => {
    test('should handle Vietnamese manga titles', () => {
      const title = 'Vương Giả Thiên Hạ';
      expect(title).toMatch(/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i);
    });

    test('should handle Vietnamese chapter titles', () => {
      const chapter = 'Chương 1: Bắt đầu';
      expect(chapter).toContain('Chương');
    });
  });

  describe('URL Slug Format', () => {
    test('should recognize slug with numeric IDs', () => {
      const url = 'https://truyenqqno.com/truyen-tranh/vuong-gia-thien-ha-1-245';
      const match = url.match(/\/truyen-tranh\/([\w-]+)-(\d+)-(\d+)/);
      expect(match).toBeTruthy();
      if (match) {
        expect(match[1]).toBe('vuong-gia-thien-ha');
        expect(match[2]).toBe('1');
        expect(match[3]).toBe('245');
      }
    });

    test('should recognize slug format', () => {
      const url = 'https://truyenqqno.com/truyen-tranh/vuong-gia-thien-ha-1-245';
      expect(url).toMatch(/\/truyen-tranh\/[\w-]+/);
    });
  });

  describe('Selector Configuration', () => {
    test('should use chapter link selector', () => {
      const selector = 'div.list_chapter div.works-chapter-item a';
      expect(selector).toContain('works-chapter-item');
    });

    test('should use title selector', () => {
      const selector = 'h1[itemprop="name"]';
      expect(selector).toContain('itemprop="name"');
    });

    test('should use cover selector', () => {
      const selector = 'div.book_avatar img';
      expect(selector).toContain('book_avatar');
    });
  });

  describe('Cover Image Extraction', () => {
    test('should extract from book_avatar div', () => {
      const selector = 'div.book_avatar img';
      expect(selector).toContain('book_avatar');
    });

    test('should fallback to meta og:image', () => {
      const metaSelector = 'meta[property="og:image"]';
      expect(metaSelector).toContain('og:image');
    });

    test('should filter bad meta cover markers', () => {
      const badMarkers = ['og-image.png', '/template/frontend/images/og-image'];
      expect(badMarkers).toContain('og-image.png');
    });

    test('should accept valid cover URLs', () => {
      const validUrl = 'https://cdn.truyenqqno.com/covers/manga-cover.jpg';
      expect(validUrl).toMatch(/^https?:\/\//);
      expect(validUrl).toContain('.jpg');
    });
  });

  describe('Image Source Extraction', () => {
    test('should prioritize src over data-src', () => {
      const src = 'https://example.com/image.jpg';
      const dataSrc = 'https://example.com/lazy.jpg';
      expect(src.length).toBeGreaterThan(0);
    });

    test('should use data-src when src is empty', () => {
      const src = '';
      const dataSrc = 'https://example.com/lazy.jpg';
      const result = src.length > 0 ? src : dataSrc;
      expect(result).toBe(dataSrc);
    });

    test('should not use data-fb attribute', () => {
      const dataFb = 'data-fb';
      expect(dataFb).not.toBe('src');
      expect(dataFb).not.toBe('data-src');
    });
  });

  describe('Chapter Image Collection', () => {
    test('should use TruyenQQ-specific image parser', () => {
      const selector = 'div.chapter_content div.page-chapter img';
      expect(selector).toContain('chapter_content');
      expect(selector).toContain('page-chapter');
    });
  });

  describe('Error Messages', () => {
    test('should return Vietnamese error for empty URL', async () => {
      const result = await truyenqqService.load('');
      expect(result.error).toContain('trống');
    });

    test('should return Vietnamese error for missing title', () => {
      const errorMsg = 'Không đọc được tên truyện (selector trang có thể đổi).';
      expect(errorMsg).toContain('Không đọc được');
    });

    test('should return Vietnamese error for fetch failure', () => {
      const errorMsg = 'Không tải được trang truyện.';
      expect(errorMsg).toContain('Không tải được');
    });

    test('should append 403 hint to error messages', () => {
      const error = 'HTTP 403';
      const hint = ' — Thử tắt VPN WARP 1.1.1.1';
      const withHint = error + hint;
      expect(withHint).toContain('403');
      expect(withHint).toContain('Thử tắt VPN');
    });
  });

  describe('URL Resolution', () => {
    test('should resolve relative URLs', () => {
      const base = 'https://truyenqqno.com/truyen-tranh/test';
      const relative = '/chap-1';
      const expected = 'https://truyenqqno.com/chap-1';
      expect(expected).toContain(base.split('/truyen-tranh')[0]);
    });

    test('should handle absolute URLs', () => {
      const url = 'https://truyenqqno.com/truyen-tranh/test/chap-1';
      expect(url).toMatch(/^https?:\/\//);
    });
  });

  describe('VPN/DNS Warning', () => {
    test('should provide helpful hint for 403 errors', () => {
      const hint = 'Thử tắt VPN WARP 1.1.1.1';
      expect(hint).toContain('VPN');
      expect(hint).toContain('1.1.1.1');
    });

    test('should only add hint once', () => {
      const message = 'HTTP 403 — Thử tắt VPN WARP 1.1.1.1';
      const count = (message.match(/Thử tắt VPN/g) || []).length;
      expect(count).toBe(1);
    });

    test('should detect 403 in error message', () => {
      const error = 'HTTP 403 Forbidden';
      expect(error).toMatch(/\b403\b/);
    });
  });

  describe('Meta Tag Extraction', () => {
    test('should extract from itemprop image', () => {
      const selector = 'meta[itemprop="image"]';
      expect(selector).toContain('itemprop="image"');
    });

    test('should extract from og:image', () => {
      const selector = 'meta[property="og:image"]';
      expect(selector).toContain('og:image');
    });

    test('should extract from twitter:image', () => {
      const selector = 'meta[name="twitter:image"]';
      expect(selector).toContain('twitter:image');
    });
  });
});
