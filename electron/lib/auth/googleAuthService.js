/**
 * Đăng nhập Google qua Supabase Auth, membership/type lưu trên Supabase:
 * - SUPABASE_URL + SUPABASE_ANON_KEY dùng cho OAuth PKCE và Edge Functions
 * - Type: Free | Member | Admin
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const {
  embedded_supabase_url,
  embedded_supabase_anon_key,
} = require('../platform/connectors/api-clients/supabaseEmbeddedConfig');
const { hasApp } = require('./packageEntitlements');

const TYPE_FREE = 'Free';
const TYPE_MEMBER = 'Member';
/** Cột P/Q: Admin — toàn quyền app. */
const TYPE_ADMIN = 'Admin';
const SUPABASE_OAUTH_CALLBACK_PATH = '/oauth2callback';
const SUPABASE_SESSION_REFRESH_SKEW_MS = 60 * 1000;

function getSupabaseUrl() {
  return String(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || embedded_supabase_url,
  )
    .trim()
    .replace(/\/+$/, '');
}

function getSupabaseAnonKey() {
  return String(
    process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      embedded_supabase_anon_key,
  ).trim();
}

function getSupabaseConfig() {
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  if (!url || !anonKey) {
    return {
      ok: false,
      error: 'Supabase chưa cấu hình (thiếu SUPABASE_URL hoặc SUPABASE_ANON_KEY).',
    };
  }
  return { ok: true, url, anonKey };
}

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
}

function createSupabaseAuthClient() {
  const config = getSupabaseConfig();
  if (!config.ok) return config;
  return {
    ok: true,
    client: createClient(config.url, config.anonKey, {
      auth: {
        flowType: 'pkce',
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storage: createMemoryStorage(),
      },
    }),
  };
}

function buildFunctionUrl(functionName) {
  const baseUrl = getSupabaseUrl();
  return `${baseUrl}/functions/v1/${functionName}`;
}

function normalizeProfileSession({ authSession, profile }) {
  const user = authSession?.user || {};
  const email = String(profile?.email || user.email || '').trim().toLowerCase();
  const userType = String(profile?.userType || 'Free').trim() || TYPE_FREE;
  const entitlement_rows = Array.isArray(profile?.entitlements) ? profile.entitlements : [];
  const is_admin = Boolean(profile?.isAdmin) || userType === TYPE_ADMIN;
  return {
    email,
    userType,
    entitlements: entitlement_rows,
    isAdmin: is_admin,
    impliedSupabaseFree: Boolean(
      profile?.impliedSupabaseFree ?? !hasApp({ entitlements: entitlement_rows, isAdmin: is_admin, userType }),
    ),
    remainingTokens: Number.isFinite(Number(profile?.remainingTokens)) ? Number(profile.remainingTokens) : undefined,
    accessToken: authSession?.access_token || '',
    refreshToken: authSession?.refresh_token || '',
    expiresAt: authSession?.expires_at || null,
    providerToken: authSession?.provider_token || '',
    createdAt: user.created_at || null,
    savedAt: new Date().toISOString(),
  };
}

async function callProfileFunction(accessToken) {
  const config = getSupabaseConfig();
  if (!config.ok) return config;
  if (!accessToken) {
    return { ok: false, error: 'Thiếu Supabase access token.', code: 'NO_ACCESS_TOKEN' };
  }
  try {
    const res = await fetch(buildFunctionUrl('resolve-user-profile'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      body: '{}',
    });
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    if (!res.ok || !body?.ok) {
      return {
        ok: false,
        error:
          (body && typeof body === 'object' && (body.error || body.message)) ||
          `Supabase Edge Function HTTP ${res.status}`,
        code: body?.code || 'PROFILE_FUNCTION_FAILED',
      };
    }
    return { ok: true, profile: body };
  } catch (e) {
    return { ok: false, error: String(e?.message || e), code: 'PROFILE_FUNCTION_NETWORK_ERROR' };
  }
}

function writeSession(userDataPath, session) {
  fs.mkdirSync(userDataPath, { recursive: true });
  fs.writeFileSync(sessionFile(userDataPath), JSON.stringify(session, null, 2), 'utf8');
}

function isSupabaseSessionExpired(sess) {
  const expiresAtMs = Number(sess?.expiresAt || 0) * 1000;
  return Boolean(expiresAtMs && Date.now() >= expiresAtMs - SUPABASE_SESSION_REFRESH_SKEW_MS);
}

