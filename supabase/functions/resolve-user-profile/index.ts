// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleOptions, jsonResponse } from '../shared/http.ts';

/** Must match SQL ensure_current_user_profile / migration 20260820120000_user_entitlements.sql.
 * Deploy together: db push, then resolve-user-profile AND sheets. */

const DEFAULT_USER_TOKEN_MAX = 300;

function isActiveAppEntitlement(entitlement) {
  const package_key = entitlement?.packageKey ?? entitlement?.package_key;
  if (package_key !== 'app') return false;
  const expires_at_raw = entitlement?.expiresAt ?? entitlement?.expires_at;
  if (expires_at_raw == null || expires_at_raw === '') return true;
  const expires_ms = Date.parse(expires_at_raw);
  if (!Number.isFinite(expires_ms)) return false;
  return expires_ms > Date.now();
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, { status: 405 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  if (!supabaseUrl || !anonKey) {
    return jsonResponse({ ok: false, error: 'Supabase function is not configured' }, { status: 500 });
  }

  const authHeader = req.headers.get('Authorization') || '';
  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client.rpc('ensure_current_user_profile', {
    p_default_tokens: DEFAULT_USER_TOKEN_MAX,
  });
  if (error) {
    return jsonResponse({ ok: false, error: error.message, code: 'PROFILE_RESOLVE_FAILED' }, { status: 400 });
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.email) {
    return jsonResponse({ ok: false, error: 'Profile response is empty', code: 'PROFILE_EMPTY' }, { status: 500 });
  }

  const entitlements = Array.isArray(row.entitlements) ? row.entitlements : [];
  const isAdmin = Boolean(row.is_admin) || String(row.user_type || '') === 'Admin';

  return jsonResponse({
    ok: true,
    email: row.email,
    userType: row.user_type || 'Free',
    isAdmin,
    entitlements,
    impliedSupabaseFree: !isAdmin && !entitlements.some(isActiveAppEntitlement),
    remainingTokens: Number.isFinite(Number(row.remaining_tokens)) ? Number(row.remaining_tokens) : 0,
  });
});
