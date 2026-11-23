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

  test('multi-source search uses MultiSelectDropdown for selecting sources cleanly without redundant cards', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain('MultiSelectDropdown');
    expect(content).toContain('searchCapableSiteOptions');
    expect(content).toContain('handleMultiSearchSiteIdsChange');
  });

  test('latestListFetchTriggerKey incorporates selectedMultiSearchSiteIds only when isMultiSourceSearch is active', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    const cacheContent = fs.readFileSync(
      path.resolve(process.cwd(), 'src/features/latest-updates/latestUpdatesCache.mjs'),
      'utf8',
    );
    expect(content).toContain('buildLatestListTriggerKey');
    expect(content).toContain('searchAllSources && selectedMultiSearchSiteIds.length === 0');
    expect(cacheContent).toContain('selectedMultiSearchSiteIds.slice().sort().join');
    expect(cacheContent).toMatch(/scope\s*=\s*isMultiSourceSearch\s*\?[\s\S]*all:\$\{/);
  });

  test('exports latestUpdatesMultiSearchCache and supports dual cache switching without redundant fetch', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain('export const latestUpdatesMultiSearchCache = {');
    expect(content).toContain('singleSourceCacheRef');
    expect(content).toContain('latestUpdatesMultiSearchCache.rows?.length > 0');
    expect(content).toContain("latestUpdatesMultiSearchCache.searchTerm = ''");
  });

  test('supports client-side pagination for multi-source search results', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    expect(content).toContain('const MULTI_SEARCH_PAGE_SIZES = [20, 50, 100];');
    expect(content).toContain('MULTI_SEARCH_PAGE_SIZE = 20');
    expect(content).toContain('multiSearchTotalPages');
    expect(content).toContain('displayedRows');
    expect(content).toContain('handleMultiPageJumpSubmit');
    expect(content).toContain('bulkScan.pageSize');
  });
});

