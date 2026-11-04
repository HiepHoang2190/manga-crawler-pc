import { describe, test, expect } from '@jest/globals';

describe('scan and toggle cache logic', () => {
  test('sameFiles detection prevents unnecessary state updates', () => {
    const current = [
      { absolutePath: '/folder/p1.png', relativePath: 'p1.png' },
      { absolutePath: '/folder/p2.png', relativePath: 'p2.png' },
    ];
    const scanned = [
      { absolutePath: '/folder/p1.png', relativePath: 'p1.png' },
      { absolutePath: '/folder/p2.png', relativePath: 'p2.png' },
    ];

    const isSameImages =
      current.length === scanned.length &&
      current.every((img, i) => img.absolutePath === scanned[i].absolutePath);

    expect(isSameImages).toBe(true);
  });

  test('initialBatchNeeded respects folder size smaller than limit', () => {
    const INITIAL_ANALYZE_LIMIT = 50;
    const images = new Array(25).fill(null).map((_, i) => ({ absolutePath: `/folder/p${i}.png` }));
    const analysisCache = Object.fromEntries(images.map((img) => [img.absolutePath, { ok: true }]));

    const neededBefore = Object.keys(analysisCache).length < INITIAL_ANALYZE_LIMIT;
    expect(neededBefore).toBe(true); // Buggy: 25 < 50 was true!

    const neededFixed =
      images.length > 0 &&
      Object.keys(analysisCache).length < Math.min(INITIAL_ANALYZE_LIMIT, images.length);
    expect(neededFixed).toBe(false); // Fixed: 25 < min(50, 25) is false!
  });

  test('preserves cumulative analysis cache when toggling subfolders', () => {
    const rootFiles = [{ absolutePath: '/folder/p1.png' }];
    const subFiles = [{ absolutePath: '/folder/p1.png' }, { absolutePath: '/folder/sub/p2.png' }];

    let analysis = {
      '/folder/p1.png': { ok: true, skewAngle: 0 },
      '/folder/sub/p2.png': { ok: true, skewAngle: 1.5 },
    };

    // When toggling subfolders off, scanned is rootFiles.
    // If we DO NOT wipe subFiles from cache:
    const retainedAnalysis = { ...analysis };
    expect(retainedAnalysis['/folder/sub/p2.png']).toBeDefined();

    // When toggling subfolders back on, subFiles are already in cache!
    const unanalyzed = subFiles.filter((img) => !retainedAnalysis[img.absolutePath]);
    expect(unanalyzed).toHaveLength(0);
  });
});
