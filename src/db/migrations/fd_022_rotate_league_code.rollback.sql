-- Rollback for fd_022.
--
-- NOTE: this restores the pre-fd_022 FK, which had no ON UPDATE action — so any
-- league code already rotated STAYS rotated (the rename is data, not schema).
-- Rolling back only removes the ability to rotate again.

DROP FUNCTION IF EXISTS public.fd_rotate_league_code(text, text, uuid, boolean);

ALTER TABLE public.fd_league_guard_peak
  DROP CONSTRAINT IF EXISTS fd_league_guard_peak_league_id_fkey;

ALTER TABLE public.fd_league_guard_peak
  ADD CONSTRAINT fd_league_guard_peak_league_id_fkey
  FOREIGN KEY (league_id) REFERENCES public.leagues(id)
  ON DELETE CASCADE;
