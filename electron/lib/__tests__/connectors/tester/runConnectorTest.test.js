const { runConnectorTest } = require('../../../platform/connectors/tester/runConnectorTest');
const { fetchHtml } = require('../../../download/connector/htmlConnectorUtils');

jest.mock('../../../download/connector/htmlConnectorUtils', () => ({
  fetchHtml: jest.fn(),
}));

jest.mock('../../../platform/connectors/moetruyen', () => ({
  id: 'moetruyen',
  label: 'MoeTruyen',
  domain: 'https://moetruyen.net/',
  requiresCookie: true,
  requiresVpn: false,
  fetchLatestUpdates: jest.fn(),
  load: jest.fn(),
  downloadChapter: jest.fn(),
}));

jest.mock('../../../platform/connectors/chapVn', () => ({
  id: 'chapvn',
  label: 'ChapVn',
  domain: 'https://chapvn.com/',
  requiresCookie: false,
  requiresVpn: true,
  load: jest.fn(),
  downloadChapter: jest.fn(),
}));

jest.mock('../../../platform/connectors/comicDays', () => ({
  id: 'comicdays',
  label: 'ComicDays',
  domain: 'https://comic-days.com/',
  load: jest.fn(),
  downloadChapter: jest.fn(),
}));

jest.mock('../../../platform/connectors/dtvebook', () => ({
  id: 'dtvebook',
  label: 'DTV Ebook',
  domain: 'https://dtv-ebook.com.vn/',
  load: jest.fn(),
  downloadChapter: jest.fn(),
}));

