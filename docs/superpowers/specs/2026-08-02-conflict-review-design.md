# Design — Auto-schedule draft → conflict review → apply

**Date:** 2026-08-02
**Phase:** 3, item 1 (Admin Power Tools)
**Prototype:** `~/Downloads/design_handoff_fieldday_review/Conflict Review Prototype.dc.html`
**Branch:** `fd-conflict-review` (worktree at `.worktrees/fd-conflict-review`, off `dev`)

---

## The finding that shaped this design

The roadmap says conflict data "already exists (`autoScheduleConflicts`) — this is presentation + resolution actions." That is half true, and the half that is false changes the scope.

**The prototype's four flags are all quality problems in games that were placed:**

| Prototype flag | Can the app produce it? |
|---|---|
| Diamond 2 double-booked | No — prevented at `autoScheduler.ts:203` |
| Umpire on overlapping games | No — the scheduler assigns no umpires |
| Team plays back-to-back days | No — never evaluated (`:204` blocks same-day only) |
| Only 90 min between games | No — never evaluated |

**The app's conflict is the opposite category:** a matchup it *failed to place*. `reason` is always
`Could not find an available slot for X vs Y`. There is exactly one kind, and the prototype has no card for it.

FieldDay's scheduler is **constructive**, not **repair-based**: it only ever emits a game satisfying every
constraint, so its failure mode is omission — the schedule is always valid but possibly incomplete. The
prototype was drawn against a repair model. Both are legitimate; they produce opposite conflict taxonomies.

**Decision:** build the prototype's *chrome* (severity tiers, one-click fixes, auto-fix-all, gated apply)
over the app's *real* conflicts. No new audit engine. Back-to-back-days and field-turnaround detection are
explicitly out of scope; umpire overlap is impossible until the scheduler assigns umpires at all.

---

## Decisions

| Question | Decision |
|---|---|
| Scope | Prototype chrome over real (unplaced-game) conflicts. No audit engine. |
| Severity | **By fixability.** A relaxed-search candidate exists → `warning`. None → `conflict`. Two tiers only. |
| Apply gate | **Hard gate** — disabled until zero open flags — plus `Skip all remaining` so no one is trapped. |
| Snapshot | Auto-snapshot **on Replace only**, via the existing `saveSnapshot()`. Append is covered by the undo stack. |
| Mobile | Responsive, no phone-specific component. Cards reflow at 390px; ≥44px targets. |
| Candidate computation | **Derived at render** (`useMemo`), nothing persisted. |

Severity-by-fixability makes "auto-fix all fixable" mean exactly "resolve every warning" — no separate
`autoFix` flag is needed, unlike the prototype's data model.

---

## Architecture

### New module: `src/lib/conflictPlan.ts` (+ `conflictPlan.test.ts`)

Pure, React-free, runnable under `npx tsx` — the `mobileNav.ts` / `coachView.ts` / `standings.ts` convention.

```ts
conflictPlan(conflicts, preview, { divisions, fields, season, blackoutDates, existingGames })
  → PlannedConflict[]   // sorted most-severe-first

type PlannedConflict = {
  conflict:  ScheduleConflict      // unchanged, straight from state
  severity:  'conflict' | 'warning'
  candidate: ScheduledGame | null  // result of rescheduleMatchupRelaxed
  overrides: { teamName: string; date: string }[]   // formatted by the UI
}
```

Severity is `candidate ? 'warning' : 'conflict'`.

**`conflictPlan` reserves each candidate as it walks the list.** A candidate found for one conflict is
pushed onto the running preview before the next conflict is searched, so no two cards can ever display the
same slot. This makes the displayed warnings **simultaneously satisfiable**: accepting all of them is always
valid.

That property removes a whole function. An earlier draft had `autoFixAll(plans, preview, ctx)` folding
sequentially in the lib — apply one, recompute, apply the next — to avoid double-booking. With reservation,
"auto-fix all" is just "apply every warning's candidate", five lines in the component, and its correctness
is an invariant of `conflictPlan` rather than a separate algorithm needing its own tests.

The cost: a conflict can read as unfixable because an earlier conflict in the list reserved its only slot.
Accepted — the list stays internally consistent, and skipping the earlier one re-derives the later one as
fixable on the next render.

