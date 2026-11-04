const { listRegistryIds } = require('../../../platform/connectors');
const {
  getCatalogEntry,
  listCatalogEntries,
  resolveTestUrl,
} = require('../../../platform/connectors/tester/catalog');

describe('connector test catalog', () => {
  test('listRegistryIds returns every built-in including hidden', () => {
    const registry_ids = listRegistryIds();
    expect(registry_ids).toEqual(expect.arrayContaining([
      'cuutruyen',
      'kenhsinhvien',
    ]));
  });

  test('catalog keys match REGISTRY exactly', () => {
    const registry_ids = listRegistryIds().slice().sort();
    const catalog_ids = listCatalogEntries().map((entry) => entry.siteId).sort();
    expect(catalog_ids).toEqual(registry_ids);
  });

  test('every entry has a testUrl', () => {
    for (const entry of listCatalogEntries()) {
      expect(typeof entry.testUrl).toBe('string');
      expect(entry.testUrl.length).toBeGreaterThan(0);
    }
  });

  test('skipSteps only allows download', () => {
    for (const entry of listCatalogEntries()) {
      const skip_steps = entry.skipSteps || [];
      for (const step_name of skip_steps) {
        expect(step_name).toBe('download');
      }
    }
    expect(getCatalogEntry('dtvebook').skipSteps).toEqual(['download']);
  });

  test('chapterPicker is first or free-last when set', () => {
    for (const entry of listCatalogEntries()) {
      if (entry.chapterPicker) {
        expect(['first', 'free-last']).toContain(entry.chapterPicker);
      }
    }
    expect(getCatalogEntry('comicdays').chapterPicker).toBe('first');
    expect(getCatalogEntry('manhwatv').chapterPicker).toBe('first');
  });

  test('getCatalogEntry lowercases siteId and returns null for unknown', () => {
    expect(getCatalogEntry('CuuTruyen').testUrl).toBe(getCatalogEntry('cuutruyen').testUrl);
    expect(getCatalogEntry('missing-site')).toBeNull();
  });

  test('resolveTestUrl joins relative paths against domain', () => {
    const resolved_url = resolveTestUrl(
      'toptruyenzone2',
      'https://toptruyenzone2.com/',
    );
    expect(resolved_url).toBe(
      'https://toptruyenzone2.com/truyen-tranh/hoan-quan-hoi-quy-troc-phong-truy-nguyet/18649',
    );
  });

  test('resolveTestUrl returns absolute testUrl unchanged', () => {
    const raw_url = getCatalogEntry('luutrucuawibu').testUrl;
    expect(resolveTestUrl('luutrucuawibu', 'https://ignored.example/')).toBe(raw_url);
  });

  test('resolveTestUrl returns empty string for unknown site', () => {
    expect(resolveTestUrl('not-a-site', 'https://example.com')).toBe('');
  });

  describe('relative URL resolution and trailing slash handling', () => {
    test('should return relative url joined with currentDomain for luottruyen', () => {
      const url = resolveTestUrl('luottruyen', 'https://luottruyen21.com');
      expect(url).toBe('https://luottruyen21.com/truyen-tranh/dac-vu-song-sinh-16719');
    });

    test('should handle currentDomain with or without trailing slash', () => {
      const urlWithSlash = resolveTestUrl('luottruyen', 'https://luottruyen21.com/');
      const urlWithoutSlash = resolveTestUrl('luottruyen', 'https://luottruyen21.com');
      expect(urlWithSlash).toBe('https://luottruyen21.com/truyen-tranh/dac-vu-song-sinh-16719');
      expect(urlWithoutSlash).toBe('https://luottruyen21.com/truyen-tranh/dac-vu-song-sinh-16719');
    });

    test('should keep absolute URLs for third-party hosted sites like luutrucuawibu', () => {
      const url = resolveTestUrl('luutrucuawibu', 'https://ignored.com');
      expect(url).toContain('blogspot.com');
    });
  });
});
