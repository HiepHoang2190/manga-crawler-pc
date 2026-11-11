import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const chapterListPath = path.resolve(dirname, '../ChapterList.jsx');

describe('ChapterList volume grouping structure', () => {
  const content = fs.readFileSync(chapterListPath, 'utf8');

  test('imports chapterVolumeGrouping utilities', () => {
    expect(content).toMatch(/hasVolumeData/);
    expect(content).toMatch(/groupChaptersByVolume/);
  });

  test('contains volume accordion state and toggles', () => {
    expect(content).toMatch(/collapsedVolumeKeys/);
    expect(content).toMatch(/toggleVolumeCollapse/);
    expect(content).toMatch(/toggleAllVolumes/);
  });

  test('supports volume-level quick selection with indeterminate state', () => {
    expect(content).toMatch(/toggleSelectVolume/);
    expect(content).toMatch(/indeterminate/);
  });

  test('renders volume header row with expand/collapse icons', () => {
    expect(content).toMatch(/expand_more/);
    expect(content).toMatch(/volumeHeader/);
    expect(content).toMatch(/noVolumeHeader/);
  });

  test('integrates parseChapterTitleMetadata to clean chapter titles and group tags', () => {
    expect(content).toMatch(/parseChapterTitleMetadata/);
    expect(content).toMatch(/meta\.chapterLabel/);
  });

  test('renders Card Accordion layout with volume card boxes and child row indentation (Option 2)', () => {
    // Card container styling and spacing
    expect(content).toMatch(/space-y-3/);
    expect(content).toMatch(/rounded-xl overflow-hidden/);
    // Indented child chapter rows
    expect(content).toMatch(/renderCardChapterItem/);
    expect(content).toMatch(/pl-6/);
    // Compact read button
    expect(content).toMatch(/auto_stories/);
    // Select all checkbox in volume mode
    expect(content).toMatch(/data-testid="select-all-chapters-chk"/);
  });
});
