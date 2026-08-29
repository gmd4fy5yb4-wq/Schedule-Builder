-- Migration fd_018: close the incremental-deletion gap in the fd_010 league guard
-- Run in the Supabase SQL editor (Alfred Digital Sports project), or apply via MCP
-- under the name "fd_018_leagues_guard_highwater".
--
-- WHY. fd_010 snapshots a league when ONE write shrinks it below 50% of its
-- immediately-previous size. That catches the full -> empty wipe it was written for
-- (2026-06-13, YWWM8G) and nothing else.
--
-- On 2026-07-28 the same league lost an entire spring/summer season — 131 games,
-- 113 practices, 41 teams — and the guard never fired, because the deletion was
-- INCREMENTAL: each individual save stayed above the 50% threshold, so no single
-- write ever looked destructive. The season survived only because one unrelated
-- league_snapshots row happened to hold it. That was luck, not a guarantee.
--
-- Comparing each write to the previous one cannot see a slow deletion. This
-- migration compares against the league's HIGH-WATER MARK instead.
--
-- WHAT IT DOES.
--   * public.fd_league_guard_peak keeps ONE row per league holding the largest
--     version of that league seen so far, blob and all.
--   * On a write that grows a league past its high-water mark, that copy is
--     refreshed. Strictly-greater on purpose: an equal-size save (renaming a team,
--     moving a game — the common case) copies nothing.
--   * On a write that leaves the league below HALF its high-water mark — however
--     many saves it took to get there — the stored copy is promoted into
--     league_snapshots, where the admin can see and restore it. Once per peak, so
--     a league that sits below the line does not spam.
--
-- WHY THE COPY IS NOT SIMPLY A DAILY SNAPSHOT. src/lib/sync.ts loadSnapshots()
-- reads the 30 most recent rows with no filter, so a daily auto-snapshot would
-- push every snapshot the admin took themselves out of their own list inside a
-- month. The high-water copy is invisible to the app and becomes a visible
-- snapshot only at the moment something looks wrong.
--
-- STILL NON-BLOCKING. Like fd_010, this never rejects a write. It guarantees a
-- recovery point exists; it does not decide that the user is wrong.
--
-- ADDITIVE AND FIELDDAY-ONLY. Touches `leagues` (trigger function only, no schema
-- change), `league_snapshots` (inserts), and one new fd_-prefixed table. Prospect
-- Card and AthleteCard tables are not referenced. See the Table Ownership Map in
-- memory/migrations.md.

-- ── The high-water copy ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.fd_league_guard_peak (
  league_id   text PRIMARY KEY REFERENCES public.leagues(id) ON DELETE CASCADE,
  peak_items  int NOT NULL,
  peak_data   jsonb NOT NULL,
  peak_at     timestamptz NOT NULL DEFAULT now(),
  -- Set when this peak has already been promoted into league_snapshots. Cleared
  -- whenever a new high-water mark is set, so each peak is promoted at most once.
  promoted_at timestamptz
);

COMMENT ON TABLE public.fd_league_guard_peak IS
  'fd_018: largest known version of each league, kept so an incremental deletion can be recovered. Written only by guard_snapshot_leagues() (SECURITY DEFINER). Never read by the app.';

-- This table holds full league blobs, which carry coach names, phones and emails.
-- It is written exclusively by the SECURITY DEFINER trigger below and read by
-- nobody, so it gets RLS with no policies at all: deny by default, for every role.
ALTER TABLE public.fd_league_guard_peak ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fd_league_guard_peak FORCE ROW LEVEL SECURITY;

-- Revoke from PUBLIC, not from anon. A `REVOKE ... FROM anon` is a no-op while the
-- default PUBLIC grant stands — that mistake has now been made three times on these
-- projects (shared_002, spoc_006, pc_020). Verify by impersonation, never by
-- reading pg_policies.
REVOKE ALL ON public.fd_league_guard_peak FROM PUBLIC;
REVOKE ALL ON public.fd_league_guard_peak FROM anon, authenticated;