function sessionFile(userDataPath) {
  return path.join(userDataPath, 'google-auth-session.json');
}

let lastMembershipValidateAt = 0;
const MEMBERSHIP_VALIDATE_THROTTLE_MS = 10 * 60 * 1000;

/**
 * Gọi trước getSession (có throttle). force=true khi focus cửa sổ / bỏ qua throttle.
 * @returns {Promise<{ ok: boolean, reason?: string, throttled?: boolean, skipped?: boolean }>}
 */
async function maybeValidateMembershipSession(userDataPath, force = false) {
  if (!force && Date.now() - lastMembershipValidateAt < MEMBERSHIP_VALIDATE_THROTTLE_MS) {
    return { ok: true, throttled: true };
  }
  lastMembershipValidateAt = Date.now();
  return validateMembershipSession(userDataPath);
}

/**
 * Đối chiếu membership hiện tại trên Supabase và cập nhật session local nếu type thay đổi.
 * @returns {Promise<{ ok: true, skipped?: boolean } | { ok: false, reason: string }>}
 */
async function validateMembershipSession(userDataPath) {
  const sess = readSession(userDataPath);
  if (!sess?.refreshToken || !String(sess.email || '').trim()) {
    return { ok: true };
  }
  const next = await resolveAndPersistMembershipSession(userDataPath, sess, { forceRefresh: true });
  if (!next?.refreshToken) {
    return { ok: true, skipped: true };
  }
  return { ok: true };
}

const validateWhitelistSession = validateMembershipSession;
const maybeValidateWhitelistSession = maybeValidateMembershipSession;

/**
 * @param {import('electron').Shell} shell
 * @param {{ userDataPath: string, clearOAuth: boolean }} opts
 */
function loginWithGoogle(shell, { userDataPath, clearOAuth }) {
  if (clearOAuth) {
    try {
      const sf = sessionFile(userDataPath);
      if (fs.existsSync(sf)) fs.unlinkSync(sf);
    } catch {
      /* */
    }
  }

  const created = createSupabaseAuthClient();
  if (!created.ok) {
    return Promise.resolve({ ok: false, error: created.error });
  }
  const supabase = created.client;

  return new Promise((resolve) => {
    let settled = false;
    let timeoutId;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve(result);
    };

    const server = http.createServer(async (req, res) => {
      try {
        const host = req.headers.host || '127.0.0.1';
        const u = new URL(req.url || '/', `http://${host}`);
        if (u.pathname !== SUPABASE_OAUTH_CALLBACK_PATH) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404');
          return;
        }

        const code = u.searchParams.get('code');
        const errParam = u.searchParams.get('error');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(
          '<!DOCTYPE html><html><head><meta charset="utf-8"><title>OK</title></head><body style="font-family:system-ui,sans-serif;padding:24px">Đăng nhập xong. Bạn có thể đóng cửa sổ này.</body></html>'
        );

        if (errParam) {
          try {
            server.close();
          } catch {
            /* */
          }
          finish({ ok: false, error: errParam });
          return;
        }
        if (!code) {
          try {
            server.close();
          } catch {
            /* */
          }
          finish({ ok: false, error: 'Không nhận được mã xác thực.' });
          return;
        }

        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error || !data?.session) {
          try {
            server.close();
          } catch {
            /* */
          }
          finish({ ok: false, error: error?.message || 'Đổi mã Supabase Auth thất bại.' });
          return;
        }

        const profileResult = await callProfileFunction(data.session.access_token);
        if (!profileResult.ok) {
          try {
            server.close();
          } catch {
            /* */
          }
          finish({ ok: false, error: profileResult.error || 'Đồng bộ membership Supabase thất bại.' });
          return;
        }

        const session = normalizeProfileSession({
          authSession: data.session,
          profile: profileResult.profile,
        });
        try {
          writeSession(userDataPath, session);
        } catch (e) {
          try {
            server.close();
          } catch {
            /* */
          }
          finish({ ok: false, error: `Lưu phiên lỗi: ${e.message}` });
          return;
        }

        try {
          server.close();
        } catch {
          /* */
        }
        finish({ ok: true, email: session.email, userType: session.userType });
      } catch (e) {
        try {
          server.close();
        } catch {
          /* */
        }
        finish({ ok: false, error: String(e?.message || e) });
      }
    });

    timeoutId = setTimeout(() => {
      try {
        server.close();
      } catch {
        /* */
      }
      finish({ ok: false, error: 'Hết thời gian chờ (đóng trình duyệt hoặc không hoàn tất đăng nhập).' });
    }, 180000);

    server.on('error', (e) => {
      finish({ ok: false, error: String(e?.message || e) });
    });

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const redirectUri = `http://127.0.0.1:${port}${SUPABASE_OAUTH_CALLBACK_PATH}`;
      supabase.auth
        .signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: redirectUri,
            scopes: 'openid email',
            skipBrowserRedirect: true,
            queryParams: {
              access_type: 'offline',
              prompt: 'consent',
            },
          },
        })
        .then(({ data, error }) => {
          if (error || !data?.url) {
            try {
              server.close();
            } catch {
              /* */
            }
            finish({ ok: false, error: error?.message || 'Không tạo được URL đăng nhập Supabase.' });
            return;
          }
          shell.openExternal(data.url);
        })
        .catch((e) => {
          try {
            server.close();
          } catch {
            /* */
          }
          finish({ ok: false, error: String(e?.message || e) });
        });
    });
  });
}

