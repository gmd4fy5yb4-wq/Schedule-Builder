-- Rollback for Migration 010: remove the auto-snapshot guard.
-- Run in the Supabase SQL editor (Alfred Digital Sports project).

DROP TRIGGER IF EXISTS trg_leagues_guard_snapshot ON public.leagues;
DROP FUNCTION IF EXISTS public.guard_snapshot_leagues();
DROP FUNCTION IF EXISTS public.league_item_count(jsonb);
DROP FUNCTION IF EXISTS public.jsonb_arr_len(jsonb);
