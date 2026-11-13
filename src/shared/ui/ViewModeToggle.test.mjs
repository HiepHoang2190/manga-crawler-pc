import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('ViewModeToggle Component Structure & Requirements', () => {
  const compPath = path.resolve(__dirname, './ViewModeToggle.jsx');

  test('file exists and exports default ViewModeToggle', () => {
    expect(fs.existsSync(compPath)).toBe(true);
    const code = fs.readFileSync(compPath, 'utf8');
    expect(code).toContain('export default function ViewModeToggle');
  });

  test('conforms to UI standards: data-tooltip used, no native title attribute', () => {
    const code = fs.readFileSync(compPath, 'utf8');
    expect(code).toContain('data-tooltip=');
    expect(code).not.toMatch(/<button\b[^>]*?\btitle=/);
  });

  test('conforms to UI standards: no underline classes', () => {
    const code = fs.readFileSync(compPath, 'utf8');
    expect(code).not.toContain('underline');
  });

  test('handles viewMode toggling between grid and list', () => {
    const code = fs.readFileSync(compPath, 'utf8');
    expect(code).toContain("viewMode === 'grid'");
    expect(code).toContain('view_list');
    expect(code).toContain('grid_view');
  });

  test('supports size variants (sm, md, lg)', () => {
    const code = fs.readFileSync(compPath, 'utf8');
    expect(code).toContain('sm:');
    expect(code).toContain('md:');
    expect(code).toContain('lg:');
  });
});

