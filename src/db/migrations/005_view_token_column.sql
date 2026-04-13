-- Migration 005: Ensure view_token column exists and grant function execute permission
-- Run this in the Supabase SQL editor on any project that ran migrations 001-004.
--
-- Safe to run multiple times (IF NOT EXISTS / OR REPLACE / CREATE OR REPLACE).

-- 1. Add view_token column if it isn't already on the leagues table
ALTER TABLE leagues
  ADD COLUMN IF NOT EXISTS view_token UUID;

-- 2. Grant execute on the view-token function to authenticated users
--    (SECURITY DEFINER functions are not callable by default without an explicit grant)
GRANT EXECUTE ON FUNCTION public.get_or_create_view_token(TEXT) TO authenticated;

-- 3. Grant execute on the handle_new_user trigger function as well (good hygiene)
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;
