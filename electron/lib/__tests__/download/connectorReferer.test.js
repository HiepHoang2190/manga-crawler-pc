const { getImageRefererForUrl, isMangadexCdnHost } = require('../../download/connector/connectorReferer');
const { connectorDomainManager } = require('../../platform/connectors/domain/ConnectorDomainManager');

describe('connectorReferer dynamic resolution', () => {
  test('should return default referer for LuotTruyen image CDN when no override is set', () => {
    const referer = getImageRefererForUrl('https://img.dichvucdn.com/uploads/chapter/1.jpg');
    expect(referer).toBe('https://luottruyen20.com/');
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
});
