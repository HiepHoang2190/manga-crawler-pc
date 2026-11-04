// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleOptions, jsonResponse, readJson } from '../shared/http.ts';

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

  const authHeader = req.headers.get('Authorization') || '';
  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client.rpc('consume_current_user_download_token', {
    p_manga_url: String(body.mangaUrl || '').trim() || null,
    p_chapter_url: String(body.chapterUrl || '').trim() || null,
  });
  if (error) {
    return jsonResponse({ ok: false, error: error.message, code: 'CREDIT_CONSUME_FAILED' }, { status: 400 });
  }

  const row = Array.isArray(data) ? data[0] : data;
  return jsonResponse({
    ok: Boolean(row?.ok),
    needLogin: Boolean(row?.need_login),
    remainingTokens: Number.isFinite(Number(row?.remaining_tokens)) ? Number(row.remaining_tokens) : 0,
  });
});
