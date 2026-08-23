-- Migration 010: Auto-snapshot guard against destructive league overwrites
-- Run this in the Supabase SQL editor (Alfred Digital Sports project).
--
-- WHY: On 2026-06-13 league YWWM8G ("2026 Intramural Softball") had its
-- leagues.data overwritten with an empty default (0 games, 0 practices,
-- 0 divisions) via an app save (updated_by = 'Greg'). The full league —
-- 115 games, 99 practices, 7 special events, 5 divisions, 14 fields — was
-- recoverable ONLY because the app had previously written auto-snapshots to
-- league_snapshots. Nothing at the database level prevented or recorded the
-- destructive write.
--
-- WHAT THIS DOES: a BEFORE UPDATE/DELETE trigger that captures the OLD
-- leagues.data into league_snapshots whenever a write would significantly
-- shrink a league (the full -> empty failure mode) or delete a non-empty
-- league. It is NON-BLOCKING: it never rejects the write, it only guarantees
-- a recovery point exists. This is defense-in-depth and does not replace the
-- app's own validation or Supabase Point-in-Time Recovery.

-- Helper: safe array length (returns 0 for null / non-array jsonb)
CREATE OR REPLACE FUNCTION public.jsonb_arr_len(j jsonb)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE WHEN jsonb_typeof(j) = 'array' THEN jsonb_array_length(j) ELSE 0 END;
$$;

-- Count the "content items" in a league's data blob
CREATE OR REPLACE FUNCTION public.league_item_count(d jsonb)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT public.jsonb_arr_len(d->'divisions')
       + public.jsonb_arr_len(d->'fields')
       + public.jsonb_arr_len(d#>'{schedule,games}')
       + public.jsonb_arr_len(d#>'{schedule,practices}')
       + public.jsonb_arr_len(d#>'{schedule,specialEvents}');
$$;

-- Trigger function: snapshot OLD data before a destructive change
CREATE OR REPLACE FUNCTION public.guard_snapshot_leagues()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  old_items int := public.league_item_count(OLD.data);
  new_items int;
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
    -- Trigger only on a meaningful shrink: full league overwritten by an
    -- empty/near-empty one. 50% threshold catches full->empty wipes while
    -- ignoring normal incremental edits.
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
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leagues_guard_snapshot ON public.leagues;
CREATE TRIGGER trg_leagues_guard_snapshot
  BEFORE UPDATE OR DELETE ON public.leagues
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_snapshot_leagues();

-- Applied 2026-08-21 via MCP as "fd_010_leagues_guard_snapshot" (reviewed: blob
-- paths verified against all live leagues incl. multisport; league_snapshots has
-- no FK so guard snapshots survive league deletion; shrink path live-tested in a
-- rolled-back transaction, 97->0 items snapshotted). Addendum applied with it:
REVOKE EXECUTE ON FUNCTION public.jsonb_arr_len(jsonb) FROM public;
REVOKE EXECUTE ON FUNCTION public.league_item_count(jsonb) FROM public;
REVOKE EXECUTE ON FUNCTION public.guard_snapshot_leagues() FROM public;
