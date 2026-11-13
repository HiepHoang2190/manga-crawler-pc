import fs from 'node:fs';
import path from 'node:path';

describe('ExplorePanel and ShellLayout persistence structure', () => {
  const shellPath = path.resolve(process.cwd(), 'src/features/shell/ShellLayout.jsx');
  const explorePath = path.resolve(process.cwd(), 'src/features/explore/ExplorePanel.jsx');
  const latestUpdatesPath = path.resolve(process.cwd(), 'src/features/latest-updates/LatestUpdatesPanel.jsx');

  test('ShellLayout renders ExplorePanel in persistent tab container with data-testid="tab-content-explore"', () => {
    const shellSrc = fs.readFileSync(shellPath, 'utf8');
    expect(shellSrc).toContain('data-testid="tab-content-explore"');
    expect(shellSrc).toMatch(/hasVisitedExplore/);
    expect(shellSrc).not.toMatch(/: menuView === 'explore' \|\| menuView === 'latestUpdates' \|\| menuView === 'bulkScan' \?\s*\(\s*<ExplorePanel/);
  });

  test('ExplorePanel synchronizes activeSubtab with initialSubtab prop', () => {
    const exploreSrc = fs.readFileSync(explorePath, 'utf8');
    expect(exploreSrc).toMatch(/setActiveSubtab\(initialSubtab\)/);
  });

  test('LatestUpdatesPanel contains listing cache to prevent duplicate fetches', () => {
    const latestSrc = fs.readFileSync(latestUpdatesPath, 'utf8');
    expect(latestSrc).toMatch(/latestUpdatesListingCache/);
  });
});

