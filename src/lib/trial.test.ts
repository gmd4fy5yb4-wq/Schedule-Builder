// Standalone assert-based check (no framework). Run: npx tsx src/lib/trial.test.ts
import assert from 'node:assert'
import { trialBanner, checklistSteps, isUnnamedLeague, DEFAULT_LEAGUE_NAME } from './trial'
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
// ── isUnnamedLeague ──────────────────────────────────────────────────────────

assert.equal(isUnnamedLeague({ leagueName: DEFAULT_LEAGUE_NAME }), true, 'placeholder name → unnamed')
assert.equal(isUnnamedLeague({ leagueName: '   ' }), true, 'whitespace → unnamed')
assert.equal(isUnnamedLeague({}), true, 'missing name → unnamed')
assert.equal(isUnnamedLeague({ leagueName: 'Cedar Valley Little League' }), false, 'real name → named')
// Close but not equal — a real league may well be called this.
assert.equal(isUnnamedLeague({ leagueName: 'My League 2026' }), false, 'only the exact placeholder counts')

const blank = {
  season: { leagueName: DEFAULT_LEAGUE_NAME, startDate: '', endDate: '', gameDurationMinutes: 90, practiceDurationMinutes: 90 },
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

// Dates alone no longer finish step 1 — the 9 production leagues still called
// "My League" have dates set and had nothing telling them to rename.
const datedButUnnamed = {
  ...blank,
  season: { ...blank.season, startDate: '2026-04-06', endDate: '2026-06-27' },
} as unknown as AppState
assert.equal(checklistSteps(datedButUnnamed)[0].done, false, 'dates set but still "My League" → step 1 open')

const ready = {
  ...blank,
  season: { ...blank.season, leagueName: 'Cedar Valley Little League', startDate: '2026-04-06', endDate: '2026-06-27' },
  divisions: [{ id: 'd1', name: 'Majors', teams: [team('a'), team('b')] }],
  fields: [{ id: 'f1', name: 'Diamond 1' }],
  schedule: { ...blank.schedule, generatedAt: '2026-07-29T14:41:00Z' },
} as unknown as AppState
assert.deepEqual(checklistSteps(ready).map(s => s.done), [true, true, true, true], 'complete league → all done')

// Deep links must stay pinned to the TABS indices page.tsx uses.
assert.deepEqual(checklistSteps(blank).map(s => s.tab), [1, 2, 3, 8], 'tab indices unchanged')

console.log('trial.test.ts — all assertions passed')

// ── Expiry warning for PAID plans that will not auto-renew ───────────────────
// Written after a real sale (2026-08-19): a customer bought a 90-day season pass
// and would have hit read-only on day 91 with no warning at all, because the
// banner only ever spoke to trials.

const EWnow = new Date('2026-08-19T12:00:00Z')
const inDaysFrom = (n: number) => new Date(EWnow.getTime() + n * 86_400_000).toISOString()

// A season pass has NO Stripe subscription object — nothing will renew it.
const pass = (endsInDays: number) => ({
  plan_tier: 'starter',
  subscription_end: inDaysFrom(endsInDays),
  stripe_subscription_id: null,
})

// Silent while the end is comfortably far off...
assert.equal(trialBanner(pass(30), EWnow), null, 'no nagging 30 days out')
assert.equal(trialBanner(pass(15), EWnow), null, 'still silent just outside the window')

// ...then counts down inside the window.
assert.deepEqual(trialBanner(pass(14), EWnow), { kind: 'ending', daysLeft: 14 })
assert.deepEqual(trialBanner(pass(1), EWnow), { kind: 'ending', daysLeft: 1 })

// THE ONE THAT MUST NOT REGRESS: an annual subscriber has a live Stripe
// subscription that renews itself. Telling them their plan "ends in 9 days"
// would be false, and would push a happy customer toward cancelling.
assert.equal(
  trialBanner({ plan_tier: 'pro', subscription_end: inDaysFrom(9), stripe_subscription_id: 'sub_live_123' }, EWnow),
  null,
  'an auto-renewing annual subscription must never be told it is ending',
)

// The 4 plan_tier='unlimited' testers never expire — no end date, no banner.
assert.equal(
  trialBanner({ plan_tier: 'unlimited', subscription_end: null, stripe_subscription_id: null }, EWnow),
  null,
  'a tester row must not be told anything',
)

// Already lapsed stays silent here: the amber renew banner owns that state, and
// two bars stacked in the same region is worse than one.
assert.equal(trialBanner(pass(-3), EWnow), null, 'lapsed paid plan is owned by the renew banner')

// A trial is unaffected by any of this.
assert.deepEqual(
  trialBanner({ plan_tier: 'trial', subscription_end: inDaysFrom(5) }, EWnow),
  { kind: 'running', daysLeft: 5 },
  'trial behaviour is unchanged',
)
