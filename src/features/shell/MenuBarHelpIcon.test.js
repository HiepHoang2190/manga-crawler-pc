import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

test('MenuBar displays help icon always when tab is active (not hidden behind opacity-0)', () => {
  const code = fs.readFileSync(path.join(dirname, 'MenuBar.jsx'), 'utf8');

  // Verify help button exists
  expect(code).toMatch(/data-testid=\{`help-btn-\$\{tab\.id\}`\}/);

  // The help button should be visible directly when active without requiring group-hover from opacity-0
  expect(code).not.toMatch(/opacity-0\s+group-hover:opacity/);
  expect(code).toMatch(/opacity-60\s+hover:opacity-100/);
});

test('HomeWorkspace subtabs do not show individual help icons (consolidated into Crawler main tab)', () => {
  const homeWorkspaceCode = fs.readFileSync(path.join(dirname, '../home/HomeWorkspace.jsx'), 'utf8');
  expect(homeWorkspaceCode).not.toMatch(/setHelpModalTabId\(tab\.id\)/);
});
