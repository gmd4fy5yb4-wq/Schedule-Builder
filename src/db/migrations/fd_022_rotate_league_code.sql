-- Migration fd_022: let a league OWNER rotate the league code
-- Run in the Supabase SQL editor (Alfred Digital Sports project), or apply via MCP
-- under the name "fd_022_rotate_league_code".
--
-- WHY. The 6-character league code is not a name, it is the write credential:
-- any authenticated user who knows it can edit the league, and there is no
-- membership table to revoke from. So the only way to withdraw edit access you
-- once handed out is to change the credential. Until now there was none, which
-- meant sharing a code was a permanent, irreversible grant.
--
-- WHY A FUNCTION AND NOT AN UPDATE FROM THE ROUTE. leagues.id is simultaneously
-- the primary key and the credential, and two other tables key off it:
--
--   * fd_league_guard_peak.league_id — a real FK, but ON DELETE CASCADE only, so
--     a plain UPDATE of leagues.id was REJECTED outright by the constraint.
--   * league_snapshots.league_id     — no FK at all, so the same UPDATE would
--     have SILENTLY ORPHANED every snapshot of the league, including the
--     [Auto-guard] recovery points that fd_010/fd_018 exist to produce. A
--     rotation that quietly destroys the disaster-recovery history is worse
--     than no rotation feature.
--
-- Both moves plus the rename have to be one transaction, so they live in one
-- function. The ON UPDATE CASCADE added below is what makes the rename legal at
-- all; the snapshot re-key is explicit because there is no constraint to do it.
--
-- NOT AFFECTED. `view_token` is a separate credential on a separate path
-- (/api/league/view, service role, contact details redacted). Rotating the code
-- does NOT invalidate share links that are already out — deliberately: coaches
-- and parents holding a read-only link should not lose the schedule because an
-- admin was removed. p_revoke_view_links is there for when that IS what you
-- want; it clears the token so the next share mints a fresh one and every old
-- link 404s.
--
-- ADDITIVE AND FIELDDAY-ONLY. Touches `leagues` (no schema change), one FK on
-- fd_league_guard_peak, and re-keys league_snapshots rows. Prospect Card and
-- AthleteCard tables are not referenced. See the Table Ownership Map in
-- memory/migrations.md.

-- ── Make the rename legal ───────────────────────────────────────────────────
-- ON DELETE CASCADE is unchanged. ON UPDATE CASCADE is the addition: without it
-- the FK blocks any change to leagues.id.

ALTER TABLE public.fd_league_guard_peak
  DROP CONSTRAINT IF EXISTS fd_league_guard_peak_league_id_fkey;

ALTER TABLE public.fd_league_guard_peak
  ADD CONSTRAINT fd_league_guard_peak_league_id_fkey
  FOREIGN KEY (league_id) REFERENCES public.leagues(id)
  ON UPDATE CASCADE ON DELETE CASCADE;

-- ── The rotation ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fd_rotate_league_code(
  p_old_code          text,
  p_new_code          text,
  p_owner             uuid,
  p_revoke_view_links boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  -- Ownership is authorization HERE and almost nowhere else in this app, and the
  -- exception is deliberate: the code is the credential every collaborator holds,
  -- so gating rotation on the code would let the person being removed rotate it
  -- back. Only the account that PAYS for the league may change its credential.
  --
  -- FOR UPDATE so a concurrent save (or a second rotation) serialises behind us
  -- rather than writing under a code that is about to stop existing.
  SELECT owner_id INTO v_owner
    FROM public.leagues
   WHERE id = p_old_code
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  -- An unclaimed league has no owner to authorise this. Refusing is the safe
  -- answer: allowing it would let any code-holder rotate a NULL-owner league and
  -- lock out everyone else, including whoever was about to claim it.
  IF v_owner IS NULL OR v_owner IS DISTINCT FROM p_owner THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_owner');
  END IF;

  IF EXISTS (SELECT 1 FROM public.leagues WHERE id = p_new_code) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'code_taken');
  END IF;

  -- Snapshots first. There is no FK to carry them, and a rotation that leaves
  -- them behind silently deletes the league's recovery history.
  UPDATE public.league_snapshots
     SET league_id = p_new_code
   WHERE league_id = p_old_code;

  -- The rename itself. fd_league_guard_peak follows via ON UPDATE CASCADE.
  -- trg_leagues_guard_snapshot fires but does nothing: its UPDATE path is gated
  -- on `NEW.data IS DISTINCT FROM OLD.data`, and a rotation does not touch data.
  UPDATE public.leagues
     SET id         = p_new_code,
         view_token = CASE WHEN p_revoke_view_links THEN NULL ELSE view_token END
   WHERE id = p_old_code;

  RETURN jsonb_build_object('ok', true, 'code', p_new_code);
EXCEPTION
  WHEN unique_violation THEN
    -- Lost a race for the new code between the EXISTS check and the UPDATE.
    -- The caller retries with a fresh candidate.
    RETURN jsonb_build_object('ok', false, 'reason', 'code_taken');
END;
$$;

COMMENT ON FUNCTION public.fd_rotate_league_code(text, text, uuid, boolean) IS
  'fd_022: change a league''s code (its write credential), re-keying league_snapshots and fd_league_guard_peak in the same transaction. Owner-only. Service-role callers only — see /api/leagues/rotate-code.';

-- Service-role only, matching migration 008's treatment of get_or_create_view_token.
-- The function takes the owner id as an argument and trusts it, so a browser that
-- could call it directly could pass any uuid — the API route is what proves the
-- caller is that user.
REVOKE ALL ON FUNCTION public.fd_rotate_league_code(text, text, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fd_rotate_league_code(text, text, uuid, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fd_rotate_league_code(text, text, uuid, boolean) TO service_role;
