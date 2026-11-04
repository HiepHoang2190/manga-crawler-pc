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
});

describe('buildRetryLogMessage', () => {
  test('calls t with app.log.retryChapter and params', () => {
    const t = (key, params) => `${key}:${JSON.stringify(params)}`;
    expect(buildRetryLogMessage(t, 'M', 'C', 2, 5)).toBe(
      'app.log.retryChapter:{"retryCount":2,"maxRetry":5,"mangaTitle":"M","chapterTitle":"C"}'
    );
  });
});
