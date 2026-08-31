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
- `field-aliases.json` — human-confirmed venue/field merges for the converter
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

The converter is proven against real data (`--self-test` passes; a full run over both
live leagues produced 2 seasons / 7 venues / 14 fields / 21 teams / 87 bookings and
correctly emitted 3 cross-org field grants for Azalea Dirt, Azalea Turf and MacLaren
Turf 60' — the exact double-booking risk 2.0 exists to solve). **47 warnings are not yet
resolved**, and they are the reason nothing was loaded: 24 events carry free-text
locations (`"REDWING 75 TURF"`, `"Azelea - Turf"`) with no field mapping, and 3 field
pairs are flagged as possible duplicates needing Greg's confirmation before they are
merged into one registry row. Loading now would bake all 47 into the new schema.

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