`overrides` is returned structured (`teamName` + ISO `date`) rather than as a prepared sentence, so the
tests do not depend on date formatting and the UI can use its existing `fmtDateShort`.

**`overrides` is an honesty fix.** `rescheduleMatchupRelaxed` ignores team blackout dates
(`autoScheduler.ts:393`). Today's button is vaguely labelled "Try relaxed constraints", which conceals that.
A button reading "Place Sat May 9 · Diamond 1" would conceal it worse. `conflictPlan` re-checks the
candidate's date against each team's blackout set and reports what accepting it would violate, shown on the
card beneath the fix button.

The risky logic — never offering the same slot twice — lives in `conflictPlan` and is therefore the tested
logic. The component only maps over warnings and sets state once.

### Why derive at render rather than persist

`rescheduleMatchupRelaxed` returns the *first* slot scanning dates ascending, against
`existingGames + previewGames`. Candidates computed for two different conflicts can therefore name the
**same slot**; applying one silently invalidates the other.

Deriving in a `useMemo` keyed on `(conflicts, preview)` makes that collision **impossible by construction**
rather than by detection: any fix changes `preview`, the memo re-runs, and every remaining candidate is
recomputed against the new preview. A cached candidate would be a derivation that was valid when computed
and may not be when clicked — and every cache needs an invalidation story.

Two further reasons, both decisive on their own:

1. Persisting `severity`/`candidate` would require new fields on `ScheduleConflict` in **`src/lib/types.ts`
   — a file another live session owns and has uncommitted changes in.** This design does not touch it.
2. No new persisted state means **no migration** (no `fd_015`) and nothing to backfill.

Cost is `conflicts × dates × fields × times` — at 12 × 100 × 5 × 5, ~30k iterations of set lookups, well
under a frame. Accepted; if a pathological league is ever slow, the fix is memoising per-conflict.

### Data flow

```
generateSchedule()  →  state.autoScheduleConflicts (shape unchanged)
                    →  state.autoSchedulePreview
                              ↓
        useMemo → conflictPlan(...)   ← re-runs on every preview change
                              ↓
     flag list · "Auto-fix all" = every warning · apply gate = zero open
                              ↓
   fix clicked → append candidate to preview + mark conflict 'resolved'
                              ↓
                    (memo re-runs, remaining candidates recomputed)
```

### Files

| File | Change |
|---|---|
| `src/lib/conflictPlan.ts` | new |
| `src/lib/conflictPlan.test.ts` | new |
| `src/components/AutoScheduleTab.tsx` | rewrite the conflict block (~620–760) and `commitPreview` |
| `src/lib/autoScheduler.ts` | reword `details[]` / `suggestions[]` at 258–311; hoist team-name lookups |
| `src/lib/types.ts` | **not touched** |

**Deleted, not extended:** the prev/next carousel (`conflictIndex` state at lines 48/186/202/226, render at
640–660) and the `showAllConflicts` collapsed table (728+). The flat severity-sorted list replaces both —
the table existed only because the carousel showed one flag at a time.

`'deferred'` stops being emitted. It is left in the `ScheduleConflict` union because removing it would mean
editing `types.ts`.

---

## UI

```
Review your draft schedule
Nothing is saved yet — resolve or accept the flags below, then apply.
                                          [Discard draft] [Apply schedule (12 open)]

  38 games placed  ·  12 flags to review  ·  3 resolved

FLAGS · MOST SEVERE FIRST          [Auto-fix all fixable (9)]  [Skip all remaining]

┌ CONFLICT ─────────────────────────────────────────────┐
│ Wildcats vs Eagles couldn't be placed · Majors        │
│   12 slots — field already booked                     │
│    3 slots — Eagles' blackout dates                   │
│   Extend the season end date                          │
│   [Skip this game]                                    │
└───────────────────────────────────────────────────────┘
┌ WARNING ──────────────────────────────────────────────┐
│ Comets vs Rockies couldn't be placed · Minors         │
│    8 slots — Rockies already play that day            │
│   [Place Fri May 22, 5:30 PM · Diamond 2]  [Skip]     │
│    ⚠ overrides Rockies' blackout on May 22            │
└───────────────────────────────────────────────────────┘
```

Cause and suggestion lines are `details[]` and `suggestions[]` **rendered verbatim** — no parsing in the
UI layer.

