import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

test('src/features/plugins/index.js default-exports PluginManagementPanel', () => {
  const src = fs.readFileSync(path.join(dirname, 'index.js'), 'utf8');
  expect(src).toMatch(/export \{ default \} from '\.\/PluginManagementPanel\.jsx'/);
});

test('App imports PluginManagementPanel from the plugins barrel', () => {
  const shell_src = fs.readFileSync(path.join(dirname, '../shell/ShellLayout.jsx'), 'utf8');
  expect(shell_src).toMatch(/from '\.\.\/plugins'/);
  expect(shell_src).not.toMatch(/from '\.\.\/\.\.\/components\/PluginManagementPanel'/);
});

test('PluginManagementPanel keeps existing electronAPI plugin names', () => {
  const src = fs.readFileSync(path.join(dirname, 'PluginManagementPanel.jsx'), 'utf8');
  expect(src).toMatch(/listPlugins/);
  expect(src).toMatch(/importPluginFromFile/);
  expect(src).toMatch(/importPluginFromUrl/);
  expect(src).toMatch(/enablePlugin/);
  expect(src).toMatch(/disablePlugin/);
  expect(src).toMatch(/deletePlugin/);
});

test('PluginManagementPanel adopts StudioLayout and useStudioLayout', () => {
  const src = fs.readFileSync(path.join(dirname, 'PluginManagementPanel.jsx'), 'utf8');
  expect(src).toMatch(/StudioLayout/);
  expect(src).toMatch(/useStudioLayout/);
  expect(src).toMatch(/StudioLayout\.Toolbar/);
  expect(src).toMatch(/StudioLayout\.LeftSidebar/);
  expect(src).toMatch(/StudioLayout\.Content/);
});

test('PluginManagementPanel never uses native window.confirm dialogs', () => {
  const src = fs.readFileSync(path.join(dirname, 'PluginManagementPanel.jsx'), 'utf8');
  expect(src).not.toMatch(/window\.confirm/);
});

test('PluginManagementPanel adopts unified EmptyState component', () => {
  const src = fs.readFileSync(path.join(dirname, 'PluginManagementPanel.jsx'), 'utf8');
  expect(src).toMatch(/<EmptyState/);
  expect(src).not.toMatch(/border-dashed/);
});


