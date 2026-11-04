const { ConnectorDomainManager } = require('../../../platform/connectors/domain/ConnectorDomainManager');

describe('ConnectorDomainManager', () => {
  let manager;

  beforeEach(() => {
    manager = new ConnectorDomainManager();
  });

  test('should return fallback domain when no active domain is stored', () => {
    expect(manager.getDomain('luottruyen', 'https://luottruyen20.com/')).toBe('https://luottruyen20.com/');
  });

  test('should store and retrieve active domain with trailing slash', () => {
    manager.setDomain('luottruyen', 'https://luottruyen21.com');
    expect(manager.getDomain('luottruyen', 'https://luottruyen20.com/')).toBe('https://luottruyen21.com/');
  });

  test('should resolve relative URLs against active domain', () => {
    manager.setDomain('luottruyen', 'https://luottruyen21.com');
    const resolved = manager.resolveUrl('luottruyen', '/truyen-tranh/test-1', 'https://luottruyen20.com');
    expect(resolved).toBe('https://luottruyen21.com/truyen-tranh/test-1');
  });

  test('should keep absolute URLs unchanged when resolving', () => {
    manager.setDomain('luottruyen', 'https://luottruyen21.com');
    const resolved = manager.resolveUrl('luottruyen', 'https://example.com/other', 'https://luottruyen20.com');
    expect(resolved).toBe('https://example.com/other');
  });

  test('should probe next numeric domain when registered pattern matches', async () => {
    manager.registerPattern('luottruyen', /^(https?:\/\/(?:www\.)?luottruyen)(\d+)(\.com\/?)$/i);
    const mockFetcher = jest.fn(async (url) => {
      if (url.includes('luottruyen21.com')) return { ok: true, status: 200 };
      return { ok: false, status: 500 };
    });

    const newDomain = await manager.probeNewDomain('luottruyen', 'https://luottruyen20.com/', mockFetcher);
    expect(newDomain).toBe('https://luottruyen21.com/');
    expect(manager.getDomain('luottruyen')).toBe('https://luottruyen21.com/');
    expect(mockFetcher).toHaveBeenCalledWith('https://luottruyen21.com/');
  });

  test('should return null when probe fails for all candidate numbers', async () => {
    manager.registerPattern('luottruyen', /^(https?:\/\/(?:www\.)?luottruyen)(\d+)(\.com\/?)$/i);
    const mockFetcher = jest.fn(async () => ({ ok: false, status: 502 }));

    const newDomain = await manager.probeNewDomain('luottruyen', 'https://luottruyen20.com/', mockFetcher);
    expect(newDomain).toBeNull();
    // active domain should still be fallback
    expect(manager.getDomain('luottruyen', 'https://luottruyen20.com/')).toBe('https://luottruyen20.com/');
  });

  test('should probe next numeric domain for zettruyen', async () => {
    manager.registerPattern('zettruyen', /^(https?:\/\/(?:www\.)?zettruyen)(\d+)(\.com\/?)$/i);
    const mockFetcher = jest.fn(async (url) => {
      if (url.includes('zettruyen5.com')) return { ok: true, status: 200 };
      return { ok: false, status: 500 };
    });

    const newDomain = await manager.probeNewDomain('zettruyen', 'https://www.zettruyen4.com/', mockFetcher);
    expect(newDomain).toBe('https://www.zettruyen5.com/');
    expect(manager.getDomain('zettruyen')).toBe('https://www.zettruyen5.com/');
  });

  test('should support singleton instance export', () => {
    const { connectorDomainManager } = require('../../../platform/connectors/domain/ConnectorDomainManager');
    expect(connectorDomainManager).toBeInstanceOf(ConnectorDomainManager);
  });
});
