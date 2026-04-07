-- Rollback 002: Remove subscriptions table, RLS policies, and trigger
-- Run this in the Supabase SQL editor ONLY if you need to undo migration 002.

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

DROP POLICY IF EXISTS "service role full access" ON user_subscriptions;
DROP POLICY IF EXISTS "user sees own subscription" ON user_subscriptions;
DROP TABLE IF EXISTS user_subscriptions;

DROP POLICY IF EXISTS "owner can update" ON leagues;
DROP POLICY IF EXISTS "owner or unclaimed can write" ON leagues;
DROP POLICY IF EXISTS "owner or unclaimed can read" ON leagues;
ALTER TABLE leagues DISABLE ROW LEVEL SECURITY;
