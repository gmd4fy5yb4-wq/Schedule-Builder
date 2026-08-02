# Conflict Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the auto-schedule conflict carousel with a severity-tiered flag list offering concrete one-click fixes, gated apply, and an automatic snapshot before destructive replaces.

**Architecture:** One new pure module, `src/lib/conflictPlan.ts`, derives severity and a concrete fix candidate for each unplaced-game conflict at render time via `useMemo` — nothing is persisted, so no migration and no edit to the shared `types.ts`. It reserves each candidate slot as it walks the conflict list, which makes the displayed fixes simultaneously satisfiable and reduces "auto-fix all" to a single `setState`. `AutoScheduleTab.tsx` renders that plan as a flat list, replacing both the prev/next carousel and the collapsed conflict table.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind. No test framework — standalone assert files run with `npx tsx`.

**Spec:** `docs/superpowers/specs/2026-08-02-conflict-review-design.md`

## Global Constraints

- **Never edit `src/lib/types.ts`.** Another live session owns it and has uncommitted changes there. Also off-limits: `HANDOFF-shared-calendar.md`, `src/components/LinkedCalendarsTab.tsx`, `src/lib/linkedCalendars.ts`, `src/lib/linkedCalendars.test.ts`. Read `types.ts` freely; never write to it.
- **Never switch branches in the main checkout.** All work happens in the worktree `.worktrees/fd-conflict-review` on branch `fd-conflict-review`.
- **Commit author must be `gmd4fy5yb4@privaterelay.appleid.com`** or Vercel silently blocks the deploy. Every commit command below already passes `-c user.email=...`.
- **Nothing colour-only.** Severity is carried by the words `CONFLICT` / `WARNING`. Colour is redundant reinforcement, never the signal.
- **Never use `text-gray-400`** (2.5:1, fails WCAG AA; caught five times in Phase 2). Body `text-gray-700`, muted `text-gray-500`, warning ink `amber-800`, conflict ink `red-700`, resolved ink `emerald-700` (5.55:1). Never `emerald-600` (3.77:1).
- **≥44px touch targets** on every fix / skip / undo control; full-width below `sm:`.
- **No new dependencies.** No test framework — tests are `npx tsx` assert files following `src/lib/standings.test.ts`.
- **`npx tsc --noEmit` is the only source of truth.** The LSP reports phantom "Cannot find module" errors inside a worktree because `node_modules` is a symlink, and it was wrong every time it disagreed during Phase 2.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/conflictPlan.ts` | **New.** Pure derivation: given conflicts + preview + league config, produce severity, fix candidate, and blackout overrides per conflict, sorted most-severe-first. React-free so it runs under `npx tsx`. |
| `src/lib/conflictPlan.test.ts` | **New.** Nine assertions, including the reservation invariant that prevents double-booking. |
| `src/lib/autoScheduler.ts` | **Modify.** Tighten the `details[]` / `suggestions[]` wording at lines 258–311 while counts are still structured; hoist repeated team-name lookups; export a `slots()` plural helper. |
| `src/components/AutoScheduleTab.tsx` | **Modify.** Replace the conflict carousel + table with the flag list; gate apply; auto-snapshot on replace; accept two new props. |
| `src/app/page.tsx` | **Modify.** One line: pass `leagueCode` and `userName` to `AutoScheduleTab`. |

Tasks run in dependency order. Task 1 produces the module every later task consumes.

---

### Task 1: The `conflictPlan` module

**Files:**
- Create: `src/lib/conflictPlan.ts`
- Create: `src/lib/conflictPlan.test.ts`

**Interfaces:**
- Consumes: `rescheduleMatchupRelaxed` from `src/lib/autoScheduler.ts` (already exported, signature at `autoScheduler.ts:334`).
- Produces: `conflictPlan(conflicts, preview, ctx) → PlannedConflict[]`, plus exported types `PlannedConflict` and `PlanContext`. Tasks 3 and 4 import all three.

**Background you need:**

`ScheduleConflict` already exists in `src/lib/types.ts` (line 103) and is **not** modified:

```ts
export interface ScheduleConflict {
  id: string
  divisionId: string
  homeTeamId: string
  awayTeamId: string
  reason: string
  details: string[]
  suggestions: string[]
  resolution: 'pending' | 'skipped' | 'deferred' | 'resolved'
}
```

`rescheduleMatchupRelaxed` returns the **first** free slot scanning dates ascending, and **deliberately ignores team blackout dates** (`autoScheduler.ts:393`). That is why `overrides` exists — to surface what accepting a candidate would violate.

Team blackout entries are `"YYYY-MM-DD"` **or** `"YYYY-MM-DD::Label"`, so the date is always `entry.split('::')[0]`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/conflictPlan.test.ts`:

