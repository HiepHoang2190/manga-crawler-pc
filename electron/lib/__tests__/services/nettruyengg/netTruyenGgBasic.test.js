/**
 * Basic tests for NetTruyenGgService
 */
const { describe, it, expect } = require('@jest/globals');
const netTruyenGgService = require('../../../platform/connectors/services/netTruyenGgService');
const connectors = require('../../../platform/connectors');

describe('NetTruyenGgService Basic', () => {
  it('exports constants', () => {
    expect(netTruyenGgService.DOMAIN).toBe('https://nettruyen.gg/');
    expect(netTruyenGgService.LABEL).toBe('NetTruyenGG');
  });

  it('extracts slug from manga URL', () => {
    expect(
      netTruyenGgService.extractSlug(
        'https://nettruyen.gg/truyen-tranh/kyou-kara-ore-wa-cap-bai-trung',
      ),
    ).toBe('kyou-kara-ore-wa-cap-bai-trung');
  });

  it('extracts slug from chapter URL', () => {
    expect(
      netTruyenGgService.extractSlug(
        'https://nettruyen.gg/truyen-tranh/kyou-kara-ore-wa-cap-bai-trung/chuong-368',
      ),
    ).toBe('kyou-kara-ore-wa-cap-bai-trung');
  });
});

describe('NetTruyenGG connector registry', () => {
  it('is registered', () => {
    const connector = connectors.get('nettruyengg');
    expect(connector).toBeTruthy();
    expect(connector.label).toBe('NetTruyenGG');
  });

  it('detects site from URL', () => {
    expect(
      connectors.detectSiteIdFromUrl(
        'https://nettruyen.gg/truyen-tranh/kyou-kara-ore-wa-cap-bai-trung',
      ),
    ).toBe('nettruyengg');
  });
});
