'use strict';

const { resolvePageNumber } = require('../../../export/image/pipeline/pageNumber');

describe('resolvePageNumber', () => {
  test('extracts trailing number from filename', () => {
    expect(resolvePageNumber('001.jpg', 0)).toBe(1);
    expect(resolvePageNumber('/path/to/002.png', 5)).toBe(2);
    expect(resolvePageNumber('vol1_ch02_024.png', 0)).toBe(24);
    expect(resolvePageNumber('chapter_3_page_005.webp', 0)).toBe(5);
    expect(resolvePageNumber('page-10_clean.png', 0)).toBe(10);
    expect(resolvePageNumber('page00.jpg', 0)).toBe(0);
  });

  test('falls back to 1-based index if filename contains no digits', () => {
    expect(resolvePageNumber('cover.jpg', 0)).toBe(1);
    expect(resolvePageNumber('back.png', 1)).toBe(2);
    expect(resolvePageNumber('credits.webp', 9)).toBe(10);
  });

  test('falls back to 1 if neither filename digits nor valid index are provided', () => {
    expect(resolvePageNumber(null, null)).toBe(1);
    expect(resolvePageNumber('cover.jpg', null)).toBe(1);
    expect(resolvePageNumber('', undefined)).toBe(1);
  });
});
