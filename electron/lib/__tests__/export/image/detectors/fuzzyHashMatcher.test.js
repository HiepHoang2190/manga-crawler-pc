const {
  computeDHashFromRaw36x32,
  hammingDistance,
  isSimilar,
  areAspectRatiosCompatible,
  clusterSimilarImages,
} = require('../../../../export/image/detectors/fuzzyHashMatcher');

describe('fuzzyHashMatcher', () => {
  test('hammingDistance returns 0 for identical hashes', () => {
    const hash = '1010101010101010101010101010101010101010101010101010101010101010';
    expect(hammingDistance(hash, hash)).toBe(0);
    expect(isSimilar(hash, hash)).toBe(true);
  });

  test('hammingDistance counts bit differences correctly via XOR popcount', () => {
    const hashA = '0000000000000000000000000000000000000000000000000000000000000000';
    const hashB = '0000000000000000000000000000000000000000000000000000000000000111';
    expect(hammingDistance(hashA, hashB)).toBe(3);
    expect(isSimilar(hashA, hashB, 4)).toBe(true);
    expect(isSimilar(hashA, hashB, 2)).toBe(false);
  });

  test('handles invalid inputs gracefully', () => {
    expect(hammingDistance('', '')).toBe(64);
    expect(hammingDistance(null, '1010')).toBe(64);
    expect(isSimilar(null, null)).toBe(false);
  });

  test('areAspectRatiosCompatible rejects mismatched shapes when dimensions exist', () => {
    expect(areAspectRatiosCompatible({ width: 800, height: 1200 }, { width: 400, height: 600 })).toBe(true);
    expect(areAspectRatiosCompatible({ width: 800, height: 1200 }, { width: 1400, height: 600 })).toBe(false);
    expect(areAspectRatiosCompatible({ width: 0, height: 0 }, { width: 800, height: 1200 })).toBe(true);
  });

  test('clusterSimilarImages merges fuzzy hashes within Hamming threshold and respects aspect ratio', () => {
    const base = '1010101010101010101010101010101010101010101010101010101010100000';
    const near = '1010101010101010101010101010101010101010101010101010101010100111'; // 3 bits diff
    const far = '0101010101010101010101010101010101010101010101010101010101011111';

    const items = [
      { fullPath: '/a.jpg', hash: base, width: 800, height: 1200 },
      { fullPath: '/b.jpg', hash: near, width: 400, height: 600 },
      { fullPath: '/wrong_ratio.jpg', hash: near, width: 1200, height: 400 },
      { fullPath: '/c.jpg', hash: far, width: 800, height: 1200 },
    ];

    const clusters = clusterSimilarImages(items, { maxDistance: 4, maxRatioDiff: 0.35 });
    const mergedCluster = clusters.find((c) => c.items.some((i) => i.fullPath === '/a.jpg'));
    expect(mergedCluster.items.map((i) => i.fullPath)).toEqual(['/a.jpg', '/b.jpg']);
    expect(mergedCluster.matchType).toBe('fuzzy');

    const ratioMismatchCluster = clusters.find((c) => c.items.some((i) => i.fullPath === '/wrong_ratio.jpg'));
    expect(ratioMismatchCluster.items).toHaveLength(1);
    expect(ratioMismatchCluster.matchType).toBe('exact');
  });

  test('clusterSimilarImages prevents unbounded transitive chain merges beyond maxDistance', () => {
    const h0 = '0'.repeat(64);
    const h3 = '0'.repeat(61) + '111'; // dist 3 from h0
    const h6 = '0'.repeat(58) + '111111'; // dist 3 from h3, dist 6 from h0

    const clusters = clusterSimilarImages(
      [
        { fullPath: '/0.jpg', hash: h0, width: 800, height: 1200 },
        { fullPath: '/3.jpg', hash: h3, width: 800, height: 1200 },
        { fullPath: '/6.jpg', hash: h6, width: 800, height: 1200 },
      ],
      { maxDistance: 4 }
    );
    const c0 = clusters.find((c) => c.items.some((i) => i.fullPath === '/0.jpg'));
    expect(c0.items.some((i) => i.fullPath === '/6.jpg')).toBe(false);
  });

  test('computeDHashFromRaw36x32 computes 64-bit dHash matching left-to-right gradient polarity', () => {
    const raw = Buffer.alloc(36 * 32 * 3);
    for (let y = 0; y < 32; y += 1) {
      for (let x = 0; x < 36; x += 1) {
        const v = Math.floor((x / 35) * 240);
        const idx = (y * 36 + x) * 3;
        raw[idx] = v;
        raw[idx + 1] = v;
        raw[idx + 2] = v;
      }
    }
    const h = computeDHashFromRaw36x32(raw, { width: 36, height: 32, channels: 3 });
    expect(h).toHaveLength(64);
    expect(h).toBe('1'.repeat(64));
  });

  test('computeDHashFromRaw36x32 composites alpha onto white for 2/4-channel images and validates bounds', () => {
    // 1-channel grayscale gradient
    const g1 = Buffer.alloc(36 * 32);
    for (let y = 0; y < 32; y += 1) {
      for (let x = 0; x < 36; x += 1) {
        g1[y * 36 + x] = Math.floor((x / 35) * 240);
      }
    }
    expect(computeDHashFromRaw36x32(g1, { width: 36, height: 32, channels: 1 })).toBe('1'.repeat(64));

    // Transparent RGBA where RGB is pure black (0,0,0) everywhere and alpha draws strokes only on left half
    const rgbaAlphaOnly = Buffer.alloc(36 * 32 * 4, 0);
    for (let y = 0; y < 32; y += 1) {
      for (let x = 0; x < 18; x += 1) {
        rgbaAlphaOnly[(y * 36 + x) * 4 + 3] = 255;
      }
    }
    const alphaHash = computeDHashFromRaw36x32(rgbaAlphaOnly, { width: 36, height: 32, channels: 4 });
    // Left half dark (0) -> right half white (255), so transition column flips to '1' instead of flat all-'0'
    expect(alphaHash).not.toBe('0'.repeat(64));

    // Invalid / truncated inputs return deterministic zero hash without throwing
    expect(computeDHashFromRaw36x32(null, null)).toBe('0'.repeat(64));
    expect(computeDHashFromRaw36x32(Buffer.alloc(10), { width: 36, height: 32, channels: 3 })).toBe('0'.repeat(64));
  });
});
