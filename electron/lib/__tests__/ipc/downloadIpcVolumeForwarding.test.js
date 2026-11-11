const mockHandlers = new Map();
jest.mock('electron', () => ({
  app: { getPath: () => '/mock/userData' },
  ipcMain: {
    handle: (channel, handler) => {
      mockHandlers.set(channel, handler);
    },
    on: () => {},
  },
}));

// Mock connectors
const mockDownloadChapter = jest.fn().mockResolvedValue({ ok: true });
jest.mock('../../../lib/platform/connectors', () => ({
  downloadChapter: (...args) => mockDownloadChapter(...args),
}));

describe('Download IPC Volume and Setting Forwarding', () => {
  beforeEach(() => {
    mockHandlers.clear();
    mockDownloadChapter.mockClear();
    const { registerDownloadIpc } = require('../../../ipc/download');
    registerDownloadIpc({
      setAbortRequested: () => {},
      isAbortRequested: () => false,
      sendLog: () => {},
      sendDownloadProgress: () => {},
      getChapterFolderSettings: () => ({ mode: 'numbered' }),
    });
  });

  test('manga:downloadChapter forwards volume, mangadexVolumeFolderGrouping, and prefetchChapterUrls to connectors', async () => {
    const handler = mockHandlers.get('manga:downloadChapter');
    expect(typeof handler).toBe('function');

    const payload = {
      site: 'mangadex',
      mangaTitle: 'Itoko no Ko',
      mangaUrl: 'https://mangadex.org/title/8cd657d2-fa8c-4927-b884-44952fe5fbd1',
      chapterUrl: 'https://mangadex.org/chapter/270a8f08-f85a-4e1d-ada1-a57a28a47895',
      chapterTitle: 'Chapter 34',
      volume: '4',
      mangadexVolumeFolderGrouping: true,
      baseSaveDir: '/mock/downloads',
      numberOfThreads: 3,
      coverUrl: null,
      mangadexLanguage: 'vi',
      prefetchChapterUrls: ['https://mangadex.org/chapter/next'],
    };

    await handler({}, payload);

    expect(mockDownloadChapter).toHaveBeenCalledTimes(1);
    const [site, forwardedPayload] = mockDownloadChapter.mock.calls[0];
    expect(site).toBe('mangadex');
    expect(forwardedPayload.volume).toBe('4');
    expect(forwardedPayload.mangadexVolumeFolderGrouping).toBe(true);
    expect(forwardedPayload.prefetchChapterUrls).toEqual(['https://mangadex.org/chapter/next']);
  });
});