-- ── The guard ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.guard_snapshot_leagues()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  old_items int := public.league_item_count(OLD.data);
  new_items int;
  peak      public.fd_league_guard_peak%ROWTYPE;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    IF old_items > 0 THEN
      INSERT INTO public.league_snapshots (league_id, name, data, created_by)
      VALUES (
        OLD.id,
        '[Auto-guard] before DELETE ' || to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI')
          || ' (' || old_items || ' items)',
        OLD.data,
        'system:guard'
      );
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE path
  IF NEW.data IS DISTINCT FROM OLD.data THEN
    new_items := public.league_item_count(NEW.data);

    SELECT * INTO peak FROM public.fd_league_guard_peak WHERE league_id = OLD.id;

    -- fd_010's rule, unchanged: one write that halves the league.
    IF old_items > 0 AND new_items < (old_items / 2.0) THEN
      INSERT INTO public.league_snapshots (league_id, name, data, created_by)
      VALUES (
        OLD.id,
        '[Auto-guard] before shrink ' || to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI')
          || ' (' || old_items || '->' || new_items || ' items)',
        OLD.data,
        'system:guard'
      );
    END IF;

    -- fd_018: the same test against the high-water mark, which no number of small
    -- deletions can walk past. Promoted once per peak.
    IF peak.league_id IS NOT NULL
       AND peak.promoted_at IS NULL
       AND peak.peak_items > 0
       AND new_items < (peak.peak_items / 2.0)
    THEN
      INSERT INTO public.league_snapshots (league_id, name, data, created_by)
      VALUES (
        OLD.id,
        '[Auto-guard] recovered high-water ' || to_char(peak.peak_at AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI')
          || ' (' || peak.peak_items || ' items, now ' || new_items || ')',
        peak.peak_data,
        'system:guard'
      );
      UPDATE public.fd_league_guard_peak
         SET promoted_at = now()
       WHERE league_id = OLD.id;
    END IF;

    -- Refresh the high-water copy. STRICTLY greater: an equal-size save copies
    -- no blob, which is the common case (moving a game, renaming a team).
    IF peak.league_id IS NULL THEN
      -- First write we have ever seen for this league. Seed from whichever SIDE of
      -- this write is larger, not from NEW: if the very first thing we observe is
      -- a deletion, seeding from NEW would baseline against the diminished league
      -- and quietly protect nothing. (Caught in testing — seeding from NEW made a
      -- 286-item league recover as 266.)
      INSERT INTO public.fd_league_guard_peak (league_id, peak_items, peak_data, peak_at)
      VALUES (
        OLD.id,
        greatest(old_items, new_items),
        CASE WHEN old_items >= new_items THEN OLD.data ELSE NEW.data END,
        now()
      )
      ON CONFLICT (league_id) DO NOTHING;
    ELSIF new_items > peak.peak_items THEN
      UPDATE public.fd_league_guard_peak
         SET peak_items = new_items, peak_data = NEW.data, peak_at = now(), promoted_at = NULL
       WHERE league_id = OLD.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_snapshot_leagues() FROM PUBLIC;

-- Trigger definition is unchanged from fd_010; recreated so this migration is
-- self-contained and re-runnable.
DROP TRIGGER IF EXISTS trg_leagues_guard_snapshot ON public.leagues;
CREATE TRIGGER trg_leagues_guard_snapshot
  BEFORE UPDATE OR DELETE ON public.leagues
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_snapshot_leagues();

-- ── Seed ────────────────────────────────────────────────────────────────────
-- Without this, every existing league's high-water mark would start at whatever
-- its next save happens to be — so a league already mid-deletion would baseline
-- against its diminished self and the guard would protect nothing.

INSERT INTO public.fd_league_guard_peak (league_id, peak_items, peak_data, peak_at)
SELECT id, public.league_item_count(data), data, now()
  FROM public.leagues
ON CONFLICT (league_id) DO NOTHING;
