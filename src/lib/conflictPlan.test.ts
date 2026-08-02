/**
 * The reservation invariant is the assertion that matters: conflictPlan pushes
 * each candidate onto a running preview before searching for the next, so two
 * cards can never offer the same slot. Without it, "auto-fix all" would
 * double-book a field.
 */
import type { Division, Field, ScheduleConflict, ScheduledGame, SeasonConfig, Team } from './types'
import { conflictPlan } from './conflictPlan'
import { slots } from './autoScheduler'

let passed = 0
function assert(cond: boolean, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exit(1) }
  passed++
}

const team = (id: string, name: string, blackoutDates?: string[]): Team => ({
  id, name, divisionId: 'd1', ...(blackoutDates ? { blackoutDates } : {}),
})

const div = (teams: Team[]): Division => ({ id: 'd1', name: 'Majors', teams, gamesPerTeam: 2 })

const field = (id: string, name: string): Field => ({ id, name, location: '', address: '' })

const season = (startDate: string, endDate: string): SeasonConfig => ({
  leagueName: 'Test', startDate, endDate,
  gameDurationMinutes: 90, practiceDurationMinutes: 60,
})

const conflict = (
  id: string, home: string, away: string,
  resolution: ScheduleConflict['resolution'] = 'pending',
): ScheduleConflict => ({
  id, divisionId: 'd1', homeTeamId: home, awayTeamId: away,
  reason: 'Could not find an available slot',
  details: [], suggestions: [], resolution,
})

// a booked game used to occupy a slot on field f1
const booked = (id: string, date: string, time: string): ScheduledGame => ({
  id, type: 'game', date, time, durationMinutes: 90,
  fieldId: 'f1', homeTeamId: 'zz1', awayTeamId: 'zz2', umpireId: '', divisionId: 'dz',
})

const tA = team('tA', 'Wildcats')
const tB = team('tB', 'Eagles')
const tC = team('tC', 'Comets')
const tD = team('tD', 'Rockies')

const baseCtx = {
  divisions: [div([tA, tB, tC, tD])],
  fields: [field('f1', 'Diamond 1')],
  season: season('2026-05-01', '2026-05-03'),
  blackoutDates: [] as string[],
  existingGames: [] as ScheduledGame[],
}

// 1. Severity is fixability: a candidate exists here, so it's a warning.
const p1 = conflictPlan([conflict('c1', 'tA', 'tB')], [], baseCtx)
assert(p1.length === 1 && p1[0].severity === 'warning' && p1[0].candidate !== null,
  'a placeable conflict is a warning with a candidate')

// 6a. No fields at all -> nothing is placeable.
const noFields = conflictPlan([conflict('c1', 'tA', 'tB')], [], { ...baseCtx, fields: [] })
assert(noFields[0].severity === 'conflict' && noFields[0].candidate === null,
  'with no fields every conflict is unfixable')

// 6b. No season dates -> nothing is placeable.
const noDates = conflictPlan([conflict('c1', 'tA', 'tB')], [], { ...baseCtx, season: season('', '') })
assert(noDates[0].severity === 'conflict' && noDates[0].candidate === null,
  'with no season dates every conflict is unfixable')

// 7. Empty input.
assert(conflictPlan([], [], baseCtx).length === 0, 'no conflicts yields an empty plan')

// 5. Already-resolved conflicts are not searched.
const resolved = conflictPlan([conflict('c1', 'tA', 'tB', 'resolved')], [], baseCtx)
assert(resolved[0].candidate === null && resolved[0].overrides.length === 0,
  'a non-pending conflict gets no candidate computed')

// 3. The relaxed search ignores blackouts, so overrides must report the violation.
const blackoutCtx = { ...baseCtx, divisions: [div([tA, team('tB', 'Eagles', ['2026-05-01::Field trip']), tC, tD])] }
const p3 = conflictPlan([conflict('c1', 'tA', 'tB')], [], blackoutCtx)
assert(p3[0].candidate?.date === '2026-05-01', 'the relaxed search still picks the earliest date')
assert(p3[0].overrides.length === 1 &&
       p3[0].overrides[0].teamName === 'Eagles' &&
       p3[0].overrides[0].date === '2026-05-01',
  'a candidate landing on a blackout date reports the team and date it overrides')

// 4. No blackout -> no override noise.
assert(p1[0].overrides.length === 0, 'a candidate on a free date reports no overrides')

// 8. THE RESERVATION INVARIANT.
// One field, one day, five default start times (10:00/12:00/14:00/16:00/18:00).
// Book four of them, leaving exactly one free slot for two pending conflicts.
const oneSlotCtx = {
  ...baseCtx,
  season: season('2026-05-01', '2026-05-01'),
  existingGames: [
    booked('b1', '2026-05-01', '10:00'),
    booked('b2', '2026-05-01', '12:00'),
    booked('b3', '2026-05-01', '14:00'),
    booked('b4', '2026-05-01', '16:00'),
  ],
}
const p8 = conflictPlan([conflict('c1', 'tA', 'tB'), conflict('c2', 'tC', 'tD')], [], oneSlotCtx)
const warnings = p8.filter(p => p.severity === 'warning')
assert(warnings.length === 1, 'only one conflict can claim the single remaining slot')
assert(warnings[0].candidate?.time === '18:00', 'the claimed slot is the one that was left free')
assert(p8.filter(p => p.severity === 'conflict').length === 1,
  'the conflict that lost the race re-derives as unfixable rather than sharing the slot')

// 2. Sort order: conflicts, then warnings, then non-pending.
const p2 = conflictPlan(
  [conflict('c1', 'tA', 'tB'), conflict('c2', 'tC', 'tD'), conflict('c3', 'tA', 'tC', 'skipped')],
  [], oneSlotCtx,
)
assert(p2.map(p => p.conflict.id).join(',') === 'c2,c1,c3',
  'unfixable conflicts sort first, then warnings, then already-resolved')

// 9. Plural helper used by the reworded detail strings.
assert(slots(1) === '1 slot', 'slots() is singular at one')
assert(slots(2) === '2 slots', 'slots() is plural above one')

console.log(`conflictPlan: ${passed}/${passed} assertions passed`)
