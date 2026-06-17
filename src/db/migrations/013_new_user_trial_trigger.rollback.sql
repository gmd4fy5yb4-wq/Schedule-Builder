-- Rollback 013: drop the new-user trial trigger + function.
-- Does NOT delete backfilled rows (they are real trial grants; remove manually if needed).
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
