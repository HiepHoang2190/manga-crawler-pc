// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleOptions, jsonResponse, readJson } from '../shared/http.ts';

const VALID_USER_TYPES = new Map([
  ['free', 'Free'],
  ['member', 'Member'],
  ['premium member', 'Premium Member'],
  ['super member', 'Super Member'],
  ['admin', 'Admin'],
]);

function normalizeEmail(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function normalizeUserType(value: unknown) {
  const normalized = String(value || 'Free').trim().toLowerCase();
  return VALID_USER_TYPES.get(normalized) || 'Free';
}

/** Google Sheet flow: only user_profiles — never touch user_type_allowlist. */
function isSheetEditSource(body: Record<string, unknown>) {
  return String(body.source ?? '').trim().toLowerCase() === 'sheet_edit';
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, { status: 405 });
  }

  const expectedSecret = Deno.env.get('MEMBERSHIP_SYNC_SECRET') || '';
  const actualSecret = req.headers.get('X-Sync-Secret') || '';
  if (!expectedSecret || actualSecret !== expectedSecret) {
    return jsonResponse({ ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ ok: false, error: 'Supabase function is not configured' }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = await readJson(req) as Record<string, unknown>;
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      code: 'BAD_JSON',
    }, { status: 400 });
  }

  const email = normalizeEmail(body.email);
  if (!email) {
    return jsonResponse({ ok: false, error: 'email is required', code: 'EMAIL_REQUIRED' }, { status: 400 });
  }

  const userType = normalizeUserType(body.userType || body.user_type || body.type);
  const sheet_edit = isSheetEditSource(body);
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (!sheet_edit) {
    if (userType === 'Free') {
      const { error: delAlError } = await client.from('user_type_allowlist').delete().eq('email', email);
      if (delAlError) {
        return jsonResponse({ ok: false, error: delAlError.message, code: 'ALLOWLIST_DELETE_FAILED' }, { status: 400 });
      }
    } else {
      const { error: upsertAlError } = await client.from('user_type_allowlist').upsert(
        {
          email,
          user_type: userType,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'email' },
      );
      if (upsertAlError) {
        return jsonResponse({ ok: false, error: upsertAlError.message, code: 'ALLOWLIST_UPSERT_FAILED' }, { status: 400 });
      }
    }
  }

  const { data, error: profileError } = await client
    .from('user_profiles')
    .update({
      user_type: userType,
      updated_at: new Date().toISOString(),
    })
    .eq('email', email)
    .select('email, user_type')
    .maybeSingle();
  if (profileError) {
    return jsonResponse({ ok: false, error: profileError.message, code: 'PROFILE_UPDATE_FAILED' }, { status: 400 });
  }
  if (!data) {
    return jsonResponse({
      ok: true,
      email,
      userType,
      profileUpdated: false,
      notFound: true,
      allowlistSkipped: sheet_edit,
      message: sheet_edit
        ? 'No user_profiles row for this email; allowlist was not modified (sheet_edit).'
        : 'Allowlist saved. user_profiles has no row yet; user will get this type on next login.',
    });
  }

  return jsonResponse({
    ok: true,
    email,
    userType,
    profileUpdated: true,
    allowlistSkipped: sheet_edit,
  });
});
