const supabaseGuestCredits = require('../../auth/supabaseGuestCredits');

describe('supabaseGuestCredits', () => {
  const oldEnv = { ...process.env };
  const oldFetch = global.fetch;

  beforeEach(() => {
    process.env = { ...oldEnv };
    global.fetch = jest.fn();
  });

  afterAll(() => {
    process.env = oldEnv;
    global.fetch = oldFetch;
  });

  test('does not bypass credit ensure for premium member without app entitlement', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    global.fetch.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          ok: true,
          email: 'user@example.com',
          userType: 'Premium Member',
          entitlements: [],
          remainingTokens: 123,
        }),
    });

    const result = await supabaseGuestCredits.ensureFreeUserCreditsByEmail({
      email: 'User@Example.com',
      userType: 'Free',
      accessToken: 'user-token',
    });

    expect(result).toEqual({ ok: true, email: 'user@example.com', remainingTokens: 123 });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.supabase.co/functions/v1/resolve-user-profile',
      expect.objectContaining({
        headers: expect.objectContaining({
          apikey: 'anon-key',
          Authorization: 'Bearer user-token',
        }),
      })
    );
  });

  test('requests 300 default tokens when ensuring free-user credits', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    global.fetch.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        ok: true,
        email: 'free@example.com',
        userType: 'Free',
        remainingTokens: 300,
      }),
    });

    const result = await supabaseGuestCredits.ensureFreeUserCreditsByEmail({
      email: 'free@example.com',
      userType: 'Free',
      accessToken: 'user-token',
    });

    expect(result.ok).toBe(true);
    expect(result.remainingTokens).toBe(300);
    const requestInit = global.fetch.mock.calls[0][1];
    expect(JSON.parse(requestInit.body)).toEqual({ defaultTokens: 300 });
  });


  test('requires public Supabase config before calling edge functions', async () => {
    jest.resetModules();
    jest.doMock('../../platform/connectors/api-clients/supabaseEmbeddedConfig', () => ({
      embedded_supabase_url: '',
      embedded_supabase_anon_key: '',
    }));
    const creditsNoConfig = require('../../auth/supabaseGuestCredits');
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.VITE_SUPABASE_ANON_KEY;
    delete process.env.VITE_SUPABASE_URL;

    const result = await creditsNoConfig.consumeFreeUserDownloadCredit({
      email: 'user@example.com',
      userType: 'Free',
      impliedSupabaseFree: true,
      accessToken: 'user-token',
      mangaUrl: 'https://manga.example/title',
      chapterUrl: 'https://manga.example/chapter-1',
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('SUPABASE_NOT_CONFIGURED');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('consumes free credit through authenticated edge function', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co/';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    global.fetch.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ ok: true, needLogin: false, remainingTokens: 42 }),
    });

    const result = await supabaseGuestCredits.consumeFreeUserDownloadCredit({
      email: 'user@example.com',
      userType: 'Free',
      impliedSupabaseFree: true,
      accessToken: 'user-token',
      mangaUrl: 'https://manga.example/title',
      chapterUrl: 'https://manga.example/chapter-1',
    });

    expect(result).toEqual({
      ok: true,
      needLogin: false,
      remainingTokens: 42,
      email: 'user@example.com',
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.supabase.co/functions/v1/consume-free-credit',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          apikey: 'anon-key',
          Authorization: 'Bearer user-token',
        }),
      })
    );
  });

  test('does not bypass consume for super member with only catalog year 1 entitlement', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co/';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    global.fetch.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ ok: true, needLogin: false, remainingTokens: 77 }),
    });

    const result = await supabaseGuestCredits.consumeFreeUserDownloadCredit({
      email: 'user@example.com',
      userType: 'Super Member',
      impliedSupabaseFree: false,
      entitlements: [{ packageKey: 'catalog_y1', expiresAt: null }],
      accessToken: 'user-token',
      mangaUrl: 'https://manga.example/title',
      chapterUrl: 'https://manga.example/chapter-1',
    });

    expect(result).toEqual({
      ok: true,
      needLogin: false,
      remainingTokens: 77,
      email: 'user@example.com',
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('bypasses consume when app entitlement is active', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co/';
    process.env.SUPABASE_ANON_KEY = 'anon-key';

    const result = await supabaseGuestCredits.consumeFreeUserDownloadCredit({
      email: 'user@example.com',
      userType: 'Premium Member',
      impliedSupabaseFree: false,
      entitlements: [{ packageKey: 'app', expiresAt: null }],
      accessToken: 'user-token',
      mangaUrl: 'https://manga.example/title',
      chapterUrl: 'https://manga.example/chapter-1',
    });

    expect(result).toEqual({ ok: true, skipped: true, reason: 'MEMBER_BYPASS' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('bypasses ensure when session is admin', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    global.fetch.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          ok: true,
          email: 'user@example.com',
          userType: 'Free',
          entitlements: [],
          isAdmin: true,
        }),
    });

    const result = await supabaseGuestCredits.ensureFreeUserCreditsByEmail({
      email: 'User@Example.com',
      userType: 'Free',
      isAdmin: true,
      accessToken: 'user-token',
    });

    expect(result).toEqual({
      ok: true,
      skipped: true,
      reason: 'MEMBER_BYPASS',
      email: 'user@example.com',
    });
  });
});
