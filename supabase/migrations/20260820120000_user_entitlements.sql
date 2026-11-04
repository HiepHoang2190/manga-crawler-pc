-- Add package entitlements storage and expose entitlement payload in profile RPCs.
-- This migration also backfills lifetime entitlements for existing profiles and allowlist emails.

CREATE TABLE IF NOT EXISTS public.user_entitlements (
  email text NOT NULL,
  user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  package_key text NOT NULL,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NULL,
  granted_by text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_entitlements_pkey PRIMARY KEY (email, package_key),
  CONSTRAINT user_entitlements_email_normalized CHECK (email = lower(trim(email))),
  CONSTRAINT user_entitlements_package_key_check CHECK (
    package_key IN ('app', 'catalog_y1', 'catalog_y2')
  )
);

CREATE INDEX IF NOT EXISTS user_entitlements_user_id_idx
  ON public.user_entitlements(user_id);

ALTER TABLE public.user_entitlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own entitlements" ON public.user_entitlements;
CREATE POLICY "Users can read own entitlements"
  ON public.user_entitlements
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR email = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  );

REVOKE ALL ON TABLE public.user_entitlements FROM anon, authenticated;
GRANT SELECT ON TABLE public.user_entitlements TO authenticated;
GRANT ALL ON TABLE public.user_entitlements TO service_role;

INSERT INTO public.user_entitlements (email, user_id, package_key, expires_at)
SELECT lower(trim(p.email)), p.id, 'app', NULL
FROM public.user_profiles p
WHERE p.user_type IN ('Member', 'Super Member', 'Premium Member')
ON CONFLICT (email, package_key) DO NOTHING;

INSERT INTO public.user_entitlements (email, user_id, package_key, expires_at)
SELECT lower(trim(p.email)), p.id, 'catalog_y1', NULL
FROM public.user_profiles p
WHERE p.user_type IN ('Super Member', 'Premium Member')
ON CONFLICT (email, package_key) DO NOTHING;

INSERT INTO public.user_entitlements (email, user_id, package_key, expires_at)
SELECT lower(trim(p.email)), p.id, 'catalog_y2', NULL
FROM public.user_profiles p
WHERE p.user_type = 'Premium Member'
ON CONFLICT (email, package_key) DO NOTHING;

INSERT INTO public.user_entitlements (email, user_id, package_key, expires_at)
SELECT lower(trim(a.email)), NULL, 'app', NULL
FROM public.user_type_allowlist a
WHERE a.user_type IN ('Member', 'Super Member', 'Premium Member')
ON CONFLICT (email, package_key) DO NOTHING;

INSERT INTO public.user_entitlements (email, user_id, package_key, expires_at)
SELECT lower(trim(a.email)), NULL, 'catalog_y1', NULL
FROM public.user_type_allowlist a
WHERE a.user_type IN ('Super Member', 'Premium Member')
ON CONFLICT (email, package_key) DO NOTHING;

INSERT INTO public.user_entitlements (email, user_id, package_key, expires_at)
SELECT lower(trim(a.email)), NULL, 'catalog_y2', NULL
FROM public.user_type_allowlist a
WHERE a.user_type = 'Premium Member'
ON CONFLICT (email, package_key) DO NOTHING;

DROP FUNCTION IF EXISTS public.ensure_current_user_profile(integer);

CREATE FUNCTION public.ensure_current_user_profile(p_default_tokens integer DEFAULT 300)
RETURNS TABLE(
  email text,
  user_type text,
  is_admin boolean,
  implied_supabase_free boolean,
  remaining_tokens integer,
  entitlements jsonb
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
  v_is_admin boolean := false;
  v_has_active_app boolean := false;
  v_entitlements jsonb := '[]'::jsonb;
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

  UPDATE public.user_entitlements AS e
  SET user_id = v_user_id,
      updated_at = now()
  WHERE e.email = v_email
    AND e.user_id IS NULL;

  v_is_admin := (v_user_type = 'Admin');

  SELECT EXISTS (
    SELECT 1
    FROM public.user_entitlements e
    WHERE e.email = v_email
      AND e.package_key = 'app'
      AND (e.expires_at IS NULL OR e.expires_at > now())
  ) INTO v_has_active_app;

  IF NOT v_is_admin AND NOT v_has_active_app THEN
    INSERT INTO public.free_user_credits(user_id, email, remaining_tokens)
    VALUES (v_user_id, v_email, v_default_tokens)
    ON CONFLICT (user_id) DO UPDATE
    SET email = excluded.email,
        updated_at = now();
  END IF;

  SELECT c.remaining_tokens INTO v_remaining
  FROM public.free_user_credits c
  WHERE c.user_id = v_user_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'packageKey', e.package_key,
    'expiresAt', e.expires_at
  ) ORDER BY e.package_key), '[]'::jsonb)
  INTO v_entitlements
  FROM public.user_entitlements e
  WHERE e.email = v_email;

  RETURN QUERY
  SELECT
    v_email,
    v_user_type,
    v_is_admin,
    NOT v_is_admin AND NOT v_has_active_app,
    coalesce(v_remaining, 0),
    v_entitlements;
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

  IF v_user_type = 'Admin' THEN
    RETURN QUERY SELECT true, 0, false;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_entitlements e
    WHERE e.email = v_email
      AND e.package_key = 'app'
      AND (e.expires_at IS NULL OR e.expires_at > now())
  ) THEN
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

REVOKE ALL ON FUNCTION public.ensure_current_user_profile(integer) FROM public;
REVOKE ALL ON FUNCTION public.consume_current_user_download_token(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.ensure_current_user_profile(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_current_user_download_token(text, text) TO authenticated;
