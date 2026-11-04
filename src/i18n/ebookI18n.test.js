// Feature: ebook-text-reader, Property 16
// **Validates: Requirements 11.4**

const fs = require('fs');
const path = require('path');
const fc = require('fast-check');

// Source files to scan for t('ebook.*') keys
const SOURCE_FILES = [
  'src/features/reader/components/EbookReader.jsx',
  'src/features/reader/components/EbookToolbar.jsx',
  'src/features/reader/components/EbookContent.jsx',
  'src/features/reader/components/EbookChapterPanel.jsx',
  'src/features/reader/components/EbookBookmarkPanel.jsx',
  'src/features/reader/components/EbookSettingsPanel.jsx',
];

const ROOT = path.resolve(__dirname, '../../');

/**
 * Extract all t('ebook.*') key strings from source text using regex.
 * @param {string} source
 * @returns {string[]}
 */
function extractEbookKeys(source) {
  const keys = new Set();
  // Match t('ebook.something') and t("ebook.something")
  const re = /\bt\(\s*['"]((ebook)\.[^'"]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    keys.add(m[1]);
  }
  return [...keys];
}

// Collect all ebook.* keys from the component source files
function collectAllEbookKeys() {
  const allKeys = new Set();
  for (const relPath of SOURCE_FILES) {
    const absPath = path.join(ROOT, relPath);
    const source = fs.readFileSync(absPath, 'utf8');
    for (const key of extractEbookKeys(source)) {
      allKeys.add(key);
    }
  }
  return [...allKeys].sort();
}

// Load locale objects by requiring the files and extracting the exported object
function loadLocale(relPath) {
  const absPath = path.join(ROOT, relPath);
  const source = fs.readFileSync(absPath, 'utf8');
  // Use a simple eval-based approach: strip the export and eval the object literal
  // We use a Function constructor to safely evaluate the object
  const match = source.match(/export\s+const\s+\w+\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
  if (!match) throw new Error(`Could not parse locale file: ${relPath}`);
  // eslint-disable-next-line no-new-func
  const obj = new Function(`return ${match[1]}`)();
  return obj;
}

describe('Property 16: i18n key completeness', () => {
  let ebookKeys;
  let en;
  let vi;

  beforeAll(() => {
    ebookKeys = collectAllEbookKeys();
    en = loadLocale('src/i18n/locales/en.js');
    vi = loadLocale('src/i18n/locales/vi.js');
  });

  test('at least one ebook.* key is found in source files', () => {
    expect(ebookKeys.length).toBeGreaterThan(0);
  });

  test('every ebook.* key used in components exists in en locale', () => {
    const missing = ebookKeys.filter((k) => !(k in en));
    expect(missing).toEqual([]);
  });

  test('every ebook.* key used in components exists in vi locale', () => {
    const missing = ebookKeys.filter((k) => !(k in vi));
    expect(missing).toEqual([]);
  });

  test('property: for every extracted ebook.* key, both locales contain it', () => {
    // Property-based: for any key in the extracted set, both locales must have it
    // We use fast-check to sample from the extracted keys array
    fc.assert(
      fc.property(
        fc.constantFrom(...ebookKeys),
        (key) => {
          return key in en && key in vi;
        }
      )
    );
  });
});
