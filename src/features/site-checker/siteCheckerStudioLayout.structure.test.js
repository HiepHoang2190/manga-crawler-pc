import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

test('src/features/site-checker/index.js default-exports SiteCheckerPanel', () => {
  const src = fs.readFileSync(path.join(dirname, 'index.js'), 'utf8');
  expect(src).toMatch(/export \{ default \} from '\.\/SiteCheckerPanel\.jsx'/);
});

test('App imports SiteCheckerPanel from the site-checker barrel', () => {
  const shell_src = fs.readFileSync(path.join(dirname, '../shell/ShellLayout.jsx'), 'utf8');
  expect(shell_src).toMatch(/from '\.\.\/site-checker'/);
});

test('SiteCheckerPanel adopts StudioLayout and useStudioLayout', () => {
  const src = fs.readFileSync(path.join(dirname, 'SiteCheckerPanel.jsx'), 'utf8');
  expect(src).toMatch(/StudioLayout/);
  expect(src).toMatch(/useStudioLayout/);
  expect(src).toMatch(/StudioLayout\.Toolbar/);
  expect(src).toMatch(/StudioLayout\.LeftSidebar/);
  expect(src).toMatch(/StudioLayout\.Content/);
});

test('SiteCheckerPanel never uses native window.confirm or alert dialogs', () => {
  const src = fs.readFileSync(path.join(dirname, 'SiteCheckerPanel.jsx'), 'utf8');
  expect(src).not.toMatch(/window\.confirm/);
  expect(src).not.toMatch(/window\.alert/);
});
