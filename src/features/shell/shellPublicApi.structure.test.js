import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

test('src/features/shell/index.js exports ShellNavProvider, useShellNav, and ShellLayout', () => {
  const src = fs.readFileSync(path.join(dirname, 'index.js'), 'utf8');
  expect(src).toMatch(/ShellNavProvider/);
  expect(src).toMatch(/useShellNav/);
  expect(src).toMatch(/ShellLayout/);
  expect(src).not.toMatch(/TitleBar/);
  expect(src).not.toMatch(/MenuBar/);
  expect(src).not.toMatch(/StatusBar/);
  expect(src).not.toMatch(/ConsolePanel/);
});

test('ShellLayout consumes shell/app-log/reader hooks and renders chrome', () => {
  const src = fs.readFileSync(path.join(dirname, 'ShellLayout.jsx'), 'utf8');
  expect(src).toMatch(/useShellNav\(\)/);
  expect(src).toMatch(/useAppLog\(\)/);
  expect(src).not.toMatch(/useChat\(\)/);
  expect(src).toMatch(/useReader\(\)/);
  expect(src).not.toMatch(/FloatingAssistantChat/);
  expect(src).toMatch(/from '\.\/TitleBar/);
  expect(src).toMatch(/from '\.\/MenuBar/);
  expect(src).toMatch(/from '\.\/StatusBar/);
  expect(src).toMatch(/from '\.\/ConsolePanel/);
  expect(src).toMatch(/UpdateBadge/);
  expect(src).toMatch(/FavoriteUpdateBell/);
  expect(src).toMatch(/GuestCreditBadge/);
  expect(src).toMatch(/onLoggedIn=\{handleAuthGateLoggedIn\}/);
  expect(src).toMatch(/finishAuthLogin/);
  expect(src).toMatch(/setMenuView\('home'\)/);
  expect(src).toMatch(/from '\.\.\/settings'/);
  expect(src).toMatch(/from '\.\.\/\.\.\/auth'/);
  expect(src).not.toMatch(/from '\.\.\/\.\.\/components\//);
  expect(src).not.toMatch(/from '\.\.\/download\/.*TitleBar/);
});

test('ShellLayout mounts HomeWorkspace from the home barrel', () => {
  const src = fs.readFileSync(path.join(dirname, 'ShellLayout.jsx'), 'utf8');
  expect(src).toMatch(/from '\.\.\/home'/);
  expect(src).toMatch(/<HomeWorkspace[\s\S]*?\/>/);
  expect(src).not.toMatch(/from '\.\.\/home\//);
});

test('ShellLayout restore and latest/bulk enqueue call focusQueueTab instead of only persisting the tab', () => {
  const src = fs.readFileSync(path.join(dirname, 'ShellLayout.jsx'), 'utf8');
  expect(src).toMatch(/focusQueueTab/);
  expect((src.match(/focusQueueTab\(\)/g) || []).length).toBeGreaterThanOrEqual(3);
  expect(src).not.toMatch(/savePanelUi\(\{ queueTab: 'queue' \}\)/);
});
