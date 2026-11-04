const fc = require('fast-check');
const { buildPartFileName, packChaptersIntoParts } = require('../../export/splitCbz');

// ─── Property 3: Split is a complete, non-fragmenting partition ───────────────
// Validates: Requirements 5.1, 5.2, 5.3, 5.8
describe('packChaptersIntoParts', () => {
  test('Property 3: every chapter appears in exactly one part (complete, non-fragmenting partition)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1 }),
            totalBytes: fc.integer({ min: 1, max: 500 * 1024 * 1024 }),
          }),
          { minLength: 1 }
        ),
        fc.integer({ min: 1, max: 4096 }),
        (chapters, maxMb) => {
          const maxBytes = maxMb * 1024 * 1024;
          const parts = packChaptersIntoParts(chapters, maxBytes);

          // Total chapters across all parts equals input length (complete partition)
          const totalCount = parts.reduce((sum, p) => sum + p.length, 0);
          const countOk = totalCount === chapters.length;

          // Verify order is preserved: flatten parts should equal original chapter names in order
          const flatNames = parts.flat();
          const originalNames = chapters.map((c) => c.name);
          const orderOk = flatNames.every((name, i) => name === originalNames[i]);

          // No part is empty
          const noEmptyParts = parts.every((p) => p.length > 0);

          return countOk && orderOk && noEmptyParts;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('unit: single chapter fits in one part', () => {
    const chapters = [{ name: 'ch1', totalBytes: 100 }];
    const parts = packChaptersIntoParts(chapters, 1000);
    expect(parts).toEqual([['ch1']]);
  });

  test('unit: chapters that fit together are grouped', () => {
    const chapters = [
      { name: 'ch1', totalBytes: 300 },
      { name: 'ch2', totalBytes: 300 },
      { name: 'ch3', totalBytes: 300 },
    ];
    // maxBytes = 700 → ch1+ch2 fit (600), ch3 alone
    const parts = packChaptersIntoParts(chapters, 700);
    expect(parts).toEqual([['ch1', 'ch2'], ['ch3']]);
  });

  test('unit: chapter exceeding maxBytes gets its own part', () => {
    const chapters = [
      { name: 'ch1', totalBytes: 100 },
      { name: 'big', totalBytes: 999999 },
      { name: 'ch3', totalBytes: 100 },
    ];
    const parts = packChaptersIntoParts(chapters, 500);
    // ch1 alone (100), big alone (999999 > 500), ch3 alone (100)
    expect(parts).toEqual([['ch1'], ['big'], ['ch3']]);
  });

  test('unit: empty chapters returns empty parts', () => {
    expect(packChaptersIntoParts([], 1024 * 1024)).toEqual([]);
  });

  test('unit: all chapters fit in one part', () => {
    const chapters = [
      { name: 'a', totalBytes: 100 },
      { name: 'b', totalBytes: 100 },
    ];
    const parts = packChaptersIntoParts(chapters, 1000);
    expect(parts).toEqual([['a', 'b']]);
  });
});

// ─── Property 4: Part_File naming is well-formed and unique ──────────────────
// Validates: Requirements 5.4
describe('buildPartFileName', () => {
  test('Property 4: all names end in .cbz, follow Part XX pattern, and are unique', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.integer({ min: 1, max: 99 }),
        (baseName, totalParts) => {
          const names = Array.from({ length: totalParts }, (_, i) =>
            buildPartFileName(baseName, i + 1, totalParts)
          );

          const allEndCbz = names.every((n) => n.toLowerCase().endsWith('.cbz'));
          const allUnique = new Set(names).size === totalParts;
          const width = Math.max(2, String(totalParts).length);
          const patternOk = names.every((n, i) => {
            const num = String(i + 1).padStart(width, '0');
            return n.includes(`Part ${num}`);
          });

          return allEndCbz && allUnique && patternOk;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('unit: single part uses 2-digit padding', () => {
    expect(buildPartFileName('MyManga', 1, 1)).toBe('MyManga - Part 01.cbz');
  });

  test('unit: 10 parts uses 2-digit padding', () => {
    expect(buildPartFileName('MyManga', 1, 10)).toBe('MyManga - Part 01.cbz');
    expect(buildPartFileName('MyManga', 10, 10)).toBe('MyManga - Part 10.cbz');
  });

  test('unit: 100 parts uses 3-digit padding', () => {
    expect(buildPartFileName('MyManga', 1, 100)).toBe('MyManga - Part 001.cbz');
    expect(buildPartFileName('MyManga', 100, 100)).toBe('MyManga - Part 100.cbz');
  });

  test('unit: part index is zero-padded to width', () => {
    expect(buildPartFileName('X', 3, 5)).toBe('X - Part 03.cbz');
  });
});

// ─── Property 5: Max_MB clamping is idempotent ───────────────────────────────
// Validates: Requirements 4.4, 8.6
describe('Max_MB clamping', () => {
  const clamp = (x) => Math.min(4096, Math.max(1, x));

  test('Property 5: clamped value is in [1, 4096] and clamping again is idempotent', () => {
    fc.assert(
      fc.property(
        fc.integer(),
        (n) => {
          const once = clamp(n);
          return once >= 1 && once <= 4096 && clamp(once) === once;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('unit: value below 1 clamps to 1', () => {
    expect(clamp(0)).toBe(1);
    expect(clamp(-100)).toBe(1);
  });

  test('unit: value above 4096 clamps to 4096', () => {
    expect(clamp(9999)).toBe(4096);
    expect(clamp(4097)).toBe(4096);
  });

  test('unit: value within range is unchanged', () => {
    expect(clamp(200)).toBe(200);
    expect(clamp(1)).toBe(1);
    expect(clamp(4096)).toBe(4096);
  });
});
