import fs from 'node:fs';
import path from 'node:path';

describe('LatestUpdatesPanel listing cache temporal dead zone check', () => {
  const panelPath = path.resolve(process.cwd(), 'src/features/latest-updates/LatestUpdatesPanel.jsx');

  test('latestUpdatesListingCache.fetchError is assigned after let warn declaration', () => {
    const content = fs.readFileSync(panelPath, 'utf8');
    const cacheWarnIndex = content.indexOf('latestUpdatesListingCache.fetchError = warn');
    const letWarnIndex = content.indexOf('let warn =');
    expect(cacheWarnIndex).toBeGreaterThan(-1);
    expect(letWarnIndex).toBeGreaterThan(-1);
    expect(cacheWarnIndex).toBeGreaterThan(letWarnIndex);
  });
});