describe('runConnectorTest', () => {
  let moetruyen_connector;
  let chapvn_connector;
  let comicdays_connector;
  let dtvebook_connector;

  function mockAbortedDownload(connector_mock) {
    connector_mock.downloadChapter.mockImplementation(async (payload) => {
      payload.onProgress({ current: 1 });
      return { ok: false, aborted: true };
    });
  }

  beforeEach(() => {
    jest.resetAllMocks();
    moetruyen_connector = require('../../../platform/connectors/moetruyen');
    chapvn_connector = require('../../../platform/connectors/chapVn');
    comicdays_connector = require('../../../platform/connectors/comicDays');
    dtvebook_connector = require('../../../platform/connectors/dtvebook');
  });

  it('should return error for non-existent connector', async () => {
    const actual_result = await runConnectorTest('non-existent-site');
    expect(actual_result.ok).toBe(false);
    expect(actual_result.error).toContain('không tồn tại');
    expect(actual_result.steps).toEqual({});
  });

  it('should run full deep test (listing → chapters → download) when all succeed', async () => {
    moetruyen_connector.fetchLatestUpdates.mockResolvedValue({
      ok: true,
      items: [{ mangaUrl: 'https://moetruyen.net/manga/test-manga' }],
    });
    moetruyen_connector.load.mockResolvedValue({
      ok: true,
      manga: { title: 'Test Manga', mangaUrl: 'https://moetruyen.net/manga/41-dau-bep-tru-danh', coverUrl: '' },
      chapters: [
        { url: 'https://moetruyen.net/chapter/1', title: 'Chapter 1' },
        { url: 'https://moetruyen.net/chapter/2', title: 'Chapter 2' },
      ],
    });
    mockAbortedDownload(moetruyen_connector);

    const actual_result = await runConnectorTest('moetruyen');

    expect(moetruyen_connector.fetchLatestUpdates).toHaveBeenCalled();
    expect(moetruyen_connector.load).toHaveBeenCalledWith(
      'https://moetruyen.net/manga/41-dau-bep-tru-danh',
      expect.any(Object),
    );
    expect(moetruyen_connector.downloadChapter).toHaveBeenCalled();
    expect(actual_result.durationMs).toBeGreaterThanOrEqual(0);
    expect(actual_result.steps.listing).toBeDefined();
    expect(actual_result.steps.listing.ok).toBe(true);
    expect(actual_result.steps.chapters).toBeDefined();
    expect(actual_result.steps.chapters.ok).toBe(true);
    expect(actual_result.steps.chapters.chapterCount).toBe(2);
    expect(actual_result.steps.download).toBeDefined();
    expect(actual_result.testDetails).toBeDefined();
    expect(actual_result.testDetails.mangaTitle).toBe('Test Manga');
    expect(actual_result.testDetails.mangaUrl).toBe('https://moetruyen.net/manga/41-dau-bep-tru-danh');
    expect(actual_result.testDetails.chapterTitle).toBe('Chapter 2');
    expect(actual_result.testDetails.chapterUrl).toBe('https://moetruyen.net/chapter/2');
  });

  it('should stop at step 1 if listing fails', async () => {
    moetruyen_connector.fetchLatestUpdates.mockResolvedValue({ ok: false, error: 'Parse error' });
    fetchHtml.mockResolvedValue({ ok: false, error: 'Network error' });

    const actual_result = await runConnectorTest('moetruyen');
    expect(actual_result.ok).toBe(false);
    expect(actual_result.steps.listing).toBeDefined();
    expect(actual_result.steps.listing.ok).toBe(false);
    expect(actual_result.steps.chapters).toBeUndefined();
    expect(actual_result.steps.download).toBeUndefined();
    expect(moetruyen_connector.load).not.toHaveBeenCalled();
  });

  it('should stop at step 2 if load() fails', async () => {
    moetruyen_connector.fetchLatestUpdates.mockResolvedValue({
      ok: true,
      items: [{ mangaUrl: 'https://moetruyen.net/manga/broken' }],
    });
    moetruyen_connector.load.mockResolvedValue({ ok: false, error: 'Page not found' });

    const actual_result = await runConnectorTest('moetruyen');
    expect(actual_result.ok).toBe(false);
    expect(actual_result.steps.listing.ok).toBe(true);
    expect(actual_result.steps.chapters.ok).toBe(false);
    expect(actual_result.steps.chapters.error).toContain('Page not found');
    expect(actual_result.steps.download).toBeUndefined();
    expect(moetruyen_connector.downloadChapter).not.toHaveBeenCalled();
  });

  it('should stop at step 2 if load() returns 0 chapters', async () => {
    moetruyen_connector.fetchLatestUpdates.mockResolvedValue({
      ok: true,
      items: [{ mangaUrl: 'https://moetruyen.net/manga/empty' }],
    });
    moetruyen_connector.load.mockResolvedValue({
      ok: true,
      manga: { title: 'Empty', mangaUrl: 'https://moetruyen.net/manga/empty', coverUrl: '' },
      chapters: [],
    });

    const actual_result = await runConnectorTest('moetruyen');
    expect(actual_result.ok).toBe(false);
    expect(actual_result.steps.listing.ok).toBe(true);
    expect(actual_result.steps.chapters.ok).toBe(false);
    expect(actual_result.steps.chapters.chapterCount).toBe(0);
  });

  it('should use fetchHtml fallback for listing if fetchLatestUpdates fails', async () => {
    moetruyen_connector.fetchLatestUpdates.mockResolvedValue({ ok: false, error: 'Parse error' });
    fetchHtml.mockResolvedValue({ ok: true, html: '<html></html>' });
    moetruyen_connector.load.mockResolvedValue({
      ok: true,
      manga: { title: 'Test', mangaUrl: 'https://moetruyen.net/', coverUrl: '' },
      chapters: [{ url: 'https://moetruyen.net/ch/1', title: 'Ch 1' }],
    });
    mockAbortedDownload(moetruyen_connector);

    const actual_result = await runConnectorTest('moetruyen');
    expect(actual_result.steps.listing.ok).toBe(true);
    expect(fetchHtml).toHaveBeenCalledWith('https://moetruyen.net/', expect.any(Object));
  });

  it('should use fetchHtml directly for connectors without fetchLatestUpdates', async () => {
    fetchHtml.mockResolvedValue({ ok: true, html: '<html></html>' });
    chapvn_connector.load.mockResolvedValue({
      ok: true,
      manga: { title: 'Test', mangaUrl: 'https://chapvn.com/', coverUrl: '' },
      chapters: [{ url: 'https://chapvn.com/ch/1', title: 'Ch 1' }],
    });
    mockAbortedDownload(chapvn_connector);

    const actual_result = await runConnectorTest('chapvn');
    expect(actual_result.steps.listing.ok).toBe(true);
    expect(fetchHtml).toHaveBeenCalledWith('https://chapvn.com/', expect.any(Object));
  });

  it('should recover listing.ok when homepage fetchHtml fails but load succeeds', async () => {
    delete chapvn_connector.testConnection;
    chapvn_connector.requiresVpn = false;
    fetchHtml.mockResolvedValue({ ok: false, error: 'homepage timeout' });
    chapvn_connector.load.mockResolvedValue({
      ok: true,
      manga: { title: 'Test', mangaUrl: 'https://chap.vn/forums/128/', coverUrl: '' },
      chapters: [{ url: 'https://chap.vn/ch/1', title: 'Ch 1' }],
    });
    mockAbortedDownload(chapvn_connector);

    const actual_result = await runConnectorTest('chapvn');
    expect(actual_result.steps.listing.ok).toBe(true);
    expect(actual_result.steps.listing.error).toBeUndefined();
    expect(actual_result.steps.chapters.ok).toBe(true);
    chapvn_connector.requiresVpn = true;
  });

  it('should return VPN error suggestion on timeout/network failure if site requires VPN', async () => {
    fetchHtml.mockResolvedValue({ ok: false, error: 'fetch failed' });
    chapvn_connector.load.mockRejectedValue(new Error('fetch failed'));

    const actual_result = await runConnectorTest('chapvn');
    expect(actual_result.ok).toBe(false);
    expect(actual_result.error).toContain('VPN');
  });

  it('should return VPN error suggestion on timeout/network failure if site suggests VPN', async () => {
    chapvn_connector.requiresVpn = false;
    chapvn_connector.suggestsVpn = true;
    fetchHtml.mockResolvedValue({ ok: false, error: 'fetch failed' });
    chapvn_connector.load.mockRejectedValue(new Error('fetch failed'));

    const actual_result = await runConnectorTest('chapvn');
    expect(actual_result.ok).toBe(false);
    expect(actual_result.error).toContain('VPN');
    expect(actual_result.error).toContain('chặn bởi một số nhà mạng');

    chapvn_connector.requiresVpn = true;
    delete chapvn_connector.suggestsVpn;
  });

  it('should return Cookie error suggestion on HTTP 403/401 if site requires Cookie', async () => {
    moetruyen_connector.fetchLatestUpdates.mockResolvedValue({ ok: false, error: 'HTTP 403' });
    fetchHtml.mockResolvedValue({ ok: false, error: 'HTTP 403' });

    const actual_result = await runConnectorTest('moetruyen');
    expect(actual_result.ok).toBe(false);
    expect(actual_result.error).toContain('Cookie');
  });

  it('should test via custom testConnection method if defined', async () => {
    chapvn_connector.testConnection = jest.fn().mockResolvedValue({ ok: true });

    const actual_result = await runConnectorTest('chapvn', 'https://customdomain.com');
    expect(actual_result.ok).toBe(true);
    expect(actual_result.steps.custom).toBeDefined();
    expect(actual_result.steps.custom.ok).toBe(true);
    expect(chapvn_connector.testConnection).toHaveBeenCalledWith('https://customdomain.com');

    delete chapvn_connector.testConnection;
  });

  it('should return steps object in all responses', async () => {
    const missing_result = await runConnectorTest('non-existent');
    expect(missing_result.steps).toBeDefined();

    chapvn_connector.testConnection = jest.fn().mockResolvedValue({ ok: false, error: 'test fail' });
    const custom_result = await runConnectorTest('chapvn');
    expect(custom_result.steps).toBeDefined();
    expect(custom_result.steps.custom).toBeDefined();
    delete chapvn_connector.testConnection;

    fetchHtml.mockResolvedValue({ ok: false, error: 'err' });
    const listing_result = await runConnectorTest('chapvn');
    expect(listing_result.steps).toBeDefined();
    expect(listing_result.steps.listing).toBeDefined();
  });

  it('should pick the last chapter for download test', async () => {
    moetruyen_connector.fetchLatestUpdates.mockResolvedValue({
      ok: true,
      items: [{ mangaUrl: 'https://moetruyen.net/manga/test' }],
    });
    moetruyen_connector.load.mockResolvedValue({
      ok: true,
      manga: { title: 'Test', mangaUrl: 'https://moetruyen.net/manga/test', coverUrl: '' },
      chapters: [
        { url: 'https://moetruyen.net/chapter/1', title: 'Chapter 1' },
        { url: 'https://moetruyen.net/chapter/50', title: 'Chapter 50' },
        { url: 'https://moetruyen.net/chapter/100', title: 'Chapter 100' },
      ],
    });
    mockAbortedDownload(moetruyen_connector);

    await runConnectorTest('moetruyen');

    const chapter_call = moetruyen_connector.downloadChapter.mock.calls[0][0];
    expect(chapter_call.chapterUrl).toBe('https://moetruyen.net/chapter/100');
    expect(chapter_call.chapterTitle).toBe('Chapter 100');
    expect(chapter_call.numberOfThreads).toBe(1);
  });

  it('should pick Chapter 1 (chapters[0]) for comicdays download test to avoid paid/locked episodes', async () => {
    fetchHtml.mockResolvedValue({
      ok: true,
      html: '<html><body></body></html>',
    });
    comicdays_connector.load.mockResolvedValue({
      ok: true,
      manga: { title: 'ComicDays Test', mangaUrl: 'https://comic-days.com/episode/13932016480029480667', coverUrl: '' },
      chapters: [
        { url: 'https://comic-days.com/episode/1', title: '第1話' },
        { url: 'https://comic-days.com/episode/100', title: '第100話 [有料]' },
      ],
    });
    mockAbortedDownload(comicdays_connector);

    await runConnectorTest('comicdays', 'https://comic-days.com/episode/13932016480029480667');

    const chapter_call = comicdays_connector.downloadChapter.mock.calls[0][0];
    expect(chapter_call.chapterUrl).toBe('https://comic-days.com/episode/1');
    expect(chapter_call.chapterTitle).toBe('第1話');
  });

  it('should use catalog testUrl for deep test when listing returns empty', async () => {
    fetchHtml.mockResolvedValue({
      ok: true,
      html: '<html><body></body></html>',
    });
    chapvn_connector.load.mockResolvedValue({
      ok: true,
      manga: { title: 'ChapVn Test Manga', mangaUrl: 'https://chap.vn/forums/128/', coverUrl: '' },
      chapters: [{ url: 'https://chap.vn/forums/128/ch1', title: 'Chapter 1' }],
    });
    chapvn_connector.downloadChapter.mockResolvedValue({ ok: true });

    const actual_result = await runConnectorTest('chapvn');
    expect(chapvn_connector.load).toHaveBeenCalledWith(
      'https://chap.vn/forums/128/',
      expect.any(Object),
    );
    expect(actual_result.testDetails.mangaUrl).toBe('https://chap.vn/forums/128/');
  });

  it('skips download when catalog skipSteps includes download', async () => {
    fetchHtml.mockResolvedValue({ ok: true, html: '<html></html>' });
    dtvebook_connector.load.mockResolvedValue({
      ok: true,
      manga: {
        title: 'Than Dong',
        mangaUrl: 'https://dtv-ebook.com.vn/than-dong-kiem-si_26874.html',
        coverUrl: '',
      },
      chapters: [{ url: 'https://dtv-ebook.com.vn/ch/1', title: 'Ch 1' }],
    });

    const actual_result = await runConnectorTest('dtvebook');
    expect(actual_result.ok).toBe(true);
    expect(actual_result.steps.download.ok).toBe(true);
    expect(dtvebook_connector.downloadChapter).not.toHaveBeenCalled();
  });

  it('should fallback to candidate live manga when defaultTestUrl fails', async () => {
    moetruyen_connector.fetchLatestUpdates.mockResolvedValue({
      ok: true,
      items: [{ mangaUrl: 'https://moetruyen.net/manga/live-working-manga' }],
    });
    // First call (default test url) fails, second call (candidate live manga) succeeds
    moetruyen_connector.load
      .mockResolvedValueOnce({ ok: false, error: 'HTTP 404' })
      .mockResolvedValueOnce({
        ok: true,
        manga: { title: 'Live Manga', mangaUrl: 'https://moetruyen.net/manga/live-working-manga', coverUrl: '' },
        chapters: [{ url: 'https://moetruyen.net/chapter/live-1', title: 'Chapter 1' }],
      });
    mockAbortedDownload(moetruyen_connector);

    const actual_result = await runConnectorTest('moetruyen');
    expect(actual_result.ok).toBe(true);
    expect(actual_result.steps.chapters.ok).toBe(true);
    expect(actual_result.testDetails.mangaTitle).toBe('Live Manga');
    expect(actual_result.testDetails.mangaUrl).toBe('https://moetruyen.net/manga/live-working-manga');
  });

  it('should auto-discover manga url from homepage if listing is empty and defaultTestUrl fails', async () => {
    chapvn_connector.fetchLatestUpdates = undefined; // no listing
    fetchHtml.mockResolvedValue({
      ok: true,
      html: '<html><body><a href="/forums/129-live-manga/">Live Link</a></body></html>',
    });

    chapvn_connector.load
      .mockResolvedValueOnce({ ok: false, error: 'HTTP 404' }) // defaultTestUrl fails
      .mockResolvedValueOnce({
        ok: true,
        manga: { title: 'Discovered Manga', mangaUrl: 'https://chap.vn/forums/129-live-manga/', coverUrl: '' },
        chapters: [{ url: 'https://chap.vn/forums/129-live-manga/c1', title: 'Chapter 1' }],
      });
    mockAbortedDownload(chapvn_connector);

    const actual_result = await runConnectorTest('chapvn');
    expect(actual_result.ok).toBe(true);
    expect(actual_result.steps.chapters.ok).toBe(true);
    expect(actual_result.testDetails.mangaTitle).toBe('Discovered Manga');
  });
});
