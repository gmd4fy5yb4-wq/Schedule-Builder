import type { AppState } from './types'

/** What the top bar should say, or null for "say nothing". */
export type TrialBanner =
  | { kind: 'not_started' }
  | { kind: 'running'; daysLeft: number }
  /** A PAID plan that nothing will auto-renew, inside the warning window. */
  | { kind: 'ending'; daysLeft: number }

export interface TrialSubscription {
  plan_tier?: string | null
  subscription_end?: string | null
  /**
   * Present = a real Stripe subscription object exists and will renew itself.
   * NULL = a one-time season pass (or a tester row), which simply lapses.
   */
  stripe_subscription_id?: string | null
}

const DAY_MS = 86_400_000

/**
 * How long before a non-renewing paid plan starts warning. A season pass runs 90
 * days; counting down for all of them would be nagging, and saying nothing until
 * the morning it stops is how you lose a renewal. Two weeks is enough notice to
 * act and short enough to feel like news.
 */
export const ENDING_WARNING_DAYS = 14

/**
 * Since fd_014 a NULL subscription_end means two different things: a trial whose
 * clock has not started, AND the 4 plan_tier='unlimited' tester rows that never
 * expire. So plan_tier is checked FIRST — key on the null date alone and the
 * testers get told they are on a trial.
 *
 * Lapsed returns null on purpose: the Phase 0 amber renew banner already owns
 * that state, and two banners stacked in the same header region is worse than one.
 *
 * Paid plans get a countdown too, but ONLY when nothing will renew them. An
 * annual subscriber has a live Stripe subscription that renews itself — warning
 * them their plan "ends in 9 days" would be false and alarming. A season pass has
 * no subscription object at all (the webhook writes stripe_subscription_id NULL
 * on purpose), so it genuinely stops, and the customer is the only thing that can
 * restart it.
 */
export function trialBanner(
  sub: TrialSubscription | null | undefined,
  now: Date = new Date()
): TrialBanner | null {
  if (!sub) return null

  if (sub.plan_tier === 'trial') {
    if (!sub.subscription_end) return { kind: 'not_started' }
    const end = new Date(sub.subscription_end).getTime()
    if (!Number.isFinite(end) || end <= now.getTime()) return null
    return { kind: 'running', daysLeft: Math.ceil((end - now.getTime()) / DAY_MS) }
  }

  // ── Paid plans ─────────────────────────────────────────────────────────────
  // No end date = the 4 plan_tier='unlimited' tester rows, which never expire.
  if (!sub.subscription_end) return null
  // A live Stripe subscription renews itself; saying it "ends" would be a lie.
  if (sub.stripe_subscription_id) return null

  const end = new Date(sub.subscription_end).getTime()
  // Already lapsed — the amber renew banner owns that state, same as for a trial.
  if (!Number.isFinite(end) || end <= now.getTime()) return null

  const daysLeft = Math.ceil((end - now.getTime()) / DAY_MS)
  if (daysLeft > ENDING_WARNING_DAYS) return null
  return { kind: 'ending', daysLeft }
}

/** The name every league was born with before the gate asked for one. */
/**
 * Whether THIS save should start the 14-day trial clock.
 *
 * fd_014's intent was "the clock starts when a trial user first saves a league
 * whose schedule has been generated". The original implementation fired on ANY
 * save of an already-generated schedule, and that turned out to be reachable
 * with no user action at all: DashboardTab geocodes a field that has no cached
 * coordinates, writes the coords into state, and the 800 ms autosave posts the
 * whole season. So merely OPENING a populated league could burn a trial — and a
 * collaborator opening someone else's league started their OWN clock, on a
 * league the owner's plan pays for.
 *
 * Two conditions, both required:
 *   1. TRANSITION — the schedule was not generated before this save and is now.
 *      An incidental re-save of an already-generated season is not the event.
 *   2. OWNERSHIP — the saver owns the league, or is claiming an unowned one in
 *      this same save. A collaborator's own trial is irrelevant to a league
 *      gated by the OWNER's plan (see `saveGate` in plans.ts).
 *
 * The caller still applies `plan_tier='trial'` and `trial_started_at IS NULL` as
 * DB filters, so this stays one-shot and cannot touch a tester or a paying row.
 */
export function shouldStartTrialClock(args: {
  ownerId: string | null | undefined
  savingUserId: string
  previousGeneratedAt: string | null | undefined
  nextGeneratedAt: string | null | undefined
}): boolean {
  const ownsLeague = !args.ownerId || args.ownerId === args.savingUserId
  const isFirstGeneration = !args.previousGeneratedAt && Boolean(args.nextGeneratedAt)
  return ownsLeague && isFirstGeneration
}

export const DEFAULT_LEAGUE_NAME = 'My League'

/**
 * True while a league is still carrying the placeholder name. 9 of the 12 leagues
 * in production are in this state — LeagueGate never had a name field, so the
 * only way to set one was to find it in Setup.
 */
export function isUnnamedLeague(season: { leagueName?: string }): boolean {
  const name = (season.leagueName ?? '').trim()
  return name === '' || name === DEFAULT_LEAGUE_NAME
}

export interface ChecklistStep {
  label: string
  detail: string
  done: boolean
  tab: number      // TABS index in page.tsx — same indices onNavigate() already uses
  cta: string
}

/**
 * The four steps to a first schedule, derived entirely from the league blob.
 * Nothing is stored: when every step is done the checklist stops rendering.
 */
export function checklistSteps(state: AppState): ChecklistStep[] {
  const teamCount = state.divisions.reduce((n, d) => n + d.teams.length, 0)
  return [
    {
      label: 'Name your league & set season dates',
      // Plain text — this string is rendered as a JSX child, not as HTML.
      detail: 'What it’s called, when it runs, and what you play',
      done: !isUnnamedLeague(state.season) && Boolean(state.season.startDate && state.season.endDate),
      tab: 1,
      cta: 'Open setup',
    },
    {
      label: 'Add divisions & teams',
      detail: teamCount ? `${state.divisions.length} divisions · ${teamCount} teams` : 'Majors, Minors, T-Ball — then the teams in each',
      // A division with one team cannot be scheduled against anyone, so it does
      // not count as done. Same rule auto-schedule enforces.
      done: state.divisions.some(d => d.teams.length >= 2),
      tab: 2,
      cta: 'Add divisions',
    },
    {
      label: 'Add your fields',
      detail: state.fields.length ? `${state.fields.length} added` : 'Where games and practices happen',
      done: state.fields.length > 0,
      tab: 3,
      cta: 'Add fields',
    },
    {
      label: 'Generate your schedule',
      detail: 'Auto-schedule builds the whole season, conflict-free — and starts your 14-day trial',
      done: Boolean(state.schedule.generatedAt),
      tab: 8,
      cta: 'Generate',
    },
  ]
}
