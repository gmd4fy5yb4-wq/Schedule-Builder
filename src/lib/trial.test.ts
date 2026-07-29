// Standalone assert-based check (no framework). Run: npx tsx src/lib/trial.test.ts
import assert from 'node:assert'
import { trialBanner, checklistSteps } from './trial'
import type { AppState } from './types'

const now = new Date('2026-07-29T12:00:00Z')
const inDays = (n: number) => new Date(now.getTime() + n * 86_400_000).toISOString()

// ── trialBanner ──────────────────────────────────────────────────────────────

// The state every brand-new signup is in since fd_014: trial, clock not started.
assert.deepEqual(
  trialBanner({ plan_tier: 'trial', subscription_end: null }, now),
  { kind: 'not_started' },
  'trial with NULL end → not started'
)

// THE tester guard: 4 prod rows are plan_tier='unlimited' with a NULL end. They
// must never be told they are on a trial.
assert.equal(
  trialBanner({ plan_tier: 'unlimited', subscription_end: null }, now),
  null,
  'unlimited tester with NULL end → no bar'
)

assert.deepEqual(
  trialBanner({ plan_tier: 'trial', subscription_end: inDays(6) }, now),
  { kind: 'running', daysLeft: 6 },
  'running trial → days left'
)

// Partial days round up — 6.5 days left reads as "7 days", never "6".
assert.deepEqual(
  trialBanner({ plan_tier: 'trial', subscription_end: inDays(6.5) }, now),
  { kind: 'running', daysLeft: 7 },
  'partial day rounds up'
)

// Lapsed is the Phase 0 amber banner's job — no duplicate.
assert.equal(trialBanner({ plan_tier: 'trial', subscription_end: inDays(-1) }, now), null, 'lapsed trial → no bar')
assert.equal(trialBanner({ plan_tier: 'pro', subscription_end: inDays(300) }, now), null, 'paid tier → no bar')
assert.equal(trialBanner(null, now), null, 'no subscription row → no bar')
assert.equal(trialBanner({ plan_tier: 'trial', subscription_end: 'garbage' }, now), null, 'unparseable end → no bar')

// ── checklistSteps ───────────────────────────────────────────────────────────

const team = (id: string) => ({ id, name: id, coaches: [] })
const blank = {
  season: { leagueName: 'My League', startDate: '', endDate: '', gameDurationMinutes: 90, practiceDurationMinutes: 90 },
  blackoutDates: [],
  divisions: [],
  fields: [],
  umpires: [],
  fieldStaff: [],
  schedule: { games: [], practices: [], specialEvents: [], generatedAt: null, warnings: [] },
} as unknown as AppState

assert.deepEqual(checklistSteps(blank).map(s => s.done), [false, false, false, false], 'blank league → nothing done')

// A one-team division cannot play anyone, so step 2 stays open.
const oneTeam = { ...blank, divisions: [{ id: 'd1', name: 'Majors', teams: [team('a')] }] } as unknown as AppState
assert.equal(checklistSteps(oneTeam)[1].done, false, 'division with 1 team → step 2 not done')

const ready = {
  ...blank,
  season: { ...blank.season, startDate: '2026-04-06', endDate: '2026-06-27' },
  divisions: [{ id: 'd1', name: 'Majors', teams: [team('a'), team('b')] }],
  fields: [{ id: 'f1', name: 'Diamond 1' }],
  schedule: { ...blank.schedule, generatedAt: '2026-07-29T14:41:00Z' },
} as unknown as AppState
assert.deepEqual(checklistSteps(ready).map(s => s.done), [true, true, true, true], 'complete league → all done')

// Deep links must stay pinned to the TABS indices page.tsx uses.
assert.deepEqual(checklistSteps(blank).map(s => s.tab), [1, 2, 3, 8], 'tab indices unchanged')

console.log('trial.test.ts — all assertions passed')
