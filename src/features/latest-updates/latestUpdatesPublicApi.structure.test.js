import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

test('src/features/latest-updates/index.js default-exports LatestUpdatesPanel', () => {
  const src = fs.readFileSync(path.join(dirname, 'index.js'), 'utf8');
  expect(src).toMatch(/export \{ default \} from '\.\/LatestUpdatesPanel\.jsx'/);
  expect(src).not.toMatch(/latestListingChapterActions/);
});

test('ExplorePanel imports LatestUpdatesPanel from the latest-updates barrel', () => {
  const explore_src = fs.readFileSync(path.join(dirname, '../explore/ExplorePanel.jsx'), 'utf8');
  expect(explore_src).toMatch(/from '\.\.\/latest-updates'/);
  expect(explore_src).not.toMatch(/from '\.\.\/\.\.\/components\/LatestUpdatesPanel'/);
});
