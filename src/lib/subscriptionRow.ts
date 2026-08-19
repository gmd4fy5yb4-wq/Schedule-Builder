/**
 * Pure row-building for the Stripe webhook.
 *
 * Extracted from src/app/api/payments/webhook/route.ts so the money path can be
 * tested without a Stripe SDK, a Supabase client, or a mocking library — this
 * file is React-free and I/O-free so it runs under `npx tsx`, like the rest of
 * src/lib.
 *
 * `now` is a parameter everywhere for the same reason it is in trial.ts: the
 * season pass grants 90 days from "now", and a test cannot assert on a moving
 * target.
 *
 * The plan table is a defaulted parameter rather than a module-level read. PLANS
 * resolves the six STRIPE_PRICE_* values from process.env at import time, and a
 * function whose behaviour depends on when it was imported is not testable —
 * callers get the real table for free, tests pass a fixture.
 *
 * The important behaviour here is what happens when a price ID or tier matches
 * no plan. It used to fall back to Starter limits, which meant a customer who
 * paid for Org against a missing STRIPE_PRICE_ORG_ANNUAL was charged in full
 * and provisioned as Starter, silently. These functions refuse instead: the
 * caller logs and leaves the existing row alone rather than demoting someone
 * who has just paid.
 */
import { PLANS, type Plan, type PlanTier } from './plans'

/** Every column the webhook writes on a checkout. */
export interface SubscriptionRow {
  user_id: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  plan_tier: PlanTier
  subscription_status: string
  subscription_end: string
  billing_period: 'annual' | 'season_3mo'
  sports_limit: number
  divisions_limit: number
  teams_limit: number
  /** Deprecated — no longer gated, kept non-null for legacy rows. */
  leagues_limit: number
  updated_at: string
}

export type RowResult =
  | { kind: 'row'; row: SubscriptionRow }
  /** Price ID matched no plan. Do NOT write: it would demote a paying customer. */
  | { kind: 'unrecognised-price'; priceId: string | undefined }
  /** Checkout metadata carried a tier that is not in PLANS. Same rule. */
  | { kind: 'unrecognised-tier'; tier: string }

const SEASON_PASS_DAYS = 90
const DAY_MS = 86_400_000

/**
 * Stripe's basil API moved `current_period_end` onto each subscription item.
 * Older payloads carry it on the subscription. Fall back to the billing cycle
 * anchor so a row is never written with an undefined end date.
 */
export function resolvePeriodEnd(
  itemPeriodEnd: number | undefined,
  subPeriodEnd: number | undefined,
  billingCycleAnchor: number,
): number {
  return itemPeriodEnd ?? subPeriodEnd ?? billingCycleAnchor
}

/**
 * One-time season pass (Checkout mode 'payment'). No subscription object, so
 * no subscription.* events will ever arrive — it simply lapses after 90 days.
 */
export function seasonPassRow(input: {
  userId: string
  customerId: string | null
  tier: string | undefined
  now: Date
}, plans: Plan[] = PLANS): RowResult {
  const tier = input.tier
  if (!tier) return { kind: 'unrecognised-tier', tier: '' }

  const plan = plans.find(p => p.tier === tier)
  if (!plan || plan.tier === 'trial') return { kind: 'unrecognised-tier', tier }

  const end = new Date(input.now.getTime() + SEASON_PASS_DAYS * DAY_MS)
  return {
    kind: 'row',
    row: {
      user_id: input.userId,
      stripe_customer_id: input.customerId,
      stripe_subscription_id: null,
      plan_tier: plan.tier,
      subscription_status: 'active',
      subscription_end: end.toISOString(),
      billing_period: 'season_3mo',
      sports_limit: plan.sportsLimit,
      divisions_limit: plan.divisionsLimit,
      teams_limit: plan.teamsLimit,
      leagues_limit: 999,
      updated_at: input.now.toISOString(),
    },
  }
}

/**
 * Recurring subscription checkout. The tier comes from the price ID, which is
 * the part that breaks when a STRIPE_PRICE_* env var is missing or points at
 * the wrong Stripe mode.
 */
export function subscriptionRow(input: {
  userId: string
  customerId: string | null
  subscriptionId: string
  priceId: string | undefined
  periodEnd: number
  now: Date
}, plans: Plan[] = PLANS): RowResult {
  const { priceId } = input
  // An empty price id must never match a plan whose env var is also unset —
  // PLANS defaults those to '', so guard before the lookup.
  if (!priceId) return { kind: 'unrecognised-price', priceId }

  const plan = plans.find(
    p => (p.stripePriceIdAnnual !== '' && p.stripePriceIdAnnual === priceId)
      || (p.stripePriceIdSeason !== '' && p.stripePriceIdSeason === priceId),
  )
  if (!plan) return { kind: 'unrecognised-price', priceId }

  return {
    kind: 'row',
    row: {
      user_id: input.userId,
      stripe_customer_id: input.customerId,
      stripe_subscription_id: input.subscriptionId,
      plan_tier: plan.tier,
      subscription_status: 'active',
      subscription_end: new Date(input.periodEnd * 1000).toISOString(),
      billing_period: plan.stripePriceIdSeason === priceId ? 'season_3mo' : 'annual',
      sports_limit: plan.sportsLimit,
      divisions_limit: plan.divisionsLimit,
      teams_limit: plan.teamsLimit,
      leagues_limit: 999,
      updated_at: input.now.toISOString(),
    },
  }
}

/** Fields written when a subscription is fully cancelled: revert to trial. */
export function cancellationUpdate(
  input: { status: string; periodEnd: number; now: Date },
  plans: Plan[] = PLANS,
) {
  const trial = plans.find(p => p.tier === 'trial')
  return {
    plan_tier: 'trial' as PlanTier,
    subscription_status: input.status,
    subscription_end: new Date(input.periodEnd * 1000).toISOString(),
    sports_limit: trial?.sportsLimit ?? 1,
    divisions_limit: trial?.divisionsLimit ?? 1,
    teams_limit: trial?.teamsLimit ?? 8,
    updated_at: input.now.toISOString(),
  }
}

/**
 * Fields written on subscription.updated. Tier and limits are deliberately
 * untouched — a renewal or a card change must not re-derive entitlements.
 */
export function renewalUpdate(input: { status: string; periodEnd: number; now: Date }) {
  return {
    subscription_status: input.status,
    subscription_end: new Date(input.periodEnd * 1000).toISOString(),
    updated_at: input.now.toISOString(),
  }
}
