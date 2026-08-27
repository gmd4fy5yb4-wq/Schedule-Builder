# Shared Field Registry — Design Spec

**Date:** 2026-08-27
**Status:** Phase 1 APPROVED 2026-08-27 — all four §9 recommendations accepted by Greg.
Schema + converter implemented; migration still unapplied.
**Supersedes:** the "shared field pool" half of `HANDOFF-shared-calendar.md` (June 16, 2026),
which was deferred June 21. See §2 for why the deferral has expired.
**Relates to:** `src/db/migrations/fd_016_v2_schema.sql` (2.0 core schema, also draft).
This spec is deliberately kept *out* of fd_016 because it changes the RLS model.

---

## 1. The problem, in live data

Two leagues are running right now, both 2026-08-31 → 2026-11-30:

| League | Owner | What it is |
|---|---|---|
| `YWWM8G` | LEv-IT / Force | Fall travel softball |
| `UC2YE8` | Jonathan (own subscription) | Small fall interleague, separate from LEv-IT |

They share physical fields, under different names:

| Same turf | In `YWWM8G` | In `UC2YE8` |
|---|---|---|
| Azalea | `Turf` @ `Azalea Road Park` | `Azalea Turf` @ `Azalea Pool` |
| Azalea | `Dirt` @ `Azalea Road Park` | `Azalea Dirt` @ `Azalea Pool` |
| MacLaren | `Turf 60'` @ `MacLaren Stadium` | `MacLaren 60'` @ `MacLaren Stadium` |

They also share teams under different names — `Force (16U) Herrera` vs `Force (Hererra)`,
`Force Blue (10U) Ciccarello` vs `Force (Blue)`.

**Nothing connects them.** Each league is a separate JSONB blob with its own copies of
these fields. `UC2YE8` currently has **zero bookings**, so no collision has happened yet.
The moment Jonathan schedules his six games, Azalea Turf can be double-booked between the
two leagues and neither system will know.

This is the problem the LEv-IT Field Matrix exists to solve. That spreadsheet is a
**permit-allocation document** for scarce shared fields — Column B (`FIELD PRIORITY`)
assigns divisions to fields precisely because fields are contested.

## 2. Why the June deferral expired

`HANDOFF-shared-calendar.md` §4 named this exactly:

> Fields only exist inside the league JSONB blob. There is no shared field registry at
> the database level. This is the fundamental blocker for cross-league conflict detection.
> […] The long-term fix is a DB-level field registry.

It was deferred on June 21 for two stated reasons, **both now void**:

1. *"Leagues went multi-sport, so one blob already handles cross-sport field conflicts."*
   True, and irrelevant here: `UC2YE8` is a **different owner's** league, not a second
   sport inside one league. One blob cannot span two subscriptions.
2. *"The short-term fix avoids a destructive migration."* 2.0 is a normalized rewrite;
   `fd2_fields` and `fd2_venues` already exist in the fd_016 draft. The migration cost
   that justified deferring is already being paid.

The June design also recorded a decision this spec **reverses** — see §7.

## 3. Non-goals

Stated explicitly, because each is a much larger project and none is needed to fix the above.

- **Not federation.** No shared game objects between orgs, no cross-org editing of each
  other's bookings, no "one game, two leagues" record.
- **Not a national curated field database.** See §6 — the registry is emergent, with one
  seeded county.
- **Not a permit system of record.** FieldDay records who *says* they hold a permit. It is
  not the parks department and must never block a real booking on its own authority.
- **Not cross-org team identity.** June already flagged this as "the real expensive piece."
  See §9, open question 3 — it stays unsolved in v1, deliberately and visibly.
- **Not cross-org standings.**

## 4. Three layers, deliberately separated

The instinct "ship a database of local fields" bundles three things with very different
costs and risks. Keeping them apart is the core of this design.

| Layer | Question | Cost | Risk |
|---|---|---|---|
| **Identity** | Is this the same physical field? | Low | Low — this is the actual fix |
| **Discovery** | Does the app already know my fields? | Medium (data entry) | Coverage gaps read as broken |
| **Visibility** | Who can see what's booked on it? | Medium | **High — schedule leakage** |

Identity is necessary and sufficient to stop double-bookings. Discovery is UX polish and a
moat. Visibility is where this gets dangerous, and it gets the most attention below.

## 5. Data model

### 5.1 Changes to fd_016

`fd2_venues` and `fd2_fields` stop being org-scoped and become **global records with an
owning org**:

```sql
-- fd2_venues / fd2_fields
--   org_id        -> owner_org_id uuid NULL REFERENCES fd2_orgs(id)
--                    NULL = platform-seeded (a public park nobody claims)
--   + is_seed      boolean NOT NULL DEFAULT false
--   + verified_at  timestamptz          -- an owner confirmed the details
```

`org_id` is *removed* as an access gate, not renamed. Read access no longer follows
ownership (see §5.3).

### 5.2 New table: grants

