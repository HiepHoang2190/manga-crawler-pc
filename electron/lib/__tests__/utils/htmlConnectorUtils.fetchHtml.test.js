'use strict';

const { describe, it, expect, afterEach } = require('@jest/globals');

jest.mock('electron', () => ({
  app: { userAgentFallback: 'TestAgent/1.0' },
  session: {
    defaultSession: {
      cookies: {
        remove: jest.fn(async () => {}),
        set: jest.fn(async () => {}),
      },
    },
  },
}));

const { fetchHtml } = require('../../download/connector/htmlConnectorUtils');
const electron = require('electron');

describe('fetchHtml options.cookie', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    const cookieStore = electron.session.defaultSession.cookies;
    cookieStore.remove.mockReset();
    cookieStore.set.mockReset();
    cookieStore.remove.mockImplementation(async () => {});
    cookieStore.set.mockImplementation(async () => {});
  });

  it('includes Cookie header when options.cookie is non-empty', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => '<html></html>',
    }));

    await fetchHtml('https://example.com/page', { cookie: 'session=abc' });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com/page',
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie: 'session=abc',
        }),
      }),
    );
  });

  it('omits Cookie header when options.cookie is empty', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => '<html></html>',
    }));

    await fetchHtml('https://example.com/page', { referer: 'https://example.com/' });

    const call = global.fetch.mock.calls[0];
    expect(call[1].headers.Cookie).toBeUndefined();
  });

  it('removes the existing session cookie before writing the saved value', async () => {
    const cookieStore = electron.session.defaultSession.cookies;
    const callOrder = [];
    cookieStore.remove.mockImplementation(async (cookieUrl, cookieName) => {
      callOrder.push(`remove:${cookieName}@${cookieUrl}`);
    });
    cookieStore.set.mockImplementation(async (cookie) => {
      callOrder.push(`set:${cookie.name}=${cookie.value}@${cookie.url}`);
      const removed = callOrder.some((entry) => entry.startsWith(`remove:${cookie.name}@`));
      if (!removed) {
        throw new Error(
          'Failed to set cookie - The cookie would have overwritten an HttpOnly cookie',
        );
      }
    });
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => '<html></html>',
    }));

    await fetchHtml('https://moetruyen.net/manga/87/chapters/43', {
      cookie: 'bfang.sid=saved-login; cf_clearance=clear',
      preferChromiumNet: true,
    });

    expect(callOrder).toEqual([
      'remove:bfang.sid@https://moetruyen.net',
      'set:bfang.sid=saved-login@https://moetruyen.net',
      'remove:cf_clearance@https://moetruyen.net',
      'set:cf_clearance=clear@https://moetruyen.net',
    ]);
  });

  it('sends POST body and Content-Type when method is POST', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => '<li>ok</li>',
    }));

    await fetchHtml('https://example.com/search', {
      method: 'POST',
      body: 'search=test',
      contentType: 'application/x-www-form-urlencoded',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com/search',
      expect.objectContaining({
        method: 'POST',
        body: 'search=test',
        headers: expect.objectContaining({
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest',
        }),
      }),
    );
  });
});
