import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

test('src/features/home/index.js default-exports HomeWorkspace', () => {
  const src = fs.readFileSync(path.join(dirname, 'index.js'), 'utf8');
  expect(src).toMatch(/export \{ default \} from '\.\/HomeWorkspace\.jsx'/);
});

test('HomeWorkspace consumes public hooks and barrels only', () => {
  const src = fs.readFileSync(path.join(dirname, 'HomeWorkspace.jsx'), 'utf8');
  expect(src).toMatch(/useDownload\(\)/);
  expect(src).toMatch(/useLibrary\(\)/);
  expect(src).toMatch(/useExport\(\)/);
  expect(src).toMatch(/useReader\(\)/);
  expect(src).toMatch(/useSettings\(\)/);
  expect(src).toMatch(/useAuth\(\)/);
  expect(src).toMatch(/useAppLog\(\)/);
  expect(src).toMatch(/from '\.\.\/download'/);
  expect(src).not.toMatch(/\bsetQueue\b/);
  expect(src).not.toMatch(/from '\.\.\/download\//);
  expect(src).toMatch(/from '\.\.\/library'/);
  expect(src).toMatch(/from '\.\.\/export'/);
  expect(src).toMatch(/Sidebar/);
  expect(src).toMatch(/QueuePanel/);
  expect(src).toMatch(/queue\.tab/);
  expect(src).not.toMatch(/from '\.\.\/download\//);
  expect(src).not.toMatch(/from '\.\.\/library\//);
  expect(src).not.toMatch(/from '\.\.\/export\//);
});

test('HomeWorkspace switches to Queue when download nonce increments while mounted', () => {
  const src = fs.readFileSync(path.join(dirname, 'HomeWorkspace.jsx'), 'utf8');
  expect(src).toMatch(/queueTabFocusNonce/);
  expect(src).toMatch(/focusQueueTab/);
  expect(src).toMatch(/if \(queueTabFocusNonce > 0\)/);
  expect(src).toMatch(/setActiveTab\('queue'\)/);
  expect(src).not.toMatch(/const \[focusQueueTabNonce, setFocusQueueTabNonce\]/);
});

test('home tab strip lives in HomeWorkspace and mounts tab contents from barrels', () => {
  const src = fs.readFileSync(path.join(dirname, 'HomeWorkspace.jsx'), 'utf8');
  expect(src).toMatch(/FavoritesTab/);
  expect(src).toMatch(/HistoryTab/);
  expect(src).toMatch(/OfflineLibraryTab/);
  expect(src).toMatch(/QueuePanel/);
  expect(src).toMatch(/KindleJobBanner/);
  expect(src).not.toMatch(/from '\.\.\/\.\.\/components\/QueuePanel'/);
  expect(src).not.toMatch(/from '\.\/HistoryTab'/);
});
