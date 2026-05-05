-- Migration 006: Create league_snapshots table
-- Run this in the Supabase SQL editor on the Schedule Project (production).
--
-- Safe to run multiple times (IF NOT EXISTS).

-- 1. Create the snapshots table
CREATE TABLE IF NOT EXISTS league_snapshots (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  league_id   TEXT        NOT NULL,
  name        TEXT        NOT NULL,
  data        JSONB       NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by  TEXT        NOT NULL DEFAULT 'Unknown'
);

-- 2. Index for fast per-league lookups
CREATE INDEX IF NOT EXISTS league_snapshots_league_id_idx
  ON league_snapshots (league_id, created_at DESC);

-- 3. Enable Row Level Security
ALTER TABLE league_snapshots ENABLE ROW LEVEL SECURITY;

-- 4. RLS policies — any authenticated user can read/write/delete snapshots.
--    The league code is already the access-control gate (only admins know it).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'league_snapshots' AND policyname = 'authenticated_select'
  ) THEN
    CREATE POLICY authenticated_select ON league_snapshots
      FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'league_snapshots' AND policyname = 'authenticated_insert'
  ) THEN
    CREATE POLICY authenticated_insert ON league_snapshots
      FOR INSERT TO authenticated WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'league_snapshots' AND policyname = 'authenticated_delete'
  ) THEN
    CREATE POLICY authenticated_delete ON league_snapshots
      FOR DELETE TO authenticated USING (true);
  END IF;
END $$;
