import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

describe('DashboardPanel StudioLayout Structure & Compliance', () => {
  const dashboardPanelPath = path.join(dirname, 'DashboardPanel.jsx');
  const dashboardPanelSrc = fs.readFileSync(dashboardPanelPath, 'utf8');

  test('uses StudioLayout, Toolbar, and permanent resizable LeftSidebar for unified design system consistency', () => {
    expect(dashboardPanelSrc).toMatch(/import\s*\{[^}]*StudioLayout[^}]*\}\s*from/);
    expect(dashboardPanelSrc).toMatch(/import\s*\{[^}]*useStudioLayout[^}]*\}\s*from/);
    expect(dashboardPanelSrc).toMatch(/storagePrefix:\s*'dashboard'/);
    expect(dashboardPanelSrc).toMatch(/<StudioLayout/);
    expect(dashboardPanelSrc).toMatch(/<StudioLayout\.Toolbar/);
    expect(dashboardPanelSrc).toMatch(/<StudioLayout\.LeftSidebar[\s\S]{0,120}open=\{true\}/);
    expect(dashboardPanelSrc).toMatch(/<StudioLayout\.Content/);
    expect(dashboardPanelSrc).not.toContain('onToggleLeftSidebar');
    expect(dashboardPanelSrc).not.toContain('showLeftSidebar');
    expect(dashboardPanelSrc).not.toMatch(/<main\s+className=/);
  });

  test('uses canonical role="tablist" range selector without redundant open-library toolbar CTA and persists trend range', () => {
    const tablistMatch = dashboardPanelSrc.match(/role="tablist"[\s\S]{0,220}className="([^"]+)"/);
    expect(tablistMatch).not.toBeNull();
    expect(tablistMatch[1]).toContain('gap-0.5 p-0.5 rounded-xl bg-surface-container-high/70 border border-outline-variant/25');
    expect(dashboardPanelSrc).toContain('h-8 px-3 rounded-lg text-xs font-medium');
    expect(dashboardPanelSrc).not.toContain('dashboard-primary-action-slot');
    expect(dashboardPanelSrc).not.toContain('dashboard.toolbar.openLibrary');
    expect(dashboardPanelSrc).not.toContain('dashboard.toolbar.openSaveFolder');
    expect(dashboardPanelSrc).not.toMatch(/dashboard\.kpi\.[a-z]+\.hint/);
    expect(dashboardPanelSrc).toContain('loadDashboardTrendDays');
    expect(dashboardPanelSrc).toContain('saveDashboardTrendDays');
  });

  test('DashboardPanel and nested cards avoid forbidden UI/theme patterns and match EN/VI locales', () => {
    const nestedNames = [
      'ContinueReadingCard.jsx',
      'QueueStatusCard.jsx',
      'NewChaptersCard.jsx',
      'RecentDownloadsCarousel.jsx',
      'KpiTile.jsx',
      'KpiTilesRow.jsx',
      'KpiDetailDialog.jsx',
      'DownloadsBarChart.jsx',
      'ConnectorDonutChart.jsx',
      'SectionHeader.jsx',
    ];
    const sources = [
      dashboardPanelSrc,
      ...nestedNames.map((n) => fs.readFileSync(path.join(dirname, 'dashboard', n), 'utf8')),
    ];

    const viSrc = fs.readFileSync(path.join(dirname, '../../i18n/locales/vi.js'), 'utf8');
    const enSrc = fs.readFileSync(path.join(dirname, '../../i18n/locales/en.js'), 'utf8');

    const keyRegex = /\bt\(\s*['"]([a-zA-Z0-9_.]+)['"]/g;
    const keys = new Set();

    for (const src of sources) {
      expect(src).not.toMatch(/<select\b/);
      expect(src).not.toMatch(/<[a-z][^>]*?\btitle\s*=/);
      expect(src).not.toMatch(/\b(?:hover:)?underline\b/);
      expect(src).not.toMatch(/t\(\s*['"][^'"]+['"]\s*,\s*['"]/);
      expect(src).not.toContain('bg-white');
      expect(src).not.toContain('dark:bg-zinc-900');

      let match;
      while ((match = keyRegex.exec(src)) !== null) {
        keys.add(match[1]);
      }
    }

    expect(keys.size).toBeGreaterThan(25);
    const missingVi = [];
    const missingEn = [];
    for (const k of keys) {
      if (!viSrc.includes(`'${k}':`)) missingVi.push(k);
      if (!enSrc.includes(`'${k}':`)) missingEn.push(k);
    }
    expect(missingVi).toEqual([]);
    expect(missingEn).toEqual([]);
  });

  test('places Quick Access/Queue/Favorites in LeftSidebar, orders Activity < Overview < Trends in Content, and wires ShellLayout callbacks', () => {
    const leftIdx = dashboardPanelSrc.indexOf('<StudioLayout.LeftSidebar');
    const contentIdx = dashboardPanelSrc.indexOf('<StudioLayout.Content');
    const quickIdx = dashboardPanelSrc.indexOf("t('dashboard.section.quickAccess')");
    const activityIdx = dashboardPanelSrc.indexOf("t('dashboard.section.activity')");
    const overviewIdx = dashboardPanelSrc.indexOf("t('dashboard.section.overview')");
    const trendsIdx = dashboardPanelSrc.indexOf("t('dashboard.section.trends')");

    expect(leftIdx).toBeGreaterThan(-1);
    expect(contentIdx).toBeGreaterThan(leftIdx);
    expect(quickIdx).toBeGreaterThan(leftIdx);
    expect(quickIdx).toBeLessThan(contentIdx);
    expect(dashboardPanelSrc).toContain('<QueueStatusCard');
    expect(dashboardPanelSrc).toContain('<NewChaptersCard');

    expect(activityIdx).toBeGreaterThan(contentIdx);
    expect(overviewIdx).toBeGreaterThan(activityIdx);
    expect(trendsIdx).toBeGreaterThan(overviewIdx);

    const shellSrc = fs.readFileSync(path.join(dirname, '../shell/ShellLayout.jsx'), 'utf8');
    expect(shellSrc).toContain('handleOpenDashboardContinueReading');
    expect(shellSrc).toContain('handleOpenDashboardRecentChapter');
    expect(shellSrc).toContain('resolveTargetChapterIndex');
    expect(shellSrc).toContain('onOpenReader={handleOpenDashboardContinueReading}');
    expect(shellSrc).toContain('onSelectRecentChapter={handleOpenDashboardRecentChapter}');
    expect(shellSrc).toContain('onOpenQueue=');
    expect(shellSrc).toContain('onOpenExplore=');
    expect(shellSrc).toContain('onSelectNewChapterFavorite=');

    const recentSrc = fs.readFileSync(
      path.join(dirname, 'dashboard/RecentDownloadsCarousel.jsx'),
      'utf8'
    );
    expect(recentSrc).toContain('computeHorizontalWheelDelta');
    expect(recentSrc).toMatch(/addEventListener\(\s*'wheel'\s*,[\s\S]*?passive:\s*false/);
    expect(recentSrc).toMatch(/removeEventListener\(\s*'wheel'/);
  });
});
