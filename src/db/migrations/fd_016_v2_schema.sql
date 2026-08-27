-- fd_016_v2_schema.sql — FieldDay Planner 2.0 core schema
--
-- STATUS: DRAFT. NOT APPLIED. Do not run this in the SQL editor yet.
--
-- SAFETY CONTRACT (read before editing):
--   * This migration is PURELY ADDITIVE. It creates only `fd2_*` tables and
--     `fd2_*` functions. It does not name, alter, drop, or grant on `leagues`,
--     `league_snapshots`, `user_subscriptions`, `profiles`, or any Prospect
--     Card / AthleteCard table. 1.0 remains the system of record and cannot be
--     affected by anything below.
--   * The `fd2_` prefix must be registered in the Table Ownership Map in
--     memory/migrations.md before this is applied.
--   * Restore points for the two live leagues were taken 2026-08-27:
--     .backups/{UC2YE8,YWWM8G}-2026-08-27-pre-v2.json plus labeled rows in
--     league_snapshots (created_by = 'system:pre-v2').
--
-- SCOPE: team-level scheduling only. There is no player entity anywhere in
-- this schema, by design and permanently. No child's name enters the system.
--
-- =====================================================================
-- Design decisions worth knowing before you read the DDL
-- =====================================================================
--
-- 1. BOOKINGS, NOT GAMES. One table holds games, practices, scrimmages,
--    events, and block reservations. The LEv-IT matrix is ~57% practices;
--    a games table with practices bolted on is the wrong core object.
--
-- 2. NO EXCLUSION CONSTRAINT ON OVERLAP — deliberate. A double-booking must
--    WARN, never refuse. Their sheet lets them type anything and they are
--    right often enough that blocking would make this worse than the sheet.
--    Overlap is a query (see idx_fd2_bookings_field_date), not a constraint.
--
-- 3. FREE TEXT IS FIRST CLASS. `title` and `source_raw` mean a cell can hold
--    "DAVID WODA 5:30pm FARMS" before anyone resolves it into structure.
--    `needs_review` is the import queue. Structure accretes; it never gates.
--
-- 4. NO FIELD-PRIORITY OVERRIDE TABLE. The xlsx shows Red Wing Grass 60
--    flipping between MINORS and a Williamsport team week to week. That is
--    not an override — it is a division holding a field for a window, which
--    is a kind='block' booking. One concept, not two.
--
-- 5. HOME/AWAY IS TWO THINGS. Whose venue it is (derived from field_id, always
--    knowable) and who bats last (often a coin flip at the field). Only the
--    second is stored, it is NULLABLE, and `home_away_method` records how it
--    was decided. Travel-burden reporting uses the venue, so a coin flip can
--    never corrupt it.
--
-- 6. BLACKOUTS ARE DATE RANGES, one polymorphic table. "Stokes not available"
--    for two weeks is one row, not fourteen. All-NULL target = whole org.
--
-- 7. CONCURRENCY IS THE POINT. Per-row writes mean two people editing
--    different cells cannot collide — that is what makes this match a shared
--    sheet instead of losing to it. `updated_at` is the optimistic-concurrency
--    token for same-row edits (UPDATE ... WHERE id = $1 AND updated_at = $2).
--    No version column needed.
--
-- 8. DIVISIONS BELONG TO THE ORG, TEAMS BELONG TO THE SEASON. Majors persists
--    across years; the 2027 Majors roster of teams does not.
--
-- 9. EXTERNAL OPPONENTS ARE FLAGS, NOT A FEDERATION. 70% of LEv-IT's softball
--    games are interleague. `is_external` on teams and venues covers it.
--    Cross-org shared game objects are a trust/permissions project — YAGNI
--    until two orgs are both on the platform.

begin;

-- =====================================================================
-- Organizations and people
-- =====================================================================

create table if not exists public.fd2_orgs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  slug        text unique,
  timezone    text not null default 'America/New_York',
  -- settings: { "home_away_mode": "venue" | "scheduled" }
  -- 'venue'    = who bats last is decided at the field (default; matches custom)
  -- 'scheduled'= the schedule's home_team_id is policy
  settings    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null
);

