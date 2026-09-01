# Handoff — FieldDay Planner 2.0 (written 2026-08-27)

## State

**Production is healthy and two fixes shipped today.**

1. **Trial-clock bug — FIXED, LIVE** (`a9cc97a` → `main` as `9965d568`).
   Merely *opening* a populated league could burn a 14-day trial: geocode → `setState` →
   800ms debounced autosave → full-blob POST → clock stamp. Now gated by a pure function,
   `shouldStartTrialClock()` in `src/lib/trial.ts` — owner-only, first-generation-only.
   `src/app/api/leagues/save/route.ts` reads the prior value with a PostgREST JSON-path
   projection (`prev_generated:data->schedule->>generatedAt`) so it never pulls the blob.
   6 regression asserts in `src/lib/trial.test.ts`. Verified live: 0 clocks started after Greg's own edit.

2. **Anonymous read of every league blob — CLOSED, LIVE** (`fd_017_close_anon_league_reads`,
   applied via MCP to the Sports DB). 6 phone numbers and 14 emails across 2 leagues were
   readable by anyone with the anon key. Verified by effect: anon now reads 0 rows from all
   13 tables; no `USING (true)` policy survives in the Sports DB.
   `teams_select` deliberately keeps `OR (share_enabled = true)` — that's a Prospect Card
   feature, 0 of 10 teams have it on, and it does not cascade to `team_players`.
   Rollback SQL captured verbatim from `pg_policies` at `.backups/ROLLBACK-anon-rls-2026-08-27.sql`.
   `CLAUDE.md` now carries a 🔒 do-not-reopen block (`3caa895`) — its old note claimed the app
   relied on the public read. It did not.

**Git:** on `dev`, **2 commits unpushed** (`a9cc97a`, `3caa895`). `a9cc97a` is already in
production via `main`. Nothing is waiting on a deploy — the migration is applied in Supabase
independently of any push.

## Protected data

`.backups/` is gitignored (line 30 — "contain production PII — never commit"):

- `YWWM8G-…-live.json`, `UC2YE8-…-live.json` — both live leagues as of 11:08 today
- `YWWM8G-2026-07-28-spring-summer-286items.json` — **the recovered spring/summer season**
  (131 games, 113 practices, 41 teams). It had been wiped from `leagues` when YWWM8G was
  rolled forward to fall, and survived only inside one `league_snapshots` row.
  The `fd_010` guard trigger did **not** fire, because the deletion was incremental —
  each individual save stayed under the 50% threshold. That's a real gap in the guard.
- Both leagues also re-snapshotted into `league_snapshots` with labeled rows

Jonathan's UC2YE8 (paid fall league) and the YWWM8G Force travel schedule are untouched.

## The 2.0 work — Phase 1 APPLIED 2026-08-31

**`fd_016` is live in the Sports DB.** Applied via MCP and verified by measurement,
not by the tool's success flag: 12 tables, 12 with RLS, **24 policies (every table has
BOTH a read and a write policy — the silent deny-all trap did not recur)**, 5 functions,
12 indexes. anon reads 0 rows from all 12 by impersonation. 1.0 untouched and re-counted
after the fact: 6 leagues, 63 snapshots, 23 subscriptions, 10 Prospect Card teams,
8 policies.

**`fd_019` followed immediately.** fd_016's `revoke execute … from public` did NOT remove
anon's access, because Supabase's default privileges grant anon **explicitly** — the
spoc_006 trap, third time in this DB. Measured after fd_016: anon held table privileges
on all 12 fd2_ tables and EXECUTE on all 5 functions. Not a live leak (every policy is
`to authenticated`, so anon read 0 rows), but a tripwire for the first policy someone
writes without that clause. Now: anon grants NONE, anon/public EXECUTE NONE,
`authenticated` retains all 12 tables and all 5 functions.

**The tables are EMPTY.** Loading data is a separate, deliberate step — see below.

### Field-identity decisions — SETTLED 2026-08-31 (Greg)

**All three suggested merges were REJECTED, on evidence.** They were an artifact, not
duplicates: **1.0 stores ONE geocode per venue**, so every field at a venue carries the
park's coordinate. The design rule is "distance is primary, name similarity only the
tiebreaker" — but *within* a venue the distance is always zero, so the suggester falls
back on names, and the venue name dominates the trigram. That blind spot is the whole
source of the suggestions.

