// Standalone assert-based check (no framework). Run: npx tsx src/lib/subscriptionRow.test.ts
//
// Two kinds of assertion here, deliberately separated:
//
//  1. Price-ID resolution runs against a FIXTURE plan table. The six real price
//     IDs come from process.env at import time and `npx tsx` does not load
//     .env.local, so asserting against the live table would test the harness's
//     environment rather than the logic.
//  2. Limits run against the REAL PLANS table, because sportsLimit and friends
//     are hardcoded literals in plans.ts — nothing environmental about them.
//     That is what pins "Org means 999, not Starter's 24".
import assert from 'node:assert'
import { PLANS, type Plan } from './plans'
import {
  seasonPassRow, subscriptionRow, cancellationUpdate, renewalUpdate, resolvePeriodEnd,
} from './subscriptionRow'

const now = new Date('2026-08-19T12:00:00.000Z')
const base = { userId: 'u1', customerId: 'cus_1', now }

/** The live PLANS shape, with price IDs filled in so matching is deterministic. */
const FIXTURE: Plan[] = PLANS.map(p => ({
  ...p,
  stripePriceIdAnnual: p.tier === 'trial' ? '' : `price_${p.tier}_annual`,
  stripePriceIdSeason: p.tier === 'trial' ? '' : `price_${p.tier}_season`,
}))

// ── The six live SKUs resolve to the right tier, limits and billing period ───
// This is the regression that matters. A price ID that failed to match used to
// fall through to Starter, so an Org customer paid $399 and was provisioned
// with 1 sport / 3 divisions / 24 teams, with no error raised anywhere.

for (const plan of PLANS.filter(p => p.tier !== 'trial')) {
  for (const period of ['annual', 'season'] as const) {
    const priceId = `price_${plan.tier}_${period}`
    const res = subscriptionRow(
      { ...base, subscriptionId: 'sub_1', priceId, periodEnd: 1_800_000_000 },
      FIXTURE,
    )
    assert.equal(res.kind, 'row', `${priceId} must produce a row`)
    if (res.kind !== 'row') continue
    assert.equal(res.row.plan_tier, plan.tier, `${priceId} -> tier`)
    // Limits come from the REAL table, so this fails if plans.ts drifts.
    assert.equal(res.row.sports_limit, plan.sportsLimit, `${priceId} -> sports_limit`)
    assert.equal(res.row.divisions_limit, plan.divisionsLimit, `${priceId} -> divisions_limit`)
    assert.equal(res.row.teams_limit, plan.teamsLimit, `${priceId} -> teams_limit`)
    assert.equal(res.row.billing_period, period === 'annual' ? 'annual' : 'season_3mo')
    assert.equal(res.row.stripe_subscription_id, 'sub_1')
    assert.equal(res.row.subscription_status, 'active')
  }
}

// Guard the specific money case in plain terms: Org must not come back Starter-sized.
const org = subscriptionRow(
  { ...base, subscriptionId: 'sub_1', priceId: 'price_org_annual', periodEnd: 1 }, FIXTURE)
assert.ok(org.kind === 'row' && org.row.plan_tier === 'org' && org.row.teams_limit > 24,
  'an org purchase must never be provisioned with starter limits')

// ── An unrecognised price is REFUSED, never silently downgraded ──────────────
// STRIPE_PRICE_* are per-Stripe-mode and set per Vercel project, so "a live
// price ID that this environment does not know" is a real state, not a theory.

for (const bad of ['price_does_not_exist', 'price_live_mode_org_annual', 'prod_wrong_object']) {
  const res = subscriptionRow(
    { ...base, subscriptionId: 'sub_1', priceId: bad, periodEnd: 1_800_000_000 }, FIXTURE)
  assert.equal(res.kind, 'unrecognised-price', `${bad} must be refused, not downgraded to starter`)
}

