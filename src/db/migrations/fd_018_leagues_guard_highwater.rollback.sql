-- Rollback for fd_018 — restores the fd_010 guard exactly as it was.
--
-- Only needed if the high-water rule misbehaves. Note that rolling back
-- REOPENS the incremental-deletion gap: fd_010 alone does not notice a league
-- being bled away over several saves until it is ~90% gone (measured, see the
-- fd_018 header). Prefer disabling just the promotion branch over running this.
--
-- The dropped table holds only derived copies of leagues.data. Nothing else
-- reads it, so dropping it loses no primary data — but any high-water copy it
-- held is gone, so if a league is mid-descent, promote it first:
--
--   INSERT INTO public.league_snapshots (league_id, name, data, created_by)
--   SELECT league_id, '[Manual] fd_018 rollback rescue (' || peak_items || ' items)',
--          peak_data, 'system:guard'
--     FROM public.fd_league_guard_peak
--    WHERE peak_items > 0;

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

  IF NEW.data IS DISTINCT FROM OLD.data THEN
    new_items := public.league_item_count(NEW.data);
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

REVOKE EXECUTE ON FUNCTION public.guard_snapshot_leagues() FROM PUBLIC;

DROP TABLE IF EXISTS public.fd_league_guard_peak;
