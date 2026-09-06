// Standalone assert-based check (no framework). Run: npx tsx src/lib/planUsage.test.ts
import assert from 'node:assert'
import { planUsage, billingLine, planCta } from './planUsage'
import type { AppState } from './types'

const now = new Date('2026-07-29T12:00:00Z')
const inDays = (n: number) => new Date(now.getTime() + n * 86_400_000).toISOString()

const team = (id: string) => ({ id, name: id, coaches: [] })
const state = {
  season: { leagueName: 'L', sports: ['softball', 'baseball'], sport: 'softball', startDate: '', endDate: '', gameDurationMinutes: 90, practiceDurationMinutes: 90 },
  blackoutDates: [],
  divisions: [
    { id: 'd1', name: 'Majors', teams: [team('a'), team('b')] },
    { id: 'd2', name: 'Minors', teams: [team('c')] },
  ],
  fields: [],
  umpires: [],
  fieldStaff: [],
  schedule: { games: [], practices: [], specialEvents: [], generatedAt: null, warnings: [] },
} as unknown as AppState

// ── planUsage ────────────────────────────────────────────────────────────────

const trial = planUsage(state, { plan_tier: 'trial', subscription_end: inDays(6), sports_limit: 3, divisions_limit: 10, teams_limit: 100 }, now)
assert.equal(trial.planName, 'Free Trial')
assert.equal(trial.trialLabel, '6 days left')
assert.deepEqual(trial.meters.map(m => m.text), ['2 of 3', '2 of 10', '3 of 100'], 'usage counted off the blob')
assert.equal(trial.meters[0].percent, 67, 'sports 2/3 → 67%')
assert.equal(trial.meters.some(m => m.over), false, 'nothing over limit')

// A trial whose clock has not started (fd_014) says so rather than showing a countdown.
assert.equal(planUsage(state, { plan_tier: 'trial', subscription_end: null }, now).trialLabel, 'not started')

// Limits come from the DB columns, so a downgrade that leaves a league over its
// limit has to render as over — this is what tells the admin why saves fail.
const over = planUsage(state, { plan_tier: 'starter', subscription_end: inDays(300), sports_limit: 1, divisions_limit: 3, teams_limit: 24 }, now)
assert.equal(over.trialLabel, null, 'paid plan has no trial label')
assert.equal(over.meters[0].over, true, '2 sports on a 1-sport plan → over')
assert.equal(over.meters[0].percent, 100, 'over-limit bar clamps at 100')

// Unlimited (the 999 sentinel) must not render as a full bar.
const unlimited = planUsage(state, { plan_tier: 'org', sports_limit: 999, divisions_limit: 999, teams_limit: 999 }, now)
assert.equal(unlimited.meters[0].text, '2 · unlimited')
assert.equal(unlimited.meters[0].percent, 0, 'unlimited shows an empty bar, not a full one')

// ── billingLine ──────────────────────────────────────────────────────────────

assert.match(billingLine({ plan_tier: 'trial', subscription_end: null }, now), /clock starts the first time you save a schedule/)
assert.match(billingLine({ plan_tier: 'trial', subscription_end: inDays(1) }, now), /1 day left/)
assert.match(billingLine({ plan_tier: 'trial', subscription_end: inDays(-2) }, now), /read-only until you pick a plan/)
// A season pass does not renew — saying "Renews" would be a false promise.
assert.match(
  billingLine({ plan_tier: 'pro', subscription_end: inDays(60), billing_period: 'season_3mo' }, now),
  /no auto-renew/
)
assert.match(billingLine({ plan_tier: 'pro', subscription_end: inDays(300), billing_period: 'annual' }, now), /^Renews /)
// The 4 tester rows: active, never expires.
assert.match(billingLine({ plan_tier: 'unlimited', subscription_end: null }, now), /does not expire/)

// planCta — who gets sold to. Rows below mirror real production accounts.
// isWritable() compares against the real clock, so "still covered" dates are
// relative: a hardcoded 2026-11-17 would silently start failing that November.
const ACTIVE = 'active'
const stillCovered = new Date(Date.now() + 90 * 86_400_000).toISOString()

// Jonathan, 2026-08-19: bought a $39 season pass. Was shown "Your setup fits
// Starter — $99/yr" and a Keep-this-setup button for the plan he had just bought.
assert.equal(
  planCta({ plan_tier: 'starter', subscription_status: ACTIVE, subscription_end: stillCovered,
    billing_period: 'season_3mo', stripe_customer_id: null }),
  'none',
  'a current season-pass holder is not sold the plan they own',
)

// A tester: active, no expiry, no Stripe record. Nothing to sell, nothing to manage.
assert.equal(
  planCta({ plan_tier: 'unlimited', subscription_status: ACTIVE, subscription_end: null, stripe_customer_id: null }),
  'none',
  'a non-expiring account is never told to upgrade',
)

// An annual subscriber with a real customer record can reach the portal.
assert.equal(
  planCta({ plan_tier: 'pro', subscription_status: ACTIVE, subscription_end: stillCovered,
    billing_period: 'annual', stripe_customer_id: 'cus_123' }),
  'manage',
  'an active subscriber gets billing management, not a pitch',
)

// A trial is the case the panel was originally written for.
assert.equal(
  planCta({ plan_tier: 'trial', subscription_status: 'trialing', subscription_end: null }),
  'buy',
  'a trial still sees the purchase CTA',
)

// greg.amundson@gmail.com: legacy tier 'small', real Stripe customer, lapsed
// 2026-07-11. Lapsed outranks paid — they need to renew.
assert.equal(
  planCta({ plan_tier: 'small', subscription_status: ACTIVE, subscription_end: '2026-07-11T03:51:39Z',
    stripe_customer_id: 'cus_456' }),
  'buy',
  'a lapsed paid plan is sold a renewal',
)

console.log('planUsage.test.ts — all assertions passed')
