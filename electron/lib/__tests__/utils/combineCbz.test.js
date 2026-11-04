const path = require('path');
const fc = require('fast-check');
const { deduplicateFolderNames, normalizeCbzExtension, resolveDefaultOutputDir } = require('../../export/combineCbz');

// ─── Property 2: Combine deduplication produces unique folder names ───────────
// Validates: Requirements 2.3
describe('deduplicateFolderNames', () => {
  test('Property 2: output length equals input length and all names are unique', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1 }), { minLength: 1 }),
        (names) => {
          const result = deduplicateFolderNames(names);
          return result.length === names.length && new Set(result).size === result.length;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('unit: no duplicates in input → unchanged', () => {
    expect(deduplicateFolderNames(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  test('unit: duplicate names get _2, _3 suffixes', () => {
    expect(deduplicateFolderNames(['ch', 'ch', 'ch'])).toEqual(['ch', 'ch_2', 'ch_3']);
  });

  test('unit: empty array returns empty array', () => {
    expect(deduplicateFolderNames([])).toEqual([]);
  });
});

// ─── Property 6: .cbz extension normalization is idempotent ──────────────────
// Validates: Requirements 2.5
describe('normalizeCbzExtension', () => {
  test('Property 6: result always ends in .cbz and normalizing twice is idempotent', () => {
    fc.assert(
      fc.property(
        fc.string(),
        (name) => {
          const once = normalizeCbzExtension(name);
          const twice = normalizeCbzExtension(once);
          return once.toLowerCase().endsWith('.cbz') && twice === once;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('unit: name without .cbz gets extension appended', () => {
    expect(normalizeCbzExtension('my_manga')).toBe('my_manga.cbz');
  });

  test('unit: name already ending in .cbz is unchanged', () => {
    expect(normalizeCbzExtension('my_manga.cbz')).toBe('my_manga.cbz');
  });

  test('unit: case-insensitive — .CBZ is treated as already having extension', () => {
    expect(normalizeCbzExtension('my_manga.CBZ')).toBe('my_manga.CBZ');
  });

  test('unit: empty string gets .cbz appended', () => {
    expect(normalizeCbzExtension('')).toBe('.cbz');
  });
});

// ─── Property 7: Default output dir is parent of first input file ─────────────
// Validates: Requirements 7.2
describe('resolveDefaultOutputDir', () => {
  test('Property 7: default output dir equals path.dirname of first input file', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.includes('/')), { minLength: 1, maxLength: 5 }),
        (segments) => {
          const inputPath = '/' + segments.join('/') + '/file.cbz';
          const defaultDir = resolveDefaultOutputDir(inputPath);
          return defaultDir === path.dirname(inputPath);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('unit: returns parent directory of given file path', () => {
    expect(resolveDefaultOutputDir('/home/user/manga/vol1.cbz')).toBe('/home/user/manga');
  });

  test('unit: works with Windows-style paths', () => {
    const p = path.join('C:', 'Users', 'user', 'manga', 'vol1.cbz');
    expect(resolveDefaultOutputDir(p)).toBe(path.dirname(p));
  });
});
