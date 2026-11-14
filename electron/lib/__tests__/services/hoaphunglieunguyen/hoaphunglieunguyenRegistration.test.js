const { describe, test, expect } = require('@jest/globals');
const connectors = require('../../../platform/connectors');
const { getCatalogEntry } = require('../../../platform/connectors/tester/catalog');

describe('Hoaphunglieunguyen System Registration', () => {
  test('should be registered in connectors registry', () => {
    const connector = connectors.get('hoaphunglieunguyen');
    expect(connector).toBeDefined();
    expect(connector.id).toBe('hoaphunglieunguyen');
    expect(connector.label).toBe('Hỏa Phụng Liêu Nguyên');
    expect(connector.domain).toBe('https://hoaphunglieunguyen.com/');
  });

  test('should be detected by URL variations', () => {
    const urls = [
      'https://hoaphunglieunguyen.com/',
      'https://hoaphunglieunguyen.com/tap/tap-1/',
      'https://hoaphunglieunguyen.com/tap/tap-82/hoi-637/',
      'http://hoaphunglieunguyen.com/tap/tap-10/',
    ];

    for (const u of urls) {
      expect(connectors.detectSiteIdFromUrl(u)).toBe('hoaphunglieunguyen');
      expect(connectors.resolveSiteForLoad(null, u)).toBe('hoaphunglieunguyen');
    }
  });

  test('should be listed in listConnectors()', () => {
    const list = connectors.listConnectors();
    const found = list.find((c) => c.id === 'hoaphunglieunguyen');
    expect(found).toBeDefined();
    expect(found.label).toBe('Hỏa Phụng Liêu Nguyên');
    expect(found.domain).toBe('https://hoaphunglieunguyen.com/');
    expect(found.icon).toBe('data/site-icons/hoaphunglieunguyen.png');
  });

  test('should have test catalog entry', () => {
    const entry = getCatalogEntry('hoaphunglieunguyen');
    expect(entry).toBeDefined();
    expect(entry.testUrl).toBe('/');
  });
});
