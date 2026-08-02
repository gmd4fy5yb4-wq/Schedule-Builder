/**
 * Selection logic for the coach view-only page. React-free and label-free so
 * it runs under `npx tsx`, matching the shape of `mobileNav.ts`.
 *
 * `now` is always injected as a "YYYY-MM-DDTHH:MM" string rather than read
 * from the clock, so the behaviour is testable without freezing time. Events
 * sort on that same key, which makes ordering plain string comparison.
 */
import type { AppState, ScheduledGame, ScheduledPractice, ScheduledItem } from './types'

/** A game or a practice. Special events belong to no team and never appear here. */
export type CoachEvent = ScheduledGame | ScheduledPractice

export interface TeamOption {
  id: string
  name: string
  divisionId: string
  divisionName: string
}

/** Every team in the league, flattened, each carrying its division's name. */
export function teamOptions(state: AppState): TeamOption[] {
  return state.divisions.flatMap(d =>
    d.teams.map(t => ({ id: t.id, name: t.name, divisionId: d.id, divisionName: d.name }))
  )
}

/**
 * Does this event involve the team? A game counts whether the team is home or
 * away. A special event never counts — it belongs to the league, not a team.
 */
export function isTeamEvent(event: ScheduledItem, teamId: string): boolean {
  if (!teamId) return false
  if (event.type === 'game') {
    return event.homeTeamId === teamId || event.awayTeamId === teamId
  }
  if (event.type === 'practice') {
    return event.teamId === teamId
  }
  return false
}

function sortKey(e: { date: string; time: string }): string {
  return `${e.date}T${e.time}`
}

/**
 * The team's next `limit` events at or after `now`, in order — inclusive of the
 * very next one. Pass `teamId = null` for the whole league.
 */
export function upcomingFor(
  state: AppState,
  teamId: string | null,
  now: string,
  limit: number,
): CoachEvent[] {
  const all: CoachEvent[] = [...state.schedule.games, ...state.schedule.practices]
  return all
    .filter(e => (teamId ? isTeamEvent(e, teamId) : true))
    .filter(e => sortKey(e) >= now)
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
    .slice(0, limit)
}

/** The single next event for this team, or null when there is none. */
export function nextGameFor(
  state: AppState,
  teamId: string | null,
  now: string,
): CoachEvent | null {
  return upcomingFor(state, teamId, now, 1)[0] ?? null
}

/**
 * Everything on the league's calendar at or after `now`, including special
 * events. The Schedule panel uses this; the Next panel deliberately does not,
 * because a special event belongs to the league rather than to any team.
 */
export function upcomingLeagueWide(
  state: AppState,
  now: string,
  limit: number,
): ScheduledItem[] {
  const all: ScheduledItem[] = [
    ...state.schedule.games,
    ...state.schedule.practices,
    ...(state.schedule.specialEvents ?? []),
  ]
  return all
    .filter(e => `${e.date}T${e.time}` >= now)
    .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`))
    .slice(0, limit)
}