```sql
create table fd2_field_grants (
  id           uuid primary key default gen_random_uuid(),
  field_id     uuid not null references fd2_fields(id) on delete cascade,
  org_id       uuid not null references fd2_orgs(id)   on delete cascade,
  can_book     boolean not null default true,
  visibility   text    not null default 'busy'
                 check (visibility in ('busy','detail')),
  granted_by   uuid references auth.users(id),
  expires_at   timestamptz,          -- permits are seasonal
  created_at   timestamptz not null default now(),
  unique (field_id, org_id)
);
```

- The **owning org** has implicit full access; it needs no grant row.
- An org with **no grant** on a field: cannot book it, cannot see anything on it.
- `visibility='busy'` — sees only that a time range is occupied. No team, no title, no notes.
- `visibility='detail'` — sees the full booking, like the owner does.
- **A field with `owner_org_id IS NULL` (seeded, unclaimed) is bookable by any org**, at
  `busy` visibility. FieldDay is not the permit authority (§3); refusing to let someone
  book a public park because no row says they may would be the app overruling reality.

### 5.3 Visibility is enforced by projection, not by policy

**This is the load-bearing decision.** Postgres RLS is row-level; it cannot return a row
with some columns blanked. So free/busy **must not** be attempted with a policy on
`fd2_bookings` — any policy that lets a row through lets every column through.

Two separate paths:

```
Detail  ->  RLS policy on fd2_bookings. Row visible iff:
              booking.org_id = my org
              OR a grant exists (booking.field_id, my org, visibility='detail')
              OR I own the field

Busy    ->  SECURITY DEFINER function, NOT a policy:
              fd2_field_busy(field_ids uuid[], from date, to date)
                returns (field_id, booking_date, start_time, end_time)
              — four columns, no identifying data, nothing else reachable.
              Callable only for fields the caller has any grant on.
```

This is the same pattern fd_016 already reserves for public share links: *a token-scoped
`SECURITY DEFINER` function returning a masked projection — never a table policy granting
broad SELECT.* Consistency here is not aesthetic; it is the only way to be sure the
free/busy path cannot leak a team name.

`fd2_field_busy` must `REVOKE EXECUTE ... FROM public` then `GRANT ... TO authenticated`
— the default PUBLIC grant makes a revoke-from-anon a no-op.

### 5.4 What this means for LEv-IT and Jonathan

- Azalea Turf and MacLaren 60' become **one row each**, owned by LEv-IT (permit holder).
- Jonathan's org gets a grant on each: `can_book=true`, `visibility` per §9 Q2.
- Both leagues' bookings land on the same `field_id`, so the existing cross-season overlap
  query already written in the converter work catches conflicts between them with no
  further logic.

## 6. Identity: matching, then seeding

**Emergent, not curated.** When an org adds a field, search existing records and offer to
link rather than create:

> Is this **Azalea Road Park – Turf**? *Used by 2 other leagues · 0.3 mi away*
> [ Use this field ] [ No, create a new one ]

Matching signal, cheapest first:

1. Exact match on normalized name (`lower`, strip non-alphanumerics) within the venue.
2. **Geographic proximity** — `Field.geocoords` already exists and `/api/geocode` already
   populates it. No extension needed: haversine over two lat/lon columns is one expression,
   so `earthdistance`/`cube`/`postgis` are all unnecessary.
3. Trigram similarity on the **concatenated venue + field name** — never on either alone.

**Measured against the two real pairs before committing to this** (pg_trgm-equivalent
similarity, 0.4 threshold):

| Compared | Similarity | At 0.4 |
|---|---|---|
| `Azalea Road Park` vs `Azalea Pool` (venue only) | 0.38 | **miss** |
| `Turf 60'` vs `MacLaren 60'` (field only) | 0.18 | **miss** |
| `Azalea Road Park Turf` vs `Azalea Pool Azalea Turf` (concatenated) | 0.50 | match |

So name matching on either component alone would have failed on **both** live cases.
Concatenation rescues one; distance is what reliably resolves the other — `Azalea Pool`
and `Azalea Road Park` share almost no trigrams but are ~0 miles apart. **Distance is the
primary signal, name similarity is the tiebreaker**, not the reverse.

> **Dependency to decide:** `pg_trgm` is available but **not installed** in the Sports
> project, and extensions are database-wide — installing it touches the database shared with
> Prospect Card and AthleteCard. It is additive (new functions and operators, no change to
> existing objects), but it is not an `fd2_`-prefixed change and so falls outside the
> additive-only contract the 2.0 work has been held to. Either accept it deliberately, or
> use `fuzzystrmatch`/a normalized-token overlap computed in application code and skip the
> extension entirely. Distance alone covers the observed cases.

**Never auto-merge.** The converter work already established this: differently-named
records get *reported*, not silently merged. Same rule here — the app proposes, a human
confirms.

**Seed one county, not a nation.** Nassau County can be seeded from data already in hand:
the matrix's 16 fields across 6 venues (Red Wing, Jerusalem, MacLaren, Azalea, Stokes,
Polaris) plus the venues in `softball-schedule-2.csv` (Central Nassau, Hicksville, East
Meadow). ~25 fields, one afternoon. Seeded rows carry `is_seed=true`, `owner_org_id=NULL`.

