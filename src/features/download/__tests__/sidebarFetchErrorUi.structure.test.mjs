import fs from 'node:fs';
import path from 'node:path';

describe('Sidebar classified fetchError card structure', () => {
  const sidebarPath = path.resolve(process.cwd(), 'src/features/download/components/Sidebar.jsx');

  test('Sidebar uses classifyFetchError, accessible alert role, retry action, and obeys UI standards', () => {
    const content = fs.readFileSync(sidebarPath, 'utf8');
    expect(content).toContain('classifyFetchError');
    expect(content).toContain('data-testid="sidebar-fetch-error"');
    expect(content).toContain('role="alert"');
    expect(content).toContain("t('fetchError.retry')");
    expect(content).not.toMatch(/\btitle\s*=\s*["'{]/);
    expect(content).not.toMatch(/\b(?:hover:)?underline\b/);
  });
});
