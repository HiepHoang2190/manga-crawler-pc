import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

test('src/features/site-checker/index.js default-exports SiteCheckerPanel', () => {
  const src = fs.readFileSync(path.join(dirname, 'index.js'), 'utf8');
  expect(src).toMatch(/export \{ default \} from '\.\/SiteCheckerPanel\.jsx'/);
});

test('App imports SiteCheckerPanel from the site-checker barrel and does not own test state', () => {
  const shell_src = fs.readFileSync(path.join(dirname, '../shell/ShellLayout.jsx'), 'utf8');
  expect(shell_src).toMatch(/from '\.\.\/site-checker'/);
  expect(shell_src).not.toMatch(/from '\.\.\/\.\.\/components\/SiteCheckerPanel'/);
  expect(shell_src).not.toMatch(/crawler:site-test-results/);
  expect(shell_src).not.toMatch(/startTestAll/);
  expect(shell_src).not.toMatch(/testResults/);
  expect(shell_src).not.toMatch(/testRunning/);
});

test('site-checker keeps localStorage key crawler:site-test-results and testConnector IPC', () => {
  const src = fs.readFileSync(path.join(dirname, 'SiteCheckerPanel.jsx'), 'utf8');
  expect(src).toMatch(/crawler:site-test-results/);
  expect(src).toMatch(/testConnector/);
  expect(src).toMatch(/startTestAll/);
  expect(src).toMatch(/testResults/);
  expect(src).toMatch(/testRunning/);
});

test('ShellLayout keeps SiteCheckerPanel mounted persistently to allow background scanning across tabs', () => {
  const shell_src = fs.readFileSync(path.join(dirname, '../shell/ShellLayout.jsx'), 'utf8');
  expect(shell_src).toMatch(/data-testid="tab-content-siteChecker"/);
  expect(shell_src).toMatch(/menuView === 'siteChecker'\s*\?\s*'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'\s*:\s*'hidden'/);
});

