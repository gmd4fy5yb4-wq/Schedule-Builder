-- Migration 004: Atomic view token generation function
-- Eliminates the race condition in getOrCreateViewToken by using COALESCE
-- in a single UPDATE statement — sets view_token only if it's currently NULL.

CREATE OR REPLACE FUNCTION public.get_or_create_view_token(league_id TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result UUID;
BEGIN
  UPDATE leagues
  SET view_token = COALESCE(view_token, gen_random_uuid())
  WHERE id = league_id
  RETURNING view_token INTO result;

  RETURN result;
END;
$$;
