import { parseChapterTitleMetadata } from '../chapterTitleParser.js';

describe('parseChapterTitleMetadata', () => {
  test('parses full MangaDex chapter title with volume, language, and group', () => {
    const raw = 'Chapter 7 - Anh chị họ của tôi (Phần 1) (Vol 1) [vi] {Dịch Thuật Mèo Ú}';
    const result = parseChapterTitleMetadata(raw, '1');

    expect(result.chapterLabel).toBe('Chapter 7');
    expect(result.cleanTitle).toBe('Anh chị họ của tôi (Phần 1)');
    expect(result.groupName).toBe('Dịch Thuật Mèo Ú');
    expect(result.language).toBe('vi');
  });

  test('removes redundant volume marker when currentVolume matches', () => {
    const raw = 'Chapter 5 - Con trai (Vol 1) [vi] {Dịch Thuật ABC}';
    const result = parseChapterTitleMetadata(raw, 1);

    expect(result.chapterLabel).toBe('Chapter 5');
    expect(result.cleanTitle).toBe('Con trai');
    expect(result.groupName).toBe('Dịch Thuật ABC');
    expect(result.language).toBe('vi');
  });

  test('handles Oneshot titles properly', () => {
    const raw = 'Oneshot - Ngoại truyện kỷ niệm [vi] {Team XYZ}';
    const result = parseChapterTitleMetadata(raw);

    expect(result.chapterLabel).toBe('Oneshot');
    expect(result.cleanTitle).toBe('Ngoại truyện kỷ niệm');
    expect(result.groupName).toBe('Team XYZ');
    expect(result.language).toBe('vi');
  });

  test('handles titles with only chapter number', () => {
    const raw = 'Chapter 105';
    const result = parseChapterTitleMetadata(raw);

    expect(result.chapterLabel).toBe('Chapter 105');
    expect(result.cleanTitle).toBe('Chapter 105');
    expect(result.groupName).toBeNull();
    expect(result.language).toBeNull();
  });

  test('handles non-MangaDex or unstructured titles gracefully', () => {
    const raw = 'Chương 10: Khởi đầu mới';
    const result = parseChapterTitleMetadata(raw);

    expect(result.chapterLabel).toBe('Chương 10');
    expect(result.cleanTitle).toBe('Khởi đầu mới');
    expect(result.groupName).toBeNull();
    expect(result.language).toBeNull();
  });

  test('safely handles volumes with special regex characters without throwing', () => {
    const raw = 'Chapter 5 - Ngoại truyện (Vol 1 (Bonus)) [vi] {Team}';
    expect(() => {
      const res = parseChapterTitleMetadata(raw, '1 (Bonus)');
      expect(res.chapterLabel).toBe('Chapter 5');
      expect(res.cleanTitle).toBe('Ngoại truyện');
    }).not.toThrow();
  });

  test('handles empty or invalid input safely', () => {
    expect(parseChapterTitleMetadata('')).toEqual({
      chapterLabel: '',
      cleanTitle: '',
      groupName: null,
      language: null,
      rawTitle: '',
    });
    expect(parseChapterTitleMetadata(null)).toEqual({
      chapterLabel: '',
      cleanTitle: '',
      groupName: null,
      language: null,
      rawTitle: '',
    });
  });
});

