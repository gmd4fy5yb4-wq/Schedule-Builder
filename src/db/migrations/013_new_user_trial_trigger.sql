-- Migration 013: Recreate the new-user trial trigger (sports-model aware) + backfill.
-- Run in the Supabase SQL editor for Alfred Digital Sports (actgfxrinoxlyrprzkoh).
--
-- Why: the on_auth_user_created trigger from migration 002 does NOT exist in this DB,
-- so new signups never get a user_subscriptions row and middleware sends them straight
-- to /pricing (no free trial). Migration 002's trigger body is also stale — it relies on
-- column defaults that predate the sports model (sports_limit would default to 1, no
-- trial_started_at, no expiry). This version writes correct trial limits (full Pro: 3/10/100),
-- stamps trial_started_at, and sets subscription_end = now()+14d so the existing
-- subscription_end check in middleware expires the trial automatically (no code change).

-- 1. Trial-provisioning function (sports-model aware)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_subscriptions (
    user_id, plan_tier, subscription_status,
    sports_limit, divisions_limit, teams_limit, leagues_limit,
    trial_started_at, subscription_end
  )
  VALUES (
    NEW.id, 'trial', 'trialing',
    3, 10, 100, 999,
    now(), now() + interval '14 days'
  )
  ON CONFLICT (user_id) DO NOTHING;  -- never overwrite an existing row (protects testers)
  RETURN NEW;
END;
$$;

-- 2. (Re)create the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 3. Backfill users who signed up before the trigger existed and have no row.
--    LEFT JOIN ... IS NULL + ON CONFLICT DO NOTHING = double guard; the 4 unlimited
--    testers and any user who already has a row are untouched. Gives each a fresh
--    14-day trial from now (they never got one).
INSERT INTO public.user_subscriptions (
  user_id, plan_tier, subscription_status,
  sports_limit, divisions_limit, teams_limit, leagues_limit,
  trial_started_at, subscription_end
)
SELECT u.id, 'trial', 'trialing',
       3, 10, 100, 999,
       now(), now() + interval '14 days'
FROM auth.users u
LEFT JOIN public.user_subscriptions s ON s.user_id = u.id
WHERE s.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;
