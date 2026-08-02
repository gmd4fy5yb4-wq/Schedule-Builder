/**
 * The coach page answers one question — "when does my kid play next" — so the
 * logic that can actually be wrong is which events belong to a team and which
 * one is next. Time is injected, never read from the clock.
 */
import type { AppState } from './types'
import { teamOptions, isTeamEvent, upcomingFor, nextGameFor } from './coachView'

let passed = 0
function assert(cond: boolean, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exit(1) }
  passed++
}

const game = (id: string, date: string, time: string, home: string, away: string) =>
  ({ id, type: 'game' as const, date, time, durationMinutes: 90, fieldId: 'f1', homeTeamId: home, awayTeamId: away, umpireId: '', divisionId: 'd1' })
const practice = (id: string, date: string, time: string, teamId: string) =>
  ({ id, type: 'practice' as const, date, time, durationMinutes: 60, fieldId: 'f1', teamId, divisionId: 'd1' })

const state = {
  season: { leagueName: 'L', startDate: '2026-04-01', endDate: '2026-08-01', gameDurationMinutes: 90, practiceDurationMinutes: 60 },
  blackoutDates: [],
  divisions: [
    { id: 'd1', name: 'Majors', gamesPerTeam: 10, teams: [
      { id: 'tA', name: 'Wildcats', divisionId: 'd1' },
      { id: 'tB', name: 'River Hawks', divisionId: 'd1' },
    ] },
    { id: 'd2', name: 'Minors', gamesPerTeam: 8, teams: [
      { id: 'tC', name: 'Comets', divisionId: 'd2' },
    ] },
  ],
  fields: [], umpires: [], fieldStaff: [],
  schedule: {
    games: [
      game('g1', '2026-05-01', '10:00', 'tA', 'tB'),   // past
      game('g2', '2026-05-10', '18:00', 'tB', 'tA'),   // tA is AWAY here
      game('g3', '2026-05-12', '09:00', 'tB', 'tC'),   // not tA's
      game('g4', '2026-05-20', '14:00', 'tA', 'tC'),
    ],
    practices: [ practice('p1', '2026-05-08', '17:00', 'tA') ],
    specialEvents: [
      { id: 's1', type: 'special' as const, name: 'Opening Day', date: '2026-05-09', time: '12:00', durationMinutes: 120 },
    ],
    generatedAt: null, warnings: [],
  },
} as unknown as AppState

const NOW = '2026-05-05T00:00'

// 1. teamOptions flattens every team with its division name.
const opts = teamOptions(state)
assert(opts.length === 3, 'teamOptions returns every team across divisions')
assert(opts[0].divisionName === 'Majors' && opts[2].divisionName === 'Minors', 'teamOptions carries the division name')

// 2. isTeamEvent: home, away, practice — and never a special event.
assert(isTeamEvent(state.schedule.games[1], 'tA'), 'team counts when it is the AWAY side')
assert(isTeamEvent(state.schedule.games[3], 'tA'), 'team counts when it is the HOME side')
assert(isTeamEvent(state.schedule.practices[0], 'tA'), 'practice matches on teamId')
assert(!isTeamEvent(state.schedule.games[2], 'tA'), 'another teams game is not yours')
assert(!isTeamEvent(state.schedule.specialEvents[0], 'tA'), 'special events belong to no team')

// 3. nextGameFor picks the soonest event at or after now — never a past one.
const next = nextGameFor(state, 'tA', NOW)
assert(next?.id === 'p1', 'next event is the 2026-05-08 practice, not the 2026-05-01 game')
assert(nextGameFor(state, 'tA', '2026-05-21T00:00') === null, 'null once the team has no future events')
assert(nextGameFor(state, 'tC', NOW)?.id === 'g3', 'works for a team in another division')

// 4. upcomingFor is chronological, inclusive of the next one, and respects limit.
const up = upcomingFor(state, 'tA', NOW, 10)
assert(up.map(e => e.id).join(',') === 'p1,g2,g4', 'upcomingFor is chronological and only this teams events')
assert(upcomingFor(state, 'tA', NOW, 2).length === 2, 'upcomingFor respects limit')

// 5. No team selected means the whole league, minus special events.
const all = upcomingFor(state, null, NOW, 10)
assert(all.map(e => e.id).join(',') === 'p1,g2,g3,g4', 'null teamId returns every future game and practice')

console.log(`coachView: ${passed}/${passed} assertions passed`)
