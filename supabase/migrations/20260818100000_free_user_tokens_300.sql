-- Raise Free-tier download grant from 100 to 300 tokens.
-- Deploy together with edge function resolve-user-profile (p_default_tokens = 300).
-- If this SQL lands first while the function still passes 100, new Free users
-- insert 100 and miss the one-time +200 below.
--
-- Existing Free users receive a one-time +200 delta (unused 100 becomes 300).
-- Replay is guarded by free_credit_grant_events so the delta is not applied twice.

ALTER TABLE public.free_user_credits
  ALTER COLUMN remaining_tokens SET DEFAULT 300;

CREATE OR REPLACE FUNCTION public.ensure_current_user_profile(p_default_tokens integer DEFAULT 300)
RETURNS TABLE(
  email text,
  user_type text,
  implied_supabase_free boolean,
  remaining_tokens integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text := nullif(lower(trim(coalesce(auth.jwt() ->> 'email', ''))), '');
  v_user_type text := 'Free';
  v_allowlist_user_type text;
  v_default_tokens integer := greatest(0, coalesce(p_default_tokens, 300));
  v_remaining integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authenticated user is required';
  END IF;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'authenticated email is required';
  END IF;

  SELECT a.user_type INTO v_allowlist_user_type
  FROM public.user_type_allowlist a
  WHERE a.email = v_email;

  v_user_type := coalesce(v_allowlist_user_type, 'Free');

  INSERT INTO public.user_profiles AS p(
    id,
    email,
    user_type,
    last_login_at
  )
  VALUES (
    v_user_id,
    v_email,
    v_user_type,
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET email = excluded.email,
      user_type = excluded.user_type,
      last_login_at = now(),
      updated_at = now();

  SELECT p.user_type INTO v_user_type
  FROM public.user_profiles p
  WHERE p.id = v_user_id;

  IF v_user_type = 'Free' THEN
    INSERT INTO public.free_user_credits(user_id, email, remaining_tokens)
    VALUES (v_user_id, v_email, v_default_tokens)
    ON CONFLICT (user_id) DO UPDATE
    SET email = excluded.email,
        updated_at = now();
  END IF;

  SELECT c.remaining_tokens INTO v_remaining
  FROM public.free_user_credits c
  WHERE c.user_id = v_user_id;

  RETURN QUERY SELECT v_email, v_user_type, v_user_type = 'Free', coalesce(v_remaining, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_current_user_download_token(
  p_manga_url text DEFAULT NULL,
  p_chapter_url text DEFAULT NULL
)
RETURNS TABLE(ok boolean, remaining_tokens integer, need_login boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text := nullif(lower(trim(coalesce(auth.jwt() ->> 'email', ''))), '');
  v_user_type text;
  v_remaining integer;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT false, 0, true;
    RETURN;
  END IF;

  PERFORM public.ensure_current_user_profile(300);

  SELECT p.user_type INTO v_user_type
  FROM public.user_profiles p
  WHERE p.id = v_user_id;

  IF v_user_type IS DISTINCT FROM 'Free' THEN
    RETURN QUERY SELECT true, 0, false;
    RETURN;
  END IF;

  UPDATE public.free_user_credits AS c
  SET remaining_tokens = c.remaining_tokens - 1,
      updated_at = now()
  WHERE c.user_id = v_user_id
    AND c.remaining_tokens > 0
  RETURNING c.remaining_tokens INTO v_remaining;

  IF v_remaining IS NULL THEN
    RETURN QUERY SELECT false, 0, true;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, v_remaining, false;
END;
$$;

CREATE TABLE IF NOT EXISTS public.free_credit_grant_events (
  event_key text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.free_credit_grant_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.free_credit_grant_events FROM anon, authenticated;

WITH claimed AS (
  INSERT INTO public.free_credit_grant_events (event_key)
  VALUES ('free_tokens_100_to_300_delta_20260818')
  ON CONFLICT (event_key) DO NOTHING
  RETURNING event_key
)
UPDATE public.free_user_credits c
SET remaining_tokens = c.remaining_tokens + 200,
    updated_at = now()
FROM public.user_profiles p, claimed
WHERE c.user_id = p.id
  AND p.user_type = 'Free';
