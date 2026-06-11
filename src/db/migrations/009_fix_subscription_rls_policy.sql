-- Migration 009: Fix critical RLS hole on user_subscriptions
-- Run this in the Supabase SQL editor AFTER migration 008.
--
-- WHY: Migration 002 created a permissive policy with no role restriction:
--
--   CREATE POLICY "service role full access"
--     ON user_subscriptions USING (true) WITH CHECK (true);
--
-- With no `TO` clause it defaults to ALL roles (anon + authenticated), not
-- just service_role. The service role already BYPASSES RLS, so this policy
-- did nothing for webhooks — but it granted every logged-in user full
-- read/write to user_subscriptions via the public REST API. A user could:
--
--   UPDATE user_subscriptions
--   SET plan_tier='large', subscription_status='active'
--   WHERE user_id = auth.uid();
--
-- ...and unlock unlimited access without paying. This migration removes that
-- policy. After this runs, the only authenticated-user access is SELECT of
-- their own row (policy "user sees own subscription"). All writes happen via
-- the service-role webhook client, which bypasses RLS, and the SECURITY
-- DEFINER trigger handle_new_user(), which still provisions trial rows.

DROP POLICY IF EXISTS "service role full access" ON user_subscriptions;

-- Defense in depth: ensure no INSERT/UPDATE/DELETE policy exists for the
-- authenticated/anon roles. (No such policy is created here, so with RLS
-- enabled and no permissive write policy, all client writes are denied.)