```ts
/**
 * The reservation invariant is the assertion that matters: conflictPlan pushes
 * each candidate onto a running preview before searching for the next, so two
 * cards can never offer the same slot. Without it, "auto-fix all" would
 * double-book a field.
 */
import type { Division, Field, ScheduleConflict, ScheduledGame, SeasonConfig, Team } from './types'
import { conflictPlan } from './conflictPlan'
import { slots } from './autoScheduler'

let passed = 0
function assert(cond: boolean, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exit(1) }
  passed++
}

const team = (id: string, name: string, blackoutDates?: string[]): Team => ({
  id, name, divisionId: 'd1', ...(blackoutDates ? { blackoutDates } : {}),
})

const div = (teams: Team[]): Division => ({ id: 'd1', name: 'Majors', teams, gamesPerTeam: 2 })

const field = (id: string, name: string): Field => ({ id, name, location: '', address: '' })

const season = (startDate: string, endDate: string): SeasonConfig => ({
  leagueName: 'Test', startDate, endDate,
  gameDurationMinutes: 90, practiceDurationMinutes: 60,
})

const conflict = (
  id: string, home: string, away: string,
  resolution: ScheduleConflict['resolution'] = 'pending',
): ScheduleConflict => ({
  id, divisionId: 'd1', homeTeamId: home, awayTeamId: away,
  reason: 'Could not find an available slot',
  details: [], suggestions: [], resolution,
})

// a booked game used to occupy a slot on field f1
const booked = (id: string, date: string, time: string): ScheduledGame => ({
  id, type: 'game', date, time, durationMinutes: 90,
  fieldId: 'f1', homeTeamId: 'zz1', awayTeamId: 'zz2', umpireId: '', divisionId: 'dz',
})

const tA = team('tA', 'Wildcats')
const tB = team('tB', 'Eagles')
const tC = team('tC', 'Comets')
const tD = team('tD', 'Rockies')

const baseCtx = {
  divisions: [div([tA, tB, tC, tD])],
  fields: [field('f1', 'Diamond 1')],
  season: season('2026-05-01', '2026-05-03'),
  blackoutDates: [] as string[],
  existingGames: [] as ScheduledGame[],
}

// 1. Severity is fixability: a candidate exists here, so it's a warning.
const p1 = conflictPlan([conflict('c1', 'tA', 'tB')], [], baseCtx)
assert(p1.length === 1 && p1[0].severity === 'warning' && p1[0].candidate !== null,
  'a placeable conflict is a warning with a candidate')

// 6a. No fields at all -> nothing is placeable.
const noFields = conflictPlan([conflict('c1', 'tA', 'tB')], [], { ...baseCtx, fields: [] })
assert(noFields[0].severity === 'conflict' && noFields[0].candidate === null,
  'with no fields every conflict is unfixable')

// 6b. No season dates -> nothing is placeable.
const noDates = conflictPlan([conflict('c1', 'tA', 'tB')], [], { ...baseCtx, season: season('', '') })
assert(noDates[0].severity === 'conflict' && noDates[0].candidate === null,
  'with no season dates every conflict is unfixable')

// 7. Empty input.
assert(conflictPlan([], [], baseCtx).length === 0, 'no conflicts yields an empty plan')

// 5. Already-resolved conflicts are not searched.
const resolved = conflictPlan([conflict('c1', 'tA', 'tB', 'resolved')], [], baseCtx)
assert(resolved[0].candidate === null && resolved[0].overrides.length === 0,
  'a non-pending conflict gets no candidate computed')

// 3. The relaxed search ignores blackouts, so overrides must report the violation.
const blackoutCtx = { ...baseCtx, divisions: [div([tA, team('tB', 'Eagles', ['2026-05-01::Field trip']), tC, tD])] }
const p3 = conflictPlan([conflict('c1', 'tA', 'tB')], [], blackoutCtx)
assert(p3[0].candidate?.date === '2026-05-01', 'the relaxed search still picks the earliest date')
assert(p3[0].overrides.length === 1 &&
       p3[0].overrides[0].teamName === 'Eagles' &&
       p3[0].overrides[0].date === '2026-05-01',
  'a candidate landing on a blackout date reports the team and date it overrides')

// 4. No blackout -> no override noise.
assert(p1[0].overrides.length === 0, 'a candidate on a free date reports no overrides')

// 8. THE RESERVATION INVARIANT.
// One field, one day, five default start times (10:00/12:00/14:00/16:00/18:00).
// Book four of them, leaving exactly one free slot for two pending conflicts.
const oneSlotCtx = {
  ...baseCtx,
  season: season('2026-05-01', '2026-05-01'),
  existingGames: [
    booked('b1', '2026-05-01', '10:00'),
    booked('b2', '2026-05-01', '12:00'),
    booked('b3', '2026-05-01', '14:00'),
    booked('b4', '2026-05-01', '16:00'),
  ],
}
const p8 = conflictPlan([conflict('c1', 'tA', 'tB'), conflict('c2', 'tC', 'tD')], [], oneSlotCtx)
const warnings = p8.filter(p => p.severity === 'warning')
assert(warnings.length === 1, 'only one conflict can claim the single remaining slot')
assert(warnings[0].candidate?.time === '18:00', 'the claimed slot is the one that was left free')
assert(p8.filter(p => p.severity === 'conflict').length === 1,
  'the conflict that lost the race re-derives as unfixable rather than sharing the slot')

// 2. Sort order: conflicts, then warnings, then non-pending.
const p2 = conflictPlan(
  [conflict('c1', 'tA', 'tB'), conflict('c2', 'tC', 'tD'), conflict('c3', 'tA', 'tC', 'skipped')],
  [], oneSlotCtx,
)
assert(p2.map(p => p.conflict.id).join(',') === 'c2,c1,c3',
  'unfixable conflicts sort first, then warnings, then already-resolved')

// 9. Plural helper used by the reworded detail strings.
assert(slots(1) === '1 slot', 'slots() is singular at one')
assert(slots(2) === '2 slots', 'slots() is plural above one')

console.log(`conflictPlan: ${passed}/${passed} assertions passed`)
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/gregoryamundson/Desktop/CLAUDE/.worktrees/fd-conflict-review
npx tsx src/lib/conflictPlan.test.ts
```

Expected: failure resolving `./conflictPlan` (module does not exist yet) and `slots` not exported from `./autoScheduler`.

- [ ] **Step 3: Add the `slots` helper to `autoScheduler.ts`**

The plural helper is needed by both this test and Task 2. Add it near the top of `src/lib/autoScheduler.ts`, just below the existing `parseBlackoutSet` at line 35–37:

```ts
/** "1 slot" / "2 slots" — used in conflict detail lines. */
export function slots(n: number): string {
  return `${n} slot${n === 1 ? '' : 's'}`
}
```

Do not change the existing `export { minsToTime, toMins }` line at the end of the file; `slots` is exported inline above.

- [ ] **Step 4: Write `src/lib/conflictPlan.ts`**

