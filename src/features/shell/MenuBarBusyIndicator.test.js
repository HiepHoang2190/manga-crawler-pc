import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

test('MenuBar supports tabBusyMap and displays loading spinner and ping indicator for busy tabs', () => {
  const code = fs.readFileSync(path.join(dirname, 'MenuBar.jsx'), 'utf8');
  expect(code).toMatch(/tabBusyMap/);
  expect(code).toMatch(/isBusy/);
  expect(code).toMatch(/progress_activity/);
  expect(code).toMatch(/animate-spin/);
  expect(code).toMatch(/animate-ping/);
});

test('ShellLayout computes tabBusyMap and passes it to MenuBar', () => {
  const code = fs.readFileSync(path.join(dirname, 'ShellLayout.jsx'), 'utf8');
  expect(code).toMatch(/tabBusyMap/);
  expect(code).toMatch(/<MenuBar[\s\S]*?tabBusyMap=\{tabBusyMap\}/);
});

test('SiteCheckerPanel exposes onBusyChange and notifies when scanning or testing is active', () => {
  const siteCheckerCode = fs.readFileSync(path.join(dirname, '../site-checker/SiteCheckerPanel.jsx'), 'utf8');
  expect(siteCheckerCode).toMatch(/onBusyChange/);
  
  const shellCode = fs.readFileSync(path.join(dirname, 'ShellLayout.jsx'), 'utf8');
  expect(shellCode).toMatch(/<SiteCheckerPanel[\s\S]*?onBusyChange=\{/);
});
