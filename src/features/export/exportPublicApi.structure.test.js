import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const REQUIRED_USE_EXPORT_KEYS = ['cbzExportDrawerOpen', 'pdfExportOpen', 'setCbzExportDrawerOpen', 'setpdfExportOpen'];

test('src/features/export/index.js exports ExportProvider, useExport, tabs, drawers, and kindle helpers', () => {
  const src = fs.readFileSync(path.join(dirname, 'index.js'), 'utf8');
  expect(src).toMatch(/ExportProvider/);
  expect(src).toMatch(/useExport/);
  expect(src).toMatch(/CbzExportTab/);
  expect(src).toMatch(/CbzExportDrawer/);
  expect(src).toMatch(/PdfExportTab/);
  expect(src).toMatch(/PdfExportDrawer/);
  expect(src).not.toMatch(/ImageConvertTab/);
  expect(src).toMatch(/SendToKindleTab/);
  expect(src).toMatch(/SendToKindleModal/);
  expect(src).toMatch(/KindleJobBanner/);
  expect(src).toMatch(/RenameTab/);
  expect(src).toMatch(/DuplicateFinderTab/);
  expect(src).toMatch(/getKindleJob/);
  expect(src).toMatch(/subscribeKindleJob/);
  expect(src).toMatch(/consumeOpenKindleModalRequest/);
  expect(src).not.toMatch(/SplitDoublePageTab/);
  expect(src).not.toMatch(/CropTab/);
  expect(src).not.toMatch(/DeskewTab/);
  expect(src).not.toMatch(/\bCombineTab\b/);
  expect(src).not.toMatch(/\bSplitTab\b/);
  expect(src).not.toMatch(/CbzSizeSplitPreview/);
});

test('ExportProvider context value exposes the useExport public API', () => {
  const src = fs.readFileSync(path.join(dirname, 'ExportProvider.jsx'), 'utf8');
  const public_return = src.slice(src.lastIndexOf('const value = useMemo'));
  for (const key of REQUIRED_USE_EXPORT_KEYS) {
    expect(public_return).toMatch(new RegExp(`\\b${key}\\b`));
  }
});

test('ExportProvider reads session from useDownload and savePath from useSettings', () => {
  const src = fs.readFileSync(path.join(dirname, 'ExportProvider.jsx'), 'utf8');
  expect(src).toMatch(/from '\.\.\/download'/);
  expect(src).toMatch(/useDownload\(\)/);
  expect(src).toMatch(/from '\.\.\/settings'/);
  expect(src).toMatch(/useSettings\(\)/);
  expect(src).toMatch(/\bmanga\b/);
  expect(src).toMatch(/\bchapters\b/);
  expect(src).toMatch(/\bsavePath\b/);
});

test('Combine and Split stay inside export/cbz and are not home tabs', () => {
  const cbz_tab = fs.readFileSync(path.join(dirname, 'cbz/CbzExportTab.jsx'), 'utf8');
  expect(cbz_tab).toMatch(/from '\.\/CombineTab'/);
  expect(cbz_tab).toMatch(/from '\.\/SplitTab'/);
  const home_src = fs.readFileSync(path.join(dirname, '../home/HomeWorkspace.jsx'), 'utf8');
  expect(home_src).not.toMatch(/\bCombineTab\b/);
  expect(home_src).not.toMatch(/\bSplitTab\b/);
});

test('HomeWorkspace mounts export tabs from the export barrel', () => {
  const home_src = fs.readFileSync(path.join(dirname, '../home/HomeWorkspace.jsx'), 'utf8');
  expect(home_src).toMatch(/from '\.\.\/export'/);
  expect(home_src).not.toMatch(/from '\.\/CbzExportTab'/);
  expect(home_src).not.toMatch(/from '\.\/PdfExportTab'/);
  expect(home_src).not.toMatch(/from '\.\/ImageConvertTab'/);
  expect(home_src).not.toMatch(/from '\.\/RenameTab'/);
  expect(home_src).not.toMatch(/from '\.\/SendToKindleTab'/);
  expect(home_src).not.toMatch(/from '\.\/DuplicateFinderTab'/);
  expect(home_src).not.toMatch(/from '\.\/KindleJobBanner'/);
});

test('App wraps ExportProvider inside LibraryProvider and imports the export barrel', () => {
  const app_src = fs.readFileSync(path.join(dirname, '../../app/App.jsx'), 'utf8');
  expect(app_src).toMatch(/from '\.\.\/features\/export'/);
  const library_idx = app_src.indexOf('<LibraryProvider>');
  const export_idx = app_src.indexOf('<ExportProvider>');
  const layout_idx = app_src.lastIndexOf('<ShellLayout />');
  expect(library_idx).toBeGreaterThan(0);
  expect(export_idx).toBeGreaterThan(library_idx);
  expect(layout_idx).toBeGreaterThan(export_idx);
});

test('OfflineLibraryTab imports Kindle helpers from the export barrel', () => {
  const src = fs.readFileSync(path.join(dirname, '../library/OfflineLibraryTab.jsx'), 'utf8');
  expect(src).toMatch(/from '\.\.\/export'/);
  expect(src).toMatch(/SendToKindleModal/);
  expect(src).toMatch(/getKindleJob/);
  expect(src).not.toMatch(/kindleJobStore/);
  expect(src).not.toMatch(/from '\.\.\/\.\.\/components\/SendToKindleModal'/);
});
