import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('LatestUpdatesPanel Search Loading Indicator Structure', () => {
  const panelPath = path.resolve(__dirname, '../LatestUpdatesPanel.jsx');

  test('file exists and contains search loading state logic', () => {
    expect(fs.existsSync(panelPath)).toBe(true);
    const code = fs.readFileSync(panelPath, 'utf8');
    expect(code).toContain('isSearchLoading');
    expect(code).toContain('latestUpdates.searching');
    expect(code).toContain('progress_activity');
  });

  test('search button renders spinning loading icon when search is in progress', () => {
    const code = fs.readFileSync(panelPath, 'utf8');
    expect(code).toMatch(/isSearchLoading\s*\?\s*['"]progress_activity['"]\s*:\s*['"]search['"]/);
  });

  test('search button icon spins when search is in progress', () => {
    const code = fs.readFileSync(panelPath, 'utf8');
    expect(code).toMatch(/isSearchLoading\s*\?\s*['"][^'"]*animate-spin[^'"]*['"]/);
  });

  test('content area provides searching hint feedback', () => {
    const code = fs.readFileSync(panelPath, 'utf8');
    expect(code).toContain('latestUpdates.searchingHint');
  });

  test('search button does not render redundant data-tooltip when visible label is present', () => {
    const code = fs.readFileSync(panelPath, 'utf8');
    const searchBtnMatch = code.match(/<button[^>]*?onClick=\{handleApplyLatestSearch\}[^>]*?>/);
    expect(searchBtnMatch).not.toBeNull();
    expect(searchBtnMatch[0]).not.toContain('data-tooltip');
  });
});