-- The membership table 1.0 never had. Today the 6-char league code IS the
-- credential and it grants full edit to anyone who knows it. That is not
-- sellable to a board.
create table if not exists public.fd2_org_members (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.fd2_orgs(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in
                ('owner','admin','scheduler','commissioner','coach','viewer')),
  -- Scope for narrow roles: a commissioner runs one division, a coach one team.
  division_id uuid,   -- FK added after fd2_divisions exists
  team_id     uuid,   -- FK added after fd2_teams exists
  created_at  timestamptz not null default now(),
  unique (org_id, user_id, role, division_id, team_id)
);

-- =====================================================================
-- Seasons
-- =====================================================================

create table if not exists public.fd2_seasons (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.fd2_orgs(id) on delete cascade,
  name          text not null,                    -- "Spring 2027"
  sports        text[] not null default '{}',     -- carries 1.0's multi-sport model
  start_date    date not null,
  end_date      date not null,
  status        text not null default 'planning'
                  check (status in ('planning','active','archived')),
  created_at    timestamptz not null default now(),
  check (end_date >= start_date)
);

-- =====================================================================
-- Venues and fields
-- =====================================================================

-- 1.0 had venue as a free-text string on each field, so "all Red Wing fields"
-- was not expressible. LEv-IT runs 16 fields across 6 venues.
-- Venues and fields are GLOBAL records with an owning org, not org-scoped rows.
-- Two organizations booking the same physical turf must resolve to the SAME row,
-- or cross-org double-bookings are undetectable — which is the live risk between
-- YWWM8G (LEv-IT) and UC2YE8 (Jonathan), who share Azalea and MacLaren under
-- different names. See docs/superpowers/specs/2026-08-27-shared-field-registry-design.md
--
-- owner_org_id NULL = platform-seeded (a public park nobody has claimed).
create table if not exists public.fd2_venues (
  id            uuid primary key default gen_random_uuid(),
  owner_org_id  uuid references public.fd2_orgs(id) on delete set null,
  name          text not null,                     -- "Red Wing", "Hicksville"
  address       text,
  geo_lat       double precision,
  geo_lon       double precision,
  is_external   boolean not null default false,    -- not this org's home park
  is_seed       boolean not null default false,    -- shipped with the product
  verified_at   timestamptz,                       -- an owner confirmed the details
  notes         text,
  created_at    timestamptz not null default now()
);
-- No unique(org,name): the same venue may legitimately be reached by many orgs,
-- and near-duplicate names are resolved by human-confirmed matching, never by a
-- constraint that would simply reject the second league's spelling.
create index if not exists idx_fd2_venues_name on public.fd2_venues (lower(name));
create index if not exists idx_fd2_venues_geo  on public.fd2_venues (geo_lat, geo_lon);

create table if not exists public.fd2_divisions (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references public.fd2_orgs(id) on delete cascade,
  name                     text not null,          -- "Majors", "T-Ball", "Softball"
  sort_order               int  not null default 0,
  default_game_minutes     int  not null default 90,
  default_practice_minutes int  not null default 90,
  game_days                int[] not null default '{}',  -- 0=Sun .. 6=Sat
  preferred_start_time     time,
  created_at               timestamptz not null default now(),
  unique (org_id, name)
);

-- Global, like fd2_venues. `owner_org_id` is the permit holder; other orgs reach
-- it through fd2_field_grants. NULL = seeded/unclaimed public field.
create table if not exists public.fd2_fields (
  id                   uuid primary key default gen_random_uuid(),
  owner_org_id         uuid references public.fd2_orgs(id) on delete set null,
  is_seed              boolean not null default false,
  verified_at          timestamptz,
  venue_id             uuid not null references public.fd2_venues(id) on delete cascade,
  name                 text not null,              -- "Turf 75", "Dirt 75", "Tball 1"
  -- Base distance is a HARD constraint the sheet encodes only in field names
  -- ("RED WING TURF 75"). A Majors game cannot go on a 60' field. Today that
  -- rule lives only in the head of whoever fills in the spreadsheet.
  base_distance_ft     int check (base_distance_ft between 40 and 120),
  surface              text check (surface in ('turf','grass','dirt','other')),
  has_lights           boolean not null default false,
  -- 1.0 hardcoded "open 8 AM - 8 PM every day, no slot configuration needed".
  opens_at             time not null default '08:00',
  closes_at            time not null default '20:00',
  -- Column B of the matrix: the OWNER's allocation policy for its own field.
  -- Deliberately stays on the field, not on a grant — it is the permit holder's
  -- policy, which is exactly what the matrix column records. Another org does not
  -- set priority on someone else's field.
  priority_division_id uuid references public.fd2_divisions(id) on delete set null,
  sort_order           int not null default 0,
  created_at           timestamptz not null default now(),
  unique (venue_id, name),
  check (closes_at > opens_at)
);

