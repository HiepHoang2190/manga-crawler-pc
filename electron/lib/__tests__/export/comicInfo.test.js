const { generateComicInfoXml, escapeXml } = require('../../export/comicInfo');

describe('comicInfo helper', () => {
  describe('escapeXml', () => {
    test('escapes special XML characters', () => {
      expect(escapeXml('One & Two < Three > Four "Five" \'Six\'')).toBe(
        'One &amp; Two &lt; Three &gt; Four &quot;Five&quot; &apos;Six&apos;'
      );
    });

    test('handles null or empty input safely', () => {
      expect(escapeXml('')).toBe('');
      expect(escapeXml(null)).toBe('');
      expect(escapeXml(undefined)).toBe('');
    });
  });

  describe('generateComicInfoXml', () => {
    test('generates valid ComicInfo XML with basic metadata and chapter bookmarks', () => {
      const items = [
        { title: 'Chương 1: Mở đầu', baseName: '001.jpg' },
        { title: 'Chương 1: Mở đầu', baseName: '002.jpg' },
        { title: 'Chương 2: Cuộc gặp & Thử thách', baseName: '003.jpg' },
        { title: 'Chương 2: Cuộc gặp & Thử thách', baseName: '004.jpg' },
      ];

      const xml = generateComicInfoXml({
        title: 'Manga Test',
        series: 'Manga Test Series',
        items,
      });

      expect(xml).toContain('<?xml version="1.0" encoding="utf-8"?>');
      expect(xml).toContain('<ComicInfo xmlns:xsd="http://www.w3.org/2001/XMLSchema"');
      expect(xml).toContain('<Title>Manga Test</Title>');
      expect(xml).toContain('<Series>Manga Test Series</Series>');
      expect(xml).toContain('<PageCount>4</PageCount>');
      expect(xml).toContain('<Manga>YesAndRightToLeft</Manga>');

      // Check pages
      expect(xml).toContain('<Page Image="0" Bookmark="Chương 1: Mở đầu" Type="Story" />');
      expect(xml).toContain('<Page Image="1" Type="Story" />');
      expect(xml).toContain('<Page Image="2" Bookmark="Chương 2: Cuộc gặp &amp; Thử thách" Type="Story" />');
      expect(xml).toContain('<Page Image="3" Type="Story" />');
    });

    test('includes Number and Count when part splitting is specified', () => {
      const items = [
        { title: 'Chương 3', baseName: '001.jpg' },
        { title: 'Chương 3', baseName: '002.jpg' },
      ];

      const xml = generateComicInfoXml({
        title: 'Manga Test - Part 02',
        series: 'Manga Test',
        number: 2,
        count: 5,
        items,
      });

      expect(xml).toContain('<Number>2</Number>');
      expect(xml).toContain('<Count>5</Count>');
      expect(xml).toContain('<Page Image="0" Bookmark="Chương 3" Type="Story" />');
      expect(xml).toContain('<Page Image="1" Type="Story" />');
    });

    test('handles empty or missing items gracefully', () => {
      const xml = generateComicInfoXml({
        title: 'Empty Manga',
      });

      expect(xml).toContain('<Title>Empty Manga</Title>');
      expect(xml).toContain('<PageCount>0</PageCount>');
      expect(xml).toContain('<Pages />');
    });
  });

  describe('parseComicInfoBookmarks', () => {
    test('extracts chapter bookmarks from ComicInfo XML', () => {
      const { parseComicInfoBookmarks } = require('../../export/comicInfo');
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<ComicInfo>
  <Pages>
    <Page Image="0" Bookmark="Chương 1: Mở đầu" Type="Story" />
    <Page Image="1" Type="Story" />
    <Page Image="2" Bookmark="Chương 2 &amp; Tiếp nối" Type="Story" />
  </Pages>
</ComicInfo>`;

      const bookmarks = parseComicInfoBookmarks(xml);
      expect(bookmarks).toEqual([
        { imageIndex: 0, title: 'Chương 1: Mở đầu' },
        { imageIndex: 2, title: 'Chương 2 & Tiếp nối' },
      ]);
    });

    test('returns null for invalid or bookmark-free XML', () => {
      const { parseComicInfoBookmarks } = require('../../export/comicInfo');
      expect(parseComicInfoBookmarks('')).toBeNull();
      expect(parseComicInfoBookmarks(null)).toBeNull();
      expect(parseComicInfoBookmarks('<ComicInfo><Pages><Page Image="0" /></Pages></ComicInfo>')).toBeNull();
    });
  });
});