// A missing price ID must not match a plan whose env var is ALSO unset. PLANS
// defaults those to '', so a naive equality check would match trial (or every
// plan) in an environment with no Stripe config.
for (const missing of [undefined, '']) {
  assert.equal(
    subscriptionRow({ ...base, subscriptionId: 'sub_1', priceId: missing, periodEnd: 1 }, FIXTURE).kind,
    'unrecognised-price',
    `priceId ${JSON.stringify(missing)} must be refused`,
  )
}
// Same check against the REAL table, where every price ID genuinely is '' under tsx.
assert.equal(
  subscriptionRow({ ...base, subscriptionId: 'sub_1', priceId: '', periodEnd: 1 }).kind,
  'unrecognised-price',
  'an empty price id must not match the unset entries in the real PLANS table',
)

// ── Season pass (Checkout mode 'payment') ────────────────────────────────────

const season = seasonPassRow({ ...base, tier: 'pro' })
assert.equal(season.kind, 'row')
if (season.kind === 'row') {
  assert.equal(season.row.subscription_end, '2026-11-17T12:00:00.000Z', '90 days from now')
  assert.equal(season.row.billing_period, 'season_3mo')
  // No subscription object exists, so no subscription.* event will ever arrive
  // for it — this is what makes it lapse rather than renew.
  assert.equal(season.row.stripe_subscription_id, null)
  assert.equal(season.row.plan_tier, 'pro')
  assert.equal(season.row.sports_limit, 3)
}

// The same downgrade bug exists on this path, where tier comes from checkout
// metadata rather than a price ID.
const orgSeason = seasonPassRow({ ...base, tier: 'org' })
assert.ok(orgSeason.kind === 'row' && orgSeason.row.teams_limit === 999,
  'an org season pass must not be written with starter limits')

// Unknown or missing metadata is refused, not defaulted.
assert.equal(seasonPassRow({ ...base, tier: 'enterprise' }).kind, 'unrecognised-tier')
assert.equal(seasonPassRow({ ...base, tier: undefined }).kind, 'unrecognised-tier')
// 'trial' is a real PLANS entry but is not purchasable. Selling it as a season
// pass would write trial limits off a completed payment.
assert.equal(seasonPassRow({ ...base, tier: 'trial' }).kind, 'unrecognised-tier')

// ── periodEnd fallback chain (Stripe basil moved this onto the item) ─────────

assert.equal(resolvePeriodEnd(111, 222, 333), 111, 'item period end wins')
assert.equal(resolvePeriodEnd(undefined, 222, 333), 222, 'falls back to the subscription')
assert.equal(resolvePeriodEnd(undefined, undefined, 333), 333, 'finally the billing cycle anchor')
// 0 is a real epoch, not "absent" — ?? must not skip it the way || would.
assert.equal(resolvePeriodEnd(0, 222, 333), 0, 'zero is a value, not a miss')

// ── Cancellation reverts entitlements; renewal must not touch them ───────────

const cancelled = cancellationUpdate({ status: 'canceled', periodEnd: 1_800_000_000, now })
const trialPlan = PLANS.find(p => p.tier === 'trial')!
assert.equal(cancelled.plan_tier, 'trial')
assert.equal(cancelled.sports_limit, trialPlan.sportsLimit, 'reverts to the real trial limits')
assert.equal(cancelled.divisions_limit, trialPlan.divisionsLimit)
assert.equal(cancelled.teams_limit, trialPlan.teamsLimit)
assert.equal(cancelled.subscription_status, 'canceled')

const renewed = renewalUpdate({ status: 'active', periodEnd: 1_800_000_000, now })
// A renewal or card update must never re-derive entitlements. Writing any of
// these keys here is how a paying customer silently loses their tier.
for (const forbidden of ['plan_tier', 'sports_limit', 'divisions_limit', 'teams_limit']) {
  assert.ok(!(forbidden in renewed), `renewal must not write ${forbidden}`)
}
assert.equal(renewed.subscription_status, 'active')
assert.equal(renewed.subscription_end, new Date(1_800_000_000 * 1000).toISOString())

console.log('subscriptionRow.test.ts: all assertions passed')
