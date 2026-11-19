import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const chapterListPath = path.resolve(dirname, '../ChapterList.jsx');

describe('ChapterList default desc sort structure', () => {
  const content = fs.readFileSync(chapterListPath, 'utf8');

  test('imports loadChapterSortOrder and saveChapterSortOrder', () => {
    expect(content).toMatch(/loadChapterSortOrder/);
    expect(content).toMatch(/saveChapterSortOrder/);
  });

  test('initializes titleSort with loadChapterSortOrder()', () => {
    expect(content).toMatch(/useState\(\s*\(\)\s*=>\s*loadChapterSortOrder\(\)\s*\)/);
  });

  test('toggles titleSort directly between desc and asc and saves preference', () => {
    expect(content).toMatch(/saveChapterSortOrder\(next\)/);
    expect(content).toMatch(/prev === 'desc' \? 'asc' : 'desc'/);
  });

  test('renders arrow_downward for desc and arrow_upward for asc, removing swap_vert', () => {
    expect(content).not.toMatch(/swap_vert/);
    expect(content).toMatch(/titleSort === 'asc' \? 'arrow_upward' : 'arrow_downward'/);
  });
});
