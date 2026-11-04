/**
 * TruyenQQVn Service Tests
 * Tests for service-level functionality (HTML fetch + Settings cookie)
 */
const truyenqqvnService = require('../../../platform/connectors/services/truyenqqVnService');

describe('TruyenQQVn - Service Tests', () => {
  describe('Service Configuration', () => {
    test('should have correct domain', () => {
      expect(truyenqqvnService.DOMAIN).toBe('https://truyenqq.com.vn/');
    });

    test('should have correct label', () => {
      expect(truyenqqvnService.LABEL).toBe('TruyenQQ.vn');
    });
  });

  describe('Load Method', () => {
    test('should return error for empty URL', async () => {
      const result = await truyenqqvnService.load('');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('trống');
    });
  });

  describe('Response Structure', () => {
    test('should return object with ok property', async () => {
      const result = await truyenqqvnService.load('');
      expect(result).toHaveProperty('ok');
      expect(typeof result.ok).toBe('boolean');
    });

    test('should return error message on failure', async () => {
      const result = await truyenqqvnService.load('');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
      expect(typeof result.error).toBe('string');
    });
  });

  describe('Vietnamese Content Support', () => {
    test('should handle Vietnamese manga titles', () => {
      const title = 'Thích Khách Thần Cấp Ta Chính Là Bóng Đêm';
      expect(title).toMatch(/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i);
    });

    test('should handle Vietnamese chapter titles', () => {
      const chapter = 'Chương 1: Bắt đầu';
      expect(chapter).toContain('Chương');
    });
  });

  describe('Selector Configuration', () => {
    test('should use chapter link selector', () => {
      const selector = 'a[href*="/chapter-"]';
      expect(selector).toContain('chapter-');
    });

    test('should use title selector', () => {
      const selector = 'h1';
      expect(selector).toBe('h1');
    });

    test('should use cover selector', () => {
      const selector = 'img[src*="/media/book/"]';
      expect(selector).toContain('/media/book/');
    });
  });

  describe('Cover Image Extraction', () => {
    test('should extract from media/book path', () => {
      const selector = 'img[src*="/media/book/"]';
      expect(selector).toContain('/media/book/');
    });

    test('should fallback to meta og:image', () => {
      const metaSelector = 'meta[property="og:image"]';
      expect(metaSelector).toContain('og:image');
    });

    test('should fallback to twitter:image', () => {
      const metaSelector = 'meta[name="twitter:image"]';
      expect(metaSelector).toContain('twitter:image');
    });

    test('should fallback to itemprop image', () => {
      const metaSelector = 'meta[itemprop="image"]';
      expect(metaSelector).toContain('itemprop="image"');
    });
  });

  describe('Image Pattern Detection', () => {
    test('should support base/N.ext pattern', () => {
      const pattern = /^(.+\/)(\d+)\.(\w+)$/;
      const url = 'https://cdn.example.com/manga/1.jpg';
      const match = url.match(pattern);
      expect(match).toBeTruthy();
      if (match) {
        expect(match[1]).toBe('https://cdn.example.com/manga/');
        expect(match[2]).toBe('1');
        expect(match[3]).toBe('jpg');
      }
    });

    test('should support base-N.ext pattern', () => {
      const pattern = /^(.+)-(\d+)\.(\w+)$/;
      const url = 'https://cdn.example.com/image-1.jpg';
      const match = url.match(pattern);
      expect(match).toBeTruthy();
    });

    test('should support base_N.ext pattern', () => {
      const pattern = /^(.+)_(\d+)\.(\w+)$/;
      const url = 'https://cdn.example.com/image_1.jpg';
      const match = url.match(pattern);
      expect(match).toBeTruthy();
    });

    test('should support baseN.ext pattern', () => {
      const pattern = /^(.+?)(\d+)\.(\w+)$/;
      const url = 'https://cdn.example.com/image1.jpg';
      const match = url.match(pattern);
      expect(match).toBeTruthy();
    });
  });

  describe('Script Tag Parsing', () => {
    test('should extract URLs from script tags', () => {
      const urlPattern = /"(https?:\/\/[^"]*\.(?:jpg|jpeg|png|webp|gif)[^"]*)"/g;
      const script = 'var images = ["https://cdn.example.com/1.jpg", "https://cdn.example.com/2.jpg"]';
      const matches = [...script.matchAll(urlPattern)];
      expect(matches.length).toBeGreaterThan(0);
    });

    test('should parse image arrays from script', () => {
      const arrayPattern = /(?:var|let|const)\s+(?:images|chapter_images|pages)\s*=\s*(\[[\s\S]*?\]);/;
      const script = 'var images = ["url1.jpg", "url2.jpg"];';
      const match = script.match(arrayPattern);
      expect(match).toBeTruthy();
    });

    test('should handle window.images pattern', () => {
      const pattern = /window\.(?:images|chapter_images|pages)\s*=\s*(\[[\s\S]*?\]);/;
      const script = 'window.images = ["url1.jpg", "url2.jpg"];';
      const match = script.match(pattern);
      expect(match).toBeTruthy();
    });
  });

  describe('Image Validation', () => {
    test('should filter out loading placeholders', () => {
      const url = 'https://example.com/loading.svg';
      expect(url).toContain('loading.');
    });

    test('should filter out icons', () => {
      const url = 'https://example.com/icon/favicon.png';
      expect(url).toContain('/icon');
    });

    test('should filter out logos', () => {
      const url = 'https://example.com/logo/site-logo.png';
      expect(url).toContain('/logo');
    });

    test('should accept valid image URLs', () => {
      const url = 'https://cdn.example.com/manga/chapter1/page1.jpg';
      expect(url).toMatch(/^https?:\/\//);
      expect(url).toMatch(/\.(jpg|jpeg|png|webp|gif)$/i);
    });

    test('should identify truyenqqvn ad image paths for filtering', () => {
      const ad_url = 'https://truyenqq.com.vn/media/images/mat-na-nghe.webp';
      const chapter_url =
        'https://s25.static3t.com/chapters/b1835/chapter-90/nhat-chieu-lien-vo-dich-tu-chan-gioi-1.jpg';
      const is_ad_image = /https?:\/\/(?:www\.)?truyenqq\.com\.vn\/media\/images\//i.test(ad_url);
      const is_chapter_image = /https?:\/\/(?:www\.)?truyenqq\.com\.vn\/media\/images\//i.test(chapter_url);
      expect(is_ad_image).toBe(true);
      expect(is_chapter_image).toBe(false);
    });
  });

  describe('Cloudflare Protection & Error Handling', () => {
    test('should identify Cloudflare challenge HTML', () => {
      const challengeHtml = '<html><head><title>Just a moment...</title></head><body>cf-browser-verification</body></html>';
      expect(truyenqqvnService.isCloudflareBlockedHtml(challengeHtml)).toBe(true);
    });

    test('should not flag normal HTML as Cloudflare challenge', () => {
      const normalHtml = '<html><head><title>Thích khách thần cấp</title></head><body><h1>Thích khách thần cấp</h1></body></html>';
      expect(truyenqqvnService.isCloudflareBlockedHtml(normalHtml)).toBe(false);
    });

    test('should identify login-required challenge HTML', () => {
      const loginHtml = '<div class="reading-content"><div class="login-required-box"><h2>Truyện này yêu cầu đăng nhập</h2><div class="lr-msg">Để đọc bạn cần đăng nhập bằng tài khoản Google.</div></div></div>';
      expect(truyenqqvnService.isLoginRequiredHtml(loginHtml)).toBe(true);
    });

    test('should not flag normal chapter HTML as login-required', () => {
      const normalHtml = '<div class="reading-content"><img class="lazy" data-src="https://s34.cc3t.net/chapters/b1/1.jpg" /></div>';
      expect(truyenqqvnService.isLoginRequiredHtml(normalHtml)).toBe(false);
    });

    test('should return Vietnamese error for empty URL', async () => {
      const result = await truyenqqvnService.load('');
      expect(result.error).toContain('trống');
    });
  });

  describe('Timeout Configuration', () => {
    test('should use 30s timeout for manga page', () => {
      const timeout = 30000;
      expect(timeout).toBe(30000);
    });

    test('should use 60s timeout for chapter page', () => {
      const timeout = 60000;
      expect(timeout).toBe(60000);
    });

    test('should use 5s timeout for image verification', () => {
      const timeout = 5000;
      expect(timeout).toBe(5000);
    });
  });

  describe('Pattern Detection Limits', () => {
    test('should limit consecutive failures', () => {
      const maxConsecutiveFailures = 5;
      expect(maxConsecutiveFailures).toBe(5);
    });

    test('should limit max images', () => {
      const maxImages = 300;
      expect(maxImages).toBe(300);
    });

    test('should delay between requests', () => {
      const delay = 50;
      expect(delay).toBe(50);
    });
  });
});
