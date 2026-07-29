'use client'
import { useMemo } from 'react'
import type { AppState, ScheduledGame } from '@/lib/types'
import { getDivisionColor } from '@/lib/divisionColors'

interface Props {
  state: AppState
  readOnly: boolean
}

function TrophyIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
      <path d="M17 5h2a2 2 0 0 1-2 4" />
      <path d="M7 5H5a2 2 0 0 0 2 4" />
    </svg>
  )
}

interface TeamRecord {
  teamId: string
  teamName: string
  W: number
  L: number
  T: number
  RF: number   // runs for
  RA: number   // runs against
  GP: number   // games played
}

function pct(r: TeamRecord): number {
  if (r.GP === 0) return -1
  return (r.W + 0.5 * r.T) / r.GP
}

function fmtPct(r: TeamRecord): string {
  if (r.GP === 0) return '—'
  const p = pct(r)
  return p === 1 ? '1.000' : p.toFixed(3).replace(/^0/, '')
}

function calcGB(leader: TeamRecord, team: TeamRecord): string {
  if (leader.teamId === team.teamId) return '—'
  const gb = ((leader.W - team.W) + (team.L - leader.L)) / 2
  if (gb <= 0) return '—'
  return gb % 1 === 0 ? String(gb) : gb.toFixed(1)
}

function fmtDiff(r: TeamRecord): string {
  const d = r.RF - r.RA
  if (d > 0) return `+${d}`
  return String(d)
}

function sortTeams(records: TeamRecord[]): TeamRecord[] {
  return [...records].sort((a, b) => {
    const pa = pct(a), pb = pct(b)
    if (pb !== pa) return pb - pa
    if (b.W !== a.W) return b.W - a.W
    return (b.RF - b.RA) - (a.RF - a.RA)
  })
}