```ts
/**
 * Severity and one-click fixes for auto-schedule conflicts.
 *
 * FieldDay's scheduler is constructive — it only ever emits a game that
 * satisfies every constraint — so its only failure mode is omission. Every
 * conflict is one unplaced matchup, and the useful question is not "what is
 * wrong with this game" but "can this game be placed at all". That is what
 * severity means here.
 *
 * Nothing in this file is persisted. It is re-derived on every preview change,
 * which is what keeps a fix candidate from going stale between being rendered
 * and being clicked.
 *
 * React-free on purpose so it runs under `npx tsx`.
 */
import type { Division, Field, ScheduleConflict, ScheduledGame, SeasonConfig, Team } from './types'
import { rescheduleMatchupRelaxed } from './autoScheduler'

export interface PlanContext {
  divisions: Division[]
  fields: Field[]
  season: SeasonConfig
  blackoutDates: string[]
  existingGames: ScheduledGame[]
}

export interface PlannedConflict {
  conflict: ScheduleConflict
  severity: 'conflict' | 'warning'
  candidate: ScheduledGame | null
  /** What accepting `candidate` would violate. The relaxed search ignores team blackouts. */
  overrides: { teamName: string; date: string }[]
}

/** Blackout entries are "YYYY-MM-DD" or "YYYY-MM-DD::Label". */
function blackoutDatesOf(team: Team): Set<string> {
  return new Set((team.blackoutDates ?? []).map(e => e.split('::')[0]))
}

function overridesFor(candidate: ScheduledGame, teamById: Map<string, Team>) {
  const out: { teamName: string; date: string }[] = []
  for (const id of [candidate.homeTeamId, candidate.awayTeamId]) {
    const team = teamById.get(id)
    if (team && blackoutDatesOf(team).has(candidate.date)) {
      out.push({ teamName: team.name, date: candidate.date })
    }
  }
  return out
}

/** Unfixable first, then fixable, then anything already dealt with. */
function rank(p: PlannedConflict): number {
  if (p.conflict.resolution !== 'pending') return 2
  return p.severity === 'conflict' ? 0 : 1
}

export function conflictPlan(
  conflicts: ScheduleConflict[],
  preview: ScheduledGame[],
  ctx: PlanContext,
): PlannedConflict[] {
  const teamById = new Map(ctx.divisions.flatMap(d => d.teams).map(t => [t.id, t]))

  // Candidates are reserved as we go: a slot handed to one conflict is not
  // offered to the next. This is what makes "auto-fix all" safe to apply in a
  // single pass — without it two cards could name the same slot and applying
  // both would double-book a field.
  const reserved = [...preview]

  const planned: PlannedConflict[] = conflicts.map(conflict => {
    if (conflict.resolution !== 'pending') {
      return { conflict, severity: 'conflict', candidate: null, overrides: [] }
    }

    const candidate = rescheduleMatchupRelaxed({
      homeTeamId: conflict.homeTeamId,
      awayTeamId: conflict.awayTeamId,
      divisionId: conflict.divisionId,
      divisions: ctx.divisions,
      fields: ctx.fields,
      season: ctx.season,
      leagueBlackouts: ctx.blackoutDates,
      existingGames: ctx.existingGames,
      previewGames: reserved,
    })

    if (candidate) reserved.push(candidate)

    return {
      conflict,
      severity: candidate ? 'warning' : 'conflict',
      candidate,
      overrides: candidate ? overridesFor(candidate, teamById) : [],
    }
  })

  // Array.prototype.sort is stable, so equal ranks keep generation order.
  return planned.sort((a, b) => rank(a) - rank(b))
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx tsx src/lib/conflictPlan.test.ts
```

Expected: `conflictPlan: 12/12 assertions passed`

If assertion 8 fails with two warnings, `reserved.push(candidate)` is missing or the candidate is being pushed to a copy rather than the array passed as `previewGames`.

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```

Expected: no output. Ignore any LSP squiggles — `tsc` is the source of truth in a worktree.

- [ ] **Step 7: Commit**

```bash
git add src/lib/conflictPlan.ts src/lib/conflictPlan.test.ts src/lib/autoScheduler.ts
git -c user.email=gmd4fy5yb4@privaterelay.appleid.com -c user.name='Gregory Amundson' \
  commit -m "Add conflictPlan: severity by fixability, with slot reservation

Reserving each candidate as the list is walked means two cards can never
offer the same slot, which is what lets auto-fix-all apply in one pass.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Tighten the conflict wording at the source

**Files:**
- Modify: `src/lib/autoScheduler.ts:257-325`

**Interfaces:**
- Consumes: `slots()` from Task 1.
- Produces: nothing new. Only the contents of `details[]` and `suggestions[]` change.

**Why here and not in the UI:** these strings are built while the failure counts are still structured. Parsing them back apart in the UI would be a regex against sentences this file generates. A grep confirmed nothing outside `autoScheduler.ts` reads them, so rewording is a safe rename.

- [ ] **Step 1: Replace the detail/suggestion builder**

In `src/lib/autoScheduler.ts`, replace the whole `else` block that currently starts at line 257 (`} else {` … through the `conflicts.push({...})` call ending at line 325) with:

