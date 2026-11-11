const { describe, it, expect } = require('@jest/globals');
const path = require('path');
const { resolveMangaDir, resolveChapterDir, resolveCoverPath } = require('../../download/connector/connectorPathUtils');

describe('connectorPathUtils', () => {
  describe('resolveMangaDir', () => {
    it('should resolve manga directory with simple title', () => {
      const result = resolveMangaDir('/base', 'One Piece');
      expect(result).toBe(path.join('/base', 'One Piece'));
    });

    it('should handle Unicode characters', () => {
      const result = resolveMangaDir('/base', 'ワンピース');
      expect(result).toBe(path.join('/base', 'ワンピース'));
    });

    it('should sanitize invalid characters', () => {
      const result = resolveMangaDir('/base', 'Title:With<Invalid>Chars');
      expect(result).toBe(path.join('/base', 'Title WithInvalidChars'));
    });

    it('should handle very long titles', () => {
      const longTitle = 'A'.repeat(300);
      const result = resolveMangaDir('/base', longTitle);
      const folderName = path.basename(result);
      expect(Buffer.from(folderName, 'utf8').length).toBeLessThanOrEqual(255);
    });

    it('should handle empty title', () => {
      const result = resolveMangaDir('/base', '');
      expect(result).toBe(path.join('/base', ''));
    });

    it('should handle null/undefined title', () => {
      const result1 = resolveMangaDir('/base', null);
      expect(result1).toBe(path.join('/base', ''));
      
      const result2 = resolveMangaDir('/base', undefined);
      expect(result2).toBe(path.join('/base', ''));
    });

    it('should remove path separators', () => {
      const result = resolveMangaDir('/base', 'Title/With\\Slashes');
      expect(result).toBe(path.join('/base', 'TitleWithSlashes'));
    });

    it('should handle titles with colons', () => {
      const result = resolveMangaDir('/base', 'Title: Subtitle');
      expect(result).toBe(path.join('/base', 'Title Subtitle'));
    });

    it('should trim whitespace', () => {
      const result = resolveMangaDir('/base', '  Title  ');
      expect(result).toBe(path.join('/base', 'Title'));
    });

    it('should handle titles ending with dots', () => {
      const result = resolveMangaDir('/base', 'Title...');
      expect(result).toBe(path.join('/base', 'Title'));
    });
  });

  describe('resolveChapterDir', () => {
    it('should resolve chapter directory with numbered format', () => {
      const format = { mode: 'numbered', prefix: 'Chap', padDigits: 3 };
      const result = resolveChapterDir('/base', 'Manga', 'Chapter 1', format);
      expect(result).toContain('Manga');
      expect(result).toContain('Chap 001');
    });

    it('should resolve chapter directory with original format', () => {
      const format = { mode: 'original' };
      const result = resolveChapterDir('/base', 'Manga', 'Chapter 1: The Beginning', format);
      expect(result).toContain('Manga');
      expect(result).toContain('Chapter 1 The Beginning');
    });

    it('should sanitize fullwidth colon in original CJK chapter titles', () => {
      const format = { mode: 'original' };
      const result = resolveChapterDir(
        '/base',
        '死靈法師！我即是天災',
        '001話：轉職！死靈法師！',
        format,
      );
      expect(result).toBe(path.join('/base', '死靈法師！我即是天災', '001話 轉職！死靈法師！'));
      expect(path.basename(result)).not.toMatch(/[:：]/);
    });

    it('should handle decimal chapter numbers', () => {
      const format = { mode: 'numbered', prefix: 'Chap', padDigits: 3 };
      const result = resolveChapterDir('/base', 'Manga', 'Chapter 1.5', format);
      expect(result).toContain('Chap 001.5');
    });

    it('should handle Unicode manga and chapter titles', () => {
      const format = { mode: 'numbered', prefix: 'Chap', padDigits: 3 };
      const result = resolveChapterDir('/base', 'ワンピース', 'チャプター 10', format);
      expect(result).toContain('ワンピース');
      expect(result).toContain('Chap 010');
    });

    it('should handle missing format options', () => {
      const result = resolveChapterDir('/base', 'Manga', 'Chapter 1');
      expect(result).toContain('Manga');
      expect(result).toContain('Chap 001');
    });

    it('should sanitize invalid characters in chapter title', () => {
      const format = { mode: 'original' };
      const result = resolveChapterDir('/base', 'Manga', 'Chapter:1<Test>', format);
      expect(result).toContain('Chapter 1Test');
    });

    it('should handle very long chapter titles', () => {
      const longChapter = 'Chapter ' + 'A'.repeat(300);
      const result = resolveChapterDir('/base', 'Manga', longChapter);
      const chapterFolder = path.basename(result);
      expect(Buffer.from(chapterFolder, 'utf8').length).toBeLessThanOrEqual(255);
    });

    it('should place chapter in Vol. X folder when volume is provided', () => {
      const result = resolveChapterDir('/base', 'Manga', 'Chapter 1', { mode: 'numbered' }, '1');
      expect(result).toBe(path.join('/base', 'Manga', 'Vol. 1', 'Chap 001'));
    });

    it('should place chapter in root manga folder when volume is null or empty', () => {
      const result = resolveChapterDir('/base', 'Manga', 'Chapter 105', { mode: 'numbered' }, null);
      expect(result).toBe(path.join('/base', 'Manga', 'Chap 105'));
    });
  });

  describe('resolveCoverPath', () => {
    it('should resolve cover path with jpg extension', () => {
      const result = resolveCoverPath('/manga', 'https://example.com/cover.jpg');
      expect(result).toBe(path.join('/manga', 'cover.jpg'));
    });

    it('should resolve cover path with png extension', () => {
      const result = resolveCoverPath('/manga', 'https://example.com/cover.png');
      expect(result).toBe(path.join('/manga', 'cover.png'));
    });

    it('should resolve cover path with webp extension', () => {
      const result = resolveCoverPath('/manga', 'https://example.com/cover.webp');
      expect(result).toBe(path.join('/manga', 'cover.webp'));
    });

    it('should default to jpg for unknown extensions', () => {
      const result = resolveCoverPath('/manga', 'https://example.com/cover.xyz');
      expect(result).toBe(path.join('/manga', 'cover.jpg'));
    });

    it('should default to jpg for invalid URLs', () => {
      const result = resolveCoverPath('/manga', 'not-a-url');
      expect(result).toBe(path.join('/manga', 'cover.jpg'));
    });

    it('should handle URLs without extension', () => {
      const result = resolveCoverPath('/manga', 'https://example.com/cover');
      expect(result).toBe(path.join('/manga', 'cover.jpg'));
    });

    it('should handle empty cover URL', () => {
      const result = resolveCoverPath('/manga', '');
      expect(result).toBe(path.join('/manga', 'cover.jpg'));
    });

    it('should handle null/undefined cover URL', () => {
      const result1 = resolveCoverPath('/manga', null);
      expect(result1).toBe(path.join('/manga', 'cover.jpg'));
      
      const result2 = resolveCoverPath('/manga', undefined);
      expect(result2).toBe(path.join('/manga', 'cover.jpg'));
    });

    it('should handle gif extension', () => {
      const result = resolveCoverPath('/manga', 'https://example.com/cover.gif');
      expect(result).toBe(path.join('/manga', 'cover.gif'));
    });

    it('should handle jpeg extension', () => {
      const result = resolveCoverPath('/manga', 'https://example.com/cover.jpeg');
      expect(result).toBe(path.join('/manga', 'cover.jpeg'));
    });

    it('should handle uppercase extensions', () => {
      const result = resolveCoverPath('/manga', 'https://example.com/cover.PNG');
      expect(result).toBe(path.join('/manga', 'cover.png'));
    });

    it('should handle complex URLs with query params', () => {
      const result = resolveCoverPath('/manga', 'https://example.com/cover.jpg?size=large&v=2');
      expect(result).toBe(path.join('/manga', 'cover.jpg'));
    });
  });
});
