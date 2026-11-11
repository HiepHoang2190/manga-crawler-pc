import { sortImages } from '../upscaleNaming';

describe('Upscale Natural Sorting (sortImages)', () => {
  it('correctly sorts manga page files using natural numeric order (name_asc)', () => {
    const rawList = [
      { fileName: '1.jpg', relativePath: '1.jpg' },
      { fileName: '10.jpg', relativePath: '10.jpg' },
      { fileName: '2.jpg', relativePath: '2.jpg' },
      { fileName: '30.jpg', relativePath: '30.jpg' },
      { fileName: '31.jpg', relativePath: '31.jpg' },
      { fileName: '4.jpg', relativePath: '4.jpg' },
      { fileName: '5.jpg', relativePath: '5.jpg' },
      { fileName: '35.jpg', relativePath: '35.jpg' },
      { fileName: '40.jpg', relativePath: '40.jpg' },
    ];

    const sorted = sortImages(rawList, 'name_asc');
    const sortedNames = sorted.map((img) => img.fileName);

    expect(sortedNames).toEqual([
      '1.jpg',
      '2.jpg',
      '4.jpg',
      '5.jpg',
      '10.jpg',
      '30.jpg',
      '31.jpg',
      '35.jpg',
      '40.jpg',
    ]);
  });

  it('correctly sorts manga page files in descending natural order (name_desc)', () => {
    const rawList = [
      { fileName: '1.jpg', relativePath: '1.jpg' },
      { fileName: '10.jpg', relativePath: '10.jpg' },
      { fileName: '2.jpg', relativePath: '2.jpg' },
    ];

    const sorted = sortImages(rawList, 'name_desc');
    const sortedNames = sorted.map((img) => img.fileName);

    expect(sortedNames).toEqual(['10.jpg', '2.jpg', '1.jpg']);
  });

  it('correctly sorts by file size (size_asc and size_desc)', () => {
    const rawList = [
      { fileName: 'b.jpg', sizeBytes: 500 },
      { fileName: 'a.jpg', sizeBytes: 100 },
      { fileName: 'c.jpg', sizeBytes: 900 },
    ];

    expect(sortImages(rawList, 'size_asc').map((x) => x.fileName)).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
    expect(sortImages(rawList, 'size_desc').map((x) => x.fileName)).toEqual(['c.jpg', 'b.jpg', 'a.jpg']);
  });
});
