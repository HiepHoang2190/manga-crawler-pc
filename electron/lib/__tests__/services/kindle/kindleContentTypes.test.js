const {
  contentTypeForFile,
  isSupportedFile,
  extensionOf,
  MAX_UPLOAD_BYTES,
  SPLIT_TARGET_BYTES,
} = require('../../../export/kindle/kindleContentTypes');

describe('kindleContentTypes', () => {
  test('maps supported extensions to MIME types (case-insensitive)', () => {
    expect(contentTypeForFile('/a/b/manga.pdf')).toBe('application/pdf');
    expect(contentTypeForFile('BOOK.EPUB')).toBe('application/epub+zip');
    expect(contentTypeForFile('page.JPG')).toBe('image/jpeg');
    expect(contentTypeForFile('page.jpeg')).toBe('image/jpeg');
  });

  test('returns null for unsupported types (e.g. cbz)', () => {
    expect(contentTypeForFile('/x/chapter.cbz')).toBeNull();
    expect(isSupportedFile('/x/chapter.cbz')).toBe(false);
    expect(isSupportedFile('/x/manga.pdf')).toBe(true);
  });

  test('extensionOf extracts lowercase extension', () => {
    expect(extensionOf('/a/File.PDF')).toBe('pdf');
    expect(extensionOf('noext')).toBe('');
  });

  test('split target stays safely under the 200MB cap', () => {
    expect(SPLIT_TARGET_BYTES).toBeLessThan(MAX_UPLOAD_BYTES);
    expect(MAX_UPLOAD_BYTES).toBe(200 * 1024 * 1024);
  });
});
