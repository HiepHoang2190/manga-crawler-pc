import fs from 'node:fs';
import path from 'node:path';

describe('MultiSelectDropdown Component Structure and Standards', () => {
  const componentPath = path.resolve(process.cwd(), 'src/shared/ui/MultiSelectDropdown.jsx');
  const sharedIndexPath = path.resolve(process.cwd(), 'src/shared/index.js');

  test('MultiSelectDropdown.jsx exists and exports a default function', () => {
    expect(fs.existsSync(componentPath)).toBe(true);
    const content = fs.readFileSync(componentPath, 'utf8');
    expect(content).toContain('export default function MultiSelectDropdown');
  });

  test('exported in src/shared/index.js', () => {
    const sharedIndex = fs.readFileSync(sharedIndexPath, 'utf8');
    expect(sharedIndex).toContain('MultiSelectDropdown');
  });

  test('complies with UI standards: no native title attributes and no underline', () => {
    const content = fs.readFileSync(componentPath, 'utf8');
    expect(content).not.toMatch(/\btitle\s*=\s*["'{]/);
    expect(content).not.toMatch(/\bhover:underline\b/);
    expect(content).not.toMatch(/\bunderline\b/);
  });

  test('uses React Portal and supports tri-state master selection', () => {
    const content = fs.readFileSync(componentPath, 'utf8');
    expect(content).toContain('createPortal');
    expect(content).toContain('selectedValues');
    expect(content).toContain('onChange');
    expect(content).toContain('indeterminate');
  });

  test('supports variant="inline" with defaultExpanded for direct listing of options and uses data-tooltip', () => {
    const content = fs.readFileSync(componentPath, 'utf8');
    expect(content).toContain('variant');
    expect(content).toContain('defaultExpanded');
    expect(content).toContain("variant === 'inline'");
    expect(content).toContain('maxHeightClass');
    expect(content).toMatch(/data-tooltip=\{expanded \? t\('sidebar\.hidePanel'\) : t\('sidebar\.showPanel'\)\}/);
  });
});

