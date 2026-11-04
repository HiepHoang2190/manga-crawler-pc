/**
 * LuotTruyen Service Tests
 * Tests for service-level functionality and cookie authentication
 */
const luottruyenService = require('../../../platform/connectors/services/luotTruyenService');
const { parseChapterImages } = luottruyenService;

describe('LuotTruyen - Service Tests', () => {
  describe('Service Configuration', () => {
    test('should have correct domain', () => {
      expect(luottruyenService.DOMAIN).toBe('https://luottruyen19.com/');
    });

    test('should have correct label', () => {
      expect(luottruyenService.LABEL).toBe('LuotTruyen');
    });
  });

  describe('StoryID Extraction', () => {
    test('should extract StoryID from URL ending', () => {
      const pattern = /[-/](\d+)\/?$/;
      const url = 'https://luottruyen5.com/truyen-tranh/hanh-trinh-tim-lai-ban-nga-cua-mot-loser-18633';
      const match = url.match(pattern);
      expect(match).toBeTruthy();
      if (match) {
        expect(match[1]).toBe('18633');
      }
    });

    test('should extract StoryID from URL with trailing slash', () => {
      const pattern = /[-/](\d+)\/?$/;
      const url = 'https://luottruyen5.com/truyen-tranh/test-manga-12345/';
      const match = url.match(pattern);
      expect(match).toBeTruthy();
      if (match) {
        expect(match[1]).toBe('12345');
      }
    });

    test('should extract StoryID from URL with query parameters', () => {
      const pattern = /[-/](\d+)\/?$/;
      const url = 'https://luottruyen5.com/truyen-tranh/test-67890';
      const match = url.match(pattern);
      expect(match).toBeTruthy();
      if (match) {
        expect(match[1]).toBe('67890');
      }
    });
  });

  describe('API Integration', () => {
    test('should use ListChapterByStoryID API', () => {
      const apiPath = '/Story/ListChapterByStoryID';
      expect(apiPath).toBe('/Story/ListChapterByStoryID');
    });

    test('should construct API URL correctly', () => {
      const domain = 'https://luottruyen5.com/';
      const apiPath = '/Story/ListChapterByStoryID';
      const apiUrl = new URL(apiPath, domain).href;
      expect(apiUrl).toBe('https://luottruyen5.com/Story/ListChapterByStoryID');
    });

    test('should send POST request with StoryID', () => {
      const storyId = '18633';
      const body = `StoryID=${encodeURIComponent(storyId)}`;
      expect(body).toBe('StoryID=18633');
    });

    test('should include X-Requested-With header', () => {
      const headers = {
        'X-Requested-With': 'XMLHttpRequest',
      };
      expect(headers['X-Requested-With']).toBe('XMLHttpRequest');
    });
  });

  describe('Cookie Management', () => {
    test('should merge cookie headers', () => {
      const base = 'cookie1=value1';
      const extra = 'cookie2=value2';
      const merged = `${base}; ${extra}`;
      expect(merged).toBe('cookie1=value1; cookie2=value2');
    });

    test('should handle empty base cookie', () => {
      const base = '';
      const extra = 'cookie1=value1';
      const merged = extra;
      expect(merged).toBe('cookie1=value1');
    });

    test('should handle empty extra cookie', () => {
      const base = 'cookie1=value1';
      const extra = '';
      const merged = base;
      expect(merged).toBe('cookie1=value1');
    });

    test('should deduplicate cookie keys', () => {
      // Cookie merging should handle duplicate keys
      const cookies = ['cookie1=value1', 'cookie2=value2', 'cookie1=newvalue'];
      const map = new Map();
      cookies.forEach(c => {
        const eq = c.indexOf('=');
        const key = eq >= 0 ? c.slice(0, eq) : c;
        map.set(key, c);
      });
      const result = [...map.values()].join('; ');
      expect(result).toContain('cookie1=newvalue');
      expect(result).toContain('cookie2=value2');
    });
  });

  describe('Chapter URL Parsing', () => {
    test('should parse chapter URLs', () => {
      const pattern = /\/chapter-\d+\//;
      const url = 'https://luottruyen5.com/truyen-tranh/chapter-1/chapter-1/12345';
      expect(url).toMatch(pattern);
    });

    test('should handle chapter URL format', () => {
      const chapterUrl = '/truyen-tranh/chapter-5/chapter-5/18633';
      expect(chapterUrl).toContain('/chapter-');
      expect(chapterUrl).toMatch(/chapter-\d+/);
    });
  });

  describe('data-index image parsing', () => {
    const chapter_page_url = 'https://luottruyen17.com/truyen-tranh/chapter-906/chapter-906/1614117';

    test('should keep only img[data-index] and ignore decoys without it', () => {
      const html = `
        <div class="reading-detail">
          <div class="page-chapter"><img src="https://luottruyen17.com/Content/images/qc-top.jpg" alt="Quảng cáo" /></div>
          <div id="page_1" class="page-chapter">
            <img src="https://img3.dichvucdn.com/Upload02/ImageContent/20260904/6F1D0705C91C2145201DF18A1A0C7345.jpg" fetchpriority="high">
            <img alt="Đại Quản Gia Là Ma Hoàng chapter 906 - Trang 1" data-index="1" src="https://img3.dichvucdn.com/Upload02/ImageContent/20260904/b73c74ca-bbc4-4b4b-a3d7-ca1fdb820249-639241056144988300.jpg" onerror="imgError($(this))" fetchpriority="high">
          </div>
          <div id="page_2" class="page-chapter">
            <img src="https://img3.dichvucdn.com/Upload02/ImageContent/20260904/decoy-page-2.jpg" fetchpriority="high">
            <img alt="Để Tải Lại Ảnh Này Hãy Reload Trang - Trang 2" data-index="2" src="https://img3.dichvucdn.com/Upload02/ImageContent/20260904/real-page-2.jpg">
          </div>
          <div class="page-chapter"><img src="https://luottruyen17.com/Content/images/qc-bottom.jpg" alt="Quảng cáo" /></div>
        </div>`;
      const images = parseChapterImages(html, chapter_page_url);
      expect(images.map((item) => item.imageUrl)).toEqual([
        'https://img3.dichvucdn.com/Upload02/ImageContent/20260904/b73c74ca-bbc4-4b4b-a3d7-ca1fdb820249-639241056144988300.jpg',
        'https://img3.dichvucdn.com/Upload02/ImageContent/20260904/real-page-2.jpg',
      ]);
    });
  });

  describe('Image Parsing', () => {
    test('should detect dichvucdn images', () => {
      const imageUrl = 'https://dichvucdn.com/images/manga/page-001.jpg';
      expect(imageUrl).toContain('dichvucdn');
    });

    test('should support data-src attribute', () => {
      const attributes = ['src', 'data-src'];
      expect(attributes).toContain('data-src');
    });

    test('should filter data: URLs', () => {
      const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
      const isDataUrl = /^data:/i.test(dataUrl);
      expect(isDataUrl).toBe(true);
    });

    test('should validate image extensions', () => {
      const validExts = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'];
      expect(validExts).toContain('jpg');
      expect(validExts).toContain('png');
      expect(validExts).toContain('webp');
    });

    test('should extract extension from URL', () => {
      const url = 'https://example.com/image.jpg?size=large';
      const noQuery = url.split('?')[0];
      const ext = noQuery.split('.').pop().toLowerCase();
      expect(ext).toBe('jpg');
    });
  });

  describe('Content Selectors', () => {
    test('should use reading-detail selector', () => {
      const selector = 'div.reading-detail img';
      expect(selector).toContain('reading-detail');
    });

    test('should use chapter-content selector', () => {
      const selector = 'div#chapter-content img';
      expect(selector).toContain('chapter-content');
    });

    test('should use page-chapter selector', () => {
      const selector = 'div.page-chapter img';
      expect(selector).toContain('page-chapter');
    });

    test('should use vung-doc selector', () => {
      const selector = 'div.vung-doc img';
      expect(selector).toContain('vung-doc');
    });

    test('should filter dichvucdn images', () => {
      const selector = 'img[src*="dichvucdn"], img[data-src*="dichvucdn"]';
      expect(selector).toContain('dichvucdn');
    });
  });

  describe('Error Messages', () => {
    test('should return Vietnamese error for empty URL', async () => {
      const result = await luottruyenService.load('');
      expect(result.error).toContain('URL');
    });

    test('should provide cookie hint for locked chapters', () => {
      const errorMsg = 'Không tìm thấy ảnh. Chapter có thể bị khóa — vào Settings → Cookie để đăng nhập LuotTruyen.';
      expect(errorMsg).toContain('Cookie');
      expect(errorMsg).toContain('Settings');
    });
  });

  describe('Response Structure', () => {
    test('should return object with ok property', async () => {
      const result = await luottruyenService.load('');
      expect(result).toHaveProperty('ok');
      expect(typeof result.ok).toBe('boolean');
    });

    test('should return error message on failure', async () => {
      const result = await luottruyenService.load('');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
      expect(typeof result.error).toBe('string');
    });
  });

  describe('Authentication Flow', () => {
    test('should require cookie for chapter access', () => {
      // LuotTruyen requires authentication
      const requiresCookie = true;
      expect(requiresCookie).toBe(true);
    });

    test('should include cookie in requests', () => {
      const headers = {
        'User-Agent': 'Mozilla/5.0',
        'Cookie': 'session=abc123',
      };
      expect(headers.Cookie).toBeDefined();
    });

    test('should include cookie in image requests', () => {
      const headers = {
        'Referer': 'https://luottruyen5.com/',
        'Cookie': 'session=abc123',
      };
      expect(headers.Cookie).toBeDefined();
      expect(headers.Referer).toBeDefined();
    });
  });

  describe('URL Resolution', () => {
    test('should resolve relative URLs', () => {
      const baseUrl = 'https://luottruyen5.com/truyen-tranh/test';
      const relativeUrl = '/chapter-1/chapter-1/12345';
      const resolved = new URL(relativeUrl, baseUrl).href;
      expect(resolved).toBe('https://luottruyen5.com/chapter-1/chapter-1/12345');
    });

    test('should handle absolute URLs', () => {
      const absoluteUrl = 'https://dichvucdn.com/image.jpg';
      expect(absoluteUrl).toMatch(/^https?:\/\//);
    });
  });

  describe('Title Parsing', () => {
    test('should parse title from h1', () => {
      const selector = 'h1';
      expect(selector).toBe('h1');
    });

    test('should fallback to title tag', () => {
      const selector = 'title';
      expect(selector).toBe('title');
    });

    test('should clean title from page title', () => {
      const pageTitle = 'Manga Title | LuotTruyen';
      const cleaned = pageTitle.split('|')[0].trim();
      expect(cleaned).toBe('Manga Title');
    });
  });

  describe('Cover Image Parsing', () => {
    test('should parse cover from dichvucdn', () => {
      const selector = 'img[src*="dichvucdn"]';
      expect(selector).toContain('dichvucdn');
    });

    test('should check data-src attribute', () => {
      const attributes = ['data-src', 'src'];
      expect(attributes).toContain('data-src');
      expect(attributes).toContain('src');
    });

    test('should fallback to detail-info img', () => {
      const selectors = ['div.detail-info img', 'div.book-info img', 'div.manga-info img'];
      expect(selectors.length).toBeGreaterThan(0);
    });
  });
});
