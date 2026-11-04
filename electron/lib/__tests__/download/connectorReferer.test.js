const { getImageRefererForUrl } = require('../../download/connector/connectorReferer');
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
});
