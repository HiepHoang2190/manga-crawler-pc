const { fetchChapters } = require('../../../platform/connectors/services/mangadxApiClient');

describe('MangaDex Volume Extraction', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('should extract volume string for chapters that belong to a volume', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        total: 2,
        data: [
          {
            id: 'chap-1',
            attributes: { chapter: '1', volume: '1', title: 'Chapter 1' },
            relationships: [],
          },
          {
            id: 'chap-2',
            attributes: { chapter: '105', volume: null, title: 'Chapter 105' },
            relationships: [],
          },
        ],
      }),
    });

    const res = await fetchChapters('https://mangadex.org/title/a96676e5-8ae2-425e-b549-7f15dd34a6d8');
    expect(res.ok).toBe(true);
    expect(res.chapters).toHaveLength(2);
    expect(res.chapters[0].volume).toBe('1');
    expect(res.chapters[1].volume).toBeNull();
  });
});