```ts
      } else {
        // Team names are needed by nearly every line below; resolve once
        // rather than re-scanning every team in the league six times.
        const homeTeamName = divisions.flatMap(d => d.teams).find(t => t.id === home)?.name ?? home
        const awayTeamName = divisions.flatMap(d => d.teams).find(t => t.id === away)?.name ?? away

        const details: string[] = []
        const suggestions: string[] = []

        if (failReasons.fieldBooked > 0) {
          // Not "Diamond 2" — the counter is summed across every field and
          // does not record which. Per-field counters would be more state
          // than a line of explanatory text is worth.
          details.push(`${slots(failReasons.fieldBooked)} — field already booked`)
        }
        if (failReasons.homeTeamBusy > 0) {
          details.push(`${slots(failReasons.homeTeamBusy)} — ${homeTeamName} already play that day`)
        }
        if (failReasons.awayTeamBusy > 0) {
          details.push(`${slots(failReasons.awayTeamBusy)} — ${awayTeamName} already play that day`)
        }
        if (failReasons.homeTeamBlackout > 0) {
          details.push(`${slots(failReasons.homeTeamBlackout)} — ${homeTeamName}'s blackout dates`)
          if (homeBlackouts.size > 0) {
            const dates = Array.from(homeBlackouts).sort().slice(0, 3).join(', ')
            suggestions.push(`Review ${homeTeamName}'s blackout dates: ${dates}${homeBlackouts.size > 3 ? ', …' : ''}`)
          }
        }
        if (failReasons.awayTeamBlackout > 0) {
          details.push(`${slots(failReasons.awayTeamBlackout)} — ${awayTeamName}'s blackout dates`)
          if (awayBlackouts.size > 0) {
            const dates = Array.from(awayBlackouts).sort().slice(0, 3).join(', ')
            suggestions.push(`Review ${awayTeamName}'s blackout dates: ${dates}${awayBlackouts.size > 3 ? ', …' : ''}`)
          }
        }

        if (details.length === 0) {
          if (validSlots.length === 0) {
            details.push('No slots exist for this division')
            if (fields.length === 0) suggestions.push('Add at least one field')
            else if (!season.startDate || !season.endDate) suggestions.push('Set a season start and end date')
            else if (division.gameDays && division.gameDays.length > 0) {
              const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
              suggestions.push(`${division.name} only plays ${division.gameDays.map(d => dayNames[d]).join(', ')} — consider adding game days`)
            }
          } else {
            details.push('No slot survives every constraint')
            suggestions.push('Extend the season end date')
            suggestions.push('Add more fields or reduce team blackout dates')
          }
        }

        if (fields.length > 0 && validSlots.length > 0) {
          suggestions.push('Add more fields or time slots')
          if (leagueBlackouts.length > 0) {
            suggestions.push(`Remove some of the ${leagueBlackouts.length} league blackout dates`)
          }
        }

        conflicts.push({
          id: uid(),
          divisionId: division.id,
          homeTeamId: home,
          awayTeamId: away,
          reason: `Could not find an available slot for ${homeTeamName} vs ${awayTeamName}`,
          details,
          suggestions: suggestions.length > 0 ? suggestions : ['Schedule this game manually in the Schedule tab'],
          resolution: 'pending',
        })
      }
```

Note the two `const homeTeamName` / `awayTeamName` declarations that previously sat at lines 313–314 are now at the top of the block — make sure they are not declared twice.

- [ ] **Step 2: Verify the old wording is gone**

```bash
grep -n "slot(s)\|blocked because\|blocked by\|Try extending\|Consider removing" src/lib/autoScheduler.ts
```

Expected: no matches. Any hit means a string was missed.

- [ ] **Step 3: Verify nothing else depended on the old strings**

```bash
grep -rn "slot(s)\|blocked because" src --include='*.ts' --include='*.tsx'
```

Expected: no matches anywhere.

- [ ] **Step 4: Run the tests and type-check**

```bash
npx tsx src/lib/conflictPlan.test.ts && npx tsc --noEmit
```

Expected: `conflictPlan: 12/12 assertions passed`, then no `tsc` output.

- [ ] **Step 5: Commit**

```bash
git add src/lib/autoScheduler.ts
git -c user.email=gmd4fy5yb4@privaterelay.appleid.com -c user.name='Gregory Amundson' \
  commit -m "Tighten conflict detail and suggestion wording

Reworded where the counts are still structured. Also hoists the two team
name lookups that were being recomputed six times per conflict.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Replace the carousel with the flag list

**Files:**
- Modify: `src/components/AutoScheduleTab.tsx` — imports (line 2–6), component state (47–61), the resolution handlers (193–242), and the STEP 3 render block (619–773)

**Interfaces:**
- Consumes: `conflictPlan`, `PlannedConflict` from Task 1; the reworded `details[]` / `suggestions[]` from Task 2.
- Produces: nothing imported elsewhere. Task 4 modifies `commitPreview` in this same file and relies on the `plans` and `openCount` bindings added here.

**What is being deleted:** the prev/next carousel (`conflictIndex` state and its render at 640–660) and the `showAllConflicts` collapsed table (722–771). The table only existed because the carousel showed one conflict at a time.

**Existing helpers in this file you should reuse, not rewrite:** `getTeamName(id)` (line 295), `fmtDateShort(s)` (line 40), `fmtTime(t)` (line 27), `divisionMap` (line 63), `fieldMap` (line 291).

- [ ] **Step 1: Update the imports**

Replace line 5 of `src/components/AutoScheduleTab.tsx`:

```ts
import { generateSchedule, rescheduleMatchupRelaxed } from '@/lib/autoScheduler'
```

with:

```ts
import { generateSchedule } from '@/lib/autoScheduler'
import { conflictPlan, type PlannedConflict } from '@/lib/conflictPlan'
```

`rescheduleMatchupRelaxed` is no longer called directly from the component — `conflictPlan` owns it now.

- [ ] **Step 2: Replace the conflict state and derive the plan**

Delete these two lines (48 and 49):

```ts
  const [conflictIndex, setConflictIndex] = useState(0)
  const [showAllConflicts, setShowAllConflicts] = useState(false)
```

Then replace lines 60–61:

```ts
  const pendingConflicts = conflicts.filter(c => c.resolution === 'pending')
  const currentConflict = pendingConflicts[conflictIndex] ?? pendingConflicts[0] ?? null
```

with:

