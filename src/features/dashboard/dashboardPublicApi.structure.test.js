import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

test('src/features/dashboard/index.js default-exports DashboardPanel and aggregator helpers', () => {
  const src = fs.readFileSync(path.join(dirname, 'index.js'), 'utf8');
  expect(src).toMatch(/export \{ default \} from '\.\/DashboardPanel\.jsx'/);
  expect(src).toMatch(/getContinueReading/);
  expect(src).toMatch(/getKpiTiles/);
  expect(src).not.toMatch(/chartAxisLabels/);
  expect(src).not.toMatch(/chartWeekPages/);
});

test('nested dashboard cards import I18nContext from src/context, not features/context', () => {
  const nested_dir = path.join(dirname, 'dashboard');
  const nested_files = fs.readdirSync(nested_dir).filter((name) => name.endsWith('.jsx'));
  for (const file_name of nested_files) {
    const src = fs.readFileSync(path.join(nested_dir, file_name), 'utf8');
    if (!src.includes('I18nContext')) continue;
    expect(src).toMatch(/from '\.\.\/\.\.\/\.\.\/context\/I18nContext'/);
    expect(src).not.toMatch(/from '\.\.\/\.\.\/context\/I18nContext'/);
  }
});

test('App imports DashboardPanel from the dashboard barrel', () => {
  const shell_src = fs.readFileSync(path.join(dirname, '../shell/ShellLayout.jsx'), 'utf8');
  expect(shell_src).toMatch(/from '\.\.\/dashboard'/);
  expect(shell_src).not.toMatch(/from '\.\.\/\.\.\/components\/DashboardPanel'/);
  expect(shell_src).not.toMatch(/from '\.\.\/\.\.\/utils\/dashboardAggregator'/);
});
