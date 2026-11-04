const fc = require('fast-check');
const { detectFormat, SUPPORTED_EXTENSIONS } = require('../../reader/formatDetector');

// ─── Property 1: Format routing is total and correct ─────────────────────────
// Validates: Requirements 1.5, 2.6, 3.6, 4.7, 8.3
describe('detectFormat — Property 1: Format routing is total and correct', () => {
  const supportedLower = ['.cbz', '.zip', '.cbr', '.rar', '.pdf', '.epub'];
  const supportedUpper = supportedLower.map((e) => e.toUpperCase());
  const allSupported = [...supportedLower, ...supportedUpper];

  test('Property 1: every supported extension (lower + upper) returns non-null', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...allSupported),
        (ext) => detectFormat('file' + ext) !== null
      ),
      { numRuns: 100 }
    );
  });

  test('Property 1: unsupported extensions return null', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('.txt', '.mp4', '.json', '.xml', '.html', '.doc', '.docx', '.png', '.jpg'),
        (ext) => detectFormat('file' + ext) === null
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Unit tests ───────────────────────────────────────────────────────────────
describe('detectFormat — unit tests', () => {
  // Lowercase supported extensions
  test('.cbz → "cbz"', () => expect(detectFormat('manga.cbz')).toBe('cbz'));
  test('.zip → "zip"', () => expect(detectFormat('archive.zip')).toBe('zip'));
  test('.cbr → "rar"', () => expect(detectFormat('comic.cbr')).toBe('rar'));
  test('.rar → "rar"', () => expect(detectFormat('archive.rar')).toBe('rar'));
  test('.pdf → "pdf"', () => expect(detectFormat('book.pdf')).toBe('pdf'));
  test('.epub → "epub"', () => expect(detectFormat('book.epub')).toBe('epub'));

  // Uppercase variants (case-insensitive)
  test('.CBZ → "cbz"', () => expect(detectFormat('manga.CBZ')).toBe('cbz'));
  test('.ZIP → "zip"', () => expect(detectFormat('archive.ZIP')).toBe('zip'));
  test('.CBR → "rar"', () => expect(detectFormat('comic.CBR')).toBe('rar'));
  test('.RAR → "rar"', () => expect(detectFormat('archive.RAR')).toBe('rar'));
  test('.PDF → "pdf"', () => expect(detectFormat('book.PDF')).toBe('pdf'));
  test('.EPUB → "epub"', () => expect(detectFormat('book.EPUB')).toBe('epub'));

  // Mixed case
  test('.Cbz → "cbz"', () => expect(detectFormat('manga.Cbz')).toBe('cbz'));
  test('.Pdf → "pdf"', () => expect(detectFormat('book.Pdf')).toBe('pdf'));

  // Unsupported extensions
  test('.txt → null', () => expect(detectFormat('file.txt')).toBeNull());
  test('.mp4 → null', () => expect(detectFormat('video.mp4')).toBeNull());
  test('.jpg → null', () => expect(detectFormat('image.jpg')).toBeNull());

  // Edge cases
  test('empty string → null', () => expect(detectFormat('')).toBeNull());
  test('null → null', () => expect(detectFormat(null)).toBeNull());
  test('undefined → null', () => expect(detectFormat(undefined)).toBeNull());
  test('no extension → null', () => expect(detectFormat('noextension')).toBeNull());
  test('path with directory → correct format', () =>
    expect(detectFormat('/home/user/manga/chapter.cbz')).toBe('cbz'));
  test('path with multiple dots → uses last extension', () =>
    expect(detectFormat('my.manga.vol1.pdf')).toBe('pdf'));
});

// ─── SUPPORTED_EXTENSIONS ─────────────────────────────────────────────────────
describe('SUPPORTED_EXTENSIONS', () => {
  test('contains all 6 expected extensions', () => {
    expect(SUPPORTED_EXTENSIONS).toEqual(['.cbz', '.zip', '.cbr', '.rar', '.pdf', '.epub']);
  });

  test('all entries are lowercase with leading dot', () => {
    for (const ext of SUPPORTED_EXTENSIONS) {
      expect(ext).toMatch(/^\.[a-z]+$/);
    }
  });
});
