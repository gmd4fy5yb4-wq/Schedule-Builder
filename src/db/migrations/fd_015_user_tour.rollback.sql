-- Rollback for fd_015_user_tour. Reference only — not recorded in _migrations.
-- Dropping the table makes every user eligible for the welcome modal again.

DROP POLICY IF EXISTS fd_user_tour_insert_own ON public.fd_user_tour;
DROP POLICY IF EXISTS fd_user_tour_select_own ON public.fd_user_tour;
DROP TABLE IF EXISTS public.fd_user_tour;

DELETE FROM public._migrations
 WHERE app_name = 'fieldday-planner' AND migration_name = 'fd_015_user_tour';
