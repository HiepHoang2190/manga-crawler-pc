const { detectEdgeCreditPages, isEdgePage } = require('../../../../export/image/detectors/edgeRepetitionDetector');

describe('edgeRepetitionDetector', () => {
  test('isEdgePage returns true for first 2 pages and last 2 pages', () => {
    const totalPages = 20;
    expect(isEdgePage(0, totalPages)).toBe(true);
    expect(isEdgePage(1, totalPages)).toBe(true);
    expect(isEdgePage(18, totalPages)).toBe(true);
    expect(isEdgePage(19, totalPages)).toBe(true);

    expect(isEdgePage(2, totalPages)).toBe(false);
    expect(isEdgePage(10, totalPages)).toBe(false);
    expect(isEdgePage(17, totalPages)).toBe(false);
  });

  test('flags repeated edge images across >= 2 chapters as credit pages', () => {
    const creditHash = '1111000011110000111100001111000011110000111100001111000011110000';
    const storyHash1 = '0000111100001111000011110000111100001111000011110000111100001111';
    const storyHash2 = '1010101010101010101010101010101010101010101010101010101010101010';

    const buckets = [
      {
        id: 'chap_1',
        images: [
          { fullPath: '/c1/p0.jpg', hash: creditHash, index: 0, totalPages: 10, width: 800, height: 1200 },
          { fullPath: '/c1/p1.jpg', hash: storyHash1, index: 1, totalPages: 10, width: 800, height: 1200 },
        ],
      },
      {
        id: 'chap_2',
        images: [
          { fullPath: '/c2/p0.jpg', hash: creditHash, index: 0, totalPages: 10, width: 800, height: 1200 },
          { fullPath: '/c2/p1.jpg', hash: storyHash2, index: 1, totalPages: 10, width: 800, height: 1200 },
        ],
      },
    ];

    const creditPaths = detectEdgeCreditPages(buckets);
    expect(creditPaths.has('/c1/p0.jpg')).toBe(true);
    expect(creditPaths.has('/c2/p0.jpg')).toBe(true);
    expect(creditPaths.has('/c1/p1.jpg')).toBe(false);
  });

  test('skips blank pages even if repeated across >= 2 chapters', () => {
    const zeroHash = '0'.repeat(64);
    const buckets = [
      {
        id: 'chap_1',
        images: [{ fullPath: '/c1/blank.jpg', hash: zeroHash, index: 0, totalPages: 10, isBlank: true }],
      },
      {
        id: 'chap_2',
        images: [{ fullPath: '/c2/blank.jpg', hash: zeroHash, index: 0, totalPages: 10, isBlank: true }],
      },
    ];
    expect(detectEdgeCreditPages(buckets).size).toBe(0);
  });

  test('does NOT flag repeated images in the MIDDLE of a chapter or mismatched aspect ratios', () => {
    const repeatHash = '1'.repeat(64);
    const middleBuckets = [
      {
        id: 'chap_1',
        images: [{ fullPath: '/c1/p5.jpg', hash: repeatHash, index: 5, totalPages: 20 }],
      },
      {
        id: 'chap_2',
        images: [{ fullPath: '/c2/p5.jpg', hash: repeatHash, index: 5, totalPages: 20 }],
      },
    ];
    expect(detectEdgeCreditPages(middleBuckets).size).toBe(0);

    const ratioBuckets = [
      {
        id: 'chap_1',
        images: [{ fullPath: '/c1/p0.jpg', hash: repeatHash, index: 0, totalPages: 10, width: 800, height: 1200 }],
      },
      {
        id: 'chap_2',
        images: [{ fullPath: '/c2/p0.jpg', hash: repeatHash, index: 0, totalPages: 10, width: 1200, height: 300 }],
      },
    ];
    expect(detectEdgeCreditPages(ratioBuckets).size).toBe(0);
  });
});
