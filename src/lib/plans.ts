export type PlanTier = 'trial' | 'starter' | 'pro' | 'org'

export interface PlanLimits {
  sportsLimit: number     // headline gate — what the buyer shops on
  divisionsLimit: number  // silent guard
  teamsLimit: number      // silent guard — caps mega-division abuse
  adminsLimit: number     // reserved — NOT enforced in v1 (no admin records yet)
}

export interface Plan extends PlanLimits {
  tier: PlanTier
  name: string
  annualPriceUsd: number
  seasonPassPriceUsd: number
  stripePriceIdAnnual: string
  stripePriceIdSeason: string
}

export const PLANS: Plan[] = [
  // Trial = full Pro limits for 14 days (enforced via trial_started_at + middleware, not here).
  {
    tier: 'trial',
    name: 'Free Trial',
    annualPriceUsd: 0,
    seasonPassPriceUsd: 0,
    stripePriceIdAnnual: '',
    stripePriceIdSeason: '',
    sportsLimit: 3,
    divisionsLimit: 10,
    teamsLimit: 100,
    adminsLimit: 5,
  },
  {
    tier: 'starter',
    name: 'Starter',
    annualPriceUsd: 99,
    seasonPassPriceUsd: 39,
    stripePriceIdAnnual: process.env.STRIPE_PRICE_STARTER_ANNUAL ?? '',
    stripePriceIdSeason: process.env.STRIPE_PRICE_STARTER_SEASON ?? '',
    sportsLimit: 1,
    divisionsLimit: 3,
    teamsLimit: 24,
    adminsLimit: 2,
  },
  {
    tier: 'pro',
    name: 'Pro',
    annualPriceUsd: 199,
    seasonPassPriceUsd: 69,
    stripePriceIdAnnual: process.env.STRIPE_PRICE_PRO_ANNUAL ?? '',
    stripePriceIdSeason: process.env.STRIPE_PRICE_PRO_SEASON ?? '',
    sportsLimit: 3,
    divisionsLimit: 10,
    teamsLimit: 100,
    adminsLimit: 5,
  },
  {
    tier: 'org',
    name: 'Org',
    annualPriceUsd: 399,
    seasonPassPriceUsd: 129,
    stripePriceIdAnnual: process.env.STRIPE_PRICE_ORG_ANNUAL ?? '',
    stripePriceIdSeason: process.env.STRIPE_PRICE_ORG_SEASON ?? '',
    sportsLimit: 999,
    divisionsLimit: 999,
    teamsLimit: 999,
    adminsLimit: 999,
  },
]

export function getPlan(tier: PlanTier): Plan {
  return PLANS.find(p => p.tier === tier) ?? PLANS[0]
}

/**
 * What to call whatever plan_tier a subscription row actually carries.
 *
 * The DB holds tiers PLANS does not sell — 'unlimited' on the tester rows, legacy
 * 'small' — and every display site casts that string to PlanTier and calls
 * getPlan(), which falls back to PLANS[0]. That silently labels a 999-limit tester
 * and a lapsed paying customer "Free Trial". Name an unknown tier from the row
 * instead of from the fallback plan; never guess its limits, which live on the row.
 */
export function planDisplayName(tier: string | null | undefined): string {
  if (!tier) return PLANS[0].name
  const known = PLANS.find(p => p.tier === tier)
  return known ? known.name : tier.charAt(0).toUpperCase() + tier.slice(1)
}

// Cheapest *paid* tier whose sports allotment covers a selection — drives the live
// onboarding badge so a buyer sees which plan their sport count implies. PLANS is
// authored in ascending price order, so the first match is the cheapest fit.
export function minPaidTierForSports(sportCount: number): Plan {
  const paid = PLANS.filter(p => p.tier !== 'trial')
  return paid.find(p => p.sportsLimit >= Math.max(1, sportCount)) ?? paid[paid.length - 1]
}

/** The subscription columns that decide access. Shaped loosely so middleware, the
 *  save/create routes and the client can all pass whatever they happened to select. */
