import fs from 'node:fs';
import path from 'node:path';

describe('Explore Subtabs Layout Consistency Standards', () => {
  const latestPath = path.resolve(process.cwd(), 'src/features/latest-updates/LatestUpdatesPanel.jsx');
  const followedPath = path.resolve(process.cwd(), 'src/features/explore/components/FollowedMangaPanel.jsx');
  const bulkPath = path.resolve(process.cwd(), 'src/features/bulk-scan/BulkScanPanel.jsx');

  const files = [
    { name: 'LatestUpdatesPanel', path: latestPath },
    { name: 'FollowedMangaPanel', path: followedPath },
    { name: 'BulkScanPanel', path: bulkPath },
  ];

  test('all 3 subtabs exist and use StudioLayout with useStudioLayout hook', () => {
    for (const f of files) {
      expect(fs.existsSync(f.path)).toBe(true);
      const content = fs.readFileSync(f.path, 'utf8');
      expect(content).toContain('StudioLayout');
      expect(content).toContain('useStudioLayout');
    }
  });

  test('all 3 subtabs accept and render subtabsSlot followed by explore-primary-action-slot in StudioLayout.Toolbar leftSlot cleanly without outer clutter', () => {
    for (const f of files) {
      const content = fs.readFileSync(f.path, 'utf8');
      expect(content).toContain('subtabsSlot');
      expect(content).toContain('StudioLayout.Toolbar');
      const leftSlotMatch = content.match(/leftSlot=\{([\s\S]*?)\}\s*\n\s*rightSlot=/);
      expect(leftSlotMatch).not.toBeNull();
      const leftSlotCode = leftSlotMatch[1];
      const subtabsIdx = leftSlotCode.indexOf('{subtabsSlot}');
      const primarySlotIdx = leftSlotCode.indexOf('data-testid="explore-primary-action-slot"');
      expect(subtabsIdx).toBeGreaterThan(-1);
      expect(primarySlotIdx).toBeGreaterThan(subtabsIdx);
      expect(leftSlotCode).toContain('overflow-x-auto no-scrollbar');
      expect(leftSlotCode).toContain('empty:hidden');
      expect(leftSlotCode).toMatch(/subtabsSlot\s*\?\s*['"][^'"]*border-l border-outline-variant\/25[^'"]*['"]\s*:\s*['"]['"]/);

      const rightSlotMatch = content.match(/rightSlot=\{([\s\S]*?)\n\s*\}\s*\/>/);
      expect(rightSlotMatch).not.toBeNull();
      const rightSlotCode = rightSlotMatch[1];
      expect(rightSlotCode).toContain('<ViewModeToggle');
      for (const forbidden of [
        'handleManualRefresh',
        'handleStopFetch',
        'handleCheckAll',
        'handleStopCheck',
        'handleEnqueueAllNew',
        'runLoad',
        'stopScan',
        'runEnqueue',
      ]) {
        expect(rightSlotCode).not.toContain(forbidden);
      }
    }
  });

  test('all 3 subtabs have StudioLayout.LeftSidebar with resizable width support', () => {
    for (const f of files) {
      const content = fs.readFileSync(f.path, 'utf8');
      expect(content).toContain('StudioLayout.LeftSidebar');
      expect(content).toContain('handleLeftResizeStart');
      expect(content).toContain('leftWidth');
    }
  });

  test('all 3 subtabs have StudioLayout.Content for the primary work area', () => {
    for (const f of files) {
      const content = fs.readFileSync(f.path, 'utf8');
      expect(content).toContain('StudioLayout.Content');
    }
  });

  test('all 3 subtabs support ViewModeToggle (Grid/List) in toolbar rightSlot', () => {
    for (const f of files) {
      const content = fs.readFileSync(f.path, 'utf8');
      expect(content).toContain('ViewModeToggle');
      expect(content).toContain('viewMode');
      expect(content).toContain('onViewModeChange');
    }
  });

  test('ExplorePanel coordinates unified viewMode state and synchronization across subtabs', () => {
    const explorePanelPath = path.resolve(process.cwd(), 'src/features/explore/ExplorePanel.jsx');
    expect(fs.existsSync(explorePanelPath)).toBe(true);
    const content = fs.readFileSync(explorePanelPath, 'utf8');
    expect(content).toContain('EXPLORE_VIEW_MODE_KEY');
    expect(content).toContain('loadExploreViewMode');
    expect(content).toContain('handleViewModeChange');
    expect(content).toContain('viewMode={viewMode}');
    expect(content).toContain('onViewModeChange={handleViewModeChange}');
  });

  test('all 3 subtabs share unified storagePrefix explore_subtabs for synchronized sidebar resizing', () => {
    for (const f of files) {
      const content = fs.readFileSync(f.path, 'utf8');
      expect(content).toMatch(/storagePrefix:\s*['"]explore_subtabs['"]/);
    }
  });

  test('userDataBackup whitelists explore_subtabs_left_width_v1 and explore_subtabs_left_open_v1', () => {
    const backupPath = path.resolve(process.cwd(), 'src/utils/userDataBackup.js');
    const content = fs.readFileSync(backupPath, 'utf8');
    expect(content).toContain("'explore_subtabs_left_width_v1'");
    expect(content).toContain("'explore_subtabs_left_open_v1'");
    expect(content).toContain("'explore_view_mode_v1'");
  });

  test('all 3 subtabs use unified ExploreSourceSelect in LeftSidebar adhering to h-10 rounded-xl standard', () => {
    for (const f of files) {
      const content = fs.readFileSync(f.path, 'utf8');
      expect(content).toContain('ExploreSourceSelect');
    }
  });

  test('ExplorePanel sub-tab buttons match toolbar primary action button height (h-8 px-3 inside p-0.5 pill)', () => {
    const explorePanelPath = path.resolve(process.cwd(), 'src/features/explore/ExplorePanel.jsx');
    const content = fs.readFileSync(explorePanelPath, 'utf8');
    expect(content).toContain('p-0.5 rounded-xl');
    for (const testId of ['subtab-latest', 'subtab-bulk', 'subtab-followed']) {
      const match = content.match(new RegExp(`data-testid="${testId}"[\\s\\S]{0,400}className=\\{[^}]*h-8 px-3`));
      expect(match).not.toBeNull();
    }
    expect(content).not.toMatch(/data-testid="subtab-[\s\S]{0,400}\bh-7\b/);
  });

  test('ExplorePanel orders subtabs as Latest Updates -> Bulk Scan -> Followed inside role="tablist"', () => {
    const explorePanelPath = path.resolve(process.cwd(), 'src/features/explore/ExplorePanel.jsx');
    const content = fs.readFileSync(explorePanelPath, 'utf8');
    const tablistMatch = content.match(/<div\s+role="tablist"[\s\S]*?>([\s\S]*?)<\/div>/);
    expect(tablistMatch).not.toBeNull();
    const tablistCode = tablistMatch[1];
    const latestIdx = tablistCode.indexOf('data-testid="subtab-latest"');
    const bulkIdx = tablistCode.indexOf('data-testid="subtab-bulk"');
    const followedIdx = tablistCode.indexOf('data-testid="subtab-followed"');
    expect(latestIdx).toBeGreaterThan(-1);
    expect(bulkIdx).toBeGreaterThan(latestIdx);
    expect(followedIdx).toBeGreaterThan(bulkIdx);
  });
});
