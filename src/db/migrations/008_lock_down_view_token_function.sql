-- Migration 008: Lock down get_or_create_view_token (server-only)
-- Supabase security advisors flagged this SECURITY DEFINER function as
-- executable by anon and authenticated via PostgREST (lints 0028/0029,
-- anon/authenticated_security_definer_function_executable). Postgres grants
-- EXECUTE to PUBLIC by default on every new function, and migration 005
-- added explicit grants on top — so an anonymous caller hitting
-- /rest/v1/rpc/get_or_create_view_token could mint a read-only view token
-- for any league code, bypassing the login + subscription gate.
--
-- Fix: make the function service-role-only and route client calls through
-- the authenticated server route POST /api/league/share-token (mirrors how
-- /api/leagues/save and /api/leagues/create already work). This clears both
-- lints — the function is no longer client-callable at all.
--
-- The function stays SECURITY DEFINER intentionally: collaborators (any
-- signed-in user who knows the league code — the code is the shared access
-- credential, see /api/leagues/save) must be able to mint a token, but the
-- leagues RLS update policy only covers the owner.

CREATE OR REPLACE FUNCTION public.get_or_create_view_token(league_id TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  result UUID;
BEGIN
  -- Defense in depth: even if EXECUTE grants regress, anonymous PostgREST
  -- callers (no uid, no service_role claim) get nothing.
  IF auth.uid() IS NULL
     AND COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.leagues
  SET view_token = COALESCE(view_token, gen_random_uuid())
  WHERE id = league_id
  RETURNING view_token INTO result;

  RETURN result;
END;
$$;

-- Remove the implicit PUBLIC grant (what let anon in) plus the explicit
-- grants from migration 005. Only the service role keeps EXECUTE.
REVOKE EXECUTE ON FUNCTION public.get_or_create_view_token(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_or_create_view_token(TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_or_create_view_token(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_view_token(TEXT) TO service_role;
