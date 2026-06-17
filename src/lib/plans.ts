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

// Cheapest *paid* tier whose sports allotment covers a selection — drives the live
// onboarding badge so a buyer sees which plan their sport count implies. PLANS is
// authored in ascending price order, so the first match is the cheapest fit.
export function minPaidTierForSports(sportCount: number): Plan {
  const paid = PLANS.filter(p => p.tier !== 'trial')
  return paid.find(p => p.sportsLimit >= Math.max(1, sportCount)) ?? paid[paid.length - 1]
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
