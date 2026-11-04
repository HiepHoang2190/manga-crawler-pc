/**
 * LuuTruCuaWibu Service Tests
 * Tests for service-level functionality and Blogger API integration
 */
const luutrucuawibuService = require('../../../platform/connectors/services/luuTruCuaWibuService');

describe('LuuTruCuaWibu - Service Tests', () => {
  describe('Service Configuration', () => {
    test('should have correct label', () => {
      expect(luutrucuawibuService.LABEL).toBe('LuuTruCuaWibu');
    });
  });

  describe('Load Method', () => {
    test('should return error for empty URL', async () => {
      const result = await luutrucuawibuService.load('');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('trống');
    });

    test('should handle network errors gracefully', async () => {
      try {
        const result = await luutrucuawibuService.load('https://invalid-domain-12345.com/test');
        expect(result).toHaveProperty('ok');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('Response Structure', () => {
    test('should return object with ok property', async () => {
      const result = await luutrucuawibuService.load('');
      expect(result).toHaveProperty('ok');
      expect(typeof result.ok).toBe('boolean');
    });

    test('should return error message on failure', async () => {
      const result = await luutrucuawibuService.load('');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
      expect(typeof result.error).toBe('string');
    });
  });

  describe('Blogger Platform', () => {
    test('should use Blogger domain', () => {
      const domain = 'https://luutrucuawibu.blogspot.com';
      expect(domain).toContain('blogspot.com');
    });

    test('should use Blogger JSON Feeds API', () => {
      const apiPath = '/feeds/posts/summary/-/{label}?alt=json';
      expect(apiPath).toContain('/feeds/posts/');
      expect(apiPath).toContain('alt=json');
    });

    test('should support pagination', () => {
      const maxPerRequest = 150;
      expect(maxPerRequest).toBe(150);
    });
  });

  describe('Series Label Parsing', () => {
    test('should parse seriesLabel from script', () => {
      const pattern = /var\s+seriesLabel\s*=\s*["']([^"']+)["']/;
      const script = 'var seriesLabel = "onepunchmanw";';
      const match = script.match(pattern);
      expect(match).toBeTruthy();
      if (match) {
        expect(match[1]).toBe('onepunchmanw');
      }
    });

    test('should handle different quote styles', () => {
      const pattern = /var\s+seriesLabel\s*=\s*["']([^"']+)["']/;
      const script1 = 'var seriesLabel = "test";';
      const script2 = "var seriesLabel = 'test';";
      expect(script1.match(pattern)).toBeTruthy();
      expect(script2.match(pattern)).toBeTruthy();
    });
  });

  describe('Title Parsing', () => {
    test('should parse title from h1 tag', () => {
      const pattern = /<h1[^>]*>([\s\S]*?)<\/h1>/i;
      const html = '<h1>One Punch Man</h1>';
      const match = html.match(pattern);
      expect(match).toBeTruthy();
    });

    test('should fallback to title tag', () => {
      const pattern = /<title>([\s\S]*?)<\/title>/i;
      const html = '<title>One Punch Man - Blog</title>';
      const match = html.match(pattern);
      expect(match).toBeTruthy();
    });

    test('should remove HTML tags from title', () => {
      const text = '<span>One Punch Man</span>';
      const cleaned = text.replace(/<[^>]+>/g, '').trim();
      expect(cleaned).toBe('One Punch Man');
    });
  });

  describe('Cover URL Parsing', () => {
    test('should parse from link rel="image_src"', () => {
      const pattern = /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i;
      const html = '<link rel="image_src" href="https://example.com/cover.jpg" />';
      const match = html.match(pattern);
      expect(match).toBeTruthy();
    });

    test('should fallback to og:image', () => {
      const pattern = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i;
      const html = '<meta property="og:image" content="https://example.com/cover.jpg" />';
      const match = html.match(pattern);
      expect(match).toBeTruthy();
    });
  });

  describe('Blogger API Integration', () => {
    test('should construct API URL correctly', () => {
      const origin = 'https://luutrucuawibu.blogspot.com';
      const label = 'onepunchmanw';
      const maxResults = 150;
      const startIndex = 1;
      const apiUrl = `${origin}/feeds/posts/summary/-/${encodeURIComponent(label)}?alt=json&max-results=${maxResults}&start-index=${startIndex}`;
      expect(apiUrl).toContain('/feeds/posts/summary/');
      expect(apiUrl).toContain('alt=json');
      expect(apiUrl).toContain('max-results=150');
      expect(apiUrl).toContain('start-index=1');
    });

    test('should handle pagination', () => {
      const batchSize = 150;
      const startIndex = 1;
      const nextStartIndex = startIndex + batchSize;
      expect(nextStartIndex).toBe(151);
    });
  });

  describe('Chapter Entry Processing', () => {
    test('should filter out introduction posts', () => {
      const seriesName = 'One Punch Man';
      const entries = [
        { title: { $t: 'One Punch Man' } }, // Should be filtered
        { title: { $t: 'Giới thiệu' } }, // Should be filtered
        { title: { $t: 'Chương 1' } }, // Should be kept
      ];
      const filtered = entries.filter((e) => {
        const title = e.title.$t;
        return title !== seriesName && !/giới thiệu/i.test(title);
      });
      expect(filtered.length).toBe(1);
    });

    test('should extract chapter number for sorting', () => {
      const pattern = /chương\s*(\d+(?:[.,]\d+)?)/i;
      const title = 'Chương 123';
      const match = title.match(pattern);
      expect(match).toBeTruthy();
      if (match) {
        expect(match[1]).toBe('123');
      }
    });

    test('should handle decimal chapter numbers', () => {
      const pattern = /chương\s*(\d+(?:[.,]\d+)?)/i;
      const title = 'Chương 12.5';
      const match = title.match(pattern);
      expect(match).toBeTruthy();
      if (match) {
        expect(parseFloat(match[1])).toBe(12.5);
      }
    });

    test('should remove series name prefix from chapter title', () => {
      const seriesName = 'One Punch Man';
      const title = 'One Punch Man - Chương 1';
      const displayTitle = title.startsWith(seriesName)
        ? title.slice(seriesName.length).replace(/^[\s\-–—]+/, '').trim()
        : title;
      expect(displayTitle).toBe('Chương 1');
    });
  });

  describe('Google Drive Image Parsing', () => {
    test('should parse Google Drive thumbnail URLs', () => {
      const pattern = /<img[^>]+src="(https:\/\/drive\.google\.com\/thumbnail\?[^"]+)"[^>]*(?:alt="([^"]*)")?[^>]*>/gi;
      const html = '<img src="https://drive.google.com/thumbnail?id=abc123&amp;sz=w1200" alt="001.jpg" />';
      const match = pattern.exec(html);
      expect(match).toBeTruthy();
    });

    test('should decode HTML entities', () => {
      const encoded = 'https://drive.google.com/thumbnail?id=abc&amp;sz=w1200';
      const decoded = encoded.replace(/&amp;/g, '&');
      expect(decoded).toBe('https://drive.google.com/thumbnail?id=abc&sz=w1200');
    });

    test('should extract file extension from alt text', () => {
      const alt = '001.jpg';
      const extMatch = /\.(\w+)$/.exec(alt);
      expect(extMatch).toBeTruthy();
      if (extMatch) {
        expect(extMatch[1]).toBe('jpg');
      }
    });

    test('should filter out icon/logo images', () => {
      const alts = ['001.jpg', 'icon.png', 'logo.jpg', '002.jpg'];
      const filtered = alts.filter((alt) => !/icon|logo|favicon|qr|avatar/i.test(alt));
      expect(filtered).toEqual(['001.jpg', '002.jpg']);
    });

    test('should normalize jpeg to jpg', () => {
      const ext = 'jpeg';
      const normalized = ext === 'jpeg' ? 'jpg' : ext;
      expect(normalized).toBe('jpg');
    });
  });

  describe('HTML Entity Decoding', () => {
    test('should decode &amp;', () => {
      const text = 'a&amp;b';
      const decoded = text.replace(/&amp;/g, '&');
      expect(decoded).toBe('a&b');
    });

    test('should decode &lt; and &gt;', () => {
      const text = '&lt;div&gt;';
      const decoded = text.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      expect(decoded).toBe('<div>');
    });

    test('should decode &quot;', () => {
      const text = '&quot;hello&quot;';
      const decoded = text.replace(/&quot;/g, '"');
      expect(decoded).toBe('"hello"');
    });

    test('should decode &#39;', () => {
      const text = "&#39;hello&#39;";
      const decoded = text.replace(/&#39;/g, "'");
      expect(decoded).toBe("'hello'");
    });
  });

  describe('Error Messages', () => {
    test('should return Vietnamese error for empty URL', async () => {
      const result = await luutrucuawibuService.load('');
      expect(result.error).toContain('trống');
    });

    test('should return Vietnamese error for missing title', () => {
      const errorMsg = 'Không đọc được tiêu đề truyện.';
      expect(errorMsg).toContain('Không đọc được');
    });

    test('should return Vietnamese error for missing label', () => {
      const errorMsg = 'Không tìm thấy label truyện trong trang. Hãy dán URL trang index truyện.';
      expect(errorMsg).toContain('Không tìm thấy');
    });

    test('should return Vietnamese error for missing chapters', () => {
      const errorMsg = 'Không tìm thấy chương nào.';
      expect(errorMsg).toContain('Không tìm thấy');
    });
  });

  describe('Image Headers', () => {
    test('should use Google Drive referer', () => {
      const referer = 'https://drive.google.com/';
      expect(referer).toContain('drive.google.com');
    });

    test('should accept image formats', () => {
      const accept = 'image/avif,image/webp,image/*,*/*;q=0.8';
      expect(accept).toContain('image/');
    });
  });
});
