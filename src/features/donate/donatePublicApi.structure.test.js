import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

test('src/features/donate/index.js default-exports DonatePanel', () => {
  const src = fs.readFileSync(path.join(dirname, 'index.js'), 'utf8');
  expect(src).toMatch(/export \{ default \} from '\.\/DonatePanel\.jsx'/);
});

test('App imports DonatePanel from the donate barrel', () => {
  const shell_src = fs.readFileSync(path.join(dirname, '../shell/ShellLayout.jsx'), 'utf8');
  expect(shell_src).toMatch(/from '\.\.\/donate'/);
  expect(shell_src).not.toMatch(/from '\.\.\/\.\.\/components\/DonatePanel'/);
});
