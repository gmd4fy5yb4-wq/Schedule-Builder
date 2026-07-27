-- Rollback for Migration 011: revert the view to SECURITY DEFINER (default).
-- Run in the Supabase SQL editor (Alfred Digital Sports project).

ALTER VIEW public._migrations_summary SET (security_invoker = off);
