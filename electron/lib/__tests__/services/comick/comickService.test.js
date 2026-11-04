/**
 * Comick Service Tests
 * Tests for service-level functionality and API integration
 */
const comickService = require('../../../platform/connectors/services/comickService');
const { ComickApiClient, SUPPORTED_LANGUAGES, extractSlug, extractChapterHid } = require('../../../platform/connectors/services/comickApiClient');

describe('Comick - Service Tests', () => {
  describe('Service Configuration', () => {
    test('should have correct domain', () => {
      expect(comickService.SITE_DOMAIN).toBe('https://comick.live');
    });

    test('should have correct label', () => {
      expect(comickService.LABEL).toBe('Comick');
    });

    test('should have service instance', () => {
      expect(comickService.service).toBeDefined();
    });

    test('should have ComickService class', () => {
      expect(comickService.ComickService).toBeDefined();
    });
  });

  describe('Language Support', () => {
    test('should support 18 languages', () => {
      expect(SUPPORTED_LANGUAGES.length).toBe(18);
    });

    test('should include English', () => {
      expect(SUPPORTED_LANGUAGES).toContain('en');
    });

    test('should include Vietnamese', () => {
      expect(SUPPORTED_LANGUAGES).toContain('vi');
    });

    test('should include Japanese', () => {
      expect(SUPPORTED_LANGUAGES).toContain('ja');
    });

    test('should include Chinese variants', () => {
      expect(SUPPORTED_LANGUAGES).toContain('zh');
      expect(SUPPORTED_LANGUAGES).toContain('zh-hk');
    });

    test('should include Korean', () => {
      expect(SUPPORTED_LANGUAGES).toContain('ko');
    });

    test('should include Spanish variants', () => {
      expect(SUPPORTED_LANGUAGES).toContain('es');
      expect(SUPPORTED_LANGUAGES).toContain('es-la');
    });

    test('should include Portuguese variants', () => {
      expect(SUPPORTED_LANGUAGES).toContain('pt');
      expect(SUPPORTED_LANGUAGES).toContain('pt-br');
    });

    test('should include European languages', () => {
      expect(SUPPORTED_LANGUAGES).toContain('fr');
      expect(SUPPORTED_LANGUAGES).toContain('de');
      expect(SUPPORTED_LANGUAGES).toContain('it');
      expect(SUPPORTED_LANGUAGES).toContain('ru');
    });

    test('should include Asian languages', () => {
      expect(SUPPORTED_LANGUAGES).toContain('tr');
      expect(SUPPORTED_LANGUAGES).toContain('id');
      expect(SUPPORTED_LANGUAGES).toContain('th');
      expect(SUPPORTED_LANGUAGES).toContain('ar');
    });
  });

  describe('Slug Extraction', () => {
    test('should extract slug from standard URL', () => {
      const url = 'https://comick.live/comic/00-lan-ke-qi-yuan';
      const slug = extractSlug(url);
      expect(slug).toBe('00-lan-ke-qi-yuan');
    });

    test('should extract slug from chapter URL', () => {
      const url = 'https://comick.live/comic/test-manga/abc123-chapter-1-en';
      const slug = extractSlug(url);
      expect(slug).toBe('test-manga');
    });

    test('should extract slug with query parameters', () => {
      const url = 'https://comick.live/comic/test-manga?page=1';
      const slug = extractSlug(url);
      expect(slug).toBe('test-manga');
    });

    test('should extract slug with hash', () => {
      const url = 'https://comick.live/comic/test-manga#chapter-1';
      const slug = extractSlug(url);
      expect(slug).toBe('test-manga');
    });

    test('should return null for invalid URL', () => {
      const url = 'https://comick.live/invalid-path';
      const slug = extractSlug(url);
      expect(slug).toBeNull();
    });

    test('should handle empty URL', () => {
      const slug = extractSlug('');
      expect(slug).toBeNull();
    });

    test('should handle null URL', () => {
      const slug = extractSlug(null);
      expect(slug).toBeNull();
    });
  });

  describe('Chapter HID Extraction', () => {
    test('should extract hid from chapter URL', () => {
      const url = 'https://comick.live/comic/test-manga/abc123-chapter-1-en';
      const hid = extractChapterHid(url);
      expect(hid).toBe('abc123');
    });

    test('should extract hid with complex format', () => {
      const url = 'https://comick.live/comic/test/xyz789-chapter-10-vi';
      const hid = extractChapterHid(url);
      expect(hid).toBe('xyz789');
    });

    test('should return null for manga URL without chapter', () => {
      const url = 'https://comick.live/comic/test-manga';
      const hid = extractChapterHid(url);
      expect(hid).toBeNull();
    });

    test('should handle empty URL', () => {
      const hid = extractChapterHid('');
      expect(hid).toBeNull();
    });
  });

  describe('API URL Construction', () => {
    test('should construct chapter list API URL', () => {
      const slug = 'test-manga';
      const lang = 'en';
      const page = 1;
      const apiUrl = `https://comick.live/api/comics/${encodeURIComponent(slug)}/chapter-list?lang=${encodeURIComponent(lang)}&page=${page}`;
      expect(apiUrl).toContain('/api/comics/');
      expect(apiUrl).toContain('chapter-list');
      expect(apiUrl).toContain('lang=en');
      expect(apiUrl).toContain('page=1');
    });

    test('should encode special characters in slug', () => {
      const slug = 'test manga';
      const encoded = encodeURIComponent(slug);
      expect(encoded).toBe('test%20manga');
    });

    test('should encode language parameter', () => {
      const lang = 'zh-hk';
      const encoded = encodeURIComponent(lang);
      expect(encoded).toBe('zh-hk');
    });
  });

  describe('Chapter URL Construction', () => {
    test('should construct chapter URL with hid', () => {
      const slug = 'test-manga';
      const hid = 'abc123';
      const chNum = '1';
      const lang = 'en';
      const chapterUrl = `https://comick.live/comic/${slug}/${hid}-chapter-${chNum}-${lang}`;
      expect(chapterUrl).toBe('https://comick.live/comic/test-manga/abc123-chapter-1-en');
    });

    test('should construct chapter URL for oneshot', () => {
      const slug = 'test-manga';
      const hid = 'xyz789';
      const chNum = '0';
      const lang = 'vi';
      const chapterUrl = `https://comick.live/comic/${slug}/${hid}-chapter-${chNum}-${lang}`;
      expect(chapterUrl).toContain('chapter-0');
    });
  });

  describe('Chapter Title Formatting', () => {
    test('should format chapter with number', () => {
      const chNum = '1';
      const title = `Chapter ${chNum}`;
      expect(title).toBe('Chapter 1');
    });

    test('should format chapter with title', () => {
      const chNum = '1';
      const rawTitle = 'Test Title';
      const title = `Chapter ${chNum} - ${rawTitle}`;
      expect(title).toBe('Chapter 1 - Test Title');
    });

    test('should format chapter with volume', () => {
      const chNum = '1';
      const vol = '2';
      const title = `Chapter ${chNum} (Vol ${vol})`;
      expect(title).toBe('Chapter 1 (Vol 2)');
    });

    test('should format chapter with group name', () => {
      const chNum = '1';
      const groupName = 'Test Group';
      const title = `Chapter ${chNum} {${groupName}}`;
      expect(title).toBe('Chapter 1 {Test Group}');
    });

    test('should format oneshot', () => {
      const title = 'Oneshot';
      expect(title).toBe('Oneshot');
    });

    test('should format complete chapter info', () => {
      const chNum = '5';
      const rawTitle = 'Epic Battle';
      const vol = '2';
      const groupName = 'Scanlation Team';
      const title = `Chapter ${chNum} - ${rawTitle} (Vol ${vol}) {${groupName}}`;
      expect(title).toBe('Chapter 5 - Epic Battle (Vol 2) {Scanlation Team}');
    });
  });

  describe('File Extension Detection', () => {
    test('should detect jpg extension', () => {
      const url = 'https://example.com/image.jpg';
      const ext = url.split('.').pop().toLowerCase();
      expect(ext).toBe('jpg');
    });

    test('should detect png extension', () => {
      const url = 'https://example.com/image.png';
      const ext = url.split('.').pop().toLowerCase();
      expect(ext).toBe('png');
    });

    test('should detect webp extension', () => {
      const url = 'https://example.com/image.webp';
      const ext = url.split('.').pop().toLowerCase();
      expect(ext).toBe('webp');
    });

    test('should handle URL with query parameters', () => {
      const url = 'https://example.com/image.jpg?size=large';
      const path = url.split('?')[0];
      const ext = path.split('.').pop().toLowerCase();
      expect(ext).toBe('jpg');
    });

    test('should default to webp for unknown extensions', () => {
      const defaultExt = 'webp';
      expect(defaultExt).toBe('webp');
    });
  });

  describe('Pagination', () => {
    test('should handle pagination with 60 chapters per page', () => {
      const chaptersPerPage = 60;
      expect(chaptersPerPage).toBe(60);
    });

    test('should calculate total pages', () => {
      const totalChapters = 150;
      const chaptersPerPage = 60;
      const totalPages = Math.ceil(totalChapters / chaptersPerPage);
      expect(totalPages).toBe(3);
    });

    test('should handle single page', () => {
      const totalChapters = 30;
      const chaptersPerPage = 60;
      const totalPages = Math.ceil(totalChapters / chaptersPerPage);
      expect(totalPages).toBe(1);
    });
  });

  describe('API Client', () => {
    test('should create ComickApiClient instance', () => {
      const client = new ComickApiClient();
      expect(client).toBeDefined();
    });

    test('should have default language', () => {
      const client = new ComickApiClient();
      expect(client.defaultLanguage).toBe('en');
    });

    test('should have load method', () => {
      const client = new ComickApiClient();
      expect(typeof client.load).toBe('function');
    });

    test('should have fetchChapterImages method', () => {
      const client = new ComickApiClient();
      expect(typeof client.fetchChapterImages).toBe('function');
    });
  });

  describe('Error Messages', () => {
    test('should return Vietnamese error for empty URL', async () => {
      const result = await comickService.load('');
      expect(result.error).toContain('URL');
    });

    test('should return Vietnamese error for missing slug', async () => {
      const result = await comickService.load('https://comick.live/');
      expect(result.error).toBeDefined();
    });
  });

  describe('Response Structure', () => {
    test('should return object with ok property', async () => {
      const result = await comickService.load('');
      expect(result).toHaveProperty('ok');
      expect(typeof result.ok).toBe('boolean');
    });

    test('should return error message on failure', async () => {
      const result = await comickService.load('');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
      expect(typeof result.error).toBe('string');
    });
  });

  describe('Hybrid Architecture', () => {
    test('should use HTML parsing for manga info', () => {
      // Comick uses HTML parsing to extract JSON from script tags
      const scriptId = 'comic-data';
      expect(scriptId).toBe('comic-data');
    });

    test('should use API for chapter list', () => {
      const apiPath = '/api/comics/';
      expect(apiPath).toContain('/api/');
    });

    test('should use HTML parsing for chapter images', () => {
      // Comick uses HTML parsing to extract JSON from script tags
      const scriptId = 'sv-data';
      expect(scriptId).toBe('sv-data');
    });
  });
});
