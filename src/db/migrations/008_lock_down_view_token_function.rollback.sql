-- Rollback 008: Restore the pre-hardening function definition and grants
-- (as they existed live before migration 008: search_path pinned to 'public',
-- no auth check, executable by anon/authenticated/service_role + PUBLIC).
--
-- WARNING: this reintroduces the anon-executable SECURITY DEFINER function
-- flagged by Supabase advisors (lints 0028/0029). Only roll back if the
-- hardened version breaks the share-link flow, and note the client must also
-- be reverted to call the RPC directly instead of /api/league/share-token.

CREATE OR REPLACE FUNCTION public.get_or_create_view_token(league_id TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  token UUID;
BEGIN
  -- Atomically return existing token or generate a new one
  UPDATE leagues
  SET view_token = COALESCE(view_token, gen_random_uuid())
  WHERE id = league_id
  RETURNING view_token INTO token;

  RETURN token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_view_token(TEXT) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_or_create_view_token(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_view_token(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_view_token(TEXT) TO service_role;
