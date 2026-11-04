const {
  embedded_supabase_url,
  embedded_supabase_anon_key,
} = require('../platform/connectors/api-clients/supabaseEmbeddedConfig');
const { hasApp } = require('./packageEntitlements');

/** Must match resolve-user-profile + migration 20260818100000 (300). */
const DEFAULT_USER_TOKEN_MAX = 300;
const MEMBER_TYPES = new Set(['member', 'super member', 'premium member', 'admin']);

/**
 * Supabase credit: membership được quyết định server-side trong Supabase.
 * Renderer không còn là nguồn quyết định type khi ensure/consume credit.
 */
function isFreeUserTokenTier({ userType, impliedSupabaseFree, entitlements, isAdmin }) {
  if (hasApp({ userType, impliedSupabaseFree, entitlements, isAdmin })) return false;
  if (impliedSupabaseFree === true) return true;
  return String(userType || '').trim().toLowerCase() === 'free';
}

function getSupabaseUrl() {
  const url = String(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || embedded_supabase_url,
  ).trim();
  return url.replace(/\/+$/, '');
}

function getSupabaseAnonKey() {
  return String(
    process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      embedded_supabase_anon_key,
  ).trim();
}

function getSupabaseConfig() {
  const baseUrl = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  if (!baseUrl || !anonKey) {
    return {
      ok: false,
      error: 'Supabase chưa cấu hình (thiếu SUPABASE_URL hoặc SUPABASE_ANON_KEY).',
      code: 'SUPABASE_NOT_CONFIGURED',
    };
  }
  return { ok: true, baseUrl, anonKey };
}

function normalizeEmail(raw) {
  return String(raw || '').trim().toLowerCase();
}

function isMemberType(userType) {
  return MEMBER_TYPES.has(String(userType || '').trim().toLowerCase());
}

async function callEdgeFunction(functionName, accessToken, payload) {
  const config = getSupabaseConfig();
  if (!config.ok) return config;
  if (!accessToken) {
    return { ok: false, error: 'Bạn cần đăng nhập để dùng credit.', code: 'NO_AUTH_SESSION' };
  }
  const endpoint = `${config.baseUrl}/functions/v1/${functionName}`;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload || {}),
    });
    const bodyText = await res.text();
    let body = null;
    try {
      body = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      body = bodyText;
    }
    if (!res.ok) {
      return {
        ok: false,
        error:
          (body && typeof body === 'object' && (body.message || body.error_description || body.error)) ||
          `Supabase Edge Function HTTP ${res.status}`,
        code: (body && typeof body === 'object' && body.code) || 'SUPABASE_EDGE_FUNCTION_FAILED',
      };
    }
    return { ok: true, data: body };
  } catch (e) {
    return { ok: false, error: String(e?.message || e), code: 'SUPABASE_NETWORK_ERROR' };
  }
}

function normalizeConsumeRpcRow(data) {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') {
    return { ok: false, error: 'Phản hồi Supabase không hợp lệ.', code: 'SUPABASE_BAD_RESPONSE' };
  }
  const ok = Boolean(row.ok);
  const needLogin = Boolean(row.need_login);
  const rawRemaining = row.remaining_tokens ?? row.remainingTokens;
  const remaining = Number.isFinite(Number(rawRemaining)) ? Number(rawRemaining) : 0;
  return { ok, needLogin, remainingTokens: Math.max(0, Math.floor(remaining)) };
}

async function ensureFreeUserCreditsByEmail({ email, userType, impliedSupabaseFree, entitlements, isAdmin, accessToken }) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return { ok: false, error: 'Email trống.', code: 'EMAIL_REQUIRED' };
  }
  const result = await callEdgeFunction('resolve-user-profile', accessToken, {
    defaultTokens: DEFAULT_USER_TOKEN_MAX,
  });
  if (!result.ok) return result;
  const profile = result.data || {};
  const entitlement_session = {
    entitlements: Array.isArray(profile.entitlements) ? profile.entitlements : entitlements,
    isAdmin: profile.isAdmin === true || isAdmin === true,
    userType: profile.userType || userType,
  };
  if (hasApp(entitlement_session)) {
    return { ok: true, skipped: true, reason: 'MEMBER_BYPASS', email: normalizedEmail };
  }
  const remaining = Number.isFinite(Number(profile.remainingTokens))
    ? Math.max(0, Math.floor(Number(profile.remainingTokens)))
    : DEFAULT_USER_TOKEN_MAX;
  return { ok: true, email: normalizedEmail, remainingTokens: remaining };
}

async function consumeFreeUserDownloadCredit({
  email,
  userType,
  impliedSupabaseFree,
  entitlements,
  isAdmin,
  accessToken,
  mangaUrl,
  chapterUrl,
}) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return { ok: false, error: 'Email trống.', code: 'EMAIL_REQUIRED' };
  }
  if (hasApp({ userType, entitlements, isAdmin })) {
    return { ok: true, skipped: true, reason: 'MEMBER_BYPASS' };
  }
  const rpcResult = await callEdgeFunction('consume-free-credit', accessToken, {
    mangaUrl: String(mangaUrl || '').trim(),
    chapterUrl: String(chapterUrl || '').trim(),
  });
  if (!rpcResult.ok) return rpcResult;
  const parsed = normalizeConsumeRpcRow(rpcResult.data);
  if (!parsed.ok && !parsed.needLogin && parsed.code) return parsed;
  return {
    ok: parsed.ok,
    needLogin: parsed.needLogin,
    remainingTokens: parsed.remainingTokens,
    email: normalizedEmail,
  };
}

module.exports = {
  ensureFreeUserCreditsByEmail,
  consumeFreeUserDownloadCredit,
  isMemberType,
  isFreeUserTokenTier,
};
