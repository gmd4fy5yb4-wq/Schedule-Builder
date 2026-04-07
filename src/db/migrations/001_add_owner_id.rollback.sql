-- Rollback 001: Remove owner_id from leagues table
-- Run this in the Supabase SQL editor ONLY if you need to undo migration 001.

ALTER TABLE leagues DROP COLUMN IF EXISTS owner_id;
