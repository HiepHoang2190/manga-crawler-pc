import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

test('BACKUP_SECTIONS in userDataBackup.js includes plugins and site_checker layout keys', () => {
  const src = fs.readFileSync(path.join(dirname, 'userDataBackup.js'), 'utf8');
  expect(src).toMatch(/plugins_left_width_v1/);
  expect(src).toMatch(/plugins_left_open_v1/);
  expect(src).toMatch(/site_checker_left_width_v1/);
  expect(src).toMatch(/site_checker_left_open_v1/);
  expect(src).toMatch(/manga-crawler-theme-preset/);
});

