-- Migration 014: Start the 14-day trial clock at first schedule generation, not signup.
-- Run in the Supabase SQL editor for Alfred Digital Sports (actgfxrinoxlyrprzkoh).
--
-- Why: migration 013 stamped subscription_end = now()+14d at signup. An admin who
-- signs up in the off-season burns the entire trial before they ever build a
-- schedule, and churns without seeing the product work (design review, finding 2).
--
-- New shape: signup writes trial_started_at = NULL and subscription_end = NULL.
-- Middleware already reads a NULL subscription_end as "no expiry", so an unstarted
-- trial has full access. /api/leagues/save stamps both columns the first time it
-- saves a league whose schedule has been generated — see the trial-clock block in
-- src/app/api/leagues/save/route.ts. That write is gated on
-- plan_tier = 'trial' AND trial_started_at IS NULL, so it is one-shot and can
-- never touch the 4 plan_tier='unlimited' tester rows or a paid subscriber.

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
    NULL, NULL          -- clock starts at first schedule generation, not here
  )
  ON CONFLICT (user_id) DO NOTHING;  -- never overwrite an existing row (protects testers)
  RETURN NEW;
END;
$$;

-- Trigger from 013 still points at this function — no need to recreate it.

-- Deliberately NOT backfilled: users already mid-trial keep the clock they were
-- given. Resetting live trials would silently extend access for anyone who signed
-- up under 013, and there is no way to tell an abandoned trial from an active one.