```ts
  const pendingConflicts = conflicts.filter(c => c.resolution === 'pending')

  // Re-derived on every preview change. That is deliberate: a candidate slot
  // computed once and cached could be taken by the time the user clicks it.
  const plans = useMemo(
    () => conflictPlan(conflicts, preview ?? [], {
      divisions: state.divisions,
      fields: state.fields,
      season: state.season,
      blackoutDates: state.blackoutDates ?? [],
      existingGames: state.schedule.games,
    }),
    [conflicts, preview, state.divisions, state.fields, state.season, state.blackoutDates, state.schedule.games],
  )

  const openCount = pendingConflicts.length
  const fixable = plans.filter(p => p.conflict.resolution === 'pending' && p.candidate !== null)
```

- [ ] **Step 3: Add the `placedBy` state**

A resolved conflict needs to remember which game was placed for it so Undo can remove that game again. Add this next to the other `useState` calls near line 50, **before** the handlers in the next step reference it:

```ts
  // conflictId -> the game placed for it, so Undo can take it back out
  const [placedBy, setPlacedBy] = useState<Record<string, ScheduledGame>>({})
```

`ScheduledGame` is already imported on line 3.

- [ ] **Step 4: Remove the last carousel reference in `handleGenerate`**

`handleGenerate` still calls `setConflictIndex(0)` at line 186, whose state Step 2 deleted. Delete that line. `handleGenerate` now ends:

```ts
        setState(s => ({
          ...s,
          autoSchedulePreview: result.games,
          autoScheduleConflicts: result.conflicts,
        }))
      } finally {
        setGenerating(false)
      }
```

- [ ] **Step 5: Replace the resolution handlers**

Replace the whole block from line 193 (`// ── Conflict resolution ───`) through the end of `tryRelaxedConstraints` at line 242 with:

```ts
  // ── Conflict resolution ──────────────────────────────────────────

  function resolveConflict(conflictId: string, resolution: 'skipped' | 'resolved') {
    setState(s => ({
      ...s,
      autoScheduleConflicts: (s.autoScheduleConflicts ?? []).map(c =>
        c.id === conflictId ? { ...c, resolution } : c
      ),
    }))
  }

  function reopenConflict(conflictId: string, candidateId: string | null) {
    setState(s => ({
      ...s,
      autoSchedulePreview: candidateId
        ? (s.autoSchedulePreview ?? []).filter(g => g.id !== candidateId)
        : s.autoSchedulePreview,
      autoScheduleConflicts: (s.autoScheduleConflicts ?? []).map(c =>
        c.id === conflictId ? { ...c, resolution: 'pending' } : c
      ),
    }))
    setPlacedBy(m => {
      const next = { ...m }
      delete next[conflictId]
      return next
    })
  }

  function applyFix(plan: PlannedConflict) {
    if (!plan.candidate) return
    const game = plan.candidate
    setState(s => ({
      ...s,
      autoSchedulePreview: [...(s.autoSchedulePreview ?? []), game],
      autoScheduleConflicts: (s.autoScheduleConflicts ?? []).map(c =>
        c.id === plan.conflict.id ? { ...c, resolution: 'resolved' } : c
      ),
    }))
    setPlacedBy(m => ({ ...m, [plan.conflict.id]: game }))
  }

  // Safe as a single pass: conflictPlan reserved each candidate as it walked
  // the list, so no two of these name the same slot.
  function autoFixAll() {
    const games = fixable.map(p => p.candidate!)
    const ids = new Set(fixable.map(p => p.conflict.id))
    setState(s => ({
      ...s,
      autoSchedulePreview: [...(s.autoSchedulePreview ?? []), ...games],
      autoScheduleConflicts: (s.autoScheduleConflicts ?? []).map(c =>
        ids.has(c.id) ? { ...c, resolution: 'resolved' } : c
      ),
    }))
    setPlacedBy(m => {
      const next = { ...m }
      for (const p of fixable) next[p.conflict.id] = p.candidate!
      return next
    })
  }

  function skipAllRemaining() {
    setState(s => ({
      ...s,
      autoScheduleConflicts: (s.autoScheduleConflicts ?? []).map(c =>
        c.resolution === 'pending' ? { ...c, resolution: 'skipped' } : c
      ),
    }))
  }
```

- [ ] **Step 6: Replace the STEP 3 render block**

Replace lines 619–773 entirely (from the `{/* ── STEP 3: CONFLICT RESOLUTION ───` comment through the closing `)}` of that section) with:

