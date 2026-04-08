-- Migration 003: Add stripe_subscription_id to user_subscriptions
-- Allows webhook to validate subscription ID matches before updating records.

ALTER TABLE user_subscriptions
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT UNIQUE;
