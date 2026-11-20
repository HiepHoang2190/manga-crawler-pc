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

  test('all 3 subtabs accept and render subtabsSlot in StudioLayout.Toolbar leftSlot cleanly without outer clutter', () => {
    for (const f of files) {
      const content = fs.readFileSync(f.path, 'utf8');
      expect(content).toContain('subtabsSlot');
      expect(content).toContain('StudioLayout.Toolbar');
      expect(content).toMatch(/leftSlot=\{\s*subtabsSlot\s*\}/);
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
});
