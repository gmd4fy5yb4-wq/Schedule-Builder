-- Migration 012: pricing redesign — sports gate + trial + billing period
-- Run MANUALLY in the Supabase SQL editor (Sports project actgfxrinoxlyrprzkoh).
-- Additive only. Does NOT touch the `leagues` table or any league blob.
--
-- Safety: existing `plan_tier='unlimited'` tester rows (incl. the owner of live
-- league YWWM8G) have leagues_limit=999; the backfill below grants them
-- sports_limit=999 so the new gate never blocks them.

ALTER TABLE user_subscriptions
  ADD COLUMN IF NOT EXISTS sports_limit     INTEGER     NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ,                       -- null until first schedule generation
  ADD COLUMN IF NOT EXISTS billing_period   TEXT        NOT NULL DEFAULT 'annual'
    CHECK (billing_period IN ('annual','season_3mo'));

-- Protect unlimited/tester rows: unlimited sports too.
UPDATE user_subscriptions
  SET sports_limit = 999
  WHERE leagues_limit >= 999;

-- leagues_limit / teams_limit left in place (teams_limit still guarded; leagues_limit now unused).
