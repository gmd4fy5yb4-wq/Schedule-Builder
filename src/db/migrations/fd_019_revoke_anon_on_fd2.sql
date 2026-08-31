-- fd_019_revoke_anon_on_fd2.sql — close the default-privilege anon grants on fd2_*
--
-- STATUS: APPLIED 2026-08-31 via Supabase MCP (name: fd_019_revoke_anon_on_fd2).
--
-- WHY: Supabase's ALTER DEFAULT PRIVILEGES grants anon on every new table in
-- `public`, and grants EXECUTE on every new function. fd_016 revoked EXECUTE
-- from PUBLIC and re-granted to `authenticated`, but that is a no-op against an
-- EXPLICIT anon grant — the same trap as spoc_006. Measured after fd_016:
-- anon held table privileges on all 12 fd2_ tables and EXECUTE on all 5 fd2_
-- functions.
--
-- NOT a live leak: every fd_016 policy is scoped `to authenticated`, so anon
-- read 0 rows (verified by impersonation before this migration). This is
-- defence in depth — it removes the tripwire before any data lands, so a future
-- policy written without a `to authenticated` clause cannot silently expose rows.
--
-- Purely subtractive, and touches only fd2_* objects. `authenticated` and
-- `service_role` are deliberately untouched: the app runs as both.
--
-- Verified after applying: anon table grants NONE; anon/public EXECUTE NONE;
-- authenticated retains all 12 tables and all 5 functions.

begin;

revoke all on public.fd2_orgs,
              public.fd2_org_members,
              public.fd2_seasons,
              public.fd2_venues,
              public.fd2_divisions,
              public.fd2_fields,
              public.fd2_teams,
              public.fd2_team_contacts,
              public.fd2_field_grants,
              public.fd2_staff,
              public.fd2_blackouts,
              public.fd2_bookings
  from anon;

-- Revoke from public FIRST, then anon: an explicit anon grant survives a
-- public-only revoke, and a PUBLIC grant survives an anon-only revoke. Both
-- have bitten this database (shared_002, spoc_006).
revoke execute on function public.fd2_role_in(uuid)         from public, anon;
revoke execute on function public.fd2_can_write(uuid)       from public, anon;
revoke execute on function public.fd2_field_access(uuid)    from public, anon;
revoke execute on function public.fd2_can_book_field(uuid)  from public, anon;
revoke execute on function public.fd2_touch_updated_at()    from public, anon;

-- Re-assert the intended grant, in case the revoke above removed it via PUBLIC.
grant execute on function public.fd2_role_in(uuid)        to authenticated;
grant execute on function public.fd2_can_write(uuid)      to authenticated;
grant execute on function public.fd2_field_access(uuid)   to authenticated;
grant execute on function public.fd2_can_book_field(uuid) to authenticated;

commit;
