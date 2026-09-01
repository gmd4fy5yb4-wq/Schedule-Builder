-- fd_021_field_is_placeholder.sql — keep "TBD" fields out of the shared registry
--
-- STATUS: APPLIED to production 2026-08-31 via Supabase MCP (name: fd_021_field_is_placeholder).
--
-- WHY: leagues routinely know a game's date, time and teams before they know the field — an
-- opponent has not named their home diamond yet, or the park assignment lands later. The
-- established workaround in 1.0 is to create a field called "TBD"/"TBA" and book onto it.
--
-- THAT WORKAROUND IS GOOD AND IS DELIBERATELY PRESERVED. Greg, 2026-08-31: "It has been very
-- helpful for us to create a field called TBD or TBA and just use that when we don't know the
-- field. It does mark the team as busy." Marking the team busy is the behaviour that matters,
-- and it falls out for free precisely BECAUSE the game genuinely has a field. An earlier
-- design replaced this with a location_status enum, a day_part column and a candidate-field
-- join table; it was dropped for being a subsystem built over a working solution.
--
-- The workaround breaks in exactly one place, and only in 2.0. Venues and fields here are
-- GLOBAL, owned by the first org to define them, so one league's "TBD" becomes a shared row
-- other leagues could be granted against — and two leagues each with a "TBD" field would
-- collide into a single row via unique (venue_id, name).
--
-- So a placeholder is marked, kept private to its org (the converter keys it by org id),
-- never matched across orgs and never granted. It stays fully bookable: a placeholder is a
-- real scheduling commitment, just not a located one.
--
-- Verified after applying: the one placeholder is org-private with 0 cross-org grants,
-- 0 orphan fields or bookings, and the 3 REAL shared-field grants still work — the guard
-- did not break the point of the registry.
--
-- Purely additive: one boolean on one fd2_ table. Reversible with
--   alter table public.fd2_fields drop column is_placeholder;
--
-- NOTE for anyone re-running the converter across this change: org-scoping alters a
-- placeholder's deterministic UUIDv5 id, so the pre-fd_021 row is superseded rather than
-- updated. The stale row and its venue were removed by hand, guarded on having zero
-- bookings and zero grants.

begin;

alter table public.fd2_fields
  add column if not exists is_placeholder boolean not null default false;

comment on column public.fd2_fields.is_placeholder is
  'True when this field stands in for a location that is not yet known ("TBD"/"TBA"). '
  'Set by the converter from the field/venue name. Placeholders are scoped to their owning '
  'org rather than shared globally, are never matched across orgs and never granted, and '
  'carry no address or coordinates. They ARE bookable — a placeholder records a real '
  'commitment whose location is still open, which is how leagues actually schedule.';

-- Placeholders are the rows a scheduler chases down, so make "which are still open" cheap.
create index if not exists idx_fd2_fields_placeholder
  on public.fd2_fields (owner_org_id) where is_placeholder;

commit;
