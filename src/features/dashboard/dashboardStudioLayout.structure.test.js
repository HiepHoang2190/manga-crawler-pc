import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

describe('DashboardPanel StudioLayout Structure & Compliance', () => {
  const dashboardPanelPath = path.join(dirname, 'DashboardPanel.jsx');
  const dashboardPanelSrc = fs.readFileSync(dashboardPanelPath, 'utf8');

  test('uses StudioLayout for unified design system consistency', () => {
    expect(dashboardPanelSrc).toMatch(/import\s*\{[^}]*StudioLayout[^}]*\}\s*from/);
    expect(dashboardPanelSrc).toMatch(/<StudioLayout/);
    expect(dashboardPanelSrc).toMatch(/<StudioLayout\.Content/);
    expect(dashboardPanelSrc).not.toMatch(/<main\s+className=/);
  });
});
