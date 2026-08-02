# Coach View-Only Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the admin shell a share-link viewer sees with a purpose-built coach page: a team picker, a next-game hero with Directions, a YOURS-tagged schedule, highlighted standings, and a "run your own league free" footer on every screen.

**Architecture:** `src/app/page.tsx` already computes `isViewer = readOnly && !expired`. The whole feature hangs off one early `return <CoachView …/>` before the admin shell. Pure logic lives in a React-free `src/lib/coachView.ts` that runs under `npx tsx`; everything visual lives in one `src/components/CoachView.tsx`.

**Tech Stack:** Next.js App Router (client components), React 19, Tailwind CSS, TypeScript. No test framework — standalone assert files run with `npx tsx`. No new dependencies.

## Global Constraints

- **No new npm dependencies.**
- **No database migration.** Every field needed already exists. `fd_014` remains the latest.
- **Do not touch these files** — another live session owns them: `src/lib/types.ts`, `src/lib/linkedCalendars.ts`, `src/lib/linkedCalendars.test.ts`, `src/components/LinkedCalendarsTab.tsx`, `HANDOFF-shared-calendar.md`. Note `types.ts` currently has uncommitted changes from that session; read it freely, never edit it.
- **Do not modify `TABS` or `NAV_GROUPS`** in `page.tsx`.
- **The admin experience must not change at any width.** An owner whose plan lapsed is `expired`, therefore NOT `isViewer`, and must keep the admin shell and the amber renew banner.
- **Touch targets ≥44px.**
- **WCAG AA:** 4.5:1 for text under 18px. `text-gray-400` (#9CA3AF, ~2.5:1) **fails** and has recurred five times in this project. `text-gray-500` (~4.8:1) passes.
- **Accent is `var(--fd-accent)` (#cd163f); primary is `var(--fd-primary)` (#00013a).** Use the variables, not hex literals.
- **Commit author MUST be** `gmd4fy5yb4@privaterelay.appleid.com`, or Vercel silently blocks the deploy:
  `git -c user.email=gmd4fy5yb4@privaterelay.appleid.com -c user.name="Gregory Amundson" commit -m "..."`
- **The LSP reports hundreds of phantom "Cannot find module" errors inside a worktree** because `node_modules` is a symlink. `npx tsc --noEmit` is the only source of truth.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/lib/coachView.ts` | Create | Pure, React-free event selection: team options, team membership, next/upcoming events. |
| `src/lib/coachView.test.ts` | Create | Asserts the selection logic. |
| `src/components/CoachView.tsx` | Create | The entire coach surface: header, tabs, three panels, footer, team-picker modal. |
| `src/components/StandingsTab.tsx` | Modify | One optional `highlightTeamId` prop. |
| `src/app/page.tsx` | Modify | One early `return` when `isViewer`. |

---

## Task 0: Isolated workspace

**Files:** none committed.

**Interfaces:**
- Consumes: nothing.
- Produces: a worktree at `.worktrees/coach-view` on branch `coach-view`, from `dev`.

- [ ] **Step 1: Create the worktree**

```bash
cd /Users/gregoryamundson/Desktop/CLAUDE/fieldday-planner
git worktree add .worktrees/coach-view -b coach-view dev
cd .worktrees/coach-view
ln -s ../../node_modules node_modules
cp ../../.env.local .env.local
```

- [ ] **Step 2: Exclude the symlink from git**

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
Expected: `git status --short` prints nothing; `tsc` exits 0.

No commit.

---

## Task 1: Event selection logic (`coachView.ts`)

**Files:**
- Create: `src/lib/coachView.ts`
- Test: `src/lib/coachView.test.ts`

**Interfaces:**
- Consumes: types from `@/lib/types` (read-only import — never edit that file).
- Produces:
  - `type CoachEvent = ScheduledGame | ScheduledPractice`
  - `interface TeamOption { id: string; name: string; divisionId: string; divisionName: string }`
  - `teamOptions(state: AppState): TeamOption[]`
  - `isTeamEvent(event: ScheduledItem, teamId: string): boolean`
  - `upcomingFor(state: AppState, teamId: string | null, now: string, limit: number): CoachEvent[]`
  - `nextGameFor(state: AppState, teamId: string | null, now: string): CoachEvent | null`

`now` is a `"YYYY-MM-DDTHH:MM"` string passed in by the caller, never read from the clock inside — that is what makes this testable without freezing time. Events sort by the same `` `${date}T${time}` `` key, so ordering is plain string comparison.

**Note on `upcomingFor`:** it returns the next `limit` events **at or after `now`, inclusive of the next one** — the component slices off the head for its hero. The design doc described it as "after the next one"; one function returning an inclusive list is simpler than two overlapping ones, and `nextGameFor` is defined in terms of it.

- [ ] **Step 1: Write the failing test**

Create `src/lib/coachView.test.ts`:

```ts
/**
 * The coach page answers one question — "when does my kid play next" — so the
 * logic that can actually be wrong is which events belong to a team and which
 * one is next. Time is injected, never read from the clock.
 */
import type { AppState } from './types'
import { teamOptions, isTeamEvent, upcomingFor, nextGameFor } from './coachView'

let passed = 0
function assert(cond: boolean, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exit(1) }
  passed++
}

const game = (id: string, date: string, time: string, home: string, away: string) =>
  ({ id, type: 'game' as const, date, time, durationMinutes: 90, fieldId: 'f1', homeTeamId: home, awayTeamId: away, umpireId: '', divisionId: 'd1' })
const practice = (id: string, date: string, time: string, teamId: string) =>
  ({ id, type: 'practice' as const, date, time, durationMinutes: 60, fieldId: 'f1', teamId, divisionId: 'd1' })

const state = {
  season: { leagueName: 'L', startDate: '2026-04-01', endDate: '2026-08-01', gameDurationMinutes: 90, practiceDurationMinutes: 60 },
  blackoutDates: [],
  divisions: [
    { id: 'd1', name: 'Majors', gamesPerTeam: 10, teams: [
      { id: 'tA', name: 'Wildcats', divisionId: 'd1' },
      { id: 'tB', name: 'River Hawks', divisionId: 'd1' },
    ] },
    { id: 'd2', name: 'Minors', gamesPerTeam: 8, teams: [
      { id: 'tC', name: 'Comets', divisionId: 'd2' },
    ] },
  ],
  fields: [], umpires: [], fieldStaff: [],
  schedule: {
    games: [
      game('g1', '2026-05-01', '10:00', 'tA', 'tB'),   // past
      game('g2', '2026-05-10', '18:00', 'tB', 'tA'),   // tA is AWAY here
      game('g3', '2026-05-12', '09:00', 'tB', 'tC'),   // not tA's
      game('g4', '2026-05-20', '14:00', 'tA', 'tC'),
    ],
    practices: [ practice('p1', '2026-05-08', '17:00', 'tA') ],
    specialEvents: [
      { id: 's1', type: 'special' as const, name: 'Opening Day', date: '2026-05-09', time: '12:00', durationMinutes: 120 },
    ],
    generatedAt: null, warnings: [],
  },
} as unknown as AppState

const NOW = '2026-05-05T00:00'

// 1. teamOptions flattens every team with its division name.
const opts = teamOptions(state)
assert(opts.length === 3, 'teamOptions returns every team across divisions')
assert(opts[0].divisionName === 'Majors' && opts[2].divisionName === 'Minors', 'teamOptions carries the division name')

// 2. isTeamEvent: home, away, practice — and never a special event.
assert(isTeamEvent(state.schedule.games[1], 'tA'), 'team counts when it is the AWAY side')
assert(isTeamEvent(state.schedule.games[3], 'tA'), 'team counts when it is the HOME side')
assert(isTeamEvent(state.schedule.practices[0], 'tA'), 'practice matches on teamId')
assert(!isTeamEvent(state.schedule.games[2], 'tA'), 'another teams game is not yours')
assert(!isTeamEvent(state.schedule.specialEvents[0], 'tA'), 'special events belong to no team')

// 3. nextGameFor picks the soonest event at or after now — never a past one.
const next = nextGameFor(state, 'tA', NOW)
assert(next?.id === 'p1', 'next event is the 2026-05-08 practice, not the 2026-05-01 game')
assert(nextGameFor(state, 'tA', '2026-05-21T00:00') === null, 'null once the team has no future events')
assert(nextGameFor(state, 'tC', NOW)?.id === 'g3', 'works for a team in another division')

// 4. upcomingFor is chronological, inclusive of the next one, and respects limit.
const up = upcomingFor(state, 'tA', NOW, 10)
assert(up.map(e => e.id).join(',') === 'p1,g2,g4', 'upcomingFor is chronological and only this teams events')
assert(upcomingFor(state, 'tA', NOW, 2).length === 2, 'upcomingFor respects limit')

// 5. No team selected means the whole league, minus special events.
const all = upcomingFor(state, null, NOW, 10)
assert(all.map(e => e.id).join(',') === 'p1,g2,g3,g4', 'null teamId returns every future game and practice')

console.log(`coachView: ${passed}/${passed} assertions passed`)
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
npx tsx src/lib/coachView.test.ts
```
Expected: FAIL — `Cannot find module './coachView'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/coachView.ts`:

```ts
/**
 * Selection logic for the coach view-only page. React-free and label-free so
 * it runs under `npx tsx`, matching the shape of `mobileNav.ts`.
 *
 * `now` is always injected as a "YYYY-MM-DDTHH:MM" string rather than read
 * from the clock, so the behaviour is testable without freezing time. Events
 * sort on that same key, which makes ordering plain string comparison.
 */
import type { AppState, ScheduledGame, ScheduledPractice, ScheduledItem } from './types'

/** A game or a practice. Special events belong to no team and never appear here. */
export type CoachEvent = ScheduledGame | ScheduledPractice

export interface TeamOption {
  id: string
  name: string
  divisionId: string
  divisionName: string
}

/** Every team in the league, flattened, each carrying its division's name. */
export function teamOptions(state: AppState): TeamOption[] {
  return state.divisions.flatMap(d =>
    d.teams.map(t => ({ id: t.id, name: t.name, divisionId: d.id, divisionName: d.name }))
  )
}

/**
 * Does this event involve the team? A game counts whether the team is home or
 * away. A special event never counts — it belongs to the league, not a team.
 */
export function isTeamEvent(event: ScheduledItem, teamId: string): boolean {
  if (!teamId) return false
  if (event.type === 'game') {
    return event.homeTeamId === teamId || event.awayTeamId === teamId
  }
  if (event.type === 'practice') {
    return event.teamId === teamId
  }
  return false
}

function sortKey(e: { date: string; time: string }): string {
  return `${e.date}T${e.time}`
}

/**
 * The team's next `limit` events at or after `now`, in order — inclusive of the
 * very next one. Pass `teamId = null` for the whole league.
 */
export function upcomingFor(
  state: AppState,
  teamId: string | null,
  now: string,
  limit: number,
): CoachEvent[] {
  const all: CoachEvent[] = [...state.schedule.games, ...state.schedule.practices]
  return all
    .filter(e => (teamId ? isTeamEvent(e, teamId) : true))
    .filter(e => sortKey(e) >= now)
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
    .slice(0, limit)
}

/** The single next event for this team, or null when there is none. */
export function nextGameFor(
  state: AppState,
  teamId: string | null,
  now: string,
): CoachEvent | null {
  return upcomingFor(state, teamId, now, 1)[0] ?? null
}
```

- [ ] **Step 4: Run the test**

```bash
npx tsx src/lib/coachView.test.ts
```
Expected: `coachView: 13/13 assertions passed` (the count is however many `assert` calls the file contains — report the real number).

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/lib/coachView.ts src/lib/coachView.test.ts
git -c user.email=gmd4fy5yb4@privaterelay.appleid.com -c user.name="Gregory Amundson" \
  commit -m "Add coach view event-selection logic and tests"
```

---

## Task 2: Standings row highlight

**Files:**
- Modify: `src/components/StandingsTab.tsx:6-9` (Props), `:67` (signature), `:177-180` (the row)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `StandingsTab` accepts an optional `highlightTeamId?: string`. Task 3 passes it.

One standings implementation continues to serve both the admin shell and the coach page.

- [ ] **Step 1: Add the prop**

The `Props` interface at line 6 currently declares `state` and `readOnly`. Add one line:

```ts
interface Props {
  state: AppState
  readOnly: boolean
  /** Coach view: visually mark this team's row. Admin shell omits it. */
  highlightTeamId?: string
}
```

- [ ] **Step 2: Destructure it**

Line 67 reads `export default function StandingsTab({ state }: Props) {` — note it already ignores `readOnly`. Change to:

```tsx
export default function StandingsTab({ state, highlightTeamId }: Props) {
```

- [ ] **Step 3: Highlight the row**

The row at line 177 is:

```tsx
                        <tr
                          key={r.teamId}
                          className={`border-b last:border-0 ${isLeader && r.GP > 0 ? 'bg-[#f9f9fd]' : 'hover:bg-gray-50'}`}
                        >
```

Change to:

```tsx
                        <tr
                          key={r.teamId}
                          className={`border-b last:border-0 ${
                            r.teamId === highlightTeamId
                              ? 'bg-[#eeeef6] ring-1 ring-inset ring-[var(--fd-primary)]'
                              : isLeader && r.GP > 0 ? 'bg-[#f9f9fd]' : 'hover:bg-gray-50'
                          }`}
                        >
```

The highlight takes precedence over the leader tint so a coach's own team is unambiguous even when it is top of the table.

- [ ] **Step 4: Typecheck and commit**

```bash
npx tsc --noEmit
```
Expected: no errors. `highlightTeamId` is optional, so the admin shell's existing `<StandingsTab state={state} readOnly={readOnly} />` still compiles untouched.

```bash
git add src/components/StandingsTab.tsx
git -c user.email=gmd4fy5yb4@privaterelay.appleid.com -c user.name="Gregory Amundson" \
  commit -m "Add optional highlightTeamId to StandingsTab"
```

---

## Task 3: The `CoachView` component

**Files:**
- Create: `src/components/CoachView.tsx`

**Interfaces:**
- Consumes: `teamOptions`, `upcomingFor`, `nextGameFor`, `isTeamEvent`, `type CoachEvent`, `type TeamOption` from `@/lib/coachView` (Task 1); `StandingsTab` with `highlightTeamId` (Task 2); `Icon` from `./Icon`; `fetchDailyWeather`, `weatherEmoji`, `weatherDesc`, `type DayWeather` from `@/lib/weather`; `getDivisionColor` from `@/lib/divisionColors`.
- Produces: default export `CoachView` with exactly this prop interface — Task 4 wires it:

```ts
interface CoachViewProps {
  state: AppState
  viewToken: string | null
  lastUpdatedAt: string
}
```

Nothing imports it until Task 4, so the only compile check here is that the file itself typechecks.

**On weather:** `DashboardTab` fetches weather through a geocode proxy with a localStorage cache — do **not** replicate that. The coach hero uses the field's already-cached `field.geocoords` (typed `{ lat: number; lon: number } | undefined`, and its type comment says it is deliberately "shared with view-only users"). If the field has no `geocoords`, render no weather. One `fetchDailyWeather(lat, lon)` call, no geocoding, no cache.

- [ ] **Step 1: Write the component**

Create `src/components/CoachView.tsx`:

```tsx
'use client'
import { useState, useEffect, useMemo } from 'react'
import type { AppState, ScheduledGame, ScheduledPractice } from '@/lib/types'
import { teamOptions, upcomingFor, nextGameFor, isTeamEvent, type CoachEvent } from '@/lib/coachView'
import { fetchDailyWeather, weatherEmoji, weatherDesc, type DayWeather } from '@/lib/weather'
import { getDivisionColor } from '@/lib/divisionColors'
import StandingsTab from './StandingsTab'
import Icon from './Icon'

interface CoachViewProps {
  state: AppState
  viewToken: string | null
  lastUpdatedAt: string
}

type Panel = 'next' | 'schedule' | 'standings'

function fmtTime(t: string) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}
function fmtDay(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
function nowKey() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function CoachView({ state, viewToken, lastUpdatedAt }: CoachViewProps) {
  const [panel, setPanel] = useState<Panel>('next')
  const [pickerOpen, setPickerOpen] = useState(false)

  // Keyed by view token on purpose: a parent with children in two leagues
  // follows two different share links, and a bare key would make one league's
  // choice clobber the other's. Lazy initializer — a bare read would run
  // during server rendering and crash.
  const storageKey = `fd-coach-team:${viewToken ?? 'unknown'}`
  const [myTeamId, setMyTeamId] = useState<string | null>(
    () => (typeof window === 'undefined' ? null : window.localStorage.getItem(storageKey))
  )

  const teams = useMemo(() => teamOptions(state), [state])

  // A team that has since been deleted from the league is treated as no
  // selection, and the stale key is cleared.
  useEffect(() => {
    if (myTeamId && !teams.some(t => t.id === myTeamId)) {
      setMyTeamId(null)
      window.localStorage.removeItem(storageKey)
    }
  }, [myTeamId, teams, storageKey])

  function chooseTeam(id: string | null) {
    setMyTeamId(id)
    if (id) window.localStorage.setItem(storageKey, id)
    else window.localStorage.removeItem(storageKey)
    setPickerOpen(false)
  }

  const myTeam = teams.find(t => t.id === myTeamId) ?? null
  const now = nowKey()
  const next = useMemo(() => nextGameFor(state, myTeamId, now), [state, myTeamId, now])
  const upcoming = useMemo(() => upcomingFor(state, myTeamId, now, 6).slice(1), [state, myTeamId, now])
  const wholeLeague = useMemo(() => upcomingFor(state, null, now, 200), [state, now])

  const fieldMap = useMemo(() => new Map(state.fields.map(f => [f.id, f])), [state.fields])
  const teamMap = useMemo(() => new Map(teams.map(t => [t.id, t])), [teams])

  // Weather for the next event only, from the field's already-cached coords.
  // DashboardTab's geocode proxy + cache is deliberately not replicated here.
  const [wx, setWx] = useState<DayWeather | undefined>()
  const nextField = next ? fieldMap.get(next.fieldId) : undefined
  const coords = nextField?.geocoords
  useEffect(() => {
    if (!next || !coords) { setWx(undefined); return }
    let cancelled = false
    fetchDailyWeather(coords.lat, coords.lon)
      .then(map => { if (!cancelled) setWx(map.get(next.date)) })
      .catch(() => { if (!cancelled) setWx(undefined) })
    return () => { cancelled = true }
  }, [next, coords])

  function eventTitle(e: CoachEvent): string {
    if (e.type === 'game') {
      const g = e as ScheduledGame
      return `${teamMap.get(g.homeTeamId)?.name ?? 'TBD'} vs ${teamMap.get(g.awayTeamId)?.name ?? 'TBD'}`
    }
    return `${teamMap.get((e as ScheduledPractice).teamId)?.name ?? 'TBD'} practice`
  }
  function directionsUrl(fieldId: string): string | null {
    const f = fieldMap.get(fieldId)
    if (!f) return null
    if (f.geocoords) return `https://www.google.com/maps/search/?api=1&query=${f.geocoords.lat},${f.geocoords.lon}`
    if (f.address) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(f.address)}`
    return null
  }

  const TABS: { id: Panel; label: string; icon: 'home' | 'calendar' | 'chart' }[] = [
    { id: 'next', label: 'Next', icon: 'home' },
    { id: 'schedule', label: 'Schedule', icon: 'calendar' },
    { id: 'standings', label: 'Standings', icon: 'chart' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* ── Header ── */}
      <header className="bg-[var(--fd-primary)] text-white">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <h1 className="text-lg sm:text-xl font-bold truncate min-w-0">
            {state.season.leagueName || 'FieldDay Planner'}
          </h1>
          <span className="shrink-0 flex items-center gap-1.5 bg-white/10 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide">
            <span className="w-2 h-2 rounded-full bg-green-400" />
            Live
          </span>
        </div>
        <div className="max-w-3xl mx-auto px-4 pb-3">
          <button
            onClick={() => setPickerOpen(true)}
            className="min-h-[44px] w-full sm:w-auto flex items-center justify-between sm:justify-start gap-2 bg-white/10 hover:bg-white/15 rounded-lg px-3 text-sm font-medium transition"
          >
            {myTeam ? (
              <>
                <span className="truncate">{myTeam.name}</span>
                <span className="text-[var(--fd-primary-light)] text-xs shrink-0">change</span>
              </>
            ) : (
              <span>Pick your team →</span>
            )}
          </button>
        </div>
      </header>

      {/* ── Desktop tabs ── */}
      <nav aria-label="Sections" className="hidden sm:block bg-white border-b sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 flex">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setPanel(t.id)}
              aria-current={panel === t.id ? 'page' : undefined}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--fd-accent)] ${
                panel === t.id ? 'border-[var(--fd-accent)] text-[var(--fd-accent)]' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-5 pb-28 sm:pb-8 space-y-4">
        {panel === 'next' && (
          <>
            {!myTeamId && (
              <div className="bg-white rounded-xl border p-6 text-center space-y-3">
                <p className="text-base font-semibold text-gray-800">Whose schedule matters to you?</p>
                <p className="text-sm text-gray-500">We&apos;ll remember on this device — no account needed.</p>
                <button
                  onClick={() => setPickerOpen(true)}
                  className="min-h-[44px] px-5 rounded-lg bg-[var(--fd-primary)] text-white text-sm font-semibold"
                >
                  Pick your team
                </button>
              </div>
            )}

            {myTeamId && !next && (
              <div className="bg-white rounded-xl border p-6 text-center">
                <p className="text-sm text-gray-500">No upcoming games for {myTeam?.name}.</p>
              </div>
            )}

            {next && (
              <section className="bg-[var(--fd-primary)] text-white rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--fd-primary-light)]">
                    {fmtDay(next.date)} · {fmtTime(next.time)}
                  </span>
                  {wx && (
                    <span className="shrink-0 flex items-center gap-1.5 text-sm">
                      <span role="img" aria-label={weatherDesc(wx.weatherCode)}>{weatherEmoji(wx.weatherCode)}</span>
                      <span className="font-bold">{wx.tempHigh}°</span>
                      <span className="text-[var(--fd-primary-light)]">/ {wx.tempLow}°</span>
                    </span>
                  )}
                </div>
                <h2 className="text-xl font-bold leading-tight">{eventTitle(next)}</h2>
                {fieldMap.get(next.fieldId) && (
                  <p className="text-sm text-[var(--fd-primary-light)]">
                    {fieldMap.get(next.fieldId)!.name}
                    {fieldMap.get(next.fieldId)!.location ? ` · ${fieldMap.get(next.fieldId)!.location}` : ''}
                  </p>
                )}
                {directionsUrl(next.fieldId) && (
                  <a
                    href={directionsUrl(next.fieldId)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[44px] w-full flex items-center justify-center rounded-lg bg-white text-[var(--fd-primary)] text-sm font-semibold"
                  >
                    Directions
                  </a>
                )}
              </section>
            )}

            {upcoming.length > 0 && (
              <section className="bg-white rounded-xl border divide-y">
                <h3 className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-gray-500">Then</h3>
                {upcoming.map(e => (
                  <div key={e.id} className="px-4 py-3 flex items-start gap-3">
                    <span className="w-24 shrink-0 text-xs font-semibold text-gray-500 pt-0.5">{fmtDay(e.date)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-gray-900 truncate">{eventTitle(e)}</span>
                      <span className="block text-xs text-gray-500">{fmtTime(e.time)}{fieldMap.get(e.fieldId) ? ` · ${fieldMap.get(e.fieldId)!.name}` : ''}</span>
                    </span>
                  </div>
                ))}
              </section>
            )}
          </>
        )}

        {panel === 'schedule' && (
          <section className="bg-white rounded-xl border overflow-hidden">
            {wholeLeague.length === 0 && (
              <p className="px-4 py-10 text-center text-sm text-gray-500 italic">No upcoming events.</p>
            )}
            {(() => {
              const groups: { date: string; items: CoachEvent[] }[] = []
              for (const e of wholeLeague) {
                const last = groups[groups.length - 1]
                if (last && last.date === e.date) last.items.push(e)
                else groups.push({ date: e.date, items: [e] })
              }
              return groups.map(g => (
                <div key={g.date}>
                  <h3 className="sticky top-0 sm:top-12 z-[1] bg-gray-50 border-y px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-gray-500">
                    {fmtDay(g.date)}
                  </h3>
                  {g.items.map(e => {
                    const mine = myTeamId ? isTeamEvent(e, myTeamId) : false
                    const c = getDivisionColor(e.divisionId, state.divisions)
                    return (
                      <div key={e.id} className={`px-4 py-3 flex items-start gap-3 border-b last:border-0 ${mine ? 'bg-[#f9f9fd]' : ''}`}>
                        <span className="w-16 shrink-0 text-sm font-semibold text-gray-800 pt-0.5">{fmtTime(e.time)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-gray-900 truncate">{eventTitle(e)}</span>
                          <span className="block text-xs text-gray-500 truncate">{fieldMap.get(e.fieldId)?.name ?? ''}</span>
                        </span>
                        {mine && (
                          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide bg-[var(--fd-accent)] text-white rounded px-1.5 py-0.5">
                            Yours
                          </span>
                        )}
                        {!mine && (
                          <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium ${c.pill}`}>
                            {state.divisions.find(d => d.id === e.divisionId)?.name ?? ''}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))
            })()}
          </section>
        )}

        {panel === 'standings' && (
          <>
            <StandingsTab state={state} readOnly highlightTeamId={myTeamId ?? undefined} />
            {lastUpdatedAt && (
              <p className="text-xs text-center text-gray-500">
                Updated {new Date(lastUpdatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · auto-refreshes
              </p>
            )}
          </>
        )}

        {/* The acquisition loop: every coach and parent who opens this link is a
            future league admin. /pricing is public and trial-first; linking to
            "/" would bounce a signed-out visitor to /login. */}
        <footer className="pt-2 text-center">
          <a href="/pricing" className="text-xs text-gray-500 hover:text-[var(--fd-primary)] underline underline-offset-2">
            Powered by FieldDay Planner — run your own league free
          </a>
        </footer>
      </main>

      {/* ── Mobile bottom tabs ── */}
      <nav aria-label="Sections" className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t flex pb-[env(safe-area-inset-bottom)]">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setPanel(t.id)}
            aria-current={panel === t.id ? 'page' : undefined}
            className={`flex-1 min-h-[56px] flex flex-col items-center justify-center gap-1 text-[11px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--fd-accent)] ${
              panel === t.id ? 'text-[var(--fd-accent)]' : 'text-gray-500'
            }`}
          >
            <Icon name={t.icon} className="w-6 h-6" />
            {t.label}
          </button>
        ))}
      </nav>

      {/* ── Team picker ── */}
      {pickerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center animate-backdrop-in sm:p-4"
          onClick={() => setPickerOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Choose your team"
            className="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl max-h-[85vh] overflow-y-auto animate-sheet-up sm:animate-none pb-[env(safe-area-inset-bottom)] sm:pb-0"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-4 pt-4 pb-2">
              <h2 className="text-base font-bold text-gray-900">Whose schedule matters to you?</h2>
              <p className="text-sm text-gray-500 mt-0.5">We&apos;ll remember on this device — no account needed.</p>
            </div>
            {state.divisions.map(d => (
              d.teams.length > 0 && (
                <div key={d.id}>
                  <h3 className="px-4 py-1.5 bg-gray-50 border-y text-xs font-bold uppercase tracking-wider text-gray-500">{d.name}</h3>
                  {d.teams.map(t => (
                    <button
                      key={t.id}
                      onClick={() => chooseTeam(t.id)}
                      className="w-full min-h-[52px] px-4 flex items-center justify-between text-left text-[15px] text-gray-800 border-b last:border-0 active:bg-gray-50"
                    >
                      {t.name}
                      {t.id === myTeamId && <span className="text-xs font-semibold text-[var(--fd-accent)]">Selected</span>}
                    </button>
                  ))}
                </div>
              )
            ))}
            <button
              onClick={() => chooseTeam(null)}
              className="w-full min-h-[52px] px-4 flex items-center text-left text-[15px] font-medium text-gray-600 border-t"
            >
              Show the whole league
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```
Expected: no errors.

Two things about `getDivisionColor(divisionId, allDivisions)`, already verified so you do not need to re-derive them: it returns a palette entry that always exposes `.pill` (e.g. `'bg-blue-100 text-blue-700'`), and it **never returns null** — an unknown division falls back to `DEFAULT_COLOR`. So no truthiness guard around `c` is needed.

- [ ] **Step 3: Commit**

```bash
git add src/components/CoachView.tsx
git -c user.email=gmd4fy5yb4@privaterelay.appleid.com -c user.name="Gregory Amundson" \
  commit -m "Add CoachView: team picker, next-game hero, schedule, standings, footer"
```

---

## Task 4: Wire the seam into `page.tsx`

**Files:**
- Modify: `src/app/page.tsx` — imports near the top, and an early return after the `!leagueCode` gate (which ends around line 533)

**Interfaces:**
- Consumes: `CoachView` (Task 3), with props `state`, `viewToken`, `lastUpdatedAt`.
- Produces: no exports change.

**Deliverable:** a share-link viewer gets the coach page; the admin shell is untouched for everyone else.

- [ ] **Step 1: Import the component**

Alongside the other component imports near the top of `src/app/page.tsx`, add:

```tsx
import CoachView from '@/components/CoachView'
```

- [ ] **Step 2: Add the early return**

`isViewer` is already computed at line 500 (`const isViewer = readOnly && !expired`). The gates that follow are `!hydrated`, `viewTokenError`, then `!leagueCode` (which ends with its closing `}` around line 533).

Immediately **after** the `!leagueCode` block and **before** the `const timeSince = …` line, insert:

```tsx
  // A share-link viewer gets a purpose-built read surface instead of the admin
  // shell. Placed after the gates above so a bad token still shows "Link not
  // found" and an unhydrated page still shows the loader.
  //
  // An expired OWNER is not a viewer (isViewer = readOnly && !expired), so they
  // keep the admin shell and its amber renew banner — that split is deliberate.
  //
  // Consequence, accepted: the isViewer guards further down are now unreachable.
  // They remain correct and cost nothing; sweeping ~900 lines to delete them
  // would risk regressions for no user-visible benefit.
  if (isViewer) {
    return <CoachView state={state} viewToken={roTokenRef.current} lastUpdatedAt={lastUpdatedAt} />
  }
```

`roTokenRef` is declared at line 133 as `useRef<string | null>(null)` and is set to the view token at line 167 when a share link loads — it is exactly the per-league key the coach page needs for its `localStorage` entry.

- [ ] **Step 3: Typecheck and build**

```bash
npx tsc --noEmit && npm run build
```
Expected: no type errors; build succeeds. Report the actual output.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git -c user.email=gmd4fy5yb4@privaterelay.appleid.com -c user.name="Gregory Amundson" \
  commit -m "Render CoachView for share-link viewers"
```

---

## Task 5: Verification and merge

**Files:** none modified.

**Interfaces:**
- Consumes: every prior task.
- Produces: the work on `dev`, then `main`, deployed.

- [ ] **Step 1: Run the whole suite**

```bash
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
Expected: all seven suites pass, no type errors, build succeeds. Paste the real output.

- [ ] **Step 2: Browser pass — the coach page**

```bash
pkill -f "next dev" || true
rm -rf .next
npm run dev
```
Run in the background. Preview tools fail under `~/Desktop` (`getcwd EPERM`); drive a real browser. A 500 with `__webpack_modules__[moduleId] is not a function` means a stale `.next` — the `rm -rf` above prevents it.

Open the share link — `/?token=<view_token>&view=readonly` — at **390px** and check:
1. No admin chrome anywhere: no league code, no share button, no kebab, no setup tabs.
2. LIVE pill in the header; "Pick your team →" before a team is chosen.
3. Picking a team persists across a reload; the pill then shows the team name with "change".
4. Next panel: hero with matchup, venue and a working Directions link. Weather appears only when the field has cached coords.
5. Schedule panel: whole league grouped by day, YOURS tags only on the picked team's rows.
6. Standings panel: the picked team's row is highlighted.
7. The footer link to `/pricing` is on all three panels.
8. No horizontal page scroll; every control ≥44px.

Then at **1280px**: the same page with a top tab strip instead of the bottom bar, no bottom bar, and no layout breakage.

- [ ] **Step 3: Browser pass — the admin must be untouched**

Sign in as an admin (`greg+test8@`, a running trial — never a `plan_tier='unlimited'` tester) and confirm at 390px and 1280px that the admin shell is exactly as before: bottom bar with all 11 tabs on mobile, grouped tab nav on desktop, header controls, FAB on Schedule. **The coach page must not appear for an admin.**

- [ ] **Step 4: Confirm scope and the standing auth check**

```bash
git status --short
git diff --name-only dev..HEAD
```
Expected: status empty; changed files are exactly `src/lib/coachView.ts`, `src/lib/coachView.test.ts`, `src/components/CoachView.tsx`, `src/components/StandingsTab.tsx`, `src/app/page.tsx`. If `types.ts`, `linkedCalendars*`, `LinkedCalendarsTab.tsx` or `HANDOFF-shared-calendar.md` appear, stop.

```sql
select email, confirmation_sent_at from auth.users order by created_at desc limit 3;
```
A non-null `confirmation_sent_at` on a recent row means Supabase's "Confirm email" is back on. It must stay off.

- [ ] **Step 5: Merge to `dev`**

The main checkout is already on `dev` and stays there — it holds another session's uncommitted work, so never switch branches in it.

```bash
cd /Users/gregoryamundson/Desktop/CLAUDE/fieldday-planner
git merge --no-ff coach-view -m "Merge coach-view: purpose-built share-link page"
```

- [ ] **Step 6: Merge `dev` → `main` via a temporary worktree**

```bash
git worktree add .worktrees/main-merge main
cd .worktrees/main-merge
git -c user.email=gmd4fy5yb4@privaterelay.appleid.com -c user.name="Gregory Amundson" \
  merge --no-ff dev -m "Merge dev: coach view-only page"
git diff --stat dev main
```
Expected: `git diff --stat dev main` prints **nothing**. If not, stop and reconcile.

```bash
git push origin main
cd /Users/gregoryamundson/Desktop/CLAUDE/fieldday-planner
git worktree remove .worktrees/main-merge
git push origin dev
```

- [ ] **Step 7: Smoke-test production**

```bash
curl -s -X POST -H 'Content-Type: application/json' -d '{}' \
  -w "\n%{http_code}\n" https://fielddayplanner.app/api/leagues/save
```
Expected: `401` with a JSON body. Then open the production share link on a phone and confirm the coach page renders.

- [ ] **Step 8: Clean up**

```bash
git worktree remove .worktrees/coach-view
git branch -d coach-view
```

---

## Deliberately not built

- **Add to calendar.** The one genuinely new capability on the prototype, with no code in the repo, filed under Phase 4 on the roadmap, and behaviour that varies across iOS and Android in ways this environment cannot verify. A silently broken "Add to calendar" is worse than its absence. Directions ships; calendar does not.
- **The Coaches and Field Calendar tabs**, which a viewer sees today. Dropped per the prototype. The cheapest way back, if parents ask, is a coach contact row on the Next panel rather than restoring a whole tab.
- **Deleting the now-unreachable `isViewer` guards** in the admin shell. Correct either way; sweeping them risks regressions in a file three tasks have edited recently.
