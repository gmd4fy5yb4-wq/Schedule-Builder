-- Migration 001: Add owner_id to leagues table
-- Run this in the Supabase SQL editor on the target project.
-- Safe to run multiple times (uses IF NOT EXISTS / ON CONFLICT DO NOTHING).

ALTER TABLE leagues
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
