import type { AppState } from './types'

/** What the trial bar should say, or null for "say nothing". */
export type TrialBanner =
  | { kind: 'not_started' }
  | { kind: 'running'; daysLeft: number }

export interface TrialSubscription {
  plan_tier?: string | null
  subscription_end?: string | null
}

const DAY_MS = 86_400_000

/**
 * Since fd_014 a NULL subscription_end means two different things: a trial whose
 * clock has not started, AND the 4 plan_tier='unlimited' tester rows that never
 * expire. So plan_tier is checked FIRST — key on the null date alone and the
 * testers get told they are on a trial.
 *
 * Lapsed returns null on purpose: the Phase 0 amber renew banner already owns
 * that state, and two banners stacked in the same header region is worse than one.
 */
export function trialBanner(
  sub: TrialSubscription | null | undefined,
  now: Date = new Date()
): TrialBanner | null {
  if (!sub || sub.plan_tier !== 'trial') return null
  if (!sub.subscription_end) return { kind: 'not_started' }

  const end = new Date(sub.subscription_end).getTime()
  if (!Number.isFinite(end) || end <= now.getTime()) return null

  return { kind: 'running', daysLeft: Math.ceil((end - now.getTime()) / DAY_MS) }
}

/** The name every league was born with before the gate asked for one. */
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
