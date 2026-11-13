const connectors = require('../../platform/connectors');
const tester = require('../../platform/connectors/tester');

describe('connectors.testConnector wrapper', () => {
  it('returns the same unknown-id error as the engine', async () => {
    const wrapped_result = await connectors.testConnector('non-existent-site');
    const engine_result = await tester.runConnectorTest('non-existent-site');
    expect(wrapped_result).toEqual(engine_result);
    expect(wrapped_result.ok).toBe(false);
    expect(wrapped_result.error).toContain('không tồn tại');
    expect(wrapped_result.steps).toEqual({});
  });
});

describe('connectors.load navigation shortcut filtering', () => {
  it('filters out "Đọc từ đầu", "Đọc mới nhất", "Read First" from chapters returned by connector', async () => {
    const cuutruyen = connectors.get('cuutruyen');
    const spy = jest.spyOn(cuutruyen, 'load').mockResolvedValue({
      ok: true,
      manga: { title: 'Test Manga', mangaUrl: 'https://cuutruyen.net/manga/1' },
      chapters: [
        { url: 'https://cuutruyen.net/manga/1/ch-0', title: 'Đọc từ đầu' },
        { url: 'https://cuutruyen.net/manga/1/ch-10', title: 'Đọc mới nhất' },
        { url: 'https://cuutruyen.net/manga/1/ch-10', title: 'Chapter 10' },
        { url: 'https://cuutruyen.net/manga/1/ch-9', title: 'Chapter 9' },
        { url: 'https://cuutruyen.net/manga/1/ch-0', title: 'Chapter 0' },
      ],
    });

    const result = await connectors.load('cuutruyen', 'https://cuutruyen.net/manga/1');
    expect(result.ok).toBe(true);
    expect(result.chapters).toHaveLength(3);
    expect(result.chapters[0].title).toBe('Chapter 10');
    expect(result.chapters[1].title).toBe('Chapter 9');
    expect(result.chapters[2].title).toBe('Chapter 0');
    expect(result.chapters.some((c) => c.title.includes('Đọc'))).toBe(false);

    spy.mockRestore();
  });
});
