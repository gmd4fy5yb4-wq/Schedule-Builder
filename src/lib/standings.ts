/**
 * Order-dependent standings figures. The accumulation in StandingsTab walks
 * `state.schedule.games` in array order and never sorts, so streak and last-5
 * cannot be derived from it — they need the team's completed games in
 * chronological order.
 *
 * Pure and React-free so it runs under `npx tsx`, matching mobileNav.ts and
 * coachView.ts.
 */
import type { ScheduledGame } from './types'

export type Outcome = 'W' | 'L' | 'T'

export interface RecentResult {
  gameId: string
  date: string
  outcome: Outcome
  opponentTeamId: string
  /** Scores from the SUBJECT team's perspective, not home-vs-away. */
  scoreFor: number
  scoreAgainst: number
}

export interface TeamForm {
  /** Chronological, oldest first, at most `limit` entries. */
  last5: Outcome[]
  /** The current run counting back from the most recent game. Null if none played. */
  streak: { kind: Outcome; count: number } | null
  /** Most recent first. */
  recentResults: RecentResult[]
}

export function teamForm(games: ScheduledGame[], teamId: string, limit: number): TeamForm {
  const played = games
    .filter(g => g.result && (g.homeTeamId === teamId || g.awayTeamId === teamId))
    .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`))

  const results: RecentResult[] = played.map(g => {
    const isHome = g.homeTeamId === teamId
    const scoreFor = isHome ? g.result!.homeScore : g.result!.awayScore
    const scoreAgainst = isHome ? g.result!.awayScore : g.result!.homeScore
    const outcome: Outcome = scoreFor > scoreAgainst ? 'W' : scoreFor < scoreAgainst ? 'L' : 'T'
    return {
      gameId: g.id,
      date: g.date,
      outcome,
      opponentTeamId: isHome ? g.awayTeamId : g.homeTeamId,
      scoreFor,
      scoreAgainst,
    }
  })

  const last5 = results.slice(-limit).map(r => r.outcome)

  let streak: TeamForm['streak'] = null
  if (results.length > 0) {
    const kind = results[results.length - 1].outcome
    let count = 0
    for (let i = results.length - 1; i >= 0 && results[i].outcome === kind; i--) count++
    streak = { kind, count }
  }

  return { last5, streak, recentResults: [...results].reverse() }
}