export interface SubscriptionState {
  subscription_status?: string | null
  subscription_end?: string | null
}

/**
 * Single source of truth for "may this user still change things?".
 *
 * A NULL subscription_end means no expiry — that covers the 4 plan_tier='unlimited'
 * tester rows AND a trial whose clock has not started yet (migration fd_014). A past
 * one means lapsed, which is what makes the 90-day season pass actually expire.
 *
 * Lapsed users keep READ access (the app renders read-only); this gate is only
 * about writes. Middleware, /api/leagues/save and /api/leagues/create must all
 * agree, or the UI and the server disagree about who is locked out.
 */
export function isWritable(sub: SubscriptionState | null | undefined): boolean {
  if (!sub) return false
  const notExpired = !sub.subscription_end || new Date(sub.subscription_end) > new Date()
  return notExpired && (sub.subscription_status === 'active' || sub.subscription_status === 'trialing')
}

export interface LimitCheckResult {
  allowed: boolean
  reason?: string
  limitType?: 'sports' | 'divisions' | 'teams'
}

// v1: gate on sports (headline), guard on divisions + teams.
// adminsLimit is reserved for when co-admin invites exist — not checked here yet.
export function checkLimits(
  limits: PlanLimits,
  sportCount: number,
  divisions: { teams: unknown[] }[]
): LimitCheckResult {
  const totalTeams = divisions.reduce((s, d) => s + d.teams.length, 0)

  if (sportCount > limits.sportsLimit) {
    return {
      allowed: false,
      limitType: 'sports',
      reason: `Your plan allows ${limits.sportsLimit} sport${limits.sportsLimit === 1 ? '' : 's'}.`,
    }
  }
  if (divisions.length > limits.divisionsLimit) {
    return {
      allowed: false,
      limitType: 'divisions',
      reason: `Your plan allows ${limits.divisionsLimit} division${limits.divisionsLimit === 1 ? '' : 's'}.`,
    }
  }
  if (totalTeams > limits.teamsLimit) {
    return {
      allowed: false,
      limitType: 'teams',
      reason: `Your plan allows ${limits.teamsLimit} team${limits.teamsLimit === 1 ? '' : 's'} total.`,
    }
  }
  return { allowed: true }
}

/**
 * Client-side mirror of saveGate()'s governing-plan rule, for greying out a
 * control before the user clicks it.
 *
 * On someone else's league the viewer's own limits are the wrong yardstick —
 * saveGate() measures the write against the OWNER's plan — and the owner's row
 * is unreadable from the browser (user_subscriptions RLS is own-row only). So a
 * collaborator is not gated client-side at all; the server answers. PlanPanel
 * suppresses its meters for the same reason.
 */
export function atClientLimit(
  count: number,
  limit: number | undefined,
  isLeagueOwner: boolean
): boolean {
  return isLeagueOwner && limit !== undefined && count >= limit
}

/**
 * Should the UI lock itself to read-only because the SIGNED-IN USER's plan has
 * lapsed? The client-side counterpart to saveGate()'s expiry check.
 *
 * The whole content of this function is "and only on a league your plan actually
 * governs". saveGate() weighs a write against the OWNER's plan, so on someone
 * else's league your own expiry is not the rule — and you cannot check theirs,
 * because user_subscriptions RLS is own-row only. The correct client behaviour
 * there is to stay editable and let the server answer.
 *
 * page.tsx got this wrong from the day the read-only mode landed: it locked on
 * `!isWritable(sub)` alone. A collaborator whose personal trial had lapsed was
 * shown "Your plan has expired" and a dead app on a league owned by an active
 * account — wrong twice, because it is not their plan's business and buying one
 * would not have unlocked anything. (Reported 2026-09-03: achic107@gmail.com on
 * YWWM8G, whose owner is on an unlimited plan with no expiry.)
 */
