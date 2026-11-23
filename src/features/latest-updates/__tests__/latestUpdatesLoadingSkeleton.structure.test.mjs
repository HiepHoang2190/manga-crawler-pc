import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const panelPath = path.join(repoRoot, 'src/features/latest-updates/LatestUpdatesPanel.jsx');
const viPath = path.join(repoRoot, 'src/i18n/locales/vi.js');
const enPath = path.join(repoRoot, 'src/i18n/locales/en.js');

describe('LatestUpdatesPanel Loading Skeleton & Progress Banner', () => {
  const code = fs.readFileSync(panelPath, 'utf8');
  const vi = fs.readFileSync(viPath, 'utf8');
  const en = fs.readFileSync(enPath, 'utf8');

  test('vi.js and en.js provide latestUpdates.loadingList and latestUpdates.loadingFromSite keys', () => {
    expect(vi).toContain("'latestUpdates.loadingList':");
    expect(vi).toContain("'latestUpdates.loadingFromSite':");
    expect(en).toContain("'latestUpdates.loadingList':");
    expect(en).toContain("'latestUpdates.loadingFromSite':");
  });

  test('defines memoized LatestUpdatesSkeleton supporting both grid and list modes', () => {
    expect(code).toContain('const LatestUpdatesSkeleton = React.memo(');
    expect(code).toContain('data-testid="latest-updates-skeleton"');
    expect(code).toContain('animate-pulse');
    expect(code).toContain('aspect-[3/4.2]');
    expect(code).toContain('h-14 w-10 sm:h-16 sm:w-11');
  });

  test('renders LatestUpdatesSkeleton directly whenever busyList or isSearchLoading is true (before rows.length > 0)', () => {
    expect(code).toMatch(/\{\(busyList\s*\|\|\s*isSearchLoading\)\s*\?\s*[\s\S]{0,120}<LatestUpdatesSkeleton/);
    const skeletonIdx = code.indexOf('<LatestUpdatesSkeleton');
    const emptyIdx = code.indexOf('<EmptyState');
    expect(skeletonIdx).toBeGreaterThan(-1);
    expect(emptyIdx).toBeGreaterThan(skeletonIdx);
    expect(code).toContain('loadingStatusText');
    expect(code).toContain('<EmptyState');
  });

  test('does not show stale dimmed rows or a top progress banner when fetching', () => {
    expect(code).not.toMatch(/rows\.length\s*>\s*0\s*&&\s*\(busyList\s*\|\|\s*isSearchLoading\)/);
    expect(code).not.toContain('opacity-50 pointer-events-none');
  });

  test('adheres to UI standards: zero native HTML title attributes and zero underline classes', () => {
    expect(code).not.toMatch(/\btitle\s*=\s*["'{]/);
    expect(code).not.toMatch(/\b(?:hover:)?underline\b/);
  });
});
