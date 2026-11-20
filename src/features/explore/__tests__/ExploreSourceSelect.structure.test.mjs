import fs from 'node:fs';
import path from 'node:path';

describe('ExploreSourceSelect Structure and Logic Tests', () => {
  const componentPath = path.resolve(process.cwd(), 'src/features/explore/components/ExploreSourceSelect.jsx');
  const barrelPath = path.resolve(process.cwd(), 'src/features/explore/index.js');

  test('ExploreSourceSelect component file exists and standardizes size="md" (h-10 rounded-xl)', () => {
    expect(fs.existsSync(componentPath)).toBe(true);
    const code = fs.readFileSync(componentPath, 'utf8');

    // Standardizes size="md" as default (h-10 rounded-xl)
    expect(code).toMatch(/size\s*=\s*['"]md['"]/);
    // Uses SearchableSelect
    expect(code).toContain('<SearchableSelect');
    // Uses explore.sourcesLabel by default
    expect(code).toContain("t('explore.sourcesLabel')");
    // Standard uppercase styling
    expect(code).toContain('uppercase tracking-wider text-on-surface-variant/70');
    // Exports extractConnectorHost
    expect(code).toContain('export function extractConnectorHost');
  });

  test('Explore barrel file re-exports ExploreSourceSelect', () => {
    const barrelCode = fs.readFileSync(barrelPath, 'utf8');
    expect(barrelCode).toContain("export { default as ExploreSourceSelect } from './components/ExploreSourceSelect.jsx'");
  });
});
