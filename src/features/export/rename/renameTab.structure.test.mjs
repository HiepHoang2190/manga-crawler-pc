import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

describe('RenameTab structure tests', () => {
  const renameSrc = fs.readFileSync(path.join(dirname, 'RenameTab.jsx'), 'utf8');

  test('RenameTab sets filterStatus default state to "changed"', () => {
    expect(renameSrc).toMatch(/const\s+\[filterStatus,\s*setFilterStatus\]\s*=\s*useState\(['"]changed['"]\)/);
  });

  test('RenameTab defines filterOptions with changed, all, unchanged, and blocked', () => {
    expect(renameSrc).toMatch(/value:\s*['"]all['"]/);
    expect(renameSrc).toMatch(/value:\s*['"]changed['"]/);
    expect(renameSrc).toMatch(/value:\s*['"]unchanged['"]/);
    expect(renameSrc).toMatch(/value:\s*['"]blocked['"]/);
  });

  test('RenameTab integrates SearchableSelect for filterStatus', () => {
    expect(renameSrc).toMatch(/<SearchableSelect[\s\S]*?value=\{filterStatus\}[\s\S]*?onChange=\{\(val\)\s*=>\s*setFilterStatus\(val\)\}/);
  });
});
