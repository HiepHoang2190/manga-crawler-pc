import fs from 'node:fs';
import path from 'node:path';

describe('LatestUpdatesPanel Multi-Source Search Integration', () => {
  const panelPath = path.resolve(process.cwd(), 'src/features/latest-updates/LatestUpdatesPanel.jsx');
  const backupPath = path.resolve(process.cwd(), 'src/utils/userDataBackup.js');

  test('LatestUpdatesPanel imports and uses MultiSelectDropdown', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain('MultiSelectDropdown');
    expect(content).toContain('mangaLatestUpdatesMultiSearchSelectedSites_v1');
    expect(content).toContain('selectedMultiSearchSiteIds');
    expect(content).toContain('handleMultiSearchSiteIdsChange');
  });

  test('activeFetchSiteIds filters by selectedMultiSearchSiteIds during multi-source search', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain('selectedMultiSearchSiteIds');
    expect(content).toMatch(/activeFetchSiteIds\s*=\s*useMemo/);
  });

  test('userDataBackup.js whitelists mangaLatestUpdatesMultiSearchSelectedSites_v1', () => {
    const content = fs.readFileSync(backupPath, 'utf8');
    expect(content).toContain('mangaLatestUpdatesMultiSearchSelectedSites_v1');
  });

  test('searchScope buttons do not render redundant data-tooltip when visible label is present', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    const scopeControlMatch = content.match(/searchScopeControl\s*=\s*[\s\S]*?\n\s*\);/);
    expect(scopeControlMatch).not.toBeNull();
    expect(scopeControlMatch[0]).not.toContain('data-tooltip');
  });

  test('multi-source search lists selected sources as cards when searchAllSources is active', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain('selectedMultiDescriptors');
    expect(content).toContain('selectedMultiDescriptors.map');
  });

  test('latestListFetchTriggerKey incorporates selectedMultiSearchSiteIds and disables search when none selected', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain('selectedMultiSearchSiteIds.slice().sort().join');
    expect(content).toContain('searchAllSources && selectedMultiSearchSiteIds.length === 0');
  });
});

