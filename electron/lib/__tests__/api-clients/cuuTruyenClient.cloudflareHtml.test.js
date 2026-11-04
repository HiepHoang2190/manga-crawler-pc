const { describe, it, expect, beforeEach } = require('@jest/globals');

describe('cuuTruyenClient Cloudflare HTML', () => {
  beforeEach(() => {
    jest.resetModules();
    global.fetch = jest.fn().mockResolvedValue({
      status: 403,
      text: async () => '<html>Just a moment</html>',
    });
  });

  it('returns a Cloudflare hint after one fetch', async () => {
    const client = require('../../platform/connectors/api-clients/cuuTruyenClient');
    const api_url = 'https://cuutruyen.net/api/v2/mangas/1';

    const result = await client.fetchCuuTruyenApiUrl(api_url);

    expect(result.body).toBeNull();
    expect(String(result.failureHint)).toMatch(/Cloudflare/i);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
