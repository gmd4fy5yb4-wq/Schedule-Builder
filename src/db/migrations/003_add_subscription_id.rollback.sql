-- Rollback 003: Remove stripe_subscription_id column
ALTER TABLE user_subscriptions DROP COLUMN IF EXISTS stripe_subscription_id;
