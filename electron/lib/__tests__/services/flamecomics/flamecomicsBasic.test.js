/**
 * Basic tests for Flame Comics connector & service
 */
const { describe, it, expect } = require('@jest/globals');
const flamecomicsService = require('../../../platform/connectors/services/flamecomicsService');
const connectors = require('../../../platform/connectors');
const {
  FLAMECOMICS_IMAGE_REFERER,
  isFlamecomicsImageCdnHost,
  getImageRefererForUrl,
} = require('../../../download/connector/connectorReferer');

describe('FlamecomicsService Basic', () => {
  it('exports service and parsing functions', () => {
    expect(flamecomicsService.service.siteId).toBe('flamecomics');
    expect(flamecomicsService.service.domain).toBe('https://flamecomics.xyz/');
    expect(typeof flamecomicsService.load).toBe('function');
    expect(typeof flamecomicsService.fetchLatestUpdates).toBe('function');
    expect(typeof flamecomicsService.extractSeriesId).toBe('function');
    expect(typeof flamecomicsService.cleanComicTitle).toBe('function');
    expect(typeof flamecomicsService.formatChapterLabel).toBe('function');
    expect(typeof flamecomicsService.extractNextData).toBe('function');
    expect(typeof flamecomicsService.stripHtml).toBe('function');
  });

  it('extracts series ID accurately from various URL formats', () => {
    expect(
      flamecomicsService.extractSeriesId('https://flamecomics.xyz/series/2')
    ).toBe('2');

    expect(
      flamecomicsService.extractSeriesId('https://flamecomics.xyz/series/2-omniscient-readers-viewpoint')
    ).toBe('2');

    expect(
      flamecomicsService.extractSeriesId('https://flamecomics.xyz/series/165/364db6fd6bef182e')
    ).toBe('165');

    expect(
      flamecomicsService.extractSeriesId('/series/42')
    ).toBe('42');

    expect(
      flamecomicsService.extractSeriesId('https://flamecomics.xyz/browse')
    ).toBe('');
  });

  it('cleans title correctly', () => {
    expect(
      flamecomicsService.cleanComicTitle("Omniscient Reader's Viewpoint | Flame Comics")
    ).toBe("Omniscient Reader's Viewpoint");
    expect(
      flamecomicsService.cleanComicTitle('Solo Leveling - Flame Comics')
    ).toBe('Solo Leveling');
    expect(
      flamecomicsService.cleanComicTitle('  Jungle   Juice  ')
    ).toBe('Jungle Juice');
  });

  it('formats chapter label from chapter string and subtitle', () => {
    expect(
      flamecomicsService.formatChapterLabel('311.00', 'Dokja’s Fable (Part 13)')
    ).toBe('Chapter 311: Dokja’s Fable (Part 13)');

    expect(
      flamecomicsService.formatChapterLabel('0.00', 'Prologue')
    ).toBe('Chapter 0: Prologue');

    expect(
      flamecomicsService.formatChapterLabel('42.50', '')
    ).toBe('Chapter 42.5');

    expect(
      flamecomicsService.formatChapterLabel('10', 'Chapter 10')
    ).toBe('Chapter 10');
  });

  it('extracts __NEXT_DATA__ json from script tag', () => {
    const html = `
      <html>
        <head>
          <script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"test":123}}}</script>
        </head>
      </html>
    `;
    const data = flamecomicsService.extractNextData(html);
    expect(data).toBeTruthy();
    expect(data.props.pageProps.test).toBe(123);
  });

  it('strips HTML from description', () => {
    expect(
      flamecomicsService.stripHtml('<p class="root">Hello &amp; welcome &quot;world&quot;</p>')
    ).toBe('Hello & welcome "world"');
  });

  it('correctly resolves CDN hosts and referer', () => {
    expect(isFlamecomicsImageCdnHost('cdn.flamecomics.xyz')).toBe(true);
    expect(isFlamecomicsImageCdnHost('flamecomics.xyz')).toBe(true);
    expect(isFlamecomicsImageCdnHost('flamecomics.me')).toBe(true);
    expect(isFlamecomicsImageCdnHost('flamescans.org')).toBe(true);
    expect(isFlamecomicsImageCdnHost('other.com')).toBe(false);

    expect(
      getImageRefererForUrl('https://cdn.flamecomics.xyz/uploads/images/series/2/364db6fd6bef182e/ORV-311-00.jpg')
    ).toBe(FLAMECOMICS_IMAGE_REFERER);
  });

  it('is registered in connectors registry', () => {
    const connector = connectors.get('flamecomics');
    expect(connector).toBeTruthy();
    expect(connector.id).toBe('flamecomics');
    expect(connector.label).toBe('Flame Comics');
    expect(connector.domain).toBe('https://flamecomics.xyz/');
    expect(connector.supportsLatestUpdates).toBe(true);
    expect(connector.supportsLatestUpdatesSearch).toBe(true);
  });
});
