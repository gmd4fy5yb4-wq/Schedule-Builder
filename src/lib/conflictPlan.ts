/**
 * Severity and one-click fixes for auto-schedule conflicts.
 *
 * FieldDay's scheduler is constructive — it only ever emits a game that
 * satisfies every constraint — so its only failure mode is omission. Every
 * conflict is one unplaced matchup, and the useful question is not "what is
 * wrong with this game" but "can this game be placed at all". That is what
 * severity means here.
 *
 * Nothing in this file is persisted. It is re-derived on every preview change,
 * which is what keeps a fix candidate from going stale between being rendered
 * and being clicked.
 *
 * React-free on purpose so it runs under `npx tsx`.
 */
import type { Division, Field, ScheduleConflict, ScheduledGame, SeasonConfig, Team } from './types'
import { rescheduleMatchupRelaxed } from './autoScheduler'

export interface PlanContext {
  divisions: Division[]
  fields: Field[]
  season: SeasonConfig
  blackoutDates: string[]
  existingGames: ScheduledGame[]
}

export interface PlannedConflict {
  conflict: ScheduleConflict
  severity: 'conflict' | 'warning'
  candidate: ScheduledGame | null
  /** What accepting `candidate` would violate. The relaxed search ignores team blackouts. */
  overrides: { teamName: string; date: string }[]
}

/** Blackout entries are "YYYY-MM-DD" or "YYYY-MM-DD::Label". */
function blackoutDatesOf(team: Team): Set<string> {
  return new Set((team.blackoutDates ?? []).map(e => e.split('::')[0]))
}

function overridesFor(candidate: ScheduledGame, teamById: Map<string, Team>) {
  const out: { teamName: string; date: string }[] = []
  for (const id of [candidate.homeTeamId, candidate.awayTeamId]) {
    const team = teamById.get(id)
    if (team && blackoutDatesOf(team).has(candidate.date)) {
      out.push({ teamName: team.name, date: candidate.date })
    }
  }
  return out
}

/** Unfixable first, then fixable, then anything already dealt with. */
function rank(p: PlannedConflict): number {
  if (p.conflict.resolution !== 'pending') return 2
  return p.severity === 'conflict' ? 0 : 1
}

export function conflictPlan(
  conflicts: ScheduleConflict[],
  preview: ScheduledGame[],
  ctx: PlanContext,
): PlannedConflict[] {
  const teamById = new Map(ctx.divisions.flatMap(d => d.teams).map(t => [t.id, t]))

  // Candidates are reserved as we go: a slot handed to one conflict is not
  // offered to the next. This is what makes "auto-fix all" safe to apply in a
  // single pass — without it two cards could name the same slot and applying
  // both would double-book a field.
  const reserved = [...preview]

  const planned: PlannedConflict[] = conflicts.map(conflict => {
    if (conflict.resolution !== 'pending') {
      return { conflict, severity: 'conflict', candidate: null, overrides: [] }
    }

    const candidate = rescheduleMatchupRelaxed({
      homeTeamId: conflict.homeTeamId,
      awayTeamId: conflict.awayTeamId,
      divisionId: conflict.divisionId,
      divisions: ctx.divisions,
      fields: ctx.fields,
      season: ctx.season,
      leagueBlackouts: ctx.blackoutDates,
      existingGames: ctx.existingGames,
      previewGames: reserved,
    })

    if (candidate) reserved.push(candidate)

    return {
      conflict,
      severity: candidate ? 'warning' : 'conflict',
      candidate,
      overrides: candidate ? overridesFor(candidate, teamById) : [],
    }
  })

  // Array.prototype.sort is stable, so equal ranks keep generation order.
  return planned.sort((a, b) => rank(a) - rank(b))
}
