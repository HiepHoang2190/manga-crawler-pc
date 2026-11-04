/**
 * Basic tests for Asura Scans connector & service
 */
const { describe, it, expect } = require('@jest/globals');
const asurascansService = require('../../../platform/connectors/services/asurascansService');
const connectors = require('../../../platform/connectors');
const {
  ASURASCANS_IMAGE_REFERER,
  isAsurascansImageCdnHost,
  getImageRefererForUrl,
} = require('../../../download/connector/connectorReferer');

describe('AsurascansService Basic', () => {
  it('exports service and parsing functions', () => {
    expect(asurascansService.service.siteId).toBe('asurascans');
    expect(asurascansService.service.domain).toBe('https://asurascans.com/');
    expect(typeof asurascansService.load).toBe('function');
    expect(typeof asurascansService.fetchLatestUpdates).toBe('function');
    expect(typeof asurascansService.extractComicSlug).toBe('function');
    expect(typeof asurascansService.cleanComicTitle).toBe('function');
    expect(typeof asurascansService.formatChapterLabel).toBe('function');
    expect(typeof asurascansService.parseAsurascansListingHtml).toBe('function');
    expect(typeof asurascansService.parseAsurascansListingMaxPage).toBe('function');
  });

  it('extracts comic slug accurately from various URL formats', () => {
    expect(
      asurascansService.extractComicSlug('https://asurascans.com/comics/solo-swordmaster-11fe7da3')
    ).toBe('solo-swordmaster-11fe7da3');

    expect(
      asurascansService.extractComicSlug('https://asurascans.com/comics/solo-swordmaster-11fe7da3/chapter/1')
    ).toBe('solo-swordmaster-11fe7da3');

    expect(
      asurascansService.extractComicSlug('https://asuracomic.net/series/solo-swordmaster-11fe7da3')
    ).toBe('solo-swordmaster-11fe7da3');

    expect(
      asurascansService.extractComicSlug('/comics/nano-machine-11fe7da3')
    ).toBe('nano-machine-11fe7da3');

    expect(
      asurascansService.extractComicSlug('https://asurascans.com/browse/comics')
    ).toBe('');
  });

  it('cleans title correctly', () => {
    expect(asurascansService.cleanComicTitle('Solo Swordmaster | Asura Scans')).toBe('Solo Swordmaster');
    expect(asurascansService.cleanComicTitle('Solo Swordmaster - Read Manga Online')).toBe('Solo Swordmaster');
    expect(asurascansService.cleanComicTitle('  Nano   Machine  ')).toBe('Nano Machine');
  });

  it('formats chapter label from text and href', () => {
    expect(
      asurascansService.formatChapterLabel('Chapter 2318 hours ago', '/comics/test/chapter/23')
    ).toBe('Chapter 23');

    expect(
      asurascansService.formatChapterLabel('Chapter 105.5', '/comics/test/chapter/105.5')
    ).toBe('Chapter 105.5');

    expect(
      asurascansService.formatChapterLabel('', '/comics/test/chapter/42')
    ).toBe('Chapter 42');
  });

  it('parses listing HTML cards with .series-card', () => {
    const html = `
      <div class="series-card" data-series-id="100">
        <a href="/comics/solo-swordmaster-11fe7da3">
          <img src="https://cdn.asurascans.com/asura-images/covers/solo-swordmaster.webp" alt="Solo Swordmaster" />
        </a>
        <div class="p-3">
          <a href="/comics/solo-swordmaster-11fe7da3">
            <h3>Solo Swordmaster</h3>
          </a>
          <span>23 Chapters</span>
        </div>
      </div>
    `;

    const items = asurascansService.parseAsurascansListingHtml(html, 'https://asurascans.com/comics');
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      title: 'Solo Swordmaster',
      mangaUrl: 'https://asurascans.com/comics/solo-swordmaster-11fe7da3',
      coverUrl: 'https://cdn.asurascans.com/asura-images/covers/solo-swordmaster.webp',
      latestChapterLabel: '23 Chapters',
    });
  });

  it('parses listing pagination max page', () => {
    const html = `
      <div class="pagination">
        <a href="/browse/comics?page=2">2</a>
        <a href="/browse/comics?page=12">12</a>
        <a href="/browse/comics?page=3">3</a>
      </div>
    `;
    expect(asurascansService.parseAsurascansListingMaxPage(html)).toBe(12);
  });

  it('correctly resolves CDN hosts and referer', () => {
    expect(isAsurascansImageCdnHost('cdn.asurascans.com')).toBe(true);
    expect(isAsurascansImageCdnHost('asurascans.com')).toBe(true);
    expect(isAsurascansImageCdnHost('gg.asuracomic.net')).toBe(true);
    expect(isAsurascansImageCdnHost('other.com')).toBe(false);

    expect(
      getImageRefererForUrl('https://cdn.asurascans.com/asura-images/chapters/solo/1/img.webp')
    ).toBe(ASURASCANS_IMAGE_REFERER);
  });

  it('is registered in connectors registry', () => {
    const connector = connectors.get('asurascans');
    expect(connector).toBeTruthy();
    expect(connector.id).toBe('asurascans');
    expect(connector.label).toBe('Asura Scans');
    expect(connector.domain).toBe('https://asurascans.com/');
    expect(connector.supportsLatestUpdates).toBe(true);
    expect(connector.supportsLatestUpdatesSearch).toBe(true);
  });
});
