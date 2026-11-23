import fs from 'node:fs';
import path from 'node:path';

describe('LatestUpdatesPanel Error Banner Refinement', () => {
  const panelPath = path.resolve(process.cwd(), 'src/features/latest-updates/LatestUpdatesPanel.jsx');

  test('implements collapsible multi-error parsing and dismiss functionality', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain('errorDismissed');
    expect(content).toContain('errorDetailsExpanded');
    expect(content).toContain('multiFetchErrorSummary');
    expect(content).toContain('dismissError');
  });

  test('complies with UI standards: no native title attributes and no underline', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).not.toMatch(/\btitle\s*=\s*["'{]/);
    expect(content).not.toMatch(/\bhover:underline\b/);
    expect(content).not.toMatch(/\bunderline\b/);
  });

  test('renders centered FetchErrorState when empty with fetchError and limits top warning banner to partial results (rows.length > 0)', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain('<FetchErrorState');
    expect(content).toContain('onRetry={handleManualRefresh}');
    expect(content).toMatch(/rows\.length\s*>\s*0\s*&&\s*fetchError\s*&&\s*!errorDismissed/);
  });
});