- **Azalea Dirt vs Turf — distinct, PROVEN.** They hold **8 bookings at the identical
  date and time** (2026-06-14 09:00, 06-21, 06-28, 07-05, …). One physical field cannot
  host two events at once. 11 vs 42 bookings, and dirt is not turf.
- **Salisbury Turf vs Grass — distinct** (different surfaces; Grass has 0 bookings, so
  no usage evidence either way — Greg's call).
- **East Meadow Greco vs Cook — distinct** (two named diamonds; both 0 bookings — Greg's call).

Rejections are recorded in `scripts/field-aliases.json` under `_rejected`, and the
converter now skips them, so **a decision made once no longer resurfaces as a warning on
every run.** Two more pairs were rejected the same way (Azalea Cages vs Dirt, vs Turf) —
the identical artifact, surfaced only once the cages were correctly placed into the park.

### Two defects the suggester never flagged

1. **`Red Wing 75` is geocoded to Minnesota.** Address `Red Wing Lane, Levittown NY 11756`,
   stored coordinate `44.56247, -92.5338` — **1,607 km** from every other field, which all
   sit in Nassau County at ~`40.7, -73.5`. It carries **6 real bookings**, and travel burden
   is the one metric the design says a home/away flip must not be able to corrupt.
   **No replacement coordinate was invented** (Greg's explicit call). The converter now
   emits a `[geocode]` warning for any venue >100 km from the median, so this class cannot
   hide again — leagues are local by nature, and the median resists a few bad rows where a
   mean would not. **Still open: re-geocode that address for real.**
2. **`Azalea Cages` had no venue at all** — empty `location`, but byte-identical address and
   coordinates to Azalea Road Park. Now placed there via a `"|<field>"` alias key. The
   "no venue" warning used to say "grouped under Unassigned venue" unconditionally, which
   was false once an alias placed it; it now reports where the field actually landed.

### Free-text event locations — SETTLED 2026-08-31 (Greg)

**All 24 resolved; `[event]` warnings are now 0.** The 24 collapsed to 12 distinct strings
(`Azelea` is a consistent misspelling of Azalea), and 13 were unambiguous:
6 named the Turf, 3 named the Dirt, 1 named Red Wing 75, 2 named MacLaren — which has
exactly one field, so "park only" was never ambiguous there — and 1 more was recoverable
because its **title** named the Turf even though its location field did not.

The remaining 11 named only Azalea Road Park, which has three fields. Greg's calls:
Summer Clinic ×6 → Turf; Tryouts ×2 → Turf; **one-day tournaments ×2 → Turf AND Dirt,
not the cages** (so each emits a `block` per field and is visible to conflict detection);
12U Team Party → **no field**, because a party is not a field booking and should not
block five hours of ball.

**The decisions are keyed by 1.0 event id, not by the location string, and they have to
be** — the single string `"Azelea"` covers a clinic, a 12-hour tournament and the team
party, which resolve three different ways. A string→field table cannot express that.
They live in `scripts/field-aliases.json` under `_event_fields`, each with a
human-readable note. A decided event carries `needs_review: false` — re-flagging a
settled question is what makes a review queue useless — while `source_raw` keeps the
original text verbatim either way.

Two events legitimately end with no field: the team party (decided), and
**"Williamsport Tryout" (2026-05-16), which had no location at all in 1.0** — nothing was
lost in conversion, 1.0 simply never recorded one. Worth a look if that tryout mattered.

Net effect across both passes: warnings **47 → 21**, venues **7 → 6**, fields still **14**
(nothing wrongly merged), bookings **87 → 89** (the two tournaments split into blocks),
and `[suggest]` and `[event]` are both empty.

**Nothing blocking remains.** The 21 are all informational: 14 field names that carry no
base distance, 1 note that Azalea Cages was placed by alias, 1 placeholder opponent
correctly flagged external, 3 `[grant]` lines that are the feature working, 1 division
needing a program set by hand, and the `[geocode]` warning for Red Wing — which is real
and still open.

The converter is proven against real data (`--self-test` passes; a full run over both
live leagues produced 2 seasons / 7 venues / 14 fields / 21 teams / 87 bookings and
correctly emitted 3 cross-org field grants for Azalea Dirt, Azalea Turf and MacLaren
Turf 60' — the exact double-booking risk 2.0 exists to solve). **47 warnings are not yet
resolved**, and they are the reason nothing was loaded: 24 events carry free-text
locations (`"REDWING 75 TURF"`, `"Azelea - Turf"`) with no field mapping. The field-identity
half of that list is now settled — see the section immediately below.

- `src/db/migrations/fd_016_v2_schema.sql` — 12 tables, 24 policies, 67 objects.
  Header carries a SAFETY CONTRACT: purely additive, only `fd2_*` names, never touches
  `leagues` / `league_snapshots` / `user_subscriptions` / `profiles` / `fd_user_tour` / `app_signups`.
  Validated in a throwaway Docker `postgres:16` with an `auth` schema shim, including RLS
  behaviour across an org boundary.
- `scripts/convert-to-v2.mjs` — 1.0 blob → 2.0 rows. Plain ESM, zero new deps, read-only
  against 1.0, `--self-test` built in. Many orgs → **one global field registry**: first org to
  define a field owns it, later orgs get an `fd2_field_grants` row instead of a duplicate.
  Never auto-merges differently-named records; `--aliases` is the human confirmation step.
  Deterministic UUIDv5 ids + `ON CONFLICT DO UPDATE` → re-runnable.
- `docs/superpowers/specs/2026-08-27-shared-field-registry-design.md` — the design record,
  10 sections, 5 accepted decisions.

### Decisions already made (don't re-litigate)

- **Teams only.** No rosters, no players, no stats — ever. No player table in the schema.
- **Home/away is a coin flip at the field**, not a property of the venue. `home_team_id` is
  nullable with a `home_away_method` column. Travel burden (from `Location`) is the metric
  that can't be corrupted by a flip.
- **Conflicts warn, never refuse.** No exclusion constraint on booking overlap.
- **Team names cross a `detail` grant** — Greg: *"That gives a real clue as to whom to
  contact for resolution, not just Lev-IT."* Org identity crosses too, but only at `detail`;
  at `busy` the booking row itself is invisible.
- **Per-row writes are the concurrency fix.** 1.0's whole-blob rewrite amplified one geocode
  ~590×; two people editing at once would clobber each other.
- LEv-IT is the test case, not the customer shape. This generalizes.

### Blocking prerequisite — DONE

The `fd2_` prefix is registered in the **Table Ownership Map** (`memory/migrations.md`
line 56), which was confirmed before `fd_016` was applied.

## Open threads (none started)

1. **Phase 2 of the field registry** — `fd2_field_busy`, the masked free/busy projection.
   This is where we stopped. RLS is row-level only and *cannot blank columns*, so free/busy
   has to be a separate projection, not a policy.
2. **The xlsx matrix importer** — better next data source than converting a third season.
   (I proposed converting spring separately and withdrew it: season ids key on league code,
   so spring and fall both being `YWWM8G` collide outright, as do 2 team ids.)
3. **Anon-leak sweep on the Education and Web Supabase projects** — the only item with
   unknown risk. They have their own `anon` policies and I have not looked at either.

## Known-unresolved, deliberately deferred

- Cross-org **team** identity — a Force team booked in two leagues at the same hour won't be
  caught in v1 (field identity is solved; team identity isn't).
- The 500KB save cap on the 1.0 blob.
- The `fd_010` guard's blind spot for incremental deletion (see above).

## Gotchas worth carrying forward

- **RLS enabled + zero policies = silent deny-all.** Six tables shipped that way in a draft
  because I wrote a *comment* saying "the same two policies apply to…" and never wrote them.
  Symptom was `INSERT 0 0` and empty selects. Write all policies explicitly.
- **`REVOKE … FROM anon` is a no-op** while the default `PUBLIC` grant stands. Revoke from
  `public`, then re-grant, then verify by impersonation.
- The repo's 14 test files are standalone `node:assert` scripts — run them with `npx tsx`
  (documented in their own headers), not a framework.
- Trigram matching on field names alone does not work: venue-alone 0.38, field-alone 0.18,
  concatenated 0.50. **Distance is primary; name similarity is only the tiebreaker.**
  (`pg_trgm` is available but NOT installed, and extensions are database-wide on a shared DB.)
- Use a git worktree for the `dev`→`main` merge; never switch branches in this shared checkout.
