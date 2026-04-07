-- Migration 002: Create user_subscriptions table, RLS policies, and new-user trigger
-- Run this in the Supabase SQL editor AFTER migration 001.

-- 1. Subscription cache table
CREATE TABLE IF NOT EXISTS user_subscriptions (
  user_id             UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id  TEXT UNIQUE,
  plan_tier           TEXT NOT NULL DEFAULT 'trial',
  subscription_status TEXT NOT NULL DEFAULT 'trialing',
  subscription_end    TIMESTAMPTZ,
  leagues_limit       INT  NOT NULL DEFAULT 1,
  divisions_limit     INT  NOT NULL DEFAULT 2,
  teams_limit         INT  NOT NULL DEFAULT 8,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Row Level Security on leagues
ALTER TABLE leagues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner or unclaimed can read" ON leagues;
CREATE POLICY "owner or unclaimed can read"
  ON leagues FOR SELECT
  USING (owner_id IS NULL OR owner_id = auth.uid());

DROP POLICY IF EXISTS "owner or unclaimed can write" ON leagues;
CREATE POLICY "owner or unclaimed can write"
  ON leagues FOR INSERT
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "owner can update" ON leagues;
CREATE POLICY "owner can update"
  ON leagues FOR UPDATE
  USING (owner_id IS NULL OR owner_id = auth.uid());

-- 3. Row Level Security on user_subscriptions
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user sees own subscription" ON user_subscriptions;
CREATE POLICY "user sees own subscription"
  ON user_subscriptions FOR SELECT
  USING (user_id = auth.uid());

-- Service role can do everything on user_subscriptions (for webhooks)
DROP POLICY IF EXISTS "service role full access" ON user_subscriptions;
CREATE POLICY "service role full access"
  ON user_subscriptions
  USING (true)
  WITH CHECK (true);

-- 4. Auto-provision trial tier when a new user confirms their email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.user_subscriptions (user_id, plan_tier, subscription_status)
  VALUES (NEW.id, 'trial', 'trialing')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
