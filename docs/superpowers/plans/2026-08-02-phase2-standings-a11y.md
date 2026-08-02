# Standings Detail + A11y Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the standings hiding their own data on a phone, and close the four accessibility gaps — tab semantics, a mouse-only tooltip, hue-only division chips, and sheets that lose focus.

**Architecture:** New derived logic (streak, last-5, recent results) goes in a pure `src/lib/standings.ts` runnable under `npx tsx` — that is this item's automated coverage. Everything else is presentation and ARIA on existing components. The existing standings accumulation is deliberately left where it is.

**Tech Stack:** Next.js App Router (client components), React 19, Tailwind CSS, TypeScript. No test framework — standalone assert files run with `npx tsx`. No new dependencies.

## Global Constraints

- **No new npm dependencies. No database migration.**
- **Do not touch these files** — another live session owns them: `src/lib/types.ts`, `src/lib/linkedCalendars.ts`, `src/lib/linkedCalendars.test.ts`, `src/components/LinkedCalendarsTab.tsx`, `HANDOFF-shared-calendar.md`. Read `types.ts` freely; never edit it.
- **Do not modify `TABS` or `NAV_GROUPS`** in `src/app/page.tsx`.
- **Nothing above 640px may change**, with exactly two intentional exceptions, both in this plan: the desktop nav's ARIA semantics (no visual change) and the division-initials badge on month-grid chips.
- **Nothing colour-only.** Every state this plan introduces — streak, last-5 dots, W/L badges, division chips — must carry a letter or text. Colour is reinforcement, never the signal. This is the whole point of finding 16; a fix that reintroduces it is a task failure.
- **Touch targets ≥44px.**
- **WCAG AA:** 4.5:1 for text under 18px. `text-gray-400` (#9CA3AF, ~2.5:1) **fails** and has been caught five times in this project. `text-gray-500` (~4.8:1) passes.
- **Accent is `var(--fd-accent)` (#cd163f); primary is `var(--fd-primary)` (#00013a).** Use the variables, not hex literals.
- **Commit author MUST be** `gmd4fy5yb4@privaterelay.appleid.com`:
  `git -c user.email=gmd4fy5yb4@privaterelay.appleid.com -c user.name="Gregory Amundson" commit -m "..."`
- **The LSP reports phantom "Cannot find module" errors inside a worktree** because `node_modules` is a symlink. `npx tsc --noEmit` is the only source of truth.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/lib/standings.ts` | Create | Pure derived form: streak, last-5, recent results. |
| `src/lib/standings.test.ts` | Create | Asserts that logic. |
| `src/lib/divisionColors.ts` | Modify | Add `divisionInitials(name)` beside the palette it complements. |
| `src/components/StandingsTab.tsx` | Modify | Mobile list + tap-row detail; desktop table untouched. |
| `src/app/page.tsx` | Modify | Tablist semantics + roving tabindex on the desktop nav; `<main>` becomes the tabpanel. |
| `src/components/DashboardTab.tsx` | Modify | Replace the mouse-only Confirm tooltip with a `?` disclosure. |
| `src/components/ScheduleTab.tsx` | Modify | Division initials badge on month-grid chips. |
| `src/components/FieldCalendarTab.tsx` | Modify | Same badge on its month-grid chips. |
| `src/components/MobileNav.tsx` | Modify | Sheet focus trap + restore. |
| `src/components/CoachView.tsx` | Modify | Picker focus trap + restore + Escape. |

---

## Task 0: Isolated workspace

**Files:** none committed.

**Interfaces:**
- Consumes: nothing.
- Produces: a worktree at `.worktrees/standings-a11y` on branch `standings-a11y`, from `dev`.

- [ ] **Step 1: Create the worktree**

```bash
cd /Users/gregoryamundson/Desktop/CLAUDE/fieldday-planner
git worktree add .worktrees/standings-a11y -b standings-a11y dev
cd .worktrees/standings-a11y
ln -s ../../node_modules node_modules
cp ../../.env.local .env.local
```

- [ ] **Step 2: Exclude the symlink**

Inside a worktree `.git` is a *file*, so `>> .git/info/exclude` fails with "not a directory". Ask git for the real path:

```bash
EX=$(git rev-parse --git-path info/exclude)
mkdir -p "$(dirname "$EX")"
grep -q '^node_modules$' "$EX" || printf 'node_modules\n.env.local\n' >> "$EX"
```

- [ ] **Step 3: Verify**

```bash
git status --short
npx tsc --noEmit
```
Expected: `git status --short` silent; `tsc` exits 0.

No commit.

---

## Task 1: Team form logic (`standings.ts`)

**Files:**
- Create: `src/lib/standings.ts`
- Test: `src/lib/standings.test.ts`

**Interfaces:**
- Consumes: `ScheduledGame` from `@/lib/types` (read-only import).
- Produces:
  - `type Outcome = 'W' | 'L' | 'T'`
  - `interface TeamForm { last5: Outcome[]; streak: { kind: Outcome; count: number } | null; recentResults: RecentResult[] }`
  - `interface RecentResult { gameId: string; date: string; outcome: Outcome; opponentTeamId: string; scoreFor: number; scoreAgainst: number }`
  - `function teamForm(games: ScheduledGame[], teamId: string, limit: number): TeamForm`

**Why this exists:** `StandingsTab` accumulates W/L/T/RF/RA/GP by iterating `state.schedule.games` in array order — it never sorts by date and never tracks sequence, so streak and last-5 cannot be read off it. This is genuinely new logic, and it is the only part of this item a unit test can hold.

- [ ] **Step 1: Write the failing test**

Create `src/lib/standings.test.ts`:

```ts
/**
 * Streak and last-5 are the only standings numbers that depend on ORDER, which
 * is exactly what the existing accumulation throws away. Scores are recorded
 * home-vs-away, so every value here also has to be flipped to the subject
 * team's perspective — the easiest thing in this file to get backwards.
 */
import type { ScheduledGame } from './types'
import { teamForm } from './standings'

let passed = 0
function assert(cond: boolean, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exit(1) }
  passed++
}

// home team `h` beats/loses to away team `a` by the given score
const g = (
  id: string, date: string, home: string, away: string,
  homeScore?: number, awayScore?: number,
): ScheduledGame => ({
  id, type: 'game', date, time: '10:00', durationMinutes: 90,
  fieldId: 'f1', homeTeamId: home, awayTeamId: away, umpireId: '', divisionId: 'd1',
  ...(homeScore === undefined ? {} : { result: { homeScore, awayScore: awayScore! } }),
})

// tA's history, oldest first: W (home), L (away), W (away), T, W (home)
const games: ScheduledGame[] = [
  g('g5', '2026-05-05', 'tA', 'tB', 7, 2),   // most recent: W
  g('g1', '2026-05-01', 'tA', 'tB', 5, 3),   // oldest: W
  g('g4', '2026-05-04', 'tB', 'tA', 4, 4),   // T
  g('g2', '2026-05-02', 'tB', 'tA', 6, 1),   // L (tA away, scored 1)
  g('g3', '2026-05-03', 'tB', 'tA', 2, 9),   // W (tA away, scored 9)
  g('g6', '2026-05-06', 'tA', 'tB'),         // no result — must be ignored
  g('g7', '2026-05-01', 'tC', 'tD', 1, 0),   // another team's game
]

const f = teamForm(games, 'tA', 5)

// 1. Only completed games for this team, in chronological order.
assert(f.last5.join('') === 'WLWTW', 'last5 is chronological oldest-first and excludes unplayed/other games')

// 2. Streak counts back from the MOST RECENT game.
assert(f.streak?.kind === 'W' && f.streak.count === 1, 'streak is the current run from the most recent game')

// 3. A tie breaks a streak rather than extending it.
const tieBreaks = teamForm([
  g('a1', '2026-05-01', 'tA', 'tB', 5, 0),
  g('a2', '2026-05-02', 'tA', 'tB', 5, 0),
  g('a3', '2026-05-03', 'tA', 'tB', 1, 1),
], 'tA', 5)
assert(tieBreaks.streak?.kind === 'T' && tieBreaks.streak.count === 1, 'a tie breaks the win streak; the run becomes the tie itself')

// 4. A genuine multi-game streak counts correctly.
const threeWins = teamForm([
  g('b1', '2026-05-01', 'tA', 'tB', 1, 0),
  g('b2', '2026-05-02', 'tB', 'tA', 0, 1),
  g('b3', '2026-05-03', 'tA', 'tB', 2, 0),
], 'tA', 5)
assert(threeWins.streak?.kind === 'W' && threeWins.streak.count === 3, 'a three-game win streak counts to 3 across home and away')

// 5. last5 caps at five but keeps the MOST RECENT five.
const many = teamForm([
  g('c1', '2026-05-01', 'tA', 'tB', 0, 1),   // L — should fall off
  g('c2', '2026-05-02', 'tA', 'tB', 1, 0),
  g('c3', '2026-05-03', 'tA', 'tB', 1, 0),
  g('c4', '2026-05-04', 'tA', 'tB', 1, 0),
  g('c5', '2026-05-05', 'tA', 'tB', 1, 0),
  g('c6', '2026-05-06', 'tA', 'tB', 1, 0),
], 'tA', 5)
assert(many.last5.join('') === 'WWWWW', 'last5 keeps the five most recent, dropping older ones')

// 6. recentResults is most-recent-FIRST and scored from this team's perspective.
assert(f.recentResults[0].gameId === 'g5', 'recentResults is most-recent-first')
const awayLoss = f.recentResults.find(r => r.gameId === 'g2')!
assert(awayLoss.outcome === 'L' && awayLoss.scoreFor === 1 && awayLoss.scoreAgainst === 6,
  'an away loss reports the score from this teams perspective, not home-vs-away')
assert(awayLoss.opponentTeamId === 'tB', 'opponent is the other side, whichever end this team played')

// 7. A team with no completed games degrades safely.
const empty = teamForm(games, 'tZ', 5)
assert(empty.streak === null && empty.last5.length === 0 && empty.recentResults.length === 0,
  'a team with no completed games yields null streak and empty lists')

console.log(`standings: ${passed}/${passed} assertions passed`)
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
npx tsx src/lib/standings.test.ts
```
Expected: FAIL — `Cannot find module './standings'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/standings.ts`:

```ts
/**
 * Order-dependent standings figures. The accumulation in StandingsTab walks
 * `state.schedule.games` in array order and never sorts, so streak and last-5
 * cannot be derived from it — they need the team's completed games in
 * chronological order.
 *
 * Pure and React-free so it runs under `npx tsx`, matching mobileNav.ts and
 * coachView.ts.
 */
import type { ScheduledGame } from './types'

export type Outcome = 'W' | 'L' | 'T'

export interface RecentResult {
  gameId: string
  date: string
  outcome: Outcome
  opponentTeamId: string
  /** Scores from the SUBJECT team's perspective, not home-vs-away. */
  scoreFor: number
  scoreAgainst: number
}

export interface TeamForm {
  /** Chronological, oldest first, at most `limit` entries. */
  last5: Outcome[]
  /** The current run counting back from the most recent game. Null if none played. */
  streak: { kind: Outcome; count: number } | null
  /** Most recent first. */
  recentResults: RecentResult[]
}

export function teamForm(games: ScheduledGame[], teamId: string, limit: number): TeamForm {
  const played = games
    .filter(g => g.result && (g.homeTeamId === teamId || g.awayTeamId === teamId))
    .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`))

  const results: RecentResult[] = played.map(g => {
    const isHome = g.homeTeamId === teamId
    const scoreFor = isHome ? g.result!.homeScore : g.result!.awayScore
    const scoreAgainst = isHome ? g.result!.awayScore : g.result!.homeScore
    const outcome: Outcome = scoreFor > scoreAgainst ? 'W' : scoreFor < scoreAgainst ? 'L' : 'T'
    return {
      gameId: g.id,
      date: g.date,
      outcome,
      opponentTeamId: isHome ? g.awayTeamId : g.homeTeamId,
      scoreFor,
      scoreAgainst,
    }
  })

  const last5 = results.slice(-limit).map(r => r.outcome)

  let streak: TeamForm['streak'] = null
  if (results.length > 0) {
    const kind = results[results.length - 1].outcome
    let count = 0
    for (let i = results.length - 1; i >= 0 && results[i].outcome === kind; i--) count++
    streak = { kind, count }
  }

  return { last5, streak, recentResults: [...results].reverse() }
}
```

- [ ] **Step 4: Run the test**

```bash
npx tsx src/lib/standings.test.ts
```
Expected: all assertions pass. Report the real count printed.

- [ ] **Step 5: Prove the test bites**

A test that cannot fail is decoration. Temporarily change `results.slice(-limit)` to `results.slice(0, limit)` — the classic oldest-vs-newest slip — re-run, and confirm assertion 6 ("last5 keeps the five most recent") FAILS. Then restore it and confirm the suite passes again. Paste all three runs into your report.

- [ ] **Step 6: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/lib/standings.ts src/lib/standings.test.ts
git -c user.email=gmd4fy5yb4@privaterelay.appleid.com -c user.name="Gregory Amundson" \
  commit -m "Add order-dependent standings form logic and tests"
```

---

## Task 2: Division initials helper

**Files:**
- Modify: `src/lib/divisionColors.ts` (append after `getDivisionColor`, which ends around line 23)

**Interfaces:**
- Consumes: nothing.
- Produces: `divisionInitials(name: string): string` — used by Tasks 5 and 6.

- [ ] **Step 1: Add the helper**

Append to `src/lib/divisionColors.ts`:

```ts
/**
 * A two-character badge for a division, so month-grid chips are not
 * distinguishable by hue alone (finding 16 — roughly 8% of men have a
 * colour-vision deficiency, and the six-theme system multiplies the risk).
 *
 * Prefers the initials of the first two words ("10U Minors" -> "1M",
 * "Majors" -> "MA"), falling back to the first two characters. Always
 * uppercase, always exactly two characters when there is anything to work
 * with, so the badges align in a column of chips.
 */
export function divisionInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '—'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/lib/divisionColors.ts
git -c user.email=gmd4fy5yb4@privaterelay.appleid.com -c user.name="Gregory Amundson" \
  commit -m "Add divisionInitials helper for non-hue-only chips"
```

---

## Task 3: Standings mobile list + tap-row detail

**Files:**
- Modify: `src/components/StandingsTab.tsx` — the per-division card body (the `records.length === 0` / `!hasResults` / table ternary begins around line 154 and the table ends around line 215)

**Interfaces:**
- Consumes: `teamForm`, `type Outcome` from `@/lib/standings` (Task 1); `nextGameFor` from `@/lib/coachView`; existing in-file `TeamRecord`, `sortTeams`, `calcGB`, `fmtPct`, `fmtDiff`, `getDivisionColor`.
- Produces: no API change. `StandingsTab`'s props stay `{ state, readOnly, highlightTeamId? }`.

**Why:** the file has **no `sm:` classes at all** and renders ten columns — `Team GP W L PCT RF RA DIFF GB` — inside `overflow-x-auto`. At 390px everything past W-L is off the right edge, and because the table scrolls inside its own container the page shows no horizontal scrollbar to hint at it.

- [ ] **Step 1: Add the selected-team state**

At the top of the component (near `const totalScheduled = …`), add:

```tsx
  // Mobile only: which team's detail is open. Null shows the list.
  // Desktop ignores this entirely — it renders the full table.
  const [detailTeamId, setDetailTeamId] = useState<string | null>(null)
```

Add `useState` to the existing `import { useMemo } from 'react'` at the top of the file.

- [ ] **Step 2: Hide the table below 640px**

Find the table's wrapper — `<div className="overflow-x-auto">` at line ~158 — and change it to:

```tsx
              <div className="hidden sm:block overflow-x-auto">
```

- [ ] **Step 3: Add the mobile list**

Immediately after that table's closing `</div>` (the one closing `overflow-x-auto`), add the mobile list. It renders when no detail is open:

```tsx
              {/* Mobile: only the columns that fit. The full table above keeps
                  every column for desktop; here the rest lives in the detail. */}
              {detailTeamId === null && (
                <div className="sm:hidden divide-y">
                  {records.map((r, i) => (
                    <button
                      key={r.teamId}
                      onClick={() => setDetailTeamId(r.teamId)}
                      className={`w-full min-h-[52px] px-4 flex items-center gap-3 text-left active:bg-gray-50 ${
                        r.teamId === highlightTeamId ? 'bg-[#eeeef6]' : ''
                      }`}
                    >
                      <span className="w-5 shrink-0 text-xs font-semibold text-gray-500">{i + 1}</span>
                      <span className="min-w-0 flex-1 font-medium text-gray-900 truncate">{r.teamName}</span>
                      <span className="shrink-0 text-sm font-semibold text-gray-800">{r.W}-{r.L}{r.T > 0 ? `-${r.T}` : ''}</span>
                      <span className="shrink-0 w-12 text-right text-sm text-gray-600">{fmtPct(r)}</span>
                      <span aria-hidden="true" className="shrink-0 text-gray-300">›</span>
                    </button>
                  ))}
                </div>
              )}
```

- [ ] **Step 4: Add the detail view**

Directly after the list block, add the detail. Everything it shows carries text as well as colour:

```tsx
              {/* Mobile detail. Every state here is readable without colour:
                  the streak carries its letter, the dots carry W/L/T, and the
                  result badges carry their outcome. */}
              {detailTeamId !== null && (() => {
                const r = records.find(x => x.teamId === detailTeamId)
                if (!r) return null
                const rank = records.findIndex(x => x.teamId === detailTeamId) + 1
                const form = teamForm(state.schedule.games, r.teamId, 5)
                const next = nextGameFor(state, r.teamId, nowKey())
                const teamName = (id: string) =>
                  state.divisions.flatMap(d => d.teams).find(t => t.id === id)?.name ?? 'TBD'
                const team = state.divisions.flatMap(d => d.teams).find(t => t.id === r.teamId)
                const totalRuns = r.RF + r.RA
                const forPct = totalRuns > 0 ? Math.round((r.RF / totalRuns) * 100) : 50
                return (
                  <div className="sm:hidden">
                    <div className="px-4 py-3 border-b flex items-center gap-3">
                      <button
                        onClick={() => setDetailTeamId(null)}
                        className="min-h-[44px] min-w-[44px] -ml-2 flex items-center text-sm font-medium text-[var(--fd-primary)]"
                      >
                        ‹ Standings
                      </button>
                      <span className="min-w-0">
                        <span className="block font-bold text-gray-900 truncate">{r.teamName}</span>
                        <span className="block text-xs text-gray-500">#{rank} in {div.name}</span>
                      </span>
                    </div>

                    {/* Record tiles */}
                    <div className="grid grid-cols-4 gap-px bg-gray-200">
                      <Tile label="Record" value={`${r.W}-${r.L}${r.T > 0 ? `-${r.T}` : ''}`} />
                      <Tile label="PCT" value={fmtPct(r)} />
                      <Tile label="Games back" value={leader ? calcGB(leader, r) : '—'} />
                      <Tile
                        label="Streak"
                        value={form.streak ? `${form.streak.kind}${form.streak.count}` : '—'}
                        tone={form.streak?.kind === 'W' ? 'good' : form.streak?.kind === 'L' ? 'bad' : 'neutral'}
                      />
                    </div>

                    {/* Last 5 */}
                    <div className="px-4 py-3 border-b">
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">Last 5</p>
                      {form.last5.length === 0 ? (
                        <p className="text-sm text-gray-500">No games played yet.</p>
                      ) : (
                        <div className="flex gap-1.5">
                          {form.last5.map((o, idx) => (
                            <span
                              key={idx}
                              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                                o === 'W' ? 'bg-green-100 text-green-800'
                                : o === 'L' ? 'bg-red-100 text-red-800'
                                : 'bg-gray-100 text-gray-700'
                              }`}
                            >
                              {o}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Runs split */}
                    <div className="px-4 py-3 border-b">
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">Runs</p>
                      <div className="h-2 rounded-full overflow-hidden bg-red-200 flex" role="presentation">
                        <div className="bg-green-500 h-full" style={{ width: `${forPct}%` }} />
                      </div>
                      <p className="text-xs text-gray-600 mt-1.5">{r.RF} for · {r.RA} against</p>
                    </div>

                    {/* Recent results */}
                    {form.recentResults.length > 0 && (
                      <div className="border-b">
                        <p className="px-4 pt-3 pb-1.5 text-xs font-bold uppercase tracking-wider text-gray-500">Recent results</p>
                        {form.recentResults.slice(0, 5).map(res => (
                          <div key={res.gameId} className="px-4 py-2.5 flex items-center gap-3 border-t">
                            <span className={`w-6 h-6 shrink-0 rounded flex items-center justify-center text-xs font-bold ${
                              res.outcome === 'W' ? 'bg-green-100 text-green-800'
                              : res.outcome === 'L' ? 'bg-red-100 text-red-800'
                              : 'bg-gray-100 text-gray-700'
                            }`}>{res.outcome}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm text-gray-900 truncate">vs {teamName(res.opponentTeamId)}</span>
                              <span className="block text-xs text-gray-500">{res.date}</span>
                            </span>
                            <span className="shrink-0 text-sm font-semibold text-gray-800">{res.scoreFor}–{res.scoreAgainst}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Next game */}
                    {next && (
                      <div className="px-4 py-3 border-b">
                        <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">Next game</p>
                        <p className="text-sm font-medium text-gray-900">
                          {next.type === 'game'
                            ? `${teamName(next.homeTeamId)} vs ${teamName(next.awayTeamId)}`
                            : `${r.teamName} practice`}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">{next.date} · {state.fields.find(f => f.id === next.fieldId)?.name ?? ''}</p>
                        {(() => {
                          const f = state.fields.find(x => x.id === next.fieldId)
                          const url = f?.geocoords
                            ? `https://www.google.com/maps/search/?api=1&query=${f.geocoords.lat},${f.geocoords.lon}`
                            : f?.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(f.address)}` : null
                          return url ? (
                            <a href={url} target="_blank" rel="noopener noreferrer"
                               className="mt-2 min-h-[44px] w-full flex items-center justify-center rounded-lg border border-gray-300 text-sm font-semibold text-gray-700">
                              Directions
                            </a>
                          ) : null
                        })()}
                      </div>
                    )}

                    {/* Coaches */}
                    {(team?.coaches?.length ?? 0) > 0 && (
                      <div className="px-4 py-3">
                        <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">Coaches</p>
                        {team!.coaches!.map(co => (
                          <div key={co.id} className="flex items-center gap-2 py-1.5">
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm text-gray-900 truncate">{co.name}</span>
                              {co.role && <span className="block text-xs text-gray-500">{co.role === 'head' ? 'Head Coach' : 'Assistant'}</span>}
                            </span>
                            {co.phone && (
                              <a href={`tel:${co.phone}`} className="min-h-[44px] px-3 flex items-center rounded-lg border border-gray-300 text-sm font-medium text-gray-700">Call</a>
                            )}
                            {co.email && (
                              <a href={`mailto:${co.email}`} className="min-h-[44px] px-3 flex items-center rounded-lg border border-gray-300 text-sm font-medium text-gray-700">Email</a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}
```

- [ ] **Step 5: Add the `Tile` sub-component and `nowKey` helper**

Near the other module-level helpers at the top of the file (beside `fmtPct` / `calcGB`), add:

```tsx
function nowKey() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** One record tile in the mobile detail. Tone is reinforcement only — the
 *  value always carries its own letter, so greyscale loses nothing. */
function Tile({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'good' | 'bad' | 'neutral' }) {
  return (
    <div className="bg-white px-2 py-3 text-center">
      <p className={`text-base font-bold ${
        tone === 'good' ? 'text-green-700' : tone === 'bad' ? 'text-red-700' : 'text-gray-900'
      }`}>{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}
```

Note `text-green-700` / `text-red-700` rather than `-500`/`-600`: on white those clear 4.5:1, the lighter shades do not.

- [ ] **Step 6: Scope the open/closed test to THIS division**

`detailTeamId` is one value shared by every division card on the page, and as written in Steps 3 and 4 that is a bug: the list is gated on `detailTeamId === null`, so opening a team's detail in the Majors card also hides the list in *every other* division's card — and those cards cannot render a detail either, because `records.find(...)` returns nothing for a team they do not contain. Every other division would render an empty card.

Fix it by testing whether the open team belongs to **this** division. Just below `const hasTies = …` in the per-division map, add:

```tsx
        // detailTeamId is page-wide, so each card must ask whether the open
        // team is one of ITS teams — otherwise opening a detail in one
        // division blanks every other division's card.
        const detailHere = detailTeamId !== null && records.some(x => x.teamId === detailTeamId)
```

Then change the two gates you added:
- Step 3's list: `{detailTeamId === null && (` becomes `{!detailHere && (`
- Step 4's detail: `{detailTeamId !== null && (() => {` becomes `{detailHere && (() => {`

With that, opening a Majors team shows its detail in the Majors card while every other division still shows its list.

- [ ] **Step 7: Typecheck, build, verify tests**

```bash
npx tsc --noEmit && npm run build && npx tsx src/lib/standings.test.ts
```
Expected: no errors, build succeeds, tests pass. Report actual output.

- [ ] **Step 8: Commit**

```bash
git add src/components/StandingsTab.tsx
git -c user.email=gmd4fy5yb4@privaterelay.appleid.com -c user.name="Gregory Amundson" \
  commit -m "Standings: mobile list with tap-row detail"
```

---

## Task 4: Tab semantics on the desktop nav

**Files:**
- Modify: `src/app/page.tsx` — the nav block (around lines 786-820) and `<main>` (line ~825)

**Interfaces:**
- Consumes: existing `tab` / `setTab` state, `TABS`, `NAV_GROUPS`, `isTabVisible`.
- Produces: no exports change.

**Why:** the eleven tabs are bare `<button>`s. A screen reader announces eleven unrelated controls with no sense of a set, a position, or which is current.

The structure is `<nav>` → three group `<div>`s (each with a label `<span>` and an inner `<div>`) → the buttons. A `tablist`'s children should be tabs, so the intervening wrappers are marked presentational rather than restructured — Phase 0 grouped these deliberately and the grouping stays.

- [ ] **Step 1: Make the nav a tablist**

Change the `<nav className="flex overflow-x-auto">` opening tag to:

```tsx
          <nav className="flex overflow-x-auto" role="tablist" aria-label="Sections">
```

- [ ] **Step 2: Mark the wrappers presentational**

The group wrapper is `<div key={group.label} className="flex items-stretch">`; inside it are `<div className="flex flex-col">` and `<div className="flex items-stretch">`. Add `role="presentation"` to all three so they do not sit between the tablist and its tabs in the accessibility tree:

```tsx
                <div key={group.label} className="flex items-stretch" role="presentation">
```
```tsx
                  <div className="flex flex-col" role="presentation">
```
```tsx
                    <div className="flex items-stretch" role="presentation">
```

Also hide the group label from screen readers — it repeats what the tabs convey and would otherwise be announced as stray text inside the tablist:

```tsx
                    <span aria-hidden="true" className="px-5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500 select-none whitespace-nowrap">
```

- [ ] **Step 3: Turn the buttons into tabs**

Replace the `<button>` in the `visible.map(...)` with:

```tsx
                        <button
                          key={TABS[i]}
                          id={`tab-${i}`}
                          role="tab"
                          aria-selected={tab === i}
                          aria-controls="tab-panel"
                          tabIndex={tab === i ? 0 : -1}
                          onClick={() => setTab(i)}
                          onKeyDown={onTabKeyDown}
                          // The default focus ring draws a full rounded box that beats the
                          // border-b-2 active underline. focus-visible keeps the ring for
                          // keyboard users without painting it on every mouse click.
                          className={`px-5 pt-1 pb-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--fd-primary)] ${
                            tab === i ? 'border-[var(--fd-primary)] text-[var(--fd-primary)]' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                          }`}
                        >
                          {TABS[i]}
                        </button>
```

`aria-current="page"` is deliberately gone: `aria-selected` is the correct state for a tab, and both together announce twice.

- [ ] **Step 4: Add the keyboard handler**

Above the `return` in the component (near the other handlers), add:

```tsx
  // WAI-ARIA tabs keyboard support. The visual order is NAV_GROUPS' order, not
  // TABS' numeric order, so arrow keys must walk the flattened visible list —
  // moving by index would jump around the screen.
  function onTabKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    const order = NAV_GROUPS.flatMap(g => g.indices).filter(i => isTabVisible(i, isViewer))
    const pos = order.indexOf(tab)
    if (pos === -1) return
    let nextPos: number | null = null
    if (e.key === 'ArrowRight') nextPos = (pos + 1) % order.length
    else if (e.key === 'ArrowLeft') nextPos = (pos - 1 + order.length) % order.length
    else if (e.key === 'Home') nextPos = 0
    else if (e.key === 'End') nextPos = order.length - 1
    if (nextPos === null) return
    e.preventDefault()
    const nextTab = order[nextPos]
    setTab(nextTab)
    // Focus follows selection, per the tabs pattern.
    requestAnimationFrame(() => document.getElementById(`tab-${nextTab}`)?.focus())
  }
```

- [ ] **Step 5: Make `<main>` the tab panel**

Change line ~825 to:

```tsx
      <main id="tab-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="max-w-7xl mx-auto px-4 py-6 pb-28 sm:pb-6">
```

- [ ] **Step 6: Typecheck and build**

```bash
npx tsc --noEmit && npm run build
```

- [ ] **Step 7: Commit**

```bash
git add src/app/page.tsx
git -c user.email=gmd4fy5yb4@privaterelay.appleid.com -c user.name="Gregory Amundson" \
  commit -m "Give the desktop nav real WAI-ARIA tab semantics"
```

---

## Task 5: Confirm disclosure

**Files:**
- Modify: `src/components/DashboardTab.tsx` — the confirm control (~lines 466-492) and the fixed tooltip block (~lines 752-764)

**Interfaces:**
- Consumes: existing `toggleConfirm`, `sc` (sport config).
- Produces: no API change. `confirmTip` state is removed.

**Why:** the explanation fires on `mouseenter` only. Touch users never see it, and keyboard users cannot reach it.

- [ ] **Step 1: Replace the tooltip state**

Find `const [confirmTip, setConfirmTip] = useState<{ x: number; y: number } | null>(null)` (~line 181) and replace it with:

```tsx
  // Which game's Confirm explanation is open. A real disclosure, not a hover
  // tooltip: the old mouseenter version was invisible to touch and keyboard.
  const [confirmHelpFor, setConfirmHelpFor] = useState<string | null>(null)
```

- [ ] **Step 2: Replace the hover wrapper with a disclosure**

Replace the confirm block (the `<div className="flex items-center gap-1.5" onMouseEnter=… onMouseLeave=…>` wrapper and its contents) with:

```tsx
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="checkbox"
                                  id={`confirm-${g.id}`}
                                  checked={!!g.confirmed}
                                  onChange={() => toggleConfirm(g.id)}
                                  aria-describedby={confirmHelpFor === g.id ? `confirm-help-${g.id}` : undefined}
                                  className="w-4 h-4 rounded-lg cursor-pointer accent-green-600"
                                />
                                <label
                                  htmlFor={`confirm-${g.id}`}
                                  className={`text-xs font-medium cursor-pointer select-none transition-colors ${
                                    g.confirmed ? 'text-green-600' : 'text-gray-500'
                                  }`}
                                >
                                  Confirm
                                </label>
                                <button
                                  type="button"
                                  onClick={() => setConfirmHelpFor(confirmHelpFor === g.id ? null : g.id)}
                                  aria-expanded={confirmHelpFor === g.id}
                                  aria-controls={`confirm-help-${g.id}`}
                                  aria-label="What does confirming do?"
                                  className="w-6 h-6 shrink-0 flex items-center justify-center rounded-full border border-gray-300 text-xs font-bold text-gray-500 hover:text-gray-800 hover:border-gray-500 outline-none focus-visible:ring-2 focus-visible:ring-[var(--fd-accent)]"
                                >
                                  ?
                                </button>
                              </div>
```

The checkbox stays a checkbox — it already announces its own state correctly, and replacing it with an `aria-pressed` button would be a downgrade.

- [ ] **Step 3: Render the disclosure panel in the card**

The old tooltip was `position: fixed` to escape stacking contexts. The disclosure is in normal flow, inside the card, directly after the header block that contains the confirm control. Add it immediately after the closing `</div>` of the `flex items-center gap-2` row that holds the confirm and Edit controls:

```tsx
                        {confirmHelpFor === g.id && (
                          <div
                            id={`confirm-help-${g.id}`}
                            className="mx-5 mb-3 bg-gray-900 text-white text-xs rounded-lg px-3 py-2.5 leading-relaxed"
                          >
                            Check this box once you&apos;ve confirmed the game with all coaches, the {sc.officialSingular.toLowerCase()}, and field staff. A green ring will appear around the card.
                            <button
                              onClick={() => setConfirmHelpFor(null)}
                              className="mt-2 block min-h-[32px] text-[11px] font-semibold underline underline-offset-2"
                            >
                              Got it
                            </button>
                          </div>
                        )}
```

- [ ] **Step 4: Delete the old fixed tooltip**

Remove the whole `{confirmTip && ( … )}` block (~lines 752-764), including its arrow `<div>`. Confirm with a grep that no reference to `confirmTip` remains:

```bash
grep -n "confirmTip" src/components/DashboardTab.tsx || echo "clean — no references remain"
```

- [ ] **Step 5: Typecheck and build**

```bash
npx tsc --noEmit && npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/components/DashboardTab.tsx
git -c user.email=gmd4fy5yb4@privaterelay.appleid.com -c user.name="Gregory Amundson" \
  commit -m "Replace mouse-only Confirm tooltip with a keyboard-operable disclosure"
```

---

## Task 6: Division initials on month-grid chips

**Files:**
- Modify: `src/components/ScheduleTab.tsx` (month-grid chip, in the `hidden sm:block` chip list), `src/components/FieldCalendarTab.tsx` (same)

**Interfaces:**
- Consumes: `divisionInitials` from `@/lib/divisionColors` (Task 2).
- Produces: no API change.

**Why:** these chips render time and team names and encode division **only** in `c.bg` / `c.text` / `c.border`. Both files hide their chips below 640px already (count badges instead), so this is a desktop-only change — the one intentional ≥640px change in this plan besides ARIA.

- [ ] **Step 1: `ScheduleTab` — add the badge**

Import the helper alongside the existing `getDivisionColor` import:

```tsx
import { getDivisionColor, divisionInitials } from '@/lib/divisionColors'
```

In the month-grid chip (the `<button>` inside the `hidden sm:block` chip list, whose content is `<span className="font-medium">{fmtTime(ev.time)}</span> {label}`), prefix a badge. Only games and practices have a division; special events do not, so guard on the existing `isSpecial`:

```tsx
                              <span className="font-medium">{fmtTime(ev.time)}</span>{' '}
                              {!isSpecial && (
                                <span className="inline-block align-baseline mr-1 px-1 rounded bg-black/10 text-[9px] font-bold tracking-wide">
                                  {divisionInitials(divMap.get((ev as ScheduledGame | ScheduledPractice).divisionId)?.name ?? '')}
                                </span>
                              )}
                              {label}
```

Both identifiers are confirmed present: `divMap` is a component-level `useMemo` at line 69 (`Map` of division id → division), and `isSpecial` is declared inside this chip's own map callback at line 428.

- [ ] **Step 2: `FieldCalendarTab` — the same badge**

This file's chips have no special-event case (a field calendar shows only field-bound events), and it has `state.divisions` in scope. Import the helper the same way, then prefix the same badge using the event's `divisionId`:

```tsx
                                  <span className="font-medium">{fmtTime(ev.time)}</span>{' '}
                                  <span className="inline-block align-baseline mr-1 px-1 rounded bg-black/10 text-[9px] font-bold tracking-wide">
                                    {divisionInitials(state.divisions.find(d => d.id === ev.divisionId)?.name ?? '')}
                                  </span>
                                  {label}
```

`bg-black/10` over the chip's own tinted background keeps the badge legible in every one of the six themes without introducing a new colour; the text inherits the chip's `c.text`, which is already AA against `c.bg`.

- [ ] **Step 3: Typecheck and build**

```bash
npx tsc --noEmit && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ScheduleTab.tsx src/components/FieldCalendarTab.tsx
git -c user.email=gmd4fy5yb4@privaterelay.appleid.com -c user.name="Gregory Amundson" \
  commit -m "Add division initials to month-grid chips so they survive greyscale"
```

---

## Task 7: Sheet focus management

**Files:**
- Modify: `src/components/MobileNav.tsx` (its local `Sheet` component), `src/components/CoachView.tsx` (the team-picker modal)

**Interfaces:**
- Consumes: nothing new.
- Produces: no API change.

**Why:** both dialogs set `role="dialog" aria-modal="true"` but never move focus in, never trap it, and never restore it. A keyboard user tabs straight through to the page behind. Deferred from items 1 and 2; paid here.

- [ ] **Step 1: `MobileNav` — trap and restore in `Sheet`**

`Sheet` already has a `useEffect` handling Escape and body-scroll lock. Add focus handling to the same component. Give the panel a ref and add an effect:

```tsx
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    // Move focus into the sheet so the next Tab stays inside it.
    panelRef.current?.focus()
    return () => {
      // Return focus to whatever opened the sheet.
      opener?.focus?.()
    }
  }, [])

  function onKeyDownTrap(e: React.KeyboardEvent) {
    if (e.key !== 'Tab') return
    const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    if (!focusables || focusables.length === 0) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }
```

Add `useRef` to the file's React import. Then on the panel `<div>` (the one carrying `role="dialog"`), add `ref={panelRef}`, `tabIndex={-1}` (so it can receive focus without entering the tab order), and `onKeyDown={onKeyDownTrap}`.

- [ ] **Step 2: `CoachView` — the same, plus Escape**

The team-picker modal has `role="dialog" aria-modal="true"` and closes on backdrop click, but has no Escape handling at all — an inconsistency with `MobileNav`'s sheets noted during item 2's review.

Apply the same ref, focus-on-open, restore-on-close and Tab-trap as Step 1, and add Escape:

```tsx
  useEffect(() => {
    if (!pickerOpen) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setPickerOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [pickerOpen])
```

Because the picker is conditionally rendered (`{pickerOpen && …}`), the focus effect belongs in a small component or must be guarded on `pickerOpen` — do whichever keeps the hook order stable. **Do not** place a hook inside the conditional JSX.

- [ ] **Step 3: Typecheck and build**

```bash
npx tsc --noEmit && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/components/MobileNav.tsx src/components/CoachView.tsx
git -c user.email=gmd4fy5yb4@privaterelay.appleid.com -c user.name="Gregory Amundson" \
  commit -m "Trap and restore focus in the mobile sheets and the team picker"
```

---

## Task 8: Verification and merge

**Files:** none modified.

- [ ] **Step 1: Run the whole suite**

```bash
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
Expected: all eight suites pass, no type errors, build succeeds. Paste real output.

- [ ] **Step 2: Browser pass — standings**

```bash
pkill -f "next dev" || true
rm -rf .next
npm run dev
```
Run in the background and drive a real browser (preview tools fail under `~/Desktop` with `getcwd EPERM`). A 500 mentioning `__webpack_modules__` means a stale `.next`; the `rm -rf` prevents it.

At **390px**, signed in as an admin with a league that has recorded results:
- Standings shows rank / team / W-L / PCT with no horizontal scroll and no clipped columns.
- Tapping a row opens the detail; the back control returns to the list.
- The detail's Record, PCT, Games back and Streak match the desktop table's values for that team.
- Streak, the last-5 dots and the result badges all show their letter, not just a colour.

At **1280px**: the ten-column table renders exactly as before, and no mobile list or detail appears.

- [ ] **Step 3: Browser pass — keyboard and ARIA**

At **1280px**, using only the keyboard:
- Tab into the nav — it takes exactly **one** tab stop, landing on the selected tab.
- Arrow Left/Right move selection and focus between tabs, wrapping at both ends; Home/End jump to first/last.
- The crimson focus ring is visible on every stop.
- Tab into a game card, reach the `?` button, press Enter — the explanation opens; Enter again or "Got it" closes it.
- At 390px, open the More sheet: focus moves into it, Tab cycles within it, Escape closes it and focus returns to the More button. Repeat for the coach page's team picker.

- [ ] **Step 4: Colour-independence check**

At 1280px, apply a greyscale filter (browser devtools rendering panel, or run `document.documentElement.style.filter = 'grayscale(1)'` in the console). Confirm: every month-grid chip is identifiable by its initials badge; standings streak, dots and result badges all readable; then remove the filter.

- [ ] **Step 5: Confirm scope and the standing auth check**

```bash
git status --short
git diff --name-only dev..HEAD
```
Expected: status empty. Changed files exactly: `src/lib/standings.ts`, `src/lib/standings.test.ts`, `src/lib/divisionColors.ts`, `src/components/StandingsTab.tsx`, `src/app/page.tsx`, `src/components/DashboardTab.tsx`, `src/components/ScheduleTab.tsx`, `src/components/FieldCalendarTab.tsx`, `src/components/MobileNav.tsx`, `src/components/CoachView.tsx`. If `types.ts`, `linkedCalendars*`, `LinkedCalendarsTab.tsx` or `HANDOFF-shared-calendar.md` appear, stop.

```sql
select email, confirmation_sent_at from auth.users order by created_at desc limit 3;
```
A non-null `confirmation_sent_at` on a recent row means Supabase's "Confirm email" is back on. It must stay off.

- [ ] **Step 6: Merge to `dev`**

The main checkout is already on `dev` and stays there — it holds another session's uncommitted work.

```bash
cd /Users/gregoryamundson/Desktop/CLAUDE/fieldday-planner
git merge --no-ff standings-a11y -m "Merge standings-a11y: standings detail and accessibility pass"
```

- [ ] **Step 7: Merge `dev` → `main` via a temporary worktree**

```bash
git worktree add .worktrees/main-merge main
cd .worktrees/main-merge
git -c user.email=gmd4fy5yb4@privaterelay.appleid.com -c user.name="Gregory Amundson" \
  merge --no-ff dev -m "Merge dev: standings detail and a11y pass"
git diff --stat dev main
```
Expected: `git diff --stat dev main` prints nothing. If not, stop and reconcile.

```bash
git push origin main
cd /Users/gregoryamundson/Desktop/CLAUDE/fieldday-planner
git worktree remove .worktrees/main-merge
git push origin dev
```

- [ ] **Step 8: Smoke-test production**

```bash
curl -s -X POST -H 'Content-Type: application/json' -d '{}' \
  -w "\n%{http_code}\n" https://fielddayplanner.app/api/leagues/save
```
Expected: `401` with a JSON body.

Vercel has silently failed to deploy a pushed commit in this project before — confirm the new build is actually serving rather than assuming.

- [ ] **Step 9: Clean up**

```bash
git worktree remove .worktrees/standings-a11y
git branch -d standings-a11y
```

If `worktree remove` reports "Directory not empty", the leftover is build scratch. Before deleting by hand, confirm `node_modules` inside the worktree is **absent or a symlink** — never a real directory — then remove the directory.

---

## Deliberately not built

- **`MobileNav`'s bottom bar and `CoachView`'s strip as tablists.** A bottom bar is conventionally a `<nav>` landmark with `aria-current`, which both already have; `CoachView` renders two navs for one panel set, so two tablists would compete for the same panel.
- **Confirm as an `aria-pressed` toggle button.** A native checkbox already announces its state correctly; swapping it would be a downgrade dressed as an a11y fix.
- **Moving the `TeamRecord` accumulation into `src/lib/standings.ts`.** It works and the detail reads it directly; relocating working code for tidiness is how regressions arrive.
- **Division badges on agenda/list rows.** Those already render the division's full name as text and were never hue-only.
