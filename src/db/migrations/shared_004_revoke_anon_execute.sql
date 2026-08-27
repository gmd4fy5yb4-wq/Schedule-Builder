-- shared_004_revoke_anon_execute.sql — take anon's EXECUTE off every SECURITY
-- DEFINER function in the Sports DB. Cross-app, so `shared_`: it touches
-- AthleteCard, FieldDay and the shared signup pair at once.
-- Run via mcp__supabase-sports__apply_migration (name: shared_004_revoke_anon_execute).
--
-- WHY shared_001 AND mkt_003 BOTH FAILED AT THIS. Both wrote
--   revoke all on function ... from public;
--   grant execute on function ... to authenticated;
-- and both left anon holding EXECUTE. Supabase ships
--   alter default privileges in schema public grant execute on functions
--     to anon, authenticated, service_role;
-- so every function is created with an EXPLICIT `anon=X` entry in its ACL,
-- separate from the PUBLIC default. Revoking PUBLIC does not touch it. This is
-- the mirror of the better-known trap (revoking anon while PUBLIC stands) — you
-- have to revoke BOTH, and `pg_proc.proacl` is the only place it shows.
-- Reading the migration source tells you nothing; three migrations across three
-- databases have now looked correct and done nothing.
--
-- WHY BOTHER, given none of these leaked. Measured as anon before this ran:
-- save_card_design failed on ac_cards.owner_id NOT NULL; confirm_app_signup
-- no-op'd on its own `auth.uid() is null` guard; record_app_signup and
-- handle_new_user are trigger-only; get_unlockables_with_owned returned the
-- 22-row cosmetics catalog and nothing athlete-specific. So this closes no open
-- hole. It is defence in depth on `ac_` — AthleteCard's tables are minors' data,
-- and the house rule is that the most protective option wins. A constraint and a
-- null-guard are what stand between anon and those functions today; a grant is a
-- better boundary than either, because neither of those was put there to be one.
--
-- SAFE BECAUSE: no RLS policy in this DB references any of these six
-- (checked against pg_policies — a function named in a policy is a grant
-- requirement, since predicates evaluate as the CALLING role, and revoking one
-- turns a working page into 42501). Every app call site is behind auth:
-- athletecard/src/app/(app)/{designer,stats,theme-binder,onboarding}.tsx.
revoke execute on function public.get_unlockables_with_owned(uuid) from anon, public;
revoke execute on function public.save_card_design(jsonb, text)    from anon, public;
revoke execute on function public.confirm_app_signup(text)         from anon, public;
revoke execute on function public.record_app_signup()              from anon, public;
revoke execute on function public.handle_new_user()                from anon, public;
revoke execute on function public.guard_snapshot_leagues()         from anon, public;

-- Re-assert the intended grants. The trigger functions get none: a trigger runs
-- as the table owner, not as whoever fired it.
grant execute on function public.get_unlockables_with_owned(uuid) to authenticated;
grant execute on function public.save_card_design(jsonb, text)    to authenticated;
grant execute on function public.confirm_app_signup(text)         to authenticated;

-- Verify by effect, not by reading the file that just failed twice:
--   select proname, proacl from pg_proc
--   where pronamespace = 'public'::regnamespace and prosecdef;
--   -- no `anon=X` may remain on these six.
