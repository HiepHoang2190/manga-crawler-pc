import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

test('src/features/site-checker/index.js default-exports SiteCheckerPanel', () => {
  const src = fs.readFileSync(path.join(dirname, 'index.js'), 'utf8');
  expect(src).toMatch(/export \{ default \} from '\.\/SiteCheckerPanel\.jsx'/);
});

test('App imports SiteCheckerPanel from the site-checker barrel', () => {
  const shell_src = fs.readFileSync(path.join(dirname, '../shell/ShellLayout.jsx'), 'utf8');
  expect(shell_src).toMatch(/(?:from|import\()\s*'\.\.\/site-checker'/);
});

test('SiteCheckerPanel adopts StudioLayout and useStudioLayout', () => {
  const src = fs.readFileSync(path.join(dirname, 'SiteCheckerPanel.jsx'), 'utf8');
  expect(src).toMatch(/StudioLayout/);
  expect(src).toMatch(/useStudioLayout/);
  expect(src).toMatch(/StudioLayout\.Toolbar/);
  expect(src).toMatch(/StudioLayout\.LeftSidebar/);
  expect(src).toMatch(/StudioLayout\.Content/);
});

test('SiteCheckerPanel never uses native window.confirm or alert dialogs', () => {
  const src = fs.readFileSync(path.join(dirname, 'SiteCheckerPanel.jsx'), 'utf8');
  expect(src).not.toMatch(/window\.confirm/);
  expect(src).not.toMatch(/window\.alert/);
});

test('SiteCheckerPanel and ConnectorCard adopt unified Grid/List studio standards without forbidden patterns', () => {
  const panelSrc = fs.readFileSync(path.join(dirname, 'SiteCheckerPanel.jsx'), 'utf8');
  const cardSrc = fs.readFileSync(path.join(dirname, 'ConnectorCard.jsx'), 'utf8');

  expect(panelSrc).toContain('ViewModeToggle');
  expect(panelSrc).toContain('EmptyState');
  expect(panelSrc).toContain('SearchableSelect');
  expect(panelSrc).toContain('SectionTitle');
  expect(panelSrc).toContain('ConnectorCard');
  expect(panelSrc).toContain('loadSiteCheckerViewMode');
  expect(panelSrc).toContain('saveSiteCheckerViewMode');
  expect(panelSrc).toContain('loadSiteCheckerSortPref');
  expect(panelSrc).toContain('saveSiteCheckerSortPref');
  expect(panelSrc).toContain('lg:grid-cols-2 2xl:grid-cols-3');
  expect(panelSrc).toContain("viewMode === 'list'");
  expect(panelSrc).toContain('siteChecker.footerSummary');
  expect(panelSrc).toMatch(/<StudioLayout\.LeftSidebar[\s\S]{0,120}open=\{true\}/);
  expect(panelSrc).not.toContain('onToggleLeftSidebar');
  expect(panelSrc).not.toContain('showLeftSidebar');

  expect(cardSrc).toContain('iconError');
  expect(cardSrc).toContain("viewMode === 'list'");

  for (const src of [panelSrc, cardSrc]) {
    expect(src).not.toMatch(/<select\b/);
    expect(src).not.toMatch(/<[a-z][^>]*?\btitle\s*=/);
    expect(src).not.toMatch(/\b(?:hover:)?underline\b/);
    expect(src).not.toMatch(/t\(\s*['"][^'"]+['"]\s*,\s*['"]/);
  }

  expect(panelSrc).not.toContain("t('siteChecker.stats')");
  expect(panelSrc.match(/siteChecker\.resetFilters/g) || []).toHaveLength(1);
  expect(panelSrc).not.toContain('handleCopyHealthReport');
  expect(panelSrc).not.toContain('siteChecker.copyReport');
  expect(panelSrc).toContain('buildConnectorErrorReport');
  expect(panelSrc).toContain('handleCopyConnectorError');
  expect(cardSrc).toContain('onCopyError');
  expect(cardSrc).toContain('siteChecker.copyErrorTooltip');
  expect(cardSrc).toContain('siteChecker.copiedError');
});

test('all static i18n keys referenced in SiteCheckerPanel and ConnectorCard exist in vi.js and en.js', () => {
  const panelSrc = fs.readFileSync(path.join(dirname, 'SiteCheckerPanel.jsx'), 'utf8');
  const cardSrc = fs.readFileSync(path.join(dirname, 'ConnectorCard.jsx'), 'utf8');
  const viSrc = fs.readFileSync(path.join(dirname, '../../i18n/locales/vi.js'), 'utf8');
  const enSrc = fs.readFileSync(path.join(dirname, '../../i18n/locales/en.js'), 'utf8');

  const keyRegex = /\bt\(\s*['"]([a-zA-Z0-9_.]+)['"]/g;
  const keys = new Set();
  for (const src of [panelSrc, cardSrc]) {
    let match;
    while ((match = keyRegex.exec(src)) !== null) {
      keys.add(match[1]);
    }
  }

  expect(keys.size).toBeGreaterThan(20);
  const missingVi = [];
  const missingEn = [];
  for (const k of keys) {
    if (!viSrc.includes(`'${k}':`)) missingVi.push(k);
    if (!enSrc.includes(`'${k}':`)) missingEn.push(k);
  }

  expect(missingVi).toEqual([]);
  expect(missingEn).toEqual([]);
});
