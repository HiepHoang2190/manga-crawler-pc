import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const shellLayoutPath = path.join(dirname, 'ShellLayout.jsx');

describe('ShellLayout startup optimization & fault isolation', () => {
  const src = fs.readFileSync(shellLayoutPath, 'utf8');

  test('code-splits heavy studio tabs using React.lazy from feature barrels', () => {
    expect(src).toMatch(/lazy\(\(\) => import\('\.\.\/explore'\)\)/);
    expect(src).toMatch(/lazy\(\(\) => import\('\.\.\/plugins'\)\)/);
    expect(src).toMatch(/lazy\(\(\) => import\('\.\.\/site-checker'\)\)/);
    expect(src).toMatch(/lazy\(\(\) => import\('\.\.\/translate'\)/);
    expect(src).toMatch(/lazy\(\(\) => import\('\.\.\/workflow'\)/);
    expect(src).toMatch(/lazy\(\(\) => import\('\.\.\/ebook-studio'\)/);
    expect(src).toMatch(/lazy\(\(\) => import\('\.\.\/tools-studio'\)/);
    expect(src).toMatch(/lazy\(\(\) => import\('\.\.\/donate'\)\)/);
    expect(src).toMatch(/lazy\(\(\) => import\('\.\.\/help'\)/);
  });

  test('guards persistent tab mounting with visitedTabs lazy-on-first-visit keep-alive', () => {
    expect(src).toMatch(/visitedTabs/);
    expect(src).toMatch(/visitedTabs\.has\('workflow'\)/);
    expect(src).toMatch(/visitedTabs\.has\('translate'\)/);
    expect(src).toMatch(/visitedTabs\.has\('ebookStudio'\)/);
    expect(src).toMatch(/visitedTabs\.has\('toolsStudio'\)/);
    expect(src).toMatch(/visitedTabs\.has\('siteChecker'\)/);
    expect(src).toMatch(/visitedTabs\.has\('explore'\)/);
  });

  test('wraps tab panels in TabErrorBoundary and Suspense', () => {
    expect(src).toMatch(/<TabErrorBoundary\b/);
    expect(src).toMatch(/<Suspense\b/);
  });

  test('does not keep unused eager imports of LatestUpdatesPanel or BulkScanPanel', () => {
    expect(src).not.toMatch(/import LatestUpdatesPanel from/);
    expect(src).not.toMatch(/import BulkScanPanel from/);
  });
});
