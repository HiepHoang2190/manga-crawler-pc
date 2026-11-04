-- Qualify user_entitlements.email in ensure_current_user_profile.
-- RETURNS TABLE(email ...) makes a bare `WHERE email = v_email` ambiguous (42702),
-- which broke login after 20260820120000_user_entitlements.sql.

CREATE OR REPLACE FUNCTION public.ensure_current_user_profile(p_default_tokens integer DEFAULT 300)
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
#variable_conflict use_column
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

REVOKE ALL ON FUNCTION public.ensure_current_user_profile(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.ensure_current_user_profile(integer) TO authenticated;
