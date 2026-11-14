const { describe, test, expect } = require('@jest/globals');
const cheerio = require('cheerio');
const {
  normalizeToMangaUrl,
  cleanMangaTitle,
  parseChapterNumber,
  parseMangaMetadata,
  parseChaptersFromSelect,
  parseReaderImages,
  DOMAIN,
  LABEL,
} = require('../../../platform/connectors/services/hoaphunglieunguyenService');

describe('Hoaphunglieunguyen Parsing Helpers', () => {
  describe('normalizeToMangaUrl', () => {
    test('should normalize any hoaphunglieunguyen url to base home domain', () => {
      expect(normalizeToMangaUrl('https://hoaphunglieunguyen.com/')).toBe('https://hoaphunglieunguyen.com/');
      expect(normalizeToMangaUrl('https://hoaphunglieunguyen.com/tap/tap-1/')).toBe('https://hoaphunglieunguyen.com/');
      expect(normalizeToMangaUrl('https://hoaphunglieunguyen.com/tap/tap-82/hoi-637/')).toBe('https://hoaphunglieunguyen.com/');
      expect(normalizeToMangaUrl('http://hoaphunglieunguyen.com/tap/tap-5/')).toBe('https://hoaphunglieunguyen.com/');
    });
  });

  describe('parseChapterNumber', () => {
    test('should extract chapter number from url or title', () => {
      expect(parseChapterNumber('Hồi 1: Đế Vương Thức Tỉnh', 'https://hoaphunglieunguyen.com/tap/tap-1/hoi-1/')).toBe(1);
      expect(parseChapterNumber('Hồi 637: Tri kỷ đồng hành', 'https://hoaphunglieunguyen.com/tap/tap-82/hoi-637/')).toBe(637);
      expect(parseChapterNumber('Chapter 23.5', '/tap/tap-4/hoi-23-5/')).toBe(23.5);
      expect(parseChapterNumber('Hồi 10', '')).toBe(10);
    });
  });

  describe('cleanMangaTitle', () => {
    test('should clean title from extra suffixes', () => {
      expect(cleanMangaTitle('Hỏa Phụng Liêu Nguyên - Đọc Full, Cập Nhật Liên Tục')).toBe('Hỏa Phụng Liêu Nguyên');
      expect(cleanMangaTitle('Hỏa Phụng Liêu Nguyên | Đọc Online')).toBe('Hỏa Phụng Liêu Nguyên');
    });
  });

  describe('parseMangaMetadata', () => {
    test('should extract metadata from home page html', () => {
      const sampleHtml = `
        <html>
          <head>
            <title>Hỏa Phụng Liêu Nguyên - Đọc Full, Cập Nhật Liên Tục</title>
            <meta name="description" content="Đọc trọn bộ Hỏa Phụng Liêu Nguyên của Chan Mou - manhua dã sử Tam Quốc"/>
            <meta property="og:image" content="https://hoaphunglieunguyen.com/wp-content/uploads/2026/09/hoa-phung-lieu-nguyen-bia-hero.webp"/>
          </head>
          <body>
            <h1 class="hero-title">Hỏa Phụng Liêu Nguyên</h1>
            <section id="moi-cap-nhat">
              <ul class="hp-latest">
                <li><a href="https://hoaphunglieunguyen.com/tap/tap-82/hoi-637/">Hồi 637</a></li>
                <li><a href="https://hoaphunglieunguyen.com/tap/tap-82/hoi-636/">Hồi 636</a></li>
              </ul>
            </section>
          </body>
        </html>
      `;
      const $ = cheerio.load(sampleHtml);
      const meta = parseMangaMetadata($, sampleHtml, 'https://hoaphunglieunguyen.com/');
      expect(meta.title).toBe('Hỏa Phụng Liêu Nguyên');
      expect(meta.author).toContain('Chan Mou');
      expect(meta.coverUrl).toBe('https://hoaphunglieunguyen.com/wp-content/uploads/2026/09/hoa-phung-lieu-nguyen-bia-hero.webp');
      expect(meta.description).toContain('Chan Mou');
      expect(meta.latestChapterUrl).toBe('https://hoaphunglieunguyen.com/tap/tap-82/hoi-637/');
      expect(meta.status).toBe('Đang tiến hành');
    });
  });

  describe('parseChaptersFromSelect', () => {
    test('should extract chapters from select.hoi-select with optgroup and sort ascending', () => {
      const sampleHtml = `
        <select class="hoi-select">
          <option value="">Chọn hồi…</option>
          <optgroup label="Tập 2">
            <option value="/tap/tap-2/hoi-7/">Hồi 7: Truyền Thuyết Anh Hùng</option>
          </optgroup>
          <optgroup label="Tập 1">
            <option value="https://hoaphunglieunguyen.com/tap/tap-1/hoi-2/">Hồi 2: Tàn Tồn Diệc Một Lộ</option>
            <option value="https://hoaphunglieunguyen.com/tap/tap-1/hoi-1/">Hồi 1: Đế Vương Thức Tỉnh</option>
          </optgroup>
        </select>
      `;
      const $ = cheerio.load(sampleHtml);
      const chapters = parseChaptersFromSelect($, 'https://hoaphunglieunguyen.com/');
      expect(chapters).toHaveLength(3);
      expect(chapters[0]).toEqual({
        url: 'https://hoaphunglieunguyen.com/tap/tap-1/hoi-1/',
        title: 'Hồi 1: Đế Vương Thức Tỉnh',
        chapterNumber: 1,
        volume: '1',
      });
      expect(chapters[1]).toEqual({
        url: 'https://hoaphunglieunguyen.com/tap/tap-1/hoi-2/',
        title: 'Hồi 2: Tàn Tồn Diệc Một Lộ',
        chapterNumber: 2,
        volume: '1',
      });
      expect(chapters[2]).toEqual({
        url: 'https://hoaphunglieunguyen.com/tap/tap-2/hoi-7/',
        title: 'Hồi 7: Truyền Thuyết Anh Hùng',
        chapterNumber: 7,
        volume: '2',
      });
    });
  });

  describe('parseReaderImages', () => {
    test('should extract image urls from hpln-page elements', () => {
      const sampleHtml = `
        <main class="reader-stage" id="hpln-reader-stage">
          <img src="https://hoaphunglieunguyen.com/uploads/p1.webp" class="hpln-page" data-page="1">
          <img data-src="https://hoaphunglieunguyen.com/uploads/p2.webp" class="hpln-page" data-page="2">
          <img src="https://hoaphunglieunguyen.com/tracking.gif" class="tracker">
        </main>
      `;
      const $ = cheerio.load(sampleHtml);
      const images = parseReaderImages($, 'https://hoaphunglieunguyen.com/tap/tap-1/hoi-1/');
      expect(images).toHaveLength(2);
      expect(images[0]).toEqual({
        imageUrl: 'https://hoaphunglieunguyen.com/uploads/p1.webp',
        ext: 'webp',
      });
      expect(images[1]).toEqual({
        imageUrl: 'https://hoaphunglieunguyen.com/uploads/p2.webp',
        ext: 'webp',
      });
    });
  });

  describe('HoaphunglieunguyenService Integration', () => {
    test('should inherit from HtmlConnectorService with correct siteId', () => {
      const { service } = require('../../../platform/connectors/services/hoaphunglieunguyenService');
      expect(service.siteId).toBe('hoaphunglieunguyen');
      expect(service.domain).toBe('https://hoaphunglieunguyen.com/');
    });
  });
});
