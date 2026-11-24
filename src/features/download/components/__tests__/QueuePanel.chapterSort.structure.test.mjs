/**
 * Structure test: QueuePanel auto-sort chapters by status priority + UI improvements
 * Verifies helper functions exist and are used for both mobile + desktop render paths.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(__dirname, '../QueuePanel.jsx'), 'utf8');

describe('QueuePanel chapter status sort', () => {
  test('chapterStatusWeight helper function exists', () => {
    expect(src).toMatch(/function chapterStatusWeight\s*\(/);
  });

  test('sortChaptersByStatusPriority helper function exists', () => {
    expect(src).toMatch(/function sortChaptersByStatusPriority\s*\(/);
  });

  test('sortChaptersByStatusPriority is called in unified responsive card render', () => {
    const matches = src.match(/sortChaptersByStatusPriority\(item\.chapters\)/g);
    expect(matches).not.toBeNull();
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  test('origIdx is used for drag operations instead of raw idx', () => {
    expect(src).toMatch(/index:\s*origIdx/);
    const origIdxCount = (src.match(/origIdx/g) || []).length;
    expect(origIdxCount).toBeGreaterThanOrEqual(4);
  });

  test('no raw item.chapters.map((c, idx) pattern remains for chapter iteration', () => {
    const rawMapPattern = /item\.chapters\.map\(\(c,\s*idx\)/g;
    const rawMatches = src.match(rawMapPattern) || [];
    expect(rawMatches.length).toBe(0);
  });
});

describe('QueuePanel UI improvements', () => {
  test('extractChapterNumber helper exists', () => {
    expect(src).toMatch(/function extractChapterNumber\s*\(/);
  });

  test('chapterStatusSummary helper exists', () => {
    expect(src).toMatch(/function chapterStatusSummary\s*\(/);
  });

  test('isAllSameStatus helper exists', () => {
    expect(src).toMatch(/function isAllSameStatus\s*\(/);
  });

  test('search input for chapter filtering exists', () => {
    expect(src).toMatch(/chapterSearchQuery/);
    expect(src).toMatch(/searchChapter/);
  });

  test('chapter number badge rendering exists', () => {
    expect(src).toMatch(/extractChapterNumber\(c\.chapterTitle\)/);
    expect(src).toMatch(/font-mono tabular-nums/);
  });

  test('smart badge hiding with allSame check exists', () => {
    expect(src).toMatch(/!allSame/);
    expect(src).toMatch(/isAllSameStatus\(item\.chapters\)/);
  });

  test('chapter action buttons are visible by default without hover opacity suppression', () => {
    expect(src).not.toMatch(/opacity-0 group-hover\/row:opacity-100/);
    expect(src).toMatch(/onSkipChapter/);
    expect(src).toMatch(/onRemoveChapter/);
  });

  test('mini summary bar exists', () => {
    expect(src).toMatch(/chapterStatusSummary\(item\.chapters\)/);
    expect(src).toMatch(/summary\.total/);
    expect(src).toMatch(/summary\.err/);
  });

  test('alternating stripe backgrounds exist', () => {
    expect(src).toMatch(/stripeBg/);
    expect(src).toMatch(/visualIdx\s*%\s*2/);
  });

  test('expand/collapse chapter buttons have proper container size, border and 19px icon', () => {
    expect(src).toMatch(/h-8 w-8 rounded-lg border/);
    expect(src).toMatch(/material-symbols-outlined text-\[19px\] leading-none transition-transform/);
  });

  test('open manga folder button is disabled when no files are downloaded or active', () => {
    expect(src).toMatch(/disabled=\{!\(p\.done > 0 \|\| p\.hasDl\)\}/);
    expect(src).toMatch(/folderNotReadyTooltip/);
  });
});