```tsx
      {/* ── STEP 3: FLAG REVIEW ──────────────────────────────────── */}
      {conflicts.length > 0 && (
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b bg-[#f5f5fb] flex items-center gap-3 flex-wrap">
            <span className="w-7 h-7 rounded-full bg-[var(--fd-primary)] text-white text-sm font-bold flex items-center justify-center flex-shrink-0">3</span>
            <span className="font-semibold text-gray-800" style={{ fontFamily: 'Oswald, sans-serif' }}>
              Flags · most severe first
            </span>
            {openCount > 0 ? (
              <span className="ml-auto bg-[var(--fd-accent)] text-white text-xs font-bold px-2.5 py-1 rounded-full">
                {openCount} to review
              </span>
            ) : (
              <span className="ml-auto bg-emerald-100 text-emerald-700 text-xs font-bold px-2.5 py-1 rounded-full">
                All resolved
              </span>
            )}
          </div>

          {openCount > 0 && (
            <div className="px-5 py-3 border-b bg-gray-50 flex flex-col sm:flex-row gap-2">
              {fixable.length > 0 && (
                <button
                  onClick={autoFixAll}
                  className="min-h-[44px] px-4 py-2 rounded-lg bg-[var(--fd-primary)] text-white text-sm font-semibold hover:bg-[var(--fd-primary-dark)] transition"
                >
                  Auto-fix all fixable ({fixable.length})
                </button>
              )}
              <button
                onClick={skipAllRemaining}
                className="min-h-[44px] px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-100 transition"
              >
                Skip all remaining ({openCount})
              </button>
            </div>
          )}

          <ul className="divide-y">
            {plans.map(plan => {
              const c = plan.conflict
              const divName = divisionMap.get(c.divisionId)?.name ?? c.divisionId
              const isOpen = c.resolution === 'pending'
              const placed = placedBy[c.id] ?? null

              if (!isOpen) {
                return (
                  <li key={c.id} className="px-5 py-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-sm font-semibold text-emerald-700">
                      {placed
                        ? `✓ Placed ${fmtDateShort(placed.date)}, ${fmtTime(placed.time)} · ${fieldMap.get(placed.fieldId)?.name ?? 'field'}`
                        : '✓ Skipped'}
                    </span>
                    <span className="text-sm text-gray-700">
                      {getTeamName(c.homeTeamId)} vs {getTeamName(c.awayTeamId)}
                    </span>
                    <button
                      onClick={() => reopenConflict(c.id, placed?.id ?? null)}
                      className="ml-auto min-h-[44px] px-3 text-sm text-[var(--fd-primary)] hover:underline"
                    >
                      Undo
                    </button>
                  </li>
                )
              }

              const isBlocker = plan.severity === 'conflict'
              return (
                <li
                  key={c.id}
                  className={`px-5 py-4 border-l-4 ${isBlocker ? 'border-l-red-600 bg-red-50' : 'border-l-amber-500 bg-amber-50'}`}
                >
                  <span
                    className={`inline-block text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full border ${
                      isBlocker
                        ? 'bg-white text-red-700 border-red-200'
                        : 'bg-white text-amber-800 border-amber-200'
                    }`}
                  >
                    {isBlocker ? 'CONFLICT' : 'WARNING'}
                  </span>

                  <p className="font-semibold text-gray-800 text-sm mt-2">
                    {getTeamName(c.homeTeamId)} vs {getTeamName(c.awayTeamId)} couldn&rsquo;t be placed
                    <span className="font-normal text-gray-500"> · {divName}</span>
                  </p>

                  {c.details.length > 0 && (
                    <ul className="mt-2 space-y-0.5">
                      {c.details.map((d, i) => (
                        <li key={i} className="text-xs text-gray-700">{d}</li>
                      ))}
                    </ul>
                  )}

                  {isBlocker && c.suggestions.length > 0 && (
                    <ul className="mt-2 space-y-0.5">
                      {c.suggestions.map((s, i) => (
                        <li key={i} className="text-xs text-gray-500">{s}</li>
                      ))}
                    </ul>
                  )}

                  <div className="mt-3 flex flex-col sm:flex-row gap-2">
                    {plan.candidate && (
                      <button
                        onClick={() => applyFix(plan)}
                        className="min-h-[44px] px-4 py-2 rounded-lg bg-[var(--fd-primary)] text-white text-sm font-semibold hover:bg-[var(--fd-primary-dark)] transition"
                      >
                        Place {fmtDateShort(plan.candidate.date)}, {fmtTime(plan.candidate.time)} · {fieldMap.get(plan.candidate.fieldId)?.name ?? 'field'}
                      </button>
                    )}
                    <button
                      onClick={() => resolveConflict(c.id, 'skipped')}
                      className="min-h-[44px] px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 transition"
                    >
                      Skip this game
                    </button>
                  </div>

                  {plan.overrides.length > 0 && (
                    <p className="mt-2 text-xs text-amber-800">
                      ⚠ overrides {plan.overrides.map(o => `${o.teamName}'s blackout on ${fmtDateShort(o.date)}`).join(' and ')}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
```

The `overrides` line sits **below** the fix button deliberately — it describes a consequence of pressing it.

- [ ] **Step 7: Type-check and build**

```bash
npx tsc --noEmit && npm run build
```

Expected: no `tsc` output; build succeeds. If `tsc` reports `conflictIndex`/`showAllConflicts` unused or undefined, a reference to the deleted carousel survives — search for both names and remove them.

- [ ] **Step 8: Confirm the deleted UI is really gone**

```bash
grep -n "conflictIndex\|showAllConflicts\|Try relaxed constraints\|text-gray-400" src/components/AutoScheduleTab.tsx
```

Expected: no matches. `text-gray-400` is in this list because the old block used it at line 716 and it fails AA.

- [ ] **Step 9: Commit**

```bash
git add src/components/AutoScheduleTab.tsx
git -c user.email=gmd4fy5yb4@privaterelay.appleid.com -c user.name='Gregory Amundson' \
  commit -m "Replace conflict carousel with severity-sorted flag list

Named one-click fixes, auto-fix-all, and blackout overrides shown on the
card. Deletes the prev/next carousel and the collapsed conflict table it
existed to compensate for.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Gate apply and auto-snapshot before replace

**Files:**
- Modify: `src/components/AutoScheduleTab.tsx` — `Props` (8–11), `commitPreview` (246–260), commit buttons (861–905)
- Modify: `src/app/page.tsx:860`

**Interfaces:**
- Consumes: `openCount` from Task 3.
- Produces: `AutoScheduleTab` now requires `leagueCode: string | null` and `userName: string`.

**Why new props:** `saveSnapshot(leagueId, name, state, userName)` lives in `src/lib/sync.ts:119` and needs the league code. `AutoScheduleTab` currently receives only `state` and `setState`; `leagueCode` and `userName` are held in `page.tsx` (lines 109–110). `page.tsx` already passes both to `SnapshotModal` at lines 868–869, so this follows an existing pattern.

**Why replace only:** `commitPreview('replace')` wipes all games **and** all practices (lines 252–253). Append is additive and the 20-deep undo stack in `page.tsx` already covers it.

- [ ] **Step 1: Widen the Props interface**

Replace lines 8–11 of `src/components/AutoScheduleTab.tsx`:

```ts
interface Props {
  state: AppState
  setState: React.Dispatch<React.SetStateAction<AppState>>
  leagueCode: string | null
  userName: string
}
```

And the signature on line 46:

