import { applyChapterResult, buildRetryLogMessage } from './applyChapterResult.js';

describe('applyChapterResult', () => {
  const base = { id: '1', status: 'downloading', retryCount: 0 };

  test('success clears downloadError and marks done', () => {
    const chapter = { ...base, downloadError: 'old' };
    expect(applyChapterResult(chapter, true, '', 3)).toEqual({
      id: '1',
      status: 'done',
      retryCount: 0,
    });
  });

  test('failure below autoRetryMax returns waiting and increments retryCount', () => {
    expect(applyChapterResult(base, false, 'net', 3)).toEqual({
      id: '1',
      status: 'waiting',
      retryCount: 1,
    });
  });

  test('failure at autoRetryMax marks done with downloadError (not status error)', () => {
    const chapter = { ...base, retryCount: 3 };
    expect(applyChapterResult(chapter, false, 'net', 3)).toEqual({
      id: '1',
      status: 'done',
      retryCount: 3,
      downloadError: 'net',
    });
  });

  test('missing retryCount treats as 0', () => {
    const chapter = { id: '1', status: 'downloading' };
    expect(applyChapterResult(chapter, false, 'x', 1).retryCount).toBe(1);
  });

  test('attaches errorMeta fields on final failure and ignores them during auto-retry', () => {
    const retrying = applyChapterResult(
      { id: '1', status: 'downloading', retryCount: 0 },
      false,
      'timeout',
      2,
      { at: '2026-11-24T10:00:00.000Z', successCount: 3, totalPages: 10, failedPageIndices: [4, 5] }
    );
    expect(retrying).toEqual({
      id: '1',
      status: 'waiting',
      retryCount: 1,
    });

    const finalFail = applyChapterResult(
      { id: '1', status: 'downloading', retryCount: 2 },
      false,
      'timeout',
      2,
      { at: '2026-11-24T10:00:00.000Z', successCount: 3, totalPages: 10, failedPageIndices: [4, 5] }
    );
    expect(finalFail).toEqual({
      id: '1',
      status: 'done',
      retryCount: 2,
      downloadError: 'timeout',
      errorAt: '2026-11-24T10:00:00.000Z',
      successCount: 3,
      totalPages: 10,
      failedPageIndices: [4, 5],
    });
  });

  test('success strips errorMeta fields along with downloadError', () => {
    const chapter = {
      id: '1',
      status: 'downloading',
      retryCount: 2,
      downloadError: 'old',
      errorAt: '2026-11-24T10:00:00.000Z',
      successCount: 3,
      totalPages: 10,
      failedPageIndices: [4, 5],
    };
    expect(applyChapterResult(chapter, true, '', 2)).toEqual({
      id: '1',
      status: 'done',
      retryCount: 0,
    });
  });

  test('final failure strips stale errorMeta fields when new errorMeta omits them', () => {
    const chapter = {
      id: '1',
      status: 'downloading',
      retryCount: 2,
      downloadError: 'old',
      errorAt: '2026-11-23T10:00:00.000Z',
      successCount: 3,
      totalPages: 10,
      failedPageIndices: [4, 5],
    };
    expect(applyChapterResult(chapter, false, 'new err', 2)).toEqual({
      id: '1',
      status: 'done',
      retryCount: 2,
      downloadError: 'new err',
    });
  });
});

describe('buildRetryLogMessage', () => {
  test('calls t with app.log.retryChapter and params', () => {
    const t = (key, params) => `${key}:${JSON.stringify(params)}`;
    expect(buildRetryLogMessage(t, 'M', 'C', 2, 5)).toBe(
      'app.log.retryChapter:{"retryCount":2,"maxRetry":5,"mangaTitle":"M","chapterTitle":"C"}'
    );
  });
});
