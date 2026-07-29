import type { AppState } from './types'
import { getSports } from './sports'
import { getPlan, type PlanTier } from './plans'

export interface PlanPanelSubscription {
  plan_tier?: string | null
  subscription_end?: string | null
  sports_limit?: number | null
  divisions_limit?: number | null
  teams_limit?: number | null
}

export interface UsageMeter {
  label: string
  text: string
  percent: number   // 0–100, clamped
  over: boolean
}

export interface PlanUsage {
  planName: string
  trialLabel: string | null   // e.g. "6 days left", or null when not a running trial
  meters: UsageMeter[]
}

const UNLIMITED = 999

/**
 * One sentence a non-technical admin can act on, in place of a raw status string
 * and an ISO date. Season passes must not say "renews" — they don't.
 */
export function billingLine(sub: PlanPanelSubscription & { billing_period?: string | null }, now: Date = new Date()): string {
  const end = sub.subscription_end ? new Date(sub.subscription_end) : null
  const when = end?.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  if (sub.plan_tier === 'trial') {
    if (!end) return 'Free trial — your 14-day clock starts when you generate your first schedule. No card on file.'
    const days = Math.ceil((end.getTime() - now.getTime()) / 86_400_000)
    return days > 0
      ? `Free trial — ${days} day${days === 1 ? '' : 's'} left, through ${when}. No card on file.`
      : `Your free trial ended ${when}. Your league is read-only until you pick a plan — nothing was deleted.`
  }
  if (!end) return 'No renewal date on file — this account does not expire.'
  if (end.getTime() <= now.getTime()) {
    return `Your plan ended ${when}. Your league is read-only until you renew — nothing was deleted.`
  }
  return sub.billing_period === 'season_3mo'
    ? `Season pass — access through ${when}. One-time payment, no auto-renew.`
    : `Renews ${when}.`
}

function meter(label: string, used: number, limit: number): UsageMeter {
  const unlimited = limit >= UNLIMITED
  return {
    label,
    text: unlimited ? `${used} · unlimited` : `${used} of ${limit}`,
    // An unlimited plan has no bar to fill — showing 100% would read as "full".
    percent: unlimited ? 0 : Math.min(100, Math.round((used / Math.max(1, limit)) * 100)),
    over: !unlimited && used > limit,
  }
}

/**
 * Turns the subscription row + league blob into the three meters the plan panel
 * shows. Limits come from the DB columns, not from PLANS — the save/create routes
 * enforce those same columns, so reading the plan table here would let the panel
 * disagree with the server about what's allowed.
 */
export function planUsage(state: AppState, sub: PlanPanelSubscription, now: Date = new Date()): PlanUsage {
  const tier = (sub.plan_tier ?? 'trial') as PlanTier
  // plan_tier='unlimited' is a real value on 4 tester rows and is NOT in PLANS;
  // getPlan falls back to trial for it, so name it from the row instead.
  const planName = tier === 'trial' ? 'Free Trial' : getPlan(tier).name ?? tier

  let trialLabel: string | null = null
  if (sub.plan_tier === 'trial') {
    if (!sub.subscription_end) {
      trialLabel = 'not started'
    } else {
      const days = Math.ceil((new Date(sub.subscription_end).getTime() - now.getTime()) / 86_400_000)
      trialLabel = days > 0 ? `${days} day${days === 1 ? '' : 's'} left` : 'expired'
    }
  }

  const teams = state.divisions.reduce((n, d) => n + d.teams.length, 0)
  return {
    planName,
    trialLabel,
    meters: [
      meter('Sports', getSports(state.season).length, sub.sports_limit ?? UNLIMITED),
      meter('Divisions', state.divisions.length, sub.divisions_limit ?? UNLIMITED),
      meter('Teams', teams, sub.teams_limit ?? UNLIMITED),
    ],
  }
}