```ts
export default function AutoScheduleTab({ state, setState, leagueCode, userName }: Props) {
```

- [ ] **Step 2: Import `saveSnapshot`**

Add below the other imports at the top of the file:

```ts
import { saveSnapshot } from '@/lib/sync'
```

- [ ] **Step 3: Add applied-summary state**

Next to the other `useState` calls:

```ts
  const [applied, setApplied] = useState<null | { games: number; fixes: number; skips: number; snapshot: boolean }>(null)
```

- [ ] **Step 4: Rewrite `commitPreview`**

Replace lines 246–260 with:

```ts
  function commitPreview(mode: 'append' | 'replace') {
    if (!preview || preview.length === 0) return

    // Replace is the only destructive path — it wipes games AND practices.
    // Fire-and-forget matches maybeAutoSnapshot() in page.tsx; a failed
    // snapshot must not block the apply the user asked for.
    const snapshot = mode === 'replace' && !!leagueCode
    if (snapshot && leagueCode) {
      void saveSnapshot(leagueCode, '[Auto] Before auto-schedule', state, userName)
    }

    setApplied({
      games: preview.length,
      fixes: conflicts.filter(c => c.resolution === 'resolved').length,
      skips: conflicts.filter(c => c.resolution === 'skipped').length,
      snapshot,
    })

    setState(s => ({
      ...s,
      schedule: {
        ...s.schedule,
        games: mode === 'replace' ? preview : [...s.schedule.games, ...preview],
        practices: mode === 'replace' ? [] : s.schedule.practices,
        generatedAt: new Date().toISOString(),
      },
      autoSchedulePreview: null,
      autoScheduleConflicts: (s.autoScheduleConflicts ?? []).filter(c => c.resolution === 'pending'),
    }))
    setCommitMode(null)
    setPlacedBy({})
  }
```

- [ ] **Step 5: Clear the summary when a new draft is generated**

In `handleGenerate` (line 170), add `setApplied(null)` next to the existing `setConflictIndex(0)` call — which Task 3 deleted, so the line now reads:

```ts
        setApplied(null)
```

placed immediately after the `setState(...)` call inside the `try` block.

- [ ] **Step 6: Gate the commit buttons**

Replace the final `) : (` branch of the commit block (lines 883–904) with:

```tsx
                ) : (
                  <>
                    {openCount > 0 && (
                      <p id="apply-gate-reason" className="w-full text-sm text-gray-700">
                        Resolve all {openCount} open flag{openCount !== 1 ? 's' : ''} above before applying.
                      </p>
                    )}
                    <button
                      onClick={() => setCommitMode('append')}
                      disabled={openCount > 0}
                      aria-describedby={openCount > 0 ? 'apply-gate-reason' : undefined}
                      className="min-h-[44px] bg-[var(--fd-primary)] text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-[var(--fd-primary-dark)] transition disabled:bg-gray-200 disabled:text-gray-500 disabled:cursor-not-allowed"
                    >
                      {openCount > 0 ? `Append to Existing Schedule (${openCount} open)` : 'Append to Existing Schedule'}
                    </button>
                    <button
                      onClick={() => setCommitMode('replace')}
                      disabled={openCount > 0}
                      aria-describedby={openCount > 0 ? 'apply-gate-reason' : undefined}
                      className="min-h-[44px] bg-white border-2 border-red-400 text-red-700 px-5 py-2 rounded-lg text-sm font-semibold hover:bg-red-50 transition disabled:border-gray-200 disabled:text-gray-500 disabled:cursor-not-allowed"
                    >
                      {openCount > 0 ? `Replace Existing Schedule (${openCount} open)` : 'Replace Existing Schedule'}
                    </button>
                    <button
                      onClick={discardPreview}
                      className="min-h-[44px] border border-gray-300 text-gray-700 px-5 py-2 rounded-lg text-sm font-semibold hover:bg-gray-100 transition"
                    >
                      Discard Draft
                    </button>
                  </>
                )}
```

`text-red-600` became `text-red-700` on the Replace button — `red-600` on white is 4.0:1 and marginal at this weight.

- [ ] **Step 7: Update the Replace confirmation copy**

The warning at line 876 tells the user to save a snapshot by hand. That is now automatic. Replace its text with:

```tsx
                    <span className="text-sm font-medium text-red-700">
                      Replace ALL existing games &amp; practices with these {preview.length} game{preview.length !== 1 ? 's' : ''}? A snapshot will be saved first.
                    </span>
```

- [ ] **Step 8: Render the applied summary**

Immediately after the closing `)}` of the STEP 4 preview section (just before the `{/* Empty state */}` comment near line 911), add:

```tsx
      {applied && preview === null && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-5 py-4">
          <p className="font-semibold text-emerald-700">
            Schedule applied — {applied.games} game{applied.games !== 1 ? 's' : ''}
          </p>
          <p className="text-sm text-gray-700 mt-1">
            {applied.fixes} fix{applied.fixes !== 1 ? 'es' : ''} applied · {applied.skips} flag{applied.skips !== 1 ? 's' : ''} skipped
          </p>
          {applied.snapshot && (
            <p className="text-sm text-gray-700 mt-1">
              A &ldquo;Before auto-schedule&rdquo; snapshot was saved — restore it from Snapshots.
            </p>
          )}
        </div>
      )}
```

- [ ] **Step 9: Pass the new props from `page.tsx`**

Replace line 860 of `src/app/page.tsx`:

```tsx
          {tab === 8  && <AutoScheduleTab state={state} setState={setState} leagueCode={leagueCode} userName={userName} />}
```

- [ ] **Step 10: Type-check and build**

```bash
npx tsc --noEmit && npm run build
```

Expected: no `tsc` output; build succeeds. A missing-prop error on `AutoScheduleTab` means Step 9 was skipped.

- [ ] **Step 11: Commit**