### Tighten the wording at the source

An earlier draft parsed counts back out of the prose into structured causes. That parser was cut: it would
have been a regex against sentences `autoScheduler.ts` generates, breaking the moment anyone reworded them,
and structured causes would need a new field on `ScheduleConflict` — i.e. `types.ts`.

Instead, **reword the strings where they are written**, in `autoScheduler.ts:258-311`, while the counts are
still structured. Nothing outside that file reads them (verified by grep), so this is a safe rename.

Add a local helper and use an em-dash cause format:

```ts
const slots = (n: number) => `${n} slot${n === 1 ? '' : 's'}`
```

| Current | Tightened |
|---|---|
| `12 slot(s) blocked because the field was already booked` | `12 slots — field already booked` |
| `8 slot(s) blocked because Rockies already has a game that day` | `8 slots — Rockies already play that day` |
| `3 slot(s) blocked by Eagles' blackout dates` | `3 slots — Eagles' blackout dates` |
| `No valid slots were generated for this division` | `No slots exist for this division` |
| `No available slot found after checking all constraints` | `No slot survives every constraint` |
| `Review blackout dates for Eagles: May 9, May 16` | `Review Eagles' blackout dates: May 9, May 16` |
| `Only Saturday, Sunday are allowed for this division — consider expanding game days` | `Majors only plays Saturday, Sunday — consider adding game days` |
| `Try extending the season end date` | `Extend the season end date` |
| `Add more fields or field time slots to increase availability` | `Add more fields or time slots` |
| `Consider removing some league blackout dates (currently 12)` | `Remove some of the 12 league blackout dates` |
| `Manually schedule this game in the Schedule tab` | `Schedule this game manually in the Schedule tab` |
| `Add more fields or reduce team blackout dates` | unchanged |
| `Add at least one field` / `Set a season start and end date` | unchanged |

`${n} slots — field already booked` says "field", not "Diamond 2": `failReasons.fieldBooked` counts across
every field and does not record which. Naming a specific field would mean tracking per-field counters, which
is more state for a line of explanatory text. The mockup's "Diamond 2 already booked" is not achievable
without that, and is not worth it.

While in this block, hoist the `homeTeamName` / `awayTeamName` lookups (currently at line 313) above the
detail builders. The same `divisions.flatMap(d => d.teams).find(...)` scan is repeated six times over the
league's full team list; two hoisted consts remove all six. In-scope cleanup — it is the code being edited,
not unrelated refactoring.

Resolved cards collapse to one green line (`✓ Placed Fri May 22, 5:30 PM · Diamond 2` / `✓ Skipped`) with an
**Undo** link, and sort below open flags.

### Auto-fix-all

Applies every warning's candidate in one `setState`. Safe without any sequencing because `conflictPlan`
already reserved as it walked the list, so the candidates on screen never collide. The naive implementation
— map over candidates, apply together — would double-book a field if candidates were computed
independently; reservation is what makes the naive implementation correct.

### States

