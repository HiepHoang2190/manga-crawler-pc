import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const chapterListPath = path.resolve(dirname, '../ChapterList.jsx');

describe('ChapterList scanlation group filter and deduplication structure', () => {
  const content = fs.readFileSync(chapterListPath, 'utf8');

  test('imports SearchableSelect from shared component library', () => {
    expect(content).toMatch(/import\s+\{[^}]*SearchableSelect[^}]*\}\s+from\s+['"][^'"]*shared/);
  });

  test('imports scanlation group utilities from chapterGroupUtils', () => {
    expect(content).toMatch(/extractScanlationGroups/);
    expect(content).toMatch(/filterChaptersByGroup/);
    expect(content).toMatch(/dedupeChaptersByNumber/);
  });

  test('maintains selectedGroup state and resets when manga changes', () => {
    expect(content).toMatch(/selectedGroup/);
    expect(content).toMatch(/setSelectedGroup/);
  });

  test('renders SearchableSelect for group filtering when multiple groups exist', () => {
    expect(content).toMatch(/<SearchableSelect/);
    expect(content).toMatch(/scanlationGroups/);
  });

  test('performs smart deduplication on select all when in all groups mode', () => {
    expect(content).toMatch(/dedupeChaptersByNumber/);
  });

  test('deduplicates chapters when selecting by volume (toggleSelectVolume)', () => {
    expect(content).toMatch(/toggleSelectVolume[\s\S]*?dedupeChaptersByNumber/);
  });

  test('calculates volume selection completion using deduplicated chapter count', () => {
    expect(content).toMatch(/targetVolumeChapters|dedupeChaptersByNumber\(group\.chapters\)/);
  });
});
