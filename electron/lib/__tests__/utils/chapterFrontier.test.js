const {
  highestDownloadedChapterNumber,
  countChaptersNewerThan,
  remoteChaptersAfterLatestLocalDownload,
  newestDownloadedChapterIndexInRemote,
  pendingNewChapterCount,
} = require('../../library/chapterFrontier');

describe('chapterFrontier (mobile parity)', () => {
  test('highestDownloadedChapterNumber ignores list order', () => {
    expect(
      highestDownloadedChapterNumber(['Chapter 1', 'Chapter 10', 'Chapter 100']),
    ).toBe(100);
  });

  test('countChaptersNewerThan counts only chapters above local frontier', () => {
    const local = ['Chương 1', 'Ch. 10', 'chapter 100'];
    const remote = [
      { title: 'Chương 1', url: 'u1' },
      { title: 'Chap 50', url: 'u50' },
      { title: 'Chapter 100', url: 'u100' },
      { title: 'Ch. 100.1', url: 'u1001' },
      { title: 'Ch. 100.10', url: 'u10010' },
      { title: 'Chapter 101', url: 'u101' },
    ];
    expect(countChaptersNewerThan(highestDownloadedChapterNumber(local), remote)).toBe(3);
  });

  test('remoteChaptersAfterLatestLocalDownload uses chapter numbers', () => {
    const local = ['Chapter 1', 'Chapter 100'];
    const remote = [
      { title: 'Chapter 50', url: 'u50' },
      { title: 'Chapter 101', url: 'u101' },
    ];
    expect(
      remoteChaptersAfterLatestLocalDownload(local, remote).map((c) => c.title),
    ).toEqual(['Chapter 101']);
  });

  test('newestDownloadedChapterIndexInRemote is not used when numbers parse', () => {
    const local = ['Chapter 1', 'Chapter 100'];
    const remote = [
      { title: 'Chapter 1', url: 'u1' },
      { title: 'Chapter 100', url: 'u100' },
    ];
    expect(newestDownloadedChapterIndexInRemote(local, remote)).toBe(1);
    expect(highestDownloadedChapterNumber(local)).toBe(100);
    expect(pendingNewChapterCount(local, remote)).toBe(0);
  });
});