| State | Behaviour |
|---|---|
| No preview yet | Flag section absent (today's `preview === null` branch, kept) |
| Preview, zero conflicts | No flag section; apply enabled, `Apply schedule · 38 games` |
| Open flags > 0 | Apply disabled, `Apply schedule (12 open)`, `aria-disabled` + reason via `aria-describedby` |
| Zero warnings | `Auto-fix all fixable` **hidden**, not disabled — a disabled button with no explanation is worse than none |
| Zero open | Both bulk buttons hidden |
| Applied (Replace) | `38 games · 3 fixes applied · 9 flags skipped` + `A "Before auto-schedule" snapshot was saved — restore it from Snapshots.` |
| Applied (Append) | Same panel, no snapshot line |

### Binding constraints

Give these to reviewers verbatim as their attention lens.

- **Nothing colour-only.** Severity is carried by the words `CONFLICT` / `WARNING`. The left edge stripe is
  redundant reinforcement, never the signal.
- **No `text-gray-400`** (2.5:1; caught five times in Phase 2). Body `text-gray-700`, muted `text-gray-500`,
  warning ink `amber-800`, conflict ink `red-700`, resolved ink `emerald-700` (5.55:1) — never
  `emerald-600` (3.77:1).
- **≥44px** on every fix / skip / undo control; full-width below `sm:`.
- Cards stack naturally at 390px. The only responsive rule is the button row going column-wise below `sm:`.

### Snapshot on Replace

`commitPreview('replace')` wipes all games **and all practices** (`AutoScheduleTab.tsx:252-253`). Today a
banner at line 335 tells the user to go save a snapshot by hand. Instead, call the existing
`saveSnapshot(code, '[Auto] Before auto-schedule', state, userName)` from `src/lib/sync.ts` immediately
before the commit, and say so on the success screen. Append is unchanged — the 20-deep undo stack covers it.

---

## Testing

`src/lib/conflictPlan.test.ts`, `npx tsx`, plain asserts.

| # | Assertion |
|---|---|
| 1 | Candidate found → `warning`; no candidate → `conflict` |
| 2 | Conflicts sort before warnings; resolved/skipped sort last |
| 3 | Candidate landing on a team blackout date → `overrides` names that team and date |
| 4 | Candidate on a free date → `overrides` is empty |
| 5 | Non-pending conflicts get no candidate computed |
| 6 | No fields, or no season dates → every conflict is `conflict`, no candidates |
| 7 | Empty conflict list → `[]` |
| 8 | **The reservation invariant:** two conflicts whose only viable slot is the same one — exactly one is a `warning` and the other re-derives to `conflict`. This is the double-booking guard. |
| 9 | `slots(1)` → `1 slot`, `slots(2)` → `2 slots` — the one branch in the reworded detail strings |

### Browser verification

Every real defect in Phase 2 was found in a browser, not by the type checker or the tests.

Mint an admin session (`/auth/callback` never completes headlessly — recipe in
`HANDOFF-phase3-admin-power-tools.md`), drive league `JF9ZDS` (`greg+test8@`, 27 games, no results — the
safe one; **never** `YWWM8G`). Over-constrain it deliberately — shrink the season, blackout a field — to
force both tiers. Check at 1280px and 390px:

- Apply is genuinely un-clickable while flags are open, and its label counts down
- Auto-fix-all with a forced slot collision produces **no double-booked field** in the resulting preview
- A resolved card's Undo returns the flag to open and its candidate to the pool
- Use `element.checkVisibility()`, never `getComputedStyle().display`
- Put a frame between any synthetic click and reading the DOM (React batches)

### Gates before merge

```bash
npx tsx src/lib/conflictPlan.test.ts     # new
npx tsx src/lib/standings.test.ts
npx tsx src/lib/coachView.test.ts
npx tsx src/lib/mobileNav.test.ts
npx tsx src/lib/plans.test.ts
npx tsx src/lib/trial.test.ts
npx tsx src/lib/planUsage.test.ts
npx tsx src/lib/themes.test.ts
npx tsx src/lib/bundle.test.ts
npx tsc --noEmit
npm run build
```

Pre-deploy auth regression check (has caught a real regression twice):

```sql
select email, confirmation_sent_at from auth.users order by created_at desc limit 3;
```

A non-null `confirmation_sent_at` on a recent row means "Confirm email" is back on — fix before deploying.

---

## Constraints inherited from the handoff

- **Never edit `src/lib/types.ts`**, `HANDOFF-shared-calendar.md`, `LinkedCalendarsTab.tsx`, or
  `linkedCalendars*.ts` — another live session owns them and has uncommitted work there.
- **Never switch branches in the main checkout.** Work in `.worktrees/fd-conflict-review`, merge to `dev`
  from the main checkout, and merge `dev` → `main` through a temporary worktree.
- Commit author must be `gmd4fy5yb4@privaterelay.appleid.com` or Vercel silently blocks the deploy.
- Verify the Vercel build actually serves the new commit; a push landing on GitHub is not a deploy.
- `npx tsc --noEmit` is the only source of truth inside a worktree — the LSP reports phantom module errors
  through the `node_modules` symlink and was wrong every time it disagreed in Phase 2.

## Out of scope

- Any audit of *placed* games (back-to-back days, field turnaround, umpire overlap)
- Umpire assignment of any kind
- The History panel (Phase 3 item 4). This item only writes a snapshot; it does not build the panel that
  browses them.
- Structured/machine-readable causes and suggestions on `ScheduleConflict`
