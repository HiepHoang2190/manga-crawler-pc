import {
  parseSiteCookieStatus,
  connectorHasSavedCookie,
  filterSitesWithSavedCookie,
} from './useSiteCookie.js';

describe('parseSiteCookieStatus', () => {
  test('defaults to zero stored length and send-on when status is empty', () => {
    expect(parseSiteCookieStatus({}, 'comicvn')).toEqual({
      stored_cookie_len: 0,
      cookie_send_on: true,
      effective_cookie_len: 0,
    });
  });

  test('reads stored length and send flag for the siteId', () => {
    expect(
      parseSiteCookieStatus(
        { comicvn: 12, comicvn_cookieSend: false, other: 99 },
        'comicvn',
      ),
    ).toEqual({
      stored_cookie_len: 12,
      cookie_send_on: false,
      effective_cookie_len: 0,
    });
  });

  test('effective length equals stored length when send is on', () => {
    expect(parseSiteCookieStatus({ comicvn: 12 }, 'comicvn').effective_cookie_len).toBe(12);
  });
});

describe('filterSitesWithSavedCookie', () => {
  const comicvn = { id: 'comicvn', label: 'ComicVN' };
  const goc = { id: 'goc', label: 'GocTruyen' };
  const other = { id: 'other', label: 'Other' };

  test('keeps sites with stored cookie length > 0', () => {
    expect(filterSitesWithSavedCookie([comicvn, other], { comicvn: 4 })).toEqual([comicvn]);
  });

  test('ignores leftover auth-token keys when listing saved cookies', () => {
    expect(filterSitesWithSavedCookie([goc, other], { goc_auth: 20 })).toEqual([]);
  });

  test('sorts remaining sites by label', () => {
    const zeta = { id: 'zeta', label: 'Zeta' };
    const alpha = { id: 'alpha', label: 'Alpha' };
    expect(filterSitesWithSavedCookie([zeta, alpha], { zeta: 1, alpha: 1 }).map((c) => c.id)).toEqual([
      'alpha',
      'zeta',
    ]);
  });
});

describe('connectorHasSavedCookie', () => {
  test('ignores leftover auth-token length keys', () => {
    expect(connectorHasSavedCookie({ id: 'x' }, { x_auth: 9 })).toBe(false);
  });
});
