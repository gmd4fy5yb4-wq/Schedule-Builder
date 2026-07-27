-- Migration 011: Fix SECURITY DEFINER view advisor (lint 0010)
-- Run in the Supabase SQL editor (Alfred Digital Sports project).
--
-- WHY: The reporting view public._migrations_summary is, like all Postgres
-- 15+ views, SECURITY DEFINER by default. Exposed via PostgREST in the public
-- schema, it runs as its owner (postgres) and bypasses the RLS of the calling
-- user, so any signed-in user could read it through /rest/v1/_migrations_summary.
-- It only exposes migration metadata (app name, counts, last-applied date) so
-- the impact is low, but the secure posture is to evaluate it as the caller.
--
-- WHAT THIS DOES: switches the view to security_invoker. After this, the view
-- respects the querying user's permissions/RLS. Because _migrations has RLS
-- enabled with no client policy (deny-all), API clients will get zero rows,
-- while the service_role / postgres (which bypass RLS) still see everything.
-- This resolves advisor lint 0010_security_definer_view.

ALTER VIEW public._migrations_summary SET (security_invoker = on);