```bash
git add src/components/AutoScheduleTab.tsx src/app/page.tsx
git -c user.email=gmd4fy5yb4@privaterelay.appleid.com -c user.name='Gregory Amundson' \
  commit -m "Gate apply on open flags and snapshot before replace

Replace wipes games and practices, so it now takes an automatic
'[Auto] Before auto-schedule' snapshot instead of telling the user to
save one by hand.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Full verification

**Files:** none modified unless a defect is found.

**Interfaces:** none.

Every real defect in Phase 2 was found in a browser, not by the type checker or the tests. Type-check-clean, build-clean, tests-green code shipped a stranger's game as the hero of the acquisition page and dropped every league's theme.

- [ ] **Step 1: Run every test file and both compilers**

```bash
cd /Users/gregoryamundson/Desktop/CLAUDE/.worktrees/fd-conflict-review
npx tsx src/lib/conflictPlan.test.ts
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

Expected: every test prints `N/N assertions passed`; no `tsc` output; build succeeds. Do not proceed past a failure.

Note `linkedCalendars.test.ts` belongs to the other session — do not run or count it.

- [ ] **Step 2: Start a dev server**

```bash
pkill -f "next dev"; rm -rf .next
npm run dev
```

`rm -rf .next` is not optional — a stale cache throws `__webpack_modules__[moduleId] is not a function`, which looks like a real 500. Run this in the background and note the port.

- [ ] **Step 3: Sign in as an admin**

`/auth/callback` never completes headlessly. Mint the session by hand — the full recipe is in `HANDOFF-phase3-admin-power-tools.md` under "Verifying UI in a browser". In short: `POST /auth/v1/admin/generate_link` → `GET /auth/v1/verify` with `redirect: 'manual'` → read `access_token` from the Location fragment → set cookie `sb-actgfxrinoxlyrprzkoh-auth-token` to `"base64-" + base64(JSON.stringify(session))`, plus `localStorage` `sb-league-code` and `sb-user-name` **on the app's own origin including port**.

Use league **`JF9ZDS`** (`greg+test8@` — 27 games, no results). **Never `YWWM8G`** — that is the real production league.

- [ ] **Step 4: Force both severity tiers**

On the Auto Schedule tab, over-constrain the league so generation fails for some matchups: shorten the season to about a week, and add a blackout to the only field. Then Generate.

Expected: a list showing both `WARNING` cards (with a `Place …` button naming a real date, time and field) and `CONFLICT` cards (no fix button, suggestions shown).

If everything is a WARNING, constrain harder. If everything is a CONFLICT, relax slightly — you need both to verify the tiers.

- [ ] **Step 5: Verify the gate**

With flags open, confirm both Append and Replace are truly disabled — not merely styled grey:

```js
document.querySelectorAll('button').forEach(b => {
  if (/Existing Schedule/.test(b.textContent)) console.log(b.textContent.trim(), '| disabled:', b.disabled)
})
```

Expected: `disabled: true` for both, and each label ends with `(N open)`.

- [ ] **Step 6: Verify auto-fix-all does not double-book — the critical check**

Click `Auto-fix all fixable`, then in the console:

```js
// no field should hold two games at the same date+time in the preview
const rows = [...document.querySelectorAll('table tr')]
console.log('preview rows:', rows.length)
```

Better, check the state directly if exposed; otherwise read the preview table and confirm no `(date, time, field)` triple appears twice. This is the invariant Task 1 assertion 8 protects — confirm it survives in the real app.

- [ ] **Step 7: Verify Undo**

On a resolved card, click `Undo`.

Expected: the card returns to open with its severity chip, the preview game count drops by exactly one, and the previously-placed slot becomes available to another flag.

- [ ] **Step 8: Verify the snapshot**

Resolve or skip every flag, then Replace. Confirm the success panel names the snapshot, then open the Snapshots modal from the header and confirm a `[Auto] Before auto-schedule` entry exists with the current timestamp.

- [ ] **Step 9: Check 390px**

Resize to 390×844 and re-check the flag list.

Expected: cards stack, fix and skip buttons go full-width, nothing scrolls horizontally, and every control measures ≥44px:

```js
[...document.querySelectorAll('li button')].forEach(b =>
  console.log(b.textContent.trim().slice(0, 30), b.getBoundingClientRect().height))
```

Use `element.checkVisibility()`, never `getComputedStyle().display` — Tailwind puts `hidden` on a *wrapper*, and a child of a `display:none` parent still reports its own display. That mistake produced a completely false "the desktop nav is leaking at 390px" reading in Phase 2.

Put a frame between any synthetic click and reading the DOM — React batches state updates, so a synchronous read shows the old value.

- [ ] **Step 10: Pre-deploy auth regression check**

Run against the Sports DB (`supabase-sports` MCP):

```sql
select email, confirmation_sent_at from auth.users order by created_at desc limit 3;
```

Expected: `confirmation_sent_at` is NULL on recent rows. A non-null value means "Confirm email" has been switched back on in Supabase — fix that before deploying. This has caught a real regression twice.

- [ ] **Step 11: Commit any fixes and report**

Commit fixes individually with the standard author flag. Then report: which assertions passed, what the browser checks showed, and any defect found and fixed. Do not claim completion without pasting the actual test output.

---

## Merge (after Task 5 passes)

Do **not** `git checkout main` in the main checkout — it would carry the other session's dirty files across.

```bash
# from the MAIN checkout, which stays on dev
cd /Users/gregoryamundson/Desktop/CLAUDE/fieldday-planner
git merge --no-ff fd-conflict-review
npx tsc --noEmit && npm run build
```

Then merge `dev` → `main` through a temporary worktree, confirm `git diff --stat dev main` prints nothing before pushing, and verify Vercel actually serves the new commit — a push landing on GitHub is not a deploy.

Finally, remove the worktree. Before `git worktree remove`, confirm `node_modules` inside it is a symlink and not a real directory.
