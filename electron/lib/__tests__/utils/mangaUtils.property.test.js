const fc = require('fast-check');
const { formatFolderName, MAX_LENGTH_FOLDER_NAME } = require('../../shared/mangaUtils');

// ─── Property 1: Path safety (formatFolderName length ≤ 255) ─────────────────
// **Validates: Requirements 8.1**
describe('formatFolderName — Property 1: Path safety (length ≤ 255 bytes)', () => {
  test('Property 1: formatFolderName always produces paths ≤ 255 bytes', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 1000 }),
        (input) => {
          const result = formatFolderName(input);
          const byteLength = Buffer.from(result, 'utf8').length;
          return byteLength <= MAX_LENGTH_FOLDER_NAME;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 1: formatFolderName with Unicode strings produces paths ≤ 255 bytes', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 1000 }),
        (input) => {
          // Add some Unicode characters to the input
          const unicodeInput = input + '你好世界こんにちはمرحبا안녕하세요';
          const result = formatFolderName(unicodeInput);
          const byteLength = Buffer.from(result, 'utf8').length;
          return byteLength <= MAX_LENGTH_FOLDER_NAME;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 1: formatFolderName with very long strings produces paths ≤ 255 bytes', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 500, maxLength: 5000 }),
        (input) => {
          const result = formatFolderName(input);
          const byteLength = Buffer.from(result, 'utf8').length;
          return byteLength <= MAX_LENGTH_FOLDER_NAME;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 1: formatFolderName with special characters produces paths ≤ 255 bytes', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 1000 }).map((s) => {
          // Mix in special characters that should be removed
          const specialChars = '<>:"|?*\\/';
          let result = s;
          for (let i = 0; i < s.length; i += 10) {
            const randomChar = specialChars[Math.floor(Math.random() * specialChars.length)];
            result = result.slice(0, i) + randomChar + result.slice(i);
          }
          return result;
        }),
        (input) => {
          const result = formatFolderName(input);
          const byteLength = Buffer.from(result, 'utf8').length;
          return byteLength <= MAX_LENGTH_FOLDER_NAME;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 1: formatFolderName with multi-byte Unicode characters produces paths ≤ 255 bytes', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.constantFrom(
            '你好', '世界', 'こんにちは', 'مرحبا', '안녕하세요',
            'Привет', 'สวัสดี', 'Γεια σου', 'שלום', 'नमस्ते',
            '🎉', '🚀', '💻', '📚', '🌟', '❤️', '🔥', '✨'
          ),
          { minLength: 0, maxLength: 200 }
        ).map((arr) => arr.join('')),
        (input) => {
          const result = formatFolderName(input);
          const byteLength = Buffer.from(result, 'utf8').length;
          return byteLength <= MAX_LENGTH_FOLDER_NAME;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 2: No path traversal characters in output ───────────────────────
// **Validates: Requirements 8.1**
describe('formatFolderName — Property 2: No path traversal characters', () => {
  test('Property 2: formatFolderName removes all path separators', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 500 }),
        (input) => {
          const result = formatFolderName(input);
          // Check for path separators and invalid Windows characters
          return !result.includes('/') &&
                 !result.includes('\\') &&
                 !result.includes('<') &&
                 !result.includes('>') &&
                 !result.includes(':') &&
                 !result.includes('：') &&
                 !result.includes('"') &&
                 !result.includes('|') &&
                 !result.includes('?') &&
                 !result.includes('*');
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 2: formatFolderName with path traversal attempts produces safe output', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          '../../../etc/passwd',
          '..\\..\\..\\windows\\system32',
          'test/../../../secret',
          'test\\..\\..\\secret',
          './test/../file',
          '.\\test\\..\\file',
          '../../',
          '..\\..\\',
          '../test/../../file',
          '..\\test\\..\\..\\file'
        ),
        (input) => {
          const result = formatFolderName(input);
          // Result should not contain any path separators
          // Note: '..' by itself (without slashes) may remain as it's just dots, not a path separator
          return !result.includes('/') && !result.includes('\\');
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 3: No trailing dots or spaces (Windows compatibility) ───────────
// **Validates: Requirements 8.1**
describe('formatFolderName — Property 3: No trailing dots or spaces', () => {
  test('Property 3: formatFolderName never produces trailing dots or spaces', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 500 }),
        (input) => {
          const result = formatFolderName(input);
          if (result === '') return true; // Empty result is valid
          // Check that result doesn't end with dot or space
          return !result.match(/[\s.]+$/);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 3: formatFolderName with strings ending in dots/spaces produces safe output', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }).map((s) => {
          // Add trailing dots and spaces
          const suffixes = ['.', '..', '...', ' ', '  ', '. ', ' .', '.. ', ' ..'];
          const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
          return s + suffix;
        }),
        (input) => {
          const result = formatFolderName(input);
          if (result === '') return true; // Empty result is valid
          // Check that result doesn't end with dot or space
          return !result.match(/[\s.]+$/);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 4: Empty input produces empty output ────────────────────────────
describe('formatFolderName — Property 4: Empty input handling', () => {
  test('Property 4: formatFolderName with null/undefined/empty produces empty string', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(null, undefined, ''),
        (input) => {
          const result = formatFolderName(input);
          return result === '';
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 4: formatFolderName with only invalid characters produces empty string', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.constantFrom('<', '>', ':', '"', '|', '?', '*', '/', '\\', ' ', '.'),
          { minLength: 1, maxLength: 50 }
        ).map((arr) => arr.join('')),
        (input) => {
          const result = formatFolderName(input);
          return result === '';
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 5: Idempotency ───────────────────────────────────────────────────
describe('formatFolderName — Property 5: Idempotency', () => {
  test('Property 5: formatFolderName is idempotent (applying twice gives same result)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 500 }),
        (input) => {
          const result1 = formatFolderName(input);
          const result2 = formatFolderName(result1);
          return result1 === result2;
        }
      ),
      { numRuns: 100 }
    );
  });
});