function readSession(userDataPath) {
  try {
    const p = sessionFile(userDataPath);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

async function refreshSupabaseSession(sess) {
  if (!sess?.refreshToken) return { ok: false, error: 'NO_REFRESH_TOKEN' };
  const created = createSupabaseAuthClient();
  if (!created.ok) return created;
  try {
    const { data, error } = await created.client.auth.refreshSession({
      refresh_token: sess.refreshToken,
    });
    if (error || !data?.session) {
      return { ok: false, error: error?.message || 'Không làm mới được phiên Supabase.' };
    }
    return { ok: true, authSession: data.session };
  } catch (err) {
    return {
      ok: false,
      error: err && err.message ? err.message : 'Không kết nối được Supabase.',
    };
  }
}

async function resolveAndPersistMembershipSession(userDataPath, sess, { forceRefresh = false } = {}) {
  if (!sess?.refreshToken) return sess;
  let authSession = null;
  let accessToken = String(sess.accessToken || '').trim();

  if (forceRefresh || isSupabaseSessionExpired(sess) || !accessToken) {
    const refreshed = await refreshSupabaseSession(sess);
    if (!refreshed.ok) return sess;
    authSession = refreshed.authSession;
    accessToken = authSession.access_token;
  }

  const profileResult = await callProfileFunction(accessToken);
  if (!profileResult.ok) {
    if (!authSession) return sess;
    const next = {
      ...sess,
      accessToken: authSession.access_token || accessToken,
      refreshToken: authSession.refresh_token || sess.refreshToken,
      expiresAt: authSession.expires_at || sess.expiresAt,
      providerToken: authSession.provider_token || sess.providerToken,
      savedAt: new Date().toISOString(),
    };
    try {
      writeSession(userDataPath, next);
    } catch {
      /* */
    }
    return next;
  }

  const next = normalizeProfileSession({
    authSession: authSession || {
      access_token: accessToken,
      refresh_token: sess.refreshToken,
      expires_at: sess.expiresAt,
      provider_token: sess.providerToken,
      user: { email: sess.email },
    },
    profile: profileResult.profile,
  });

  // Preserve registration date from previous session when the refresh cycle
  // doesn't return a full Supabase user object (no created_at).
  if (!next.createdAt && sess.createdAt) next.createdAt = sess.createdAt;

  try {
    writeSession(userDataPath, next);
  } catch {
    /* */
  }
  return next;
}

async function getSessionEnriched(userDataPath) {
  const sess = readSession(userDataPath);
  if (!sess?.refreshToken) return sess;
  const hasResolvedMembership = String(sess.email || '').trim() && String(sess.userType || '').trim();
  const recentlyValidated = Date.now() - lastMembershipValidateAt < MEMBERSHIP_VALIDATE_THROTTLE_MS;
  if (hasResolvedMembership && recentlyValidated && !isSupabaseSessionExpired(sess)) {
    return sess;
  }
  lastMembershipValidateAt = Date.now();
  return resolveAndPersistMembershipSession(userDataPath, sess, { forceRefresh: false });
}

function logout(userDataPath) {
  try {
    const p = sessionFile(userDataPath);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {
    /* */
  }
  return { ok: true };
}

module.exports = {
  loginWithGoogle,
  readSession,
  getSessionEnriched,
  logout,
  sessionFile,
  validateMembershipSession,
  maybeValidateMembershipSession,
  validateWhitelistSession,
  maybeValidateWhitelistSession,
  TYPE_FREE,
  TYPE_MEMBER,
  TYPE_ADMIN,
};
