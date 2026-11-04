import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

test('src/features/bulk-scan/index.js default-exports BulkScanPanel and migrateHiddenMenuIds', () => {
  const src = fs.readFileSync(path.join(dirname, 'index.js'), 'utf8');
  expect(src).toMatch(/export \{ default \} from '\.\/BulkScanPanel\.jsx'/);
  expect(src).toMatch(/migrateHiddenMenuIds/);
  expect(src).not.toMatch(/loadBulkScanSessions/);
  expect(src).not.toMatch(/saveBulkScanSession/);
});

test('App imports BulkScanPanel from the bulk-scan barrel', () => {
  const shell_src = fs.readFileSync(path.join(dirname, '../shell/ShellLayout.jsx'), 'utf8');
  expect(shell_src).toMatch(/from '\.\.\/bulk-scan'/);
  expect(shell_src).not.toMatch(/from '\.\.\/\.\.\/components\/BulkScanPanel'/);
});

test('shell imports migrateHiddenMenuIds from the bulk-scan barrel', () => {
  const src = fs.readFileSync(path.join(dirname, '../shell/ShellNavProvider.jsx'), 'utf8');
  expect(src).toMatch(/from '\.\.\/bulk-scan'/);
  expect(src).not.toMatch(/bulkScanSessionPrefs/);
});
