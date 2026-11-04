const {
  buildCookieExtractFeedback,
  resolveCookieExtractTargetUrl,
} = require('../platform/cookies/cookieExtractFeedback');

function t(key, params) {
  if (params && params.n != null) return `${key}:${params.n}`;
  return key;
}

describe('cookieExtractFeedback', () => {
  test('error path', () => {
    const fb = buildCookieExtractFeedback({ error: 'boom', cookieCount: 2 }, t);
    expect(fb.type).toBe('error');
    expect(fb.message).toBe('boom');
  });

  test('empty cookies', () => {
    const fb = buildCookieExtractFeedback({ cookieCount: 0 }, t);
    expect(fb.type).toBe('error');
    expect(fb.title).toBe('sidebar.cookie.extractEmptyTitle');
  });

  test('guest session (cookies but not logged in)', () => {
    const fb = buildCookieExtractFeedback({ cookieCount: 3, loginDetected: false }, t);
    expect(fb.type).toBe('warning');
    expect(fb.message).toBe('sidebar.cookie.extractGuestMessage:3');
  });

  test('success when login detected or unknown', () => {
    expect(buildCookieExtractFeedback({ cookieCount: 2, loginDetected: true }, t).type).toBe(
      'success',
    );
    expect(buildCookieExtractFeedback({ cookieCount: 2 }, t).type).toBe('success');
  });

  test('resolveCookieExtractTargetUrl prefers matching source URL', () => {
    const home = 'https://comicvn19.net/';
    const chapter =
      'https://comicvn19.net/tuyet-dai-song-kieu/chapter-424-6a5ca179a11b6268195fd734.html';
    expect(resolveCookieExtractTargetUrl(chapter, home, ['comicvn'])).toBe(chapter);
    expect(resolveCookieExtractTargetUrl('https://other.com/x', home, ['comicvn'])).toBe(home);
    expect(resolveCookieExtractTargetUrl('', home, ['comicvn'])).toBe(home);
  });
});