export default function StandingsTab({ state }: Props) {
  const totalScheduled = state.schedule.games.length
  const totalWithResults = state.schedule.games.filter(g => g.result).length

  const standingsByDiv = useMemo(() => {
    const byDiv = new Map<string, Map<string, TeamRecord>>()

    // Initialise every team with zeros
    for (const div of state.divisions) {
      const teamMap = new Map<string, TeamRecord>()
      for (const team of div.teams) {
        teamMap.set(team.id, { teamId: team.id, teamName: team.name, W: 0, L: 0, T: 0, RF: 0, RA: 0, GP: 0 })
      }
      byDiv.set(div.id, teamMap)
    }

    // Accumulate results
    for (const game of state.schedule.games) {
      if (!game.result) continue
      const divMap = byDiv.get(game.divisionId)
      if (!divMap) continue
      const { homeScore, awayScore } = game.result
      const home = divMap.get(game.homeTeamId)
      const away = divMap.get(game.awayTeamId)
      if (!home || !away) continue

      home.RF += homeScore; home.RA += awayScore; home.GP++
      away.RF += awayScore; away.RA += homeScore; away.GP++

      if (homeScore > awayScore)      { home.W++; away.L++ }
      else if (awayScore > homeScore) { away.W++; home.L++ }
      else                            { home.T++; away.T++ }
    }

    return byDiv
  }, [state.schedule.games, state.divisions])

  if (state.divisions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <TrophyIcon className="w-10 h-10 mb-3 text-gray-300" />
        <p className="font-medium">No divisions set up yet</p>
        <p className="text-sm mt-1">Add divisions and teams in the Divisions & Teams tab.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* Summary bar */}
      <div className="flex items-center justify-between bg-white rounded-xl border px-5 py-3">
        <h2 className="text-base font-semibold text-gray-800">League Standings</h2>
        <span className="text-sm text-gray-500">
          {totalWithResults === 0
            ? 'No results recorded yet'
            : `${totalWithResults} of ${totalScheduled} game${totalScheduled !== 1 ? 's' : ''} with results`}
        </span>
      </div>

      {/* One card per division */}
      {state.divisions.map((div, divIdx) => {
        const c = getDivisionColor(div.id, state.divisions)
        const divMap = standingsByDiv.get(div.id)
        const records = divMap ? sortTeams(Array.from(divMap.values())) : []
        const leader = records[0]
        const hasResults = records.some(r => r.GP > 0)
        const hasTies = records.some(r => r.T > 0)

        // Count games scheduled in this division
        const divScheduled = state.schedule.games.filter(g => g.divisionId === div.id).length
        const divPlayed    = state.schedule.games.filter(g => g.divisionId === div.id && g.result).length

        return (
          <div key={div.id} className="bg-white rounded-xl border overflow-hidden">

            {/* Division header */}
            <div className={`px-5 py-3 flex items-center justify-between ${c.bg} ${c.text}`}>
              <h3 className="font-semibold text-sm uppercase tracking-wide">{div.name}</h3>
              <span className="text-xs opacity-75">
                {divPlayed}/{divScheduled} game{divScheduled !== 1 ? 's' : ''} played
              </span>
            </div>

            {records.length === 0 ? (
              <p className="px-5 py-6 text-sm text-gray-400 italic text-center">No teams in this division.</p>
            ) : !hasResults ? (
              <p className="px-5 py-6 text-sm text-gray-400 italic text-center">No results recorded yet for this division.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b text-gray-500">
                      <th className="px-4 py-2 text-left font-medium">Team</th>
                      <th className="px-3 py-2 text-center font-medium">GP</th>
                      <th className="px-3 py-2 text-center font-medium">W</th>
                      <th className="px-3 py-2 text-center font-medium">L</th>
                      {hasTies && <th className="px-3 py-2 text-center font-medium">T</th>}
                      <th className="px-3 py-2 text-center font-medium">PCT</th>
                      <th className="px-3 py-2 text-center font-medium">RF</th>
                      <th className="px-3 py-2 text-center font-medium">RA</th>
                      <th className="px-3 py-2 text-center font-medium">DIFF</th>
                      <th className="px-3 py-2 text-center font-medium">GB</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r, i) => {
                      const isLeader = i === 0
                      const diff = r.RF - r.RA
                      return (
                        <tr
                          key={r.teamId}
                          className={`border-b last:border-0 ${isLeader && r.GP > 0 ? 'bg-[#f9f9fd]' : 'hover:bg-gray-50'}`}
                        >
                          <td className="px-4 py-2.5">
                            <span className={`font-medium ${isLeader && r.GP > 0 ? 'text-[var(--fd-primary)]' : 'text-gray-800'}`}>
                              {isLeader && r.GP > 0 && <TrophyIcon className="w-3.5 h-3.5 mr-1 inline-block align-text-bottom" />}
                              {r.teamName}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center text-gray-600">{r.GP}</td>
                          <td className="px-3 py-2.5 text-center font-semibold text-gray-800">{r.W}</td>
                          <td className="px-3 py-2.5 text-center text-gray-600">{r.L}</td>
                          {hasTies && <td className="px-3 py-2.5 text-center text-gray-600">{r.T}</td>}
                          <td className="px-3 py-2.5 text-center font-medium text-gray-700">{fmtPct(r)}</td>
                          <td className="px-3 py-2.5 text-center text-gray-600">{r.GP > 0 ? r.RF : '—'}</td>
                          <td className="px-3 py-2.5 text-center text-gray-600">{r.GP > 0 ? r.RA : '—'}</td>
                          <td className={`px-3 py-2.5 text-center font-medium ${
                            r.GP === 0 ? 'text-gray-300'
                            : diff > 0 ? 'text-green-600'
                            : diff < 0 ? 'text-red-500'
                            : 'text-gray-400'
                          }`}>
                            {r.GP > 0 ? fmtDiff(r) : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-center text-gray-500">
                            {leader ? calcGB(leader, r) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