This gets cold-start magic exactly where you sell, without committing to curating fields
in markets you have not entered. The registry then improves itself with every signup.

## 7. Conflict semantics — reversing a June decision

`HANDOFF-shared-calendar.md` §3 records: *"Hard block on field conflicts (no double-booking,
ever)."*

**Reverse it. Warn, show who else is there, never refuse.** Three reasons:

1. Two T-ball games legitimately share a field. A hard block makes the product wrong.
2. Cross-org hard-blocking lets another org's booking **veto yours on a field you hold the
   permit for**. That is strictly worse than the spreadsheet.
3. Live evidence: Jonathan already used free-text special events 24 times to route around
   forms that would not bend. Rigid validation gets routed around, and then the data is
   worse than if it had just accepted the input.

Conflict UI shows: *"Azalea Turf is also booked 17:30–19:00 — 2026 Fall League"* (at
`detail`) or *"…— another league"* (at `busy`).

## 8. Phasing

1. **Identity** — de-scope venues/fields, add grants, migrate the converter to match
   fields across leagues. Fixes the LEv-IT/Jonathan collision. No UI beyond a link prompt.
2. **Busy projection** — `fd2_field_busy` + conflict warnings that span orgs.
3. **Seeding + matching UI** — Nassau County rows, the "is this the same field?" prompt.
4. **Grant management UI** — permit holder grants use to another org, with an expiry.

Phase 1 alone solves the live problem. Phases 3–4 are the product story.

## 9. Decisions (all four ACCEPTED 2026-08-27)

Recommendations below were approved as written. Kept in full, with reasoning, because the
risks named are still live.

1. **Unclaimed seeded fields: bookable by anyone?**
   Recommendation: **yes**, at `busy` visibility. FieldDay is not the permit authority, and
   blocking on a missing grant would be the app overruling the real world. Risk: two orgs
   book the same public park and only find out via the warning.

2. **Does Jonathan's league get `busy` or `detail` on LEv-IT's fields?**
   Recommendation: **`detail`** — they are friendly, Force teams play in both, and it is
   strictly better than the shared sheet they use now. But it should be LEv-IT's choice per
   grant, not a platform default, because the next borrower may be a rival program.

3. **Cross-org team identity — solve now or record the gap?**
   Recommendation: **record the gap.** Field conflicts are the live pain (fields are scarce
   and contested); a team double-booked across two leagues is rarer and a coach notices.
   June already called cross-league team identity "the real expensive piece." But the
   measurement in §6 suggests it is *cheaper than assumed*: the same matching mechanism
   scores `Force (16U) Herrera` vs `Force (Hererra)` at **0.60** and
   `Force Blue (10U) Ciccarello` vs `Force (Blue)` at **0.42** — both above threshold,
   i.e. better than the field names matched. The expensive part was never the matching, it
   was deciding what a shared team *means* (whose roster, whose standings, who may edit).
   Since v1 has no rosters and no cross-org standings, "same team, two leagues" could be a
   pure suggestion-and-link with almost no semantics attached.
   Caveat before believing that: every Force team name starts with `Force`, so false
   positives will be common — this is a *suggest and confirm* mechanism, never automatic.
   It must be *stated*, not silently absent: in v1, a Force team booked in both leagues at
   the same time will not be caught.

4. **Does an org see *which* org holds a competing booking, at `busy`?**
   Recommendation: **no** — "another league" only. Naming the org at `busy` leaks the
   membership of a facility, which is exactly the thing `busy` exists to withhold.


5. **Do team names cross a `detail` grant?** — **YES, decided 2026-08-27.**
   A conflict you can see but cannot attribute to a team is only half useful:
   "LEv-IT has this field" names an organization, "Force Blue (10U) Ciccarello has
   this field" names who to call. Resolution happens between teams, not between
   organizations, and this must hold for orgs with no shared history — LEv-IT is a
   test case, not the target customer.

   Scope is tight: a team is visible only if it appears on a booking you can already
   see at `detail`. Measured on the live data, Jonathan sees 9 of LEv-IT's 13 teams —
   the 4 that never booked a shared field stay hidden. Divisions do NOT cross the
   grant (1 of 4 visible), and **coach contacts never do** (0 of LEv-IT's 9 leaked).

   > **Known and accepted:** in this dataset team names *embed coach surnames*
   > (`Force Blue (10U) Ciccarello`, `Lev-It (10U) (Pera)`). The original field-matrix
   > brief flagged coach surnames as PII that must not reach any public-facing view.
   > This is not a public view — it is an explicit, revocable grant between two
   > organizations — so the rule is not violated. But "expose team names" and "expose
   > coach surnames" are the same action against real data, and that is the reason
   > `fd2_team_contacts` (phone, email) stays org-private in every case.

## 10. What this does not change

- `fd2_bookings`, `fd2_teams`, `fd2_divisions`, `fd2_blackouts` keep their org scoping.
- 1.0 is untouched. Both live leagues keep running on `leagues.data` throughout.
- No production migration is implied by this document.
