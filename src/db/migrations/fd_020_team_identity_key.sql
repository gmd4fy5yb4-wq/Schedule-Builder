-- fd_020_team_identity_key.sql — cross-org team identity, as a link not a merge
--
-- STATUS: APPLIED to production 2026-08-31 via Supabase MCP (name: fd_020_team_identity_key).
--
-- WHY: venues and fields are global in 2.0, so a shared field resolves to ONE row and a
-- cross-org collision on it is detectable. TEAMS are not global — fd2_teams is org-scoped
-- with unique (season_id, name) — so the same real-world team appears once per league, under
-- whatever name that league typed. The first data load proved the cost immediately: four
-- "cross-org double-bookings" in September 2026 that are not conflicts at all, but ONE
-- interleague game recorded in both leagues. LEv-IT books it against its "Away Team"
-- placeholder; Jonathan's league books the same slot naming the real opponent.
--
--   LEv-IT "Force (14U) Harrison"        = Jonathan "Force (White)"       (Greg, 2026-08-31)
--   LEv-IT "Force (16U) Herrera"         = Jonathan "Force (Hererra)"     (same name, misspelt)
--   LEv-IT "Force Blue (10U) Ciccarello" = Jonathan "Force (Blue)"        (Greg, 2026-08-31)
--
-- A LINK, NOT A MERGE. Each org keeps its own team row, its own name, its own division and
-- its own contacts — merging would raise an ownership question nobody has answered and would
-- destroy each league's naming. Two rows sharing identity_key are the same real-world team;
-- NULL means "not known to be the same as anything", which is the safe default and stays the
-- default for every team.
--
-- Populated from the human-confirmed `_team_identity` map in scripts/field-aliases.json,
-- emitted by scripts/convert-to-v2.mjs. NEVER inferred from names: "Force (White)" and
-- "Force (14U) Harrison" share almost no trigrams, and real data misspells "Herrera".
--
-- Verified after applying: 6 teams carry a key, 3 keys each spanning exactly 2 orgs,
-- 0 real cross-org conflicts remain, 4 overlaps correctly reclassified as duplicate records.
--
-- Purely additive: one nullable column on one fd2_ table. Reversible with
--   alter table public.fd2_teams drop column identity_key;

begin;

alter table public.fd2_teams
  add column if not exists identity_key text;

comment on column public.fd2_teams.identity_key is
  'Cross-org identity for the same real-world team. Two rows sharing a key are one team in '
  'two leagues. NULL = not known to be shared (the default). Set from a human-confirmed map '
  'in scripts/field-aliases.json (_team_identity) — never inferred from names, which differ '
  'between leagues and are misspelt in real data.';

-- Partial: the column is NULL for almost every team, and only the shared ones are looked up.
create index if not exists idx_fd2_teams_identity
  on public.fd2_teams (identity_key) where identity_key is not null;

commit;

-- Applied 2026-08-31 alongside this data update:
--
-- with pairs(identity_key, org_name, team_name) as (values
--   ('force-14u-harrison',   'LEv-IT',               'Force (14U) Harrison'),
--   ('force-14u-harrison',   'Jonathan Fall League', 'Force (White)'),
--   ('force-16u-herrera',    'LEv-IT',               'Force (16U) Herrera'),
--   ('force-16u-herrera',    'Jonathan Fall League', 'Force (Hererra)'),
--   ('force-10u-ciccarello', 'LEv-IT',               'Force Blue (10U) Ciccarello'),
--   ('force-10u-ciccarello', 'Jonathan Fall League', 'Force (Blue)')
-- )
-- update public.fd2_teams t set identity_key = p.identity_key
-- from pairs p join public.fd2_orgs o on o.name = p.org_name
-- where t.org_id = o.id and t.name = p.team_name;
