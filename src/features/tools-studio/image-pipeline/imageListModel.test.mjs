import { formatBytes, getImageStatus, filterAndSortImages, countByFilter } from './imageListModel.js';

const images = [
  { absolutePath: '/x/p10.png', relativePath: 'p10.png', size: 300 },
  { absolutePath: '/x/p2.png', relativePath: 'p2.png', size: 100 },
  { absolutePath: '/x/p1.png', relativePath: 'p1.png', size: 200 },
];
const ctx = {
  analysis: {
    '/x/p1.png': { ok: true, badges: { skewAngle: 2.3, hasBorder: false, isDoublePage: false }, outputCount: 1 },
    '/x/p2.png': { ok: true, badges: { skewAngle: null, hasBorder: false, isDoublePage: false }, outputCount: 1 },
    '/x/p10.png': { ok: false, error: 'boom' },
  },
  overrides: { '/x/p2.png': { c: { params: { tolerance: 3 }, stale: true } } },
  runErrors: {},
};

describe('imageListModel', () => {
  test('formatBytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  test('status flags', () => {
    expect(getImageStatus(images[2], ctx)).toMatchObject({ needsWork: true, manual: false, error: false });
    expect(getImageStatus(images[1], ctx)).toMatchObject({ needsWork: false, manual: true, stale: true });
    expect(getImageStatus(images[0], ctx)).toMatchObject({ error: true, errorMessage: 'boom' });
  });

  test('natural sort, search and filters', () => {
    expect(filterAndSortImages(images, { ...ctx, filter: 'all', search: '', sort: 'nameAsc' }).map((i) => i.relativePath)).toEqual(['p1.png', 'p2.png', 'p10.png']);
    expect(filterAndSortImages(images, { ...ctx, filter: 'all', search: '', sort: 'sizeDesc' })[0].relativePath).toBe('p10.png');
    expect(filterAndSortImages(images, { ...ctx, filter: 'all', search: 'P1', sort: 'nameDesc' }).map((i) => i.relativePath)).toEqual(['p10.png', 'p1.png']);
    expect(filterAndSortImages(images, { ...ctx, filter: 'stale', search: '', sort: 'nameAsc' })).toHaveLength(1);
    expect(countByFilter(images, ctx)).toEqual({ all: 3, needsWork: 1, manual: 1, stale: 1, error: 1 });
  });
});
