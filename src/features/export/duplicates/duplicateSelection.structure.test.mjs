import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tabPath = path.join(__dirname, 'DuplicateFinderTab.jsx');

describe('DuplicateFinder Smart Check All tests', () => {
  const src = fs.readFileSync(tabPath, 'utf8');

  test('Auto-selects all duplicate images after scan completes', () => {
    // Must add all duplicateImages into autoSelected (check all)
    expect(src).toMatch(/for\s*\(\s*const\s+img\s+of\s+duplicateImages\s*\)\s*\{\s*autoSelected\.add\(img\.fullPath\);?\s*\}/);
  });

  test('allDisplayedChecked checks displayedItems.every', () => {
    expect(src).toMatch(/allDisplayedChecked[\s\S]*?displayedItems\.every\(\(item\)\s*=>\s*selectedForDelete\.has\(item\.fullPath\)\)/);
  });

  test('Group header checkbox uses allItemsChecked for check_box state', () => {
    expect(src).toMatch(/group\.allItemsChecked[\s\S]*?\?\s*['"]check_box['"]/);
  });

  test('handleToggleSelectAll adds all displayedItems when not all checked', () => {
    expect(src).toMatch(/handleToggleSelectAll[\s\S]*?for\s*\(\s*const\s+item\s+of\s+displayedItems\s*\)\s*next\.add\(item\.fullPath\)/);
  });

  test('Auto-collapses all duplicate groups after scan completes', () => {
    expect(src).toMatch(/setCollapsedGroups\s*\(\s*collectAllGroupIds\s*\(\s*duplicateImages\s*\)\s*\)/);
  });
});