-- Who may book a field they do not own, and how much of it they can see.
--   * the OWNING org needs no row — its access is implicit
--   * no row at all = no booking, no visibility
--   * a field with owner_org_id IS NULL (seeded/unclaimed) is bookable by anyone:
--     FieldDay is not the permit authority and must not refuse a real booking on
--     a public park because no row says it may (decision 1, 2026-08-27)
create table if not exists public.fd2_field_grants (
  id          uuid primary key default gen_random_uuid(),
  field_id    uuid not null references public.fd2_fields(id) on delete cascade,
  org_id      uuid not null references public.fd2_orgs(id)   on delete cascade,
  can_book    boolean not null default true,
  -- 'busy'   = only that a time range is occupied. No team, no title, no notes.
  -- 'detail' = the full booking, as the owner sees it.
  visibility  text not null default 'busy'
                check (visibility in ('busy','detail')),
  granted_by  uuid references auth.users(id) on delete set null,
  expires_at  timestamptz,                       -- permits are seasonal
  created_at  timestamptz not null default now(),
  unique (field_id, org_id)
);
create index if not exists idx_fd2_field_grants_org on public.fd2_field_grants (org_id, field_id);

-- =====================================================================
-- Teams and contacts
-- =====================================================================

create table if not exists public.fd2_teams (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.fd2_orgs(id) on delete cascade,
  season_id      uuid not null references public.fd2_seasons(id) on delete cascade,
  division_id    uuid references public.fd2_divisions(id) on delete set null,
  name           text not null,                    -- "Wolverines (10U4)"
  -- Interleague opponents. Excluded from plan quotas and from standings.
  is_external    boolean not null default false,
  external_org   text,                             -- "Central Nassau"
  home_venue_id  uuid references public.fd2_venues(id) on delete set null,
  preferred_days int[] not null default '{}',
  sort_order     int not null default 0,
  created_at     timestamptz not null default now(),
  unique (season_id, name)
);

