const { describe, it, expect, beforeEach } = require('@jest/globals');

describe('cuuTruyenClient orderApiBases', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('puts cuutruyen API first for cuutruyen.net URLs (primary domain)', () => {
    const { orderApiBases } = require('../../platform/connectors/api-clients/cuuTruyenClient');
    const ordered = orderApiBases('https://cuutruyen.net/mangas/4430');
    expect(ordered[0]).toContain('cuutruyen.net');
  });

  it('puts nettrom API first for hetcuutruyen URLs', () => {
    const { orderApiBases } = require('../../platform/connectors/api-clients/cuuTruyenClient');
    const ordered = orderApiBases('https://hetcuutruyen.net/mangas/1');
    expect(ordered[0]).toContain('nettrom.com');
  });
});
