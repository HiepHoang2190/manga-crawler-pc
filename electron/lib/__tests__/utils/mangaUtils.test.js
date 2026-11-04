const {
  formatFolderName,
  formatChapterTitle,
  formatChapterFolderName,
  extractChapterNumberString,
  formatChapterPageFileName,
  getFlatChapterImageNamePrefix,
  isFlatChapterLayout,
} = require('../../shared/mangaUtils');

describe('mangaUtils - Windows path compatibility', () => {
  describe('formatFolderName', () => {
    test('should remove trailing dots', () => {
      expect(formatFolderName('Ch. 75 - Anh hùng.')).toBe('Ch. 75 - Anh hùng');
      expect(formatFolderName('Test...')).toBe('Test');
      expect(formatFolderName('Test. . .')).toBe('Test');
    });

    test('should remove trailing spaces', () => {
      expect(formatFolderName('Test   ')).toBe('Test');
      expect(formatFolderName('Test . ')).toBe('Test');
    });

    test('should remove colons', () => {
      expect(formatFolderName('Test: Title')).toBe('Test Title');
    });

    test('should sanitize fullwidth Windows-illegal punctuation in CJK titles', () => {
      expect(formatFolderName('001話：轉職！死靈法師！')).toBe('001話 轉職！死靈法師！');
      expect(formatFolderName('001話：轉職！死靈法師！')).not.toMatch(/[:：]/);
      expect(formatFolderName('死靈法師！我即是天災')).toBe('死靈法師！我即是天災');
      expect(formatFolderName('Title／Part｜A')).toBe('TitlePartA');
    });

    test('should remove invalid Windows characters', () => {
      expect(formatFolderName('Test<>:"|?*\\/Name')).toBe('Test Name');
    });

    test('should handle empty or null input', () => {
      expect(formatFolderName('')).toBe('');
      expect(formatFolderName(null)).toBe('');
      expect(formatFolderName(undefined)).toBe('');
    });

    test('should handle combination of trailing dots and spaces', () => {
      expect(formatFolderName('Chapter 75. ')).toBe('Chapter 75');
      expect(formatFolderName('Chapter 75 . ')).toBe('Chapter 75');
      expect(formatFolderName('Chapter 75..  ')).toBe('Chapter 75');
    });
  });

  describe('formatChapterTitle', () => {
    test('should remove trailing dots', () => {
      expect(formatChapterTitle('Ch. 75 - Anh hùng.')).toBe('Ch. 75 - Anh hùng');
      expect(formatChapterTitle('Test...')).toBe('Test');
    });

    test('should remove trailing spaces', () => {
      expect(formatChapterTitle('Test   ')).toBe('Test');
    });

    test('should remove colons', () => {
      expect(formatChapterTitle('Test: Title')).toBe('Test Title');
    });

    test('should sanitize fullwidth colon in original chapter titles', () => {
      expect(formatChapterTitle('001話：轉職！死靈法師！')).toBe('001話 轉職！死靈法師！');
    });

    test('should handle combination of trailing dots and spaces', () => {
      expect(formatChapterTitle('Chapter 75. ')).toBe('Chapter 75');
      expect(formatChapterTitle('Chapter 75 . ')).toBe('Chapter 75');
    });
  });

  describe('formatChapterFolderName', () => {
    test('should format numbered chapters without trailing dots', () => {
      const result = formatChapterFolderName('Ch. 75 - Anh hùng.', {
        mode: 'numbered',
        prefix: 'Chap',
        padDigits: 3,
      });
      expect(result).toBe('Chap 075');
      expect(result).not.toMatch(/[\s.]+$/); // không kết thúc bằng dấu chấm hoặc khoảng trắng
    });

    test('should format original mode chapters without trailing dots', () => {
      const result = formatChapterFolderName('Ch. 75 - Anh hùng.', {
        mode: 'original',
      });
      expect(result).toBe('Ch. 75 - Anh hùng');
      expect(result).not.toMatch(/[\s.]+$/); // không kết thúc bằng dấu chấm hoặc khoảng trắng
    });

    test('should sanitize fullwidth colon in original folder mode', () => {
      const result = formatChapterFolderName('001話：轉職！死靈法師！', {
        mode: 'original',
      });
      expect(result).toBe('001話 轉職！死靈法師！');
      expect(result).not.toMatch(/[:：]/);
    });

    test('should handle chapter titles ending with dots in original mode', () => {
      const result = formatChapterFolderName('Chapter 76 - Hậu Duệ Chưởng yêu cầu bình luận ở chương trước.', {
        mode: 'original',
      });
      expect(result).not.toMatch(/[\s.]+$/);
    });
  });

  describe('extractChapterNumberString', () => {
    test('should extract chapter number from various formats', () => {
      expect(extractChapterNumberString('Ch. 75 - Anh hùng.')).toBe('75');
      expect(extractChapterNumberString('Chapter 76')).toBe('76');
      expect(extractChapterNumberString('Chương 100')).toBe('100');
      expect(extractChapterNumberString('Ch. 12.5')).toBe('12.5');
    });

    test('prefers Chinese chapter marker (话/話/章/回) over volume/part (部)', () => {
      expect(extractChapterNumberString('[第2部] 第13话')).toBe('13');
      expect(extractChapterNumberString('[第2部] 第14话')).toBe('14');
      expect(extractChapterNumberString('[第2部] 第25话')).toBe('25');
      expect(extractChapterNumberString('第2部 第1话')).toBe('1');
      expect(extractChapterNumberString('第13话')).toBe('13');
      expect(extractChapterNumberString('第12.5话')).toBe('12.5');
    });
  });

  describe('formatChapterFolderName volume prefix', () => {
    test('numbered mode uses chapter number not volume number', () => {
      const fmt = { mode: 'numbered', prefix: 'Chương', padDigits: 3, layout: 'subfolder' };
      expect(formatChapterFolderName('[第2部] 第13话', fmt)).toBe('Chương 013');
      expect(formatChapterFolderName('[第2部] 第14话', fmt)).toBe('Chương 014');
      expect(formatChapterFolderName('[第2部] 第25话', fmt)).toBe('Chương 025');
    });
  });

  describe('formatChapterPageFileName', () => {
    test('uses subfolder page names by default', () => {
      expect(formatChapterPageFileName('Chapter 1', 1, 'jpg', { layout: 'subfolder' })).toBe('001.jpg');
    });

    test('uses chapter label and zero-based page suffix in flat layout', () => {
      const fmt = { mode: 'numbered', prefix: 'Chương', padDigits: 3, layout: 'flat' };
      expect(formatChapterPageFileName('Chapter 1', 1, 'jpg', fmt)).toBe('Chương 001_000.jpg');
      expect(formatChapterPageFileName('Chapter 1', 2, 'jpg', fmt)).toBe('Chương 001_001.jpg');
    });

    test('flat prefix matches file naming', () => {
      const fmt = { mode: 'numbered', prefix: 'Chap', padDigits: 3, layout: 'flat' };
      expect(getFlatChapterImageNamePrefix('Chapter 12', fmt)).toBe('Chap 012_');
      expect(isFlatChapterLayout(fmt)).toBe(true);
    });
  });
});
