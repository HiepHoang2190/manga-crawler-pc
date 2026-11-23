const {
  getImageRefererForUrl,
  isMangadexCdnHost,
  isXbatoImageCdnHost,
  isWebtoonsImageCdnHost,
} = require('../../download/connector/connectorReferer');
const { connectorDomainManager } = require('../../platform/connectors/domain/ConnectorDomainManager');

describe('connectorReferer dynamic resolution', () => {
  test('should return default referer for LuotTruyen image CDN when no override is set', () => {
    const referer = getImageRefererForUrl('https://img.dichvucdn.com/uploads/chapter/1.jpg');
    expect(referer).toBe('https://luottruyen21.com/');
  });

  test('should return dynamically updated referer when domain changes in ConnectorDomainManager', () => {
    connectorDomainManager.setDomain('luottruyen', 'https://luottruyen25.com');
    const referer = getImageRefererForUrl('https://img.dichvucdn.com/uploads/chapter/1.jpg');
    expect(referer).toBe('https://luottruyen25.com/');
  });

  test('should return dynamically updated referer for TopTruyenZone2', () => {
    connectorDomainManager.setDomain('toptruyenzone2', 'https://www.toptruyenzone15.com');
    const referer = getImageRefererForUrl('https://anhvip.xyz/data/chapter/1.jpg');
    expect(referer).toBe('https://www.toptruyenzone15.com/');
  });

  test('should identify MangaDex CDN hosts and provide correct referer', () => {
    expect(isMangadexCdnHost('uploads.mangadex.org')).toBe(true);
    expect(isMangadexCdnHost('cmd.mangadex.network')).toBe(true);
    expect(isMangadexCdnHost('example.com')).toBe(false);

    const referer = getImageRefererForUrl('https://uploads.mangadex.org/covers/a96676e5/f8f44329.jpg.512.jpg');
    expect(referer).toBe('https://mangadex.org/');
  });

  test('should identify xBato CDN hosts including snapvip and provide correct referer', () => {
    expect(isXbatoImageCdnHost('cdnb.snapvip.xyz')).toBe(true);
    expect(isXbatoImageCdnHost('cdna.snapvip.xyz')).toBe(true);
    expect(isXbatoImageCdnHost('cdn2.merrypsycho.xyz')).toBe(true);
    expect(isXbatoImageCdnHost('xbato.co.uk')).toBe(true);

    const referer = getImageRefererForUrl('https://cdnb.snapvip.xyz/eleceed/423/0.webp');
    expect(referer).toBe('https://xbato.co.uk/');
  });

  test('should identify Webtoons pstatic/site CDN hosts and avoid MinoTruyen pstatic hosts', () => {
    const webtoonsUrls = [
      'https://swebtoon-phinf.pstatic.net/20240101_123/1700000000_JPEG/thumb.jpg',
      'https://webtoon-phinf.pstatic.net/20240101_123/1700000000_JPEG/cover.jpg',
      'https://gwebtoon-phinf.pstatic.net/thumb.jpg',
      'https://webtoons-static.pstatic.net/image/pc/home/bg.png',
      'https://www.webtoons.com/static/cover.jpg',
    ];
    for (const url of webtoonsUrls) {
      expect(isWebtoonsImageCdnHost(new URL(url).hostname)).toBe(true);
      expect(getImageRefererForUrl(url)).toBe('https://www.webtoons.com/');
    }

    // MinoTruyen chapter hosts on pstatic.net and spoof hosts must NOT collide with Webtoons
    for (const nonWebtoonUrl of [
      'https://phinf.pstatic.net/memo/page1.jpeg',
      'https://kin-phinf.pstatic.net/page1_alt',
      'https://webtoons.com.evil.com/a.jpg',
      'https://notwebtoons.com/a.jpg',
      'https://webtoon.evil.net/a.jpg',
    ]) {
      expect(isWebtoonsImageCdnHost(new URL(nonWebtoonUrl).hostname)).toBe(false);
      expect(getImageRefererForUrl(nonWebtoonUrl)).toBeNull();
    }
  });
});
