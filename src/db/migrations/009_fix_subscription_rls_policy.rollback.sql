-- Rollback for migration 009.
-- WARNING: This restores the INSECURE permissive policy from migration 002,
-- which lets any authenticated user grant themselves any plan for free.
-- Only run this if you fully understand and accept that risk.

CREATE POLICY "service role full access"
  ON user_subscriptions
  USING (true)
  WITH CHECK (true);
