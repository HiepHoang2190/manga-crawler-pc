import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

test('src/features/latest-updates/index.js default-exports LatestUpdatesPanel', () => {
  const src = fs.readFileSync(path.join(dirname, 'index.js'), 'utf8');
  expect(src).toMatch(/export \{ default \} from '\.\/LatestUpdatesPanel\.jsx'/);
  expect(src).not.toMatch(/latestListingChapterActions/);
});

test('App imports LatestUpdatesPanel from the latest-updates barrel', () => {
  const shell_src = fs.readFileSync(path.join(dirname, '../shell/ShellLayout.jsx'), 'utf8');
  expect(shell_src).toMatch(/from '\.\.\/latest-updates'/);
  expect(shell_src).not.toMatch(/from '\.\.\/\.\.\/components\/LatestUpdatesPanel'/);
});
