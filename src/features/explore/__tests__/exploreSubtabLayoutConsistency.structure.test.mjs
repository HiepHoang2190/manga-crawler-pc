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

  test('all 3 subtabs accept and render subtabsSlot in StudioLayout.Toolbar leftSlot', () => {
    for (const f of files) {
      const content = fs.readFileSync(f.path, 'utf8');
      expect(content).toContain('subtabsSlot');
      expect(content).toContain('StudioLayout.Toolbar');
      expect(content).toMatch(/leftSlot=[\s\S]*?subtabsSlot/);
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
    }
  });
});
