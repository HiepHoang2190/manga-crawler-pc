import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

describe('MangaReader temporal dead zone (TDZ) safety', () => {
  test('all callbacks referenced in the keyboard shortcuts useEffect are declared before it', () => {
    const src = fs.readFileSync(
      path.join(repoRoot, 'src/features/reader/components/MangaReader.jsx'),
      'utf8'
    );

    const shortcutsMarker = '// Keyboard shortcuts';
    const shortcutsIdx = src.indexOf(shortcutsMarker);
    expect(shortcutsIdx).toBeGreaterThan(-1);

    const requiredDecls = [
      'const requestClose =',
      'const closePreview =',
      'const toggleWebtoonSeamless =',
      'const cycleAutoScroll =',
      'const toggleChapterPanel =',
      'const navigateChapter =',
      'const prevChapterDisabled =',
      'const nextChapterDisabled =',
      'const goPrev =',
      'const goNext =',
    ];

    for (const decl of requiredDecls) {
      const idx = src.indexOf(decl);
      expect({ decl, idx }).toEqual({
        decl,
        idx: expect.any(Number),
      });
      expect(idx).toBeGreaterThan(-1);
      expect(idx).toBeLessThan(shortcutsIdx);
    }
  });
});
