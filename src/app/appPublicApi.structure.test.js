import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

test('src/app/App.jsx is a thin provider tree that mounts ShellLayout', () => {
  const src = fs.readFileSync(path.join(dirname, 'App.jsx'), 'utf8');
  expect(src).toMatch(/<AuthProvider>/);
  expect(src).toMatch(/<AppLogProvider>/);
  expect(src).toMatch(/<SettingsProvider>/);
  expect(src).toMatch(/<ConnectorsProvider>/);
  expect(src).toMatch(/<ShellNavProvider>/);
  expect(src).toMatch(/<DownloadProvider>/);
  expect(src).toMatch(/<ReaderProvider>/);
  expect(src).toMatch(/<LibraryProvider>/);
  expect(src).toMatch(/<ExportProvider>/);
  expect(src).not.toMatch(/<ChatProvider>/);
  expect(src).toMatch(/<ShellLayout \/>/);
  expect(src).not.toMatch(/useDownload\(\)/);
  expect(src).not.toMatch(/menuView/);
  expect(src).not.toMatch(/QueuePanel/);
  expect(src).not.toMatch(/TitleBar/);
  const auth_idx = src.indexOf('<AuthProvider>');
  const log_idx = src.indexOf('<AppLogProvider>');
  const settings_idx = src.indexOf('<SettingsProvider>');
  const connectors_idx = src.indexOf('<ConnectorsProvider>');
  const shell_nav_idx = src.indexOf('<ShellNavProvider>');
  const download_idx = src.indexOf('<DownloadProvider>');
  const reader_idx = src.indexOf('<ReaderProvider>');
  const library_idx = src.indexOf('<LibraryProvider>');
  const export_idx = src.indexOf('<ExportProvider>');
  const layout_idx = src.indexOf('<ShellLayout />');
  expect(auth_idx).toBeGreaterThan(0);
  expect(log_idx).toBeGreaterThan(auth_idx);
  expect(settings_idx).toBeGreaterThan(log_idx);
  expect(connectors_idx).toBeGreaterThan(settings_idx);
  expect(shell_nav_idx).toBeGreaterThan(connectors_idx);
  expect(download_idx).toBeGreaterThan(shell_nav_idx);
  expect(reader_idx).toBeGreaterThan(download_idx);
  expect(library_idx).toBeGreaterThan(reader_idx);
  expect(export_idx).toBeGreaterThan(library_idx);
  expect(layout_idx).toBeGreaterThan(export_idx);
});

test('src/main.jsx imports App from ./app/App', () => {
  const src = fs.readFileSync(path.join(dirname, '../main.jsx'), 'utf8');
  expect(src).toMatch(/from '\.\/app\/App'/);
  expect(src).not.toMatch(/from '\.\/App'/);
});
