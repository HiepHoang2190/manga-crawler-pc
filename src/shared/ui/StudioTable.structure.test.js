import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

test('src/shared/ui/StudioTable.jsx implements core table layout architecture', () => {
  const filePath = path.join(dirname, 'StudioTable.jsx');
  expect(fs.existsSync(filePath)).toBe(true);
  const src = fs.readFileSync(filePath, 'utf8');

  expect(src).toMatch(/export default function StudioTable/);
  expect(src).toMatch(/columns/);
  expect(src).toMatch(/colgroup/);
  expect(src).toMatch(/w-full min-w-full table-fixed/);
  expect(src).toMatch(/bg-surface-container-high/);
  expect(src).toMatch(/custom-scrollbar/);
  expect(src).toMatch(/renderRow/);
  expect(src).toMatch(/renderSubRow/);
  expect(src).toMatch(/emptyState/);
});

test('src/shared/index.js exports StudioTable', () => {
  const indexPath = path.join(dirname, '../index.js');
  const src = fs.readFileSync(indexPath, 'utf8');
  expect(src).toMatch(/export \{ default as StudioTable \} from '\.\/ui\/StudioTable\.jsx';/);
});

test('StudioTable respects explicit col.align and does not inject conflicting text-left', () => {
  const filePath = path.join(dirname, 'StudioTable.jsx');
  const src = fs.readFileSync(filePath, 'utf8');
  expect(src).toMatch(/col\.align === 'center'\s*\?\s*'text-center'/);
  expect(src).toMatch(/col\.align === 'right'\s*\?\s*'text-right'/);
  expect(src).toMatch(/text-\(center\|right\|left\)/);
});
