import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

test('SystemResourceBadge component file exists and defines Koharu-styled metrics badges', () => {
  const code = fs.readFileSync(path.join(dirname, 'SystemResourceBadge.jsx'), 'utf8');
  expect(code).toMatch(/getSystemMetrics/);
  expect(code).toMatch(/ramPercent/);
  expect(code).toMatch(/cpuPercent/);
  expect(code).toMatch(/ramUsedGB/);
  expect(code).toMatch(/ramTotalGB/);
  expect(code).toMatch(/data-tooltip=\{ramDetail\}/);
  expect(code).toMatch(/data-tooltip=\{cpuDetail\}/);
  expect(code).toMatch(/statusBar\.ramUsage/);
  expect(code).toMatch(/statusBar\.cpuUsage/);
  expect(code).not.toMatch(/\btitle=/);
  expect(code).not.toMatch(/isHovered/);
});

test('StatusBar imports and mounts SystemResourceBadge', () => {
  const code = fs.readFileSync(path.join(dirname, 'StatusBar.jsx'), 'utf8');
  expect(code).toMatch(/import SystemResourceBadge from '\.\/SystemResourceBadge\.jsx'/);
  expect(code).toMatch(/<SystemResourceBadge/);
});

test('electron tools IPC handles system:getMetrics and preload exposes it', () => {
  const toolsCode = fs.readFileSync(
    path.join(dirname, '../../../electron/ipc/tools.js'),
    'utf8'
  );
  expect(toolsCode).toMatch(/system:getMetrics/);
  expect(toolsCode).toMatch(/getAppMetrics/);
  expect(toolsCode).toMatch(/ramPercent/);
  expect(toolsCode).toMatch(/cpuPercent/);

  const preloadCode = fs.readFileSync(
    path.join(dirname, '../../../electron/preload.js'),
    'utf8'
  );
  expect(preloadCode).toMatch(/getSystemMetrics: \(\) => ipcRenderer\.invoke\('system:getMetrics'\)/);
});