export function shouldLockForOwnPlan(input: {
  sub: SubscriptionState | null | undefined
  /** null while booting; 'VIEW' is the share-link sentinel, which has no owner. */
  leagueCode: string | null
  /** False until the owner_id fetch lands. NULL owner is ambiguous without it. */
  ownerResolved: boolean
  isLeagueOwner: boolean
}): boolean {
  // No row yet — still loading. Locking here would flash the expired banner at
  // every user on every boot.
  if (!input.sub) return false
  if (isWritable(input.sub)) return false

  // On a real league, wait for ownership. An unresolved leagueOwnerId reads as
  // NULL, which means "unclaimed, therefore yours" — so deciding early locks
  // every collaborator and never unlocks them.
  const onRealLeague = !!input.leagueCode && input.leagueCode !== 'VIEW'
  if (onRealLeague && !input.ownerResolved) return false

  return input.isLeagueOwner
}

// ─────────────────────────────────────────────────────────────────────────────
// Save gate: whose plan governs a write, and does it pass?
// ─────────────────────────────────────────────────────────────────────────────

/** Limit columns as they come off user_subscriptions. */
export interface SubscriptionLimits extends SubscriptionState {
  sports_limit?: number | null
  divisions_limit?: number | null
  teams_limit?: number | null
}

export interface SaveGateResult {
  allowed: boolean
  reason?: string
  /** True when the block is an expired plan rather than a size limit. */
  expired?: boolean
  limitType?: 'sports' | 'divisions' | 'teams'
  /** Whose plan caused the block — drives which message the route returns. */
  blockedBy?: 'self' | 'owner'
}

/**
 * A league belongs to its owner, and the owner's plan is what pays for it. So a
 * collaborator saving someone ELSE's league is gated by the OWNER's plan, not
 * their own.
 *
 * This is what the route always claimed to do — the old comment read "use the
 * owner's limits if this is someone else's league" — but only the sports gate
 * was ever carved out. Division and team limits, and the expiry check, still ran
 * against the collaborator. The practical effect: a tester whose personal plan
 * lapsed lost write access to a league they neither own nor pay for, and a
 * collaborator on a small plan could not save a large league the owner is fully
 * entitled to.
 *
 * There is no way to collaborate around a limit: your OWN league is always gated
 * by your own plan, so the only thing a shared code buys you is edit rights on a
 * league someone else is paying for.
 */
export function saveGate(input: {
  ownerId: string | null | undefined
  savingUserId: string
  savingUserSub: SubscriptionLimits | null | undefined
  /** Only needed when the saver is not the owner. */
  ownerSub: SubscriptionLimits | null | undefined
  sportCount: number
  divisions: { teams: unknown[] }[]
}): SaveGateResult {
  // An unclaimed league (no owner_id — legacy rows predating migration 001) is
  // treated as the saver's own, which is how it has always behaved.
  const own = !input.ownerId || input.ownerId === input.savingUserId

  // Falling back to the saver's row when the owner has none is deliberate: a
  // missing owner row is an anomaly, and denying the write would break
  // collaboration on legacy leagues. This preserves the previous behaviour for
  // that case rather than inventing a new failure mode.
  const governing = own ? input.savingUserSub : (input.ownerSub ?? input.savingUserSub)
  const blockedBy: 'self' | 'owner' = own ? 'self' : 'owner'

  if (!isWritable(governing)) {
    return { allowed: false, expired: true, blockedBy }
  }

  const limits: PlanLimits = {
    sportsLimit: governing?.sports_limit ?? 1,
    divisionsLimit: governing?.divisions_limit ?? 1,
    teamsLimit: governing?.teams_limit ?? 8,
    adminsLimit: 999,
  }

  // The sport gate counts the sports IN THIS league and is the headline quota, so
  // it only applies to a league you own. Divisions and teams are size guards on
  // the league itself, so they follow the governing plan either way.
  const check = checkLimits(limits, own ? input.sportCount : 0, input.divisions)
  if (!check.allowed) {
    return { allowed: false, reason: check.reason, limitType: check.limitType, blockedBy }
  }
  return { allowed: true }
}
