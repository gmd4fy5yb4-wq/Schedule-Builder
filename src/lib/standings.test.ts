/**
 * Streak and last-5 are the only standings numbers that depend on ORDER, which
 * is exactly what the existing accumulation throws away. Scores are recorded
 * home-vs-away, so every value here also has to be flipped to the subject
 * team's perspective — the easiest thing in this file to get backwards.
 */
import type { ScheduledGame } from './types'
import { teamForm } from './standings'

let passed = 0
function assert(cond: boolean, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exit(1) }
  passed++
}

// home team `h` beats/loses to away team `a` by the given score
const g = (
  id: string, date: string, home: string, away: string,
  homeScore?: number, awayScore?: number,
): ScheduledGame => ({
  id, type: 'game', date, time: '10:00', durationMinutes: 90,
  fieldId: 'f1', homeTeamId: home, awayTeamId: away, umpireId: '', divisionId: 'd1',
  ...(homeScore === undefined ? {} : { result: { homeScore, awayScore: awayScore! } }),
})

// tA's history, oldest first: W (home), L (away), W (away), T, W (home)
const games: ScheduledGame[] = [
  g('g5', '2026-05-05', 'tA', 'tB', 7, 2),   // most recent: W
  g('g1', '2026-05-01', 'tA', 'tB', 5, 3),   // oldest: W
  g('g4', '2026-05-04', 'tB', 'tA', 4, 4),   // T
  g('g2', '2026-05-02', 'tB', 'tA', 6, 1),   // L (tA away, scored 1)
  g('g3', '2026-05-03', 'tB', 'tA', 2, 9),   // W (tA away, scored 9)
  g('g6', '2026-05-06', 'tA', 'tB'),         // no result — must be ignored
  g('g7', '2026-05-01', 'tC', 'tD', 1, 0),   // another team's game
]

const f = teamForm(games, 'tA', 5)

// 1. Only completed games for this team, in chronological order.
assert(f.last5.join('') === 'WLWTW', 'last5 is chronological oldest-first and excludes unplayed/other games')

// 2. Streak counts back from the MOST RECENT game.
assert(f.streak?.kind === 'W' && f.streak.count === 1, 'streak is the current run from the most recent game')

// 3. A tie breaks a streak rather than extending it.
const tieBreaks = teamForm([
  g('a1', '2026-05-01', 'tA', 'tB', 5, 0),
  g('a2', '2026-05-02', 'tA', 'tB', 5, 0),
  g('a3', '2026-05-03', 'tA', 'tB', 1, 1),
], 'tA', 5)
assert(tieBreaks.streak?.kind === 'T' && tieBreaks.streak.count === 1, 'a tie breaks the win streak; the run becomes the tie itself')

// 4. A genuine multi-game streak counts correctly.
const threeWins = teamForm([
  g('b1', '2026-05-01', 'tA', 'tB', 1, 0),
  g('b2', '2026-05-02', 'tB', 'tA', 0, 1),
  g('b3', '2026-05-03', 'tA', 'tB', 2, 0),
], 'tA', 5)
assert(threeWins.streak?.kind === 'W' && threeWins.streak.count === 3, 'a three-game win streak counts to 3 across home and away')

// 5. last5 caps at five but keeps the MOST RECENT five.
const many = teamForm([
  g('c1', '2026-05-01', 'tA', 'tB', 0, 1),   // L — should fall off
  g('c2', '2026-05-02', 'tA', 'tB', 1, 0),
  g('c3', '2026-05-03', 'tA', 'tB', 1, 0),
  g('c4', '2026-05-04', 'tA', 'tB', 1, 0),
  g('c5', '2026-05-05', 'tA', 'tB', 1, 0),
  g('c6', '2026-05-06', 'tA', 'tB', 1, 0),
], 'tA', 5)
assert(many.last5.join('') === 'WWWWW', 'last5 keeps the five most recent, dropping older ones')

// 6. recentResults is most-recent-FIRST and scored from this team's perspective.
assert(f.recentResults[0].gameId === 'g5', 'recentResults is most-recent-first')
const awayLoss = f.recentResults.find(r => r.gameId === 'g2')!
assert(awayLoss.outcome === 'L' && awayLoss.scoreFor === 1 && awayLoss.scoreAgainst === 6,
  'an away loss reports the score from this teams perspective, not home-vs-away')
assert(awayLoss.opponentTeamId === 'tB', 'opponent is the other side, whichever end this team played')

// 7. A team with no completed games degrades safely.
const empty = teamForm(games, 'tZ', 5)
assert(empty.streak === null && empty.last5.length === 0 && empty.recentResults.length === 0,
  'a team with no completed games yields null streak and empty lists')

console.log(`standings: ${passed}/${passed} assertions passed`)