-- The only PII in the system: adult coach contact details. No players.
-- `user_id` is set when a coach also has a login; NULL means contact-only.
create table if not exists public.fd2_team_contacts (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.fd2_orgs(id) on delete cascade,
  team_id    uuid not null references public.fd2_teams(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete set null,
  name       text not null,
  role       text not null default 'head' check (role in ('head','assistant','other')),
  phone      text,
  email      text,
  created_at timestamptz not null default now()
);

-- Umpires and field staff. 1.0 keeps these as two separate arrays (`umpires`
-- and `fieldStaff`); they differ only by role, so they merge into one table.
-- Umpire assignment is real scheduling with its own conflict rule in 1.0
-- ("already assigned to an overlapping game"), so it survives into 2.0.
create table if not exists public.fd2_staff (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.fd2_orgs(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete set null,
  name       text not null,
  role       text not null default 'umpire' check (role in
               ('umpire','scorer','concessions','groundskeeper','other')),
  phone      text,
  email      text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- Deferred FKs on the membership scope columns
alter table public.fd2_org_members
  add constraint fd2_org_members_division_fk
    foreign key (division_id) references public.fd2_divisions(id) on delete cascade,
  add constraint fd2_org_members_team_fk
    foreign key (team_id) references public.fd2_teams(id) on delete cascade;

-- =====================================================================
-- Blackouts — date ranges, polymorphic target
-- =====================================================================

create table if not exists public.fd2_blackouts (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.fd2_orgs(id) on delete cascade,
  season_id   uuid not null references public.fd2_seasons(id) on delete cascade,
  -- Exactly one target, or none (= whole organization, e.g. a holiday)
  field_id    uuid references public.fd2_fields(id)    on delete cascade,
  venue_id    uuid references public.fd2_venues(id)    on delete cascade,
  team_id     uuid references public.fd2_teams(id)     on delete cascade,
  division_id uuid references public.fd2_divisions(id) on delete cascade,
  start_date  date not null,
  end_date    date not null,
  reason      text,                                 -- "not permitted", "maintenance"
  created_at  timestamptz not null default now(),
  check (end_date >= start_date),
  check (num_nonnulls(field_id, venue_id, team_id, division_id) <= 1)
);

-- =====================================================================
-- Bookings — the core object
-- =====================================================================

create table if not exists public.fd2_bookings (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.fd2_orgs(id) on delete cascade,
  season_id         uuid not null references public.fd2_seasons(id) on delete cascade,

  -- NULL field = an off-site or venue-less event (e.g. a parade). In 1.0 a
  -- special event carried free-text `location` and could not occupy a field
  -- at all, so it was invisible to conflict checks.
  field_id          uuid references public.fd2_fields(id) on delete set null,

  kind              text not null check (kind in
                      ('game','practice','scrimmage','event','block')),

  booking_date      date not null,
  start_time        time,          -- NULL allowed: 40% of matrix cells have no
  end_time          time,          -- parseable time. Accept it, flag it.

  division_id       uuid references public.fd2_divisions(id) on delete set null,

  -- Competition type, ORTHOGONAL to division. A division is an age/level group
  -- (10U, Majors); a program is how they are competing. Live data proves the
  -- axis is missing today: YWWM8G's "Travel Softball" division holds 10U, 12U,
  -- 14U and 16U teams that never play each other, and the LEv-IT matrix shows
  -- a "12U Williamsport Team" (all-stars) holding a field. Both are programs
  -- being crammed into the only column that existed.
  program           text check (program in
                      ('intramural','interleague','travel','allstar','tournament','other')),

  -- Both nullable. A practice has one team. A block reservation has a division
  -- and no team. An event has neither.
  team_id           uuid references public.fd2_teams(id) on delete set null,
  opponent_team_id  uuid references public.fd2_teams(id) on delete set null,

  -- Who bats last. NULL = decided at the field. See design note 5.
  home_team_id      uuid references public.fd2_teams(id) on delete set null,
  home_away_method  text not null default 'venue'
                      check (home_away_method in ('venue','scheduled','coin_flip')),

  -- Assigned umpire. 1.0 stores '' for TBD; that converts to NULL.
  official_id       uuid references public.fd2_staff(id) on delete set null,

  title             text,          -- "Opening Day Parade"; free text always allowed
  notes             text,

  status            text not null default 'scheduled'
                      check (status in ('scheduled','cancelled','rained_out')),

  -- Optional score. Two integers, for the existing standings view. Nothing
  -- further is built on these — no player stats, ever.
  score_home        int check (score_home >= 0),
  score_away        int check (score_away >= 0),

  -- Import provenance. `source_raw` keeps the original spreadsheet cell text
  -- verbatim so a bad parse is always recoverable and reviewable.
  source_raw        text,
  needs_review      boolean not null default false,

  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users(id) on delete set null,
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users(id) on delete set null,

  check (end_time is null or start_time is null or end_time > start_time),
  check (opponent_team_id is null or team_id is distinct from opponent_team_id),
  check (home_team_id is null
         or home_team_id = team_id or home_team_id = opponent_team_id)
);

-- =====================================================================
-- Indexes — the matrix view and overlap detection are the hot paths
-- =====================================================================

-- Weekly field x day grid, and the overlap query that powers the warning
create index if not exists idx_fd2_bookings_field_date
  on public.fd2_bookings (field_id, booking_date, start_time);
-- Team schedule + "is this team free" for rainout rebooking
create index if not exists idx_fd2_bookings_team_date
  on public.fd2_bookings (season_id, booking_date, team_id);
create index if not exists idx_fd2_bookings_opponent_date
  on public.fd2_bookings (season_id, booking_date, opponent_team_id);
-- Backs the fd2_teams read policy's reverse lookup (which bookings involve this team)
create index if not exists idx_fd2_bookings_team_lookup
  on public.fd2_bookings (team_id) where team_id is not null;
create index if not exists idx_fd2_bookings_opponent_lookup
  on public.fd2_bookings (opponent_team_id) where opponent_team_id is not null;
create index if not exists idx_fd2_bookings_review
  on public.fd2_bookings (season_id) where needs_review;
-- "Is this umpire already booked?" — 1.0's overlapping-assignment warning
create index if not exists idx_fd2_bookings_official_date
  on public.fd2_bookings (season_id, booking_date, official_id)
  where official_id is not null;
create index if not exists idx_fd2_blackouts_range
  on public.fd2_blackouts (season_id, start_date, end_date);
create index if not exists idx_fd2_org_members_user
  on public.fd2_org_members (user_id, org_id);

-- Keep updated_at honest — it is the optimistic-concurrency token.
create or replace function public.fd2_touch_updated_at()
returns trigger language plpgsql
set search_path = pg_catalog, public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_fd2_bookings_touch
  before update on public.fd2_bookings
  for each row execute function public.fd2_touch_updated_at();

-- =====================================================================
-- RLS
-- =====================================================================
-- Contrast with 1.0, where `leagues` is SELECT USING (true) and anon can
-- enumerate every league blob including coach emails. Nothing below is
-- readable without an explicit membership row.

create or replace function public.fd2_role_in(p_org uuid)
returns text
language sql stable security definer
set search_path = pg_catalog, public as $$
  select m.role
    from public.fd2_org_members m
   where m.org_id = p_org
     and m.user_id = auth.uid()
   order by array_position(
     array['owner','admin','scheduler','commissioner','coach','viewer'], m.role)
   limit 1
$$;

-- The default PUBLIC grant makes a revoke-from-anon a no-op, so revoke from
-- public first and re-grant narrowly.
revoke execute on function public.fd2_role_in(uuid) from public;
grant  execute on function public.fd2_role_in(uuid) to authenticated;

create or replace function public.fd2_can_write(p_org uuid)
returns boolean language sql stable
set search_path = pg_catalog, public as $$
  select public.fd2_role_in(p_org) in ('owner','admin','scheduler','commissioner')
$$;
revoke execute on function public.fd2_can_write(uuid) from public;
grant  execute on function public.fd2_can_write(uuid) to authenticated;

alter table public.fd2_orgs          enable row level security;
alter table public.fd2_org_members   enable row level security;
alter table public.fd2_seasons       enable row level security;
alter table public.fd2_venues        enable row level security;
alter table public.fd2_divisions     enable row level security;
alter table public.fd2_fields        enable row level security;
alter table public.fd2_teams         enable row level security;
alter table public.fd2_team_contacts enable row level security;
alter table public.fd2_field_grants  enable row level security;
alter table public.fd2_staff         enable row level security;
alter table public.fd2_blackouts     enable row level security;
alter table public.fd2_bookings      enable row level security;

-- Can the current user's orgs reach this field at all? Owning it counts, an
-- unexpired grant counts, and a seeded/unclaimed field is reachable by everyone.
create or replace function public.fd2_field_access(p_field uuid)
returns text
language sql stable security definer
set search_path = pg_catalog, public as $$
  select case
    -- owner, or an unclaimed public field: full detail
    when exists (
      select 1 from public.fd2_fields f
       where f.id = p_field
         and (f.owner_org_id is null
              or public.fd2_role_in(f.owner_org_id) is not null)
    ) then 'detail'
    else (
      select g.visibility
        from public.fd2_field_grants g
       where g.field_id = p_field
         and public.fd2_role_in(g.org_id) is not null
         and (g.expires_at is null or g.expires_at > now())
       order by case g.visibility when 'detail' then 0 else 1 end
       limit 1
    )
  end
$$;
revoke execute on function public.fd2_field_access(uuid) from public;
grant  execute on function public.fd2_field_access(uuid) to authenticated;

-- Members read their org; writers write it. This pair is the template — the
-- same two policies apply to seasons, divisions, teams and blackouts,
-- differing only in the table name. Venues, fields and bookings differ: see below.
--
-- BOOKINGS ARE 'detail' ONLY. A row that passes this policy exposes EVERY column,
-- so free/busy must NEVER be expressed here — Postgres RLS is row-level and cannot
-- blank a column. The busy projection is a separate SECURITY DEFINER function
-- (Phase 2, `fd2_field_busy`) returning four columns and nothing else.
create policy fd2_bookings_read on public.fd2_bookings
  for select to authenticated
  using (
    public.fd2_role_in(org_id) is not null
    or (field_id is not null and public.fd2_field_access(field_id) = 'detail')
  );

-- May one of my orgs BOOK this field? Owning it counts; an unexpired grant with
-- can_book counts; a seeded/unclaimed public field is bookable by anyone
-- (decision 1) — FieldDay records permits, it does not enforce them.
create or replace function public.fd2_can_book_field(p_field uuid)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public as $$
  select exists (
    select 1 from public.fd2_fields f
     where f.id = p_field
       and (f.owner_org_id is null or public.fd2_can_write(f.owner_org_id))
  ) or exists (
    select 1 from public.fd2_field_grants g
     where g.field_id = p_field
       and g.can_book
       and (g.expires_at is null or g.expires_at > now())
       and public.fd2_can_write(g.org_id)
  )
$$;
revoke execute on function public.fd2_can_book_field(uuid) from public;
grant  execute on function public.fd2_can_book_field(uuid) to authenticated;

-- Writing a booking needs BOTH: write rights in the owning org, and the right to
-- book that particular field. Without the second clause any org could schedule
-- onto another org's permitted field simply by referencing its id.
create policy fd2_bookings_write on public.fd2_bookings
  for all to authenticated
  using      (public.fd2_can_write(org_id)
              and (field_id is null or public.fd2_can_book_field(field_id)))
  with check (public.fd2_can_write(org_id)
              and (field_id is null or public.fd2_can_book_field(field_id)));

-- Coach contact details are the only PII here, so they are the one table that
-- is NOT readable by every member: staff, or your own team's row.
create policy fd2_team_contacts_read on public.fd2_team_contacts
  for select to authenticated
  using (
    public.fd2_role_in(org_id) in ('owner','admin','scheduler','commissioner')
    or user_id = auth.uid()
    or exists (select 1 from public.fd2_org_members m
                where m.org_id = fd2_team_contacts.org_id
                  and m.user_id = auth.uid()
                  and m.team_id = fd2_team_contacts.team_id)
  );

create policy fd2_team_contacts_write on public.fd2_team_contacts
  for all to authenticated
  using      (public.fd2_can_write(org_id))
  with check (public.fd2_can_write(org_id));

-- The org-scoped tables. These MUST be written out, not described: RLS enabled with
-- zero policies denies everything silently, which reads in the app as "no data" with
-- no error anywhere. An earlier draft of this file described these as "the same
-- template" in a comment and shipped six deny-all tables.
create policy fd2_orgs_read on public.fd2_orgs
  for select to authenticated
  using (
    public.fd2_role_in(id) is not null
    -- You may also see the IDENTITY of an org that owns or is granted a field you
    -- can reach at 'detail'. Without this, a cross-org conflict renders as an
    -- unattributed "something is booked here" — you can see the booking but not
    -- whose it is, which is useless for resolving it. This cannot leak past a
    -- 'busy' grant (decision 4): at 'busy' the booking row itself is invisible,
    -- so there is nothing to attribute.
    or exists (
      select 1 from public.fd2_fields f
       where public.fd2_field_access(f.id) = 'detail'
         and (f.owner_org_id = fd2_orgs.id
              or exists (select 1 from public.fd2_field_grants g
                          where g.field_id = f.id and g.org_id = fd2_orgs.id))
    )
  );
create policy fd2_orgs_write on public.fd2_orgs
  for all to authenticated
  using (public.fd2_can_write(id)) with check (public.fd2_can_write(id));

create policy fd2_org_members_read on public.fd2_org_members
  for select to authenticated
  using (user_id = auth.uid() or public.fd2_role_in(org_id) is not null);
create policy fd2_org_members_write on public.fd2_org_members
  for all to authenticated
  using (public.fd2_role_in(org_id) in ('owner','admin'))
  with check (public.fd2_role_in(org_id) in ('owner','admin'));

create policy fd2_seasons_read on public.fd2_seasons
  for select to authenticated using (public.fd2_role_in(org_id) is not null);
create policy fd2_seasons_write on public.fd2_seasons
  for all to authenticated
  using (public.fd2_can_write(org_id)) with check (public.fd2_can_write(org_id));

create policy fd2_divisions_read on public.fd2_divisions
  for select to authenticated using (public.fd2_role_in(org_id) is not null);
create policy fd2_divisions_write on public.fd2_divisions
  for all to authenticated
  using (public.fd2_can_write(org_id)) with check (public.fd2_can_write(org_id));

-- Teams are readable to their own org, AND to anyone who can already see a booking
-- involving them at 'detail'. A conflict you can see but cannot attribute to a team
-- is only half useful: "LEv-IT has this field" tells you an organization, "Force Blue
-- (10U) has this field" tells you who to call. Resolution happens between teams, not
-- between organizations.
--
-- This exposes nothing the grant did not already imply — the booking row itself was
-- already visible, this only resolves an id that was already in it. Coach contact
-- details (fd2_team_contacts) remain org-private regardless; see that policy below.
--
-- ponytail: correlated subquery per team row. Fine at league scale (tens of teams);
-- if a big org's team list gets slow, denormalise a "teams visible to org" view.
create policy fd2_teams_read on public.fd2_teams
  for select to authenticated
  using (
    public.fd2_role_in(org_id) is not null
    or exists (
      select 1 from public.fd2_bookings b
       where b.field_id is not null
         and (b.team_id = fd2_teams.id
              or b.opponent_team_id = fd2_teams.id
              or b.home_team_id = fd2_teams.id)
         and public.fd2_field_access(b.field_id) = 'detail'
    )
  );
create policy fd2_teams_write on public.fd2_teams
  for all to authenticated
  using (public.fd2_can_write(org_id)) with check (public.fd2_can_write(org_id));

create policy fd2_blackouts_read on public.fd2_blackouts
  for select to authenticated using (public.fd2_role_in(org_id) is not null);
create policy fd2_blackouts_write on public.fd2_blackouts
  for all to authenticated
  using (public.fd2_can_write(org_id)) with check (public.fd2_can_write(org_id));

-- Venues and fields are readable to anyone who can reach the field — including at
-- 'busy', because knowing a field EXISTS leaks nothing. What is booked on it is a
-- separate question, answered by the bookings policy above.
create policy fd2_fields_read on public.fd2_fields
  for select to authenticated
  using (public.fd2_field_access(id) is not null);

create policy fd2_fields_write on public.fd2_fields
  for all to authenticated
  using      (owner_org_id is not null and public.fd2_can_write(owner_org_id))
  with check (owner_org_id is not null and public.fd2_can_write(owner_org_id));

-- Venues are the least sensitive object in the system — a public park's name and
-- address. Readable to any authenticated user so field matching can propose
-- "is this the same place?" across orgs; writable only by the owner.
create policy fd2_venues_read on public.fd2_venues
  for select to authenticated using (true);

create policy fd2_venues_write on public.fd2_venues
  for all to authenticated
  using      (owner_org_id is not null and public.fd2_can_write(owner_org_id))
  with check (owner_org_id is not null and public.fd2_can_write(owner_org_id));

-- A grant is readable by both sides — the org that holds it, and the field's
-- owner who issued it. Only the OWNER may create or revoke one: an org must not
-- be able to grant itself access to someone else's field.
create policy fd2_field_grants_read on public.fd2_field_grants
  for select to authenticated
  using (
    public.fd2_role_in(org_id) is not null
    or exists (select 1 from public.fd2_fields f
                where f.id = fd2_field_grants.field_id
                  and f.owner_org_id is not null
                  and public.fd2_can_write(f.owner_org_id))
  );

create policy fd2_field_grants_write on public.fd2_field_grants
  for all to authenticated
  using      (exists (select 1 from public.fd2_fields f
                       where f.id = fd2_field_grants.field_id
                         and f.owner_org_id is not null
                         and public.fd2_can_write(f.owner_org_id)))
  with check (exists (select 1 from public.fd2_fields f
                       where f.id = fd2_field_grants.field_id
                         and f.owner_org_id is not null
                         and public.fd2_can_write(f.owner_org_id)));

-- Staff carry phone/email, so they get the same narrow treatment as contacts:
-- schedulers manage them, and a staff member can see their own row.
create policy fd2_staff_read on public.fd2_staff
  for select to authenticated
  using (public.fd2_can_write(org_id) or user_id = auth.uid());

create policy fd2_staff_write on public.fd2_staff
  for all to authenticated
  using      (public.fd2_can_write(org_id))
  with check (public.fd2_can_write(org_id));

-- NOTE: public/coach share links (replacing 1.0's view_token) are deliberately
-- NOT in this migration. Anonymous read is the exact mechanism that produced
-- the 1.0 exposure, so it gets its own migration and its own review, built as
-- a token-scoped SECURITY DEFINER function returning a masked projection —
-- never a table policy granting anon SELECT.

commit;
