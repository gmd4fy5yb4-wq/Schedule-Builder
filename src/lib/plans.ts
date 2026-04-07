export type PlanTier = 'trial' | 'small' | 'medium' | 'large'

export interface PlanLimits {
  leaguesLimit: number
  divisionsLimit: number
  teamsLimit: number
}

export interface Plan extends PlanLimits {
  tier: PlanTier
  name: string
  monthlyPriceUsd: number
  stripePriceId: string
}

export const PLANS: Plan[] = [
  {
    tier: 'trial',
    name: 'Free Trial',
    monthlyPriceUsd: 0,
    stripePriceId: '',
    leaguesLimit: 1,
    divisionsLimit: 2,
    teamsLimit: 8,
  },
  {
    tier: 'small',
    name: 'Small League',
    monthlyPriceUsd: 12,
    stripePriceId: process.env.STRIPE_PRICE_SMALL ?? '',
    leaguesLimit: 1,
    divisionsLimit: 4,
    teamsLimit: 16,
  },
  {
    tier: 'medium',
    name: 'Mid-Size League',
    monthlyPriceUsd: 25,
    stripePriceId: process.env.STRIPE_PRICE_MEDIUM ?? '',
    leaguesLimit: 2,
    divisionsLimit: 8,
    teamsLimit: 32,
  },
  {
    tier: 'large',
    name: 'Unlimited',
    monthlyPriceUsd: 49,
    stripePriceId: process.env.STRIPE_PRICE_LARGE ?? '',
    leaguesLimit: 999,
    divisionsLimit: 999,
    teamsLimit: 999,
  },
]

export function getPlan(tier: PlanTier): Plan {
  return PLANS.find(p => p.tier === tier) ?? PLANS[0]
}

export interface LimitCheckResult {
  allowed: boolean
  reason?: string
  limitType?: 'leagues' | 'divisions' | 'teams'
}

export function checkLimits(
  limits: PlanLimits,
  ownedLeagueCount: number,
  divisions: { teams: unknown[] }[]
): LimitCheckResult {
  const totalTeams = divisions.reduce((s, d) => s + d.teams.length, 0)

  if (ownedLeagueCount > limits.leaguesLimit) {
    return {
      allowed: false,
      limitType: 'leagues',
      reason: `Your plan allows ${limits.leaguesLimit} league${limits.leaguesLimit === 1 ? '' : 's'}.`,
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
