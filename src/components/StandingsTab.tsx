'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { AppState, ScheduledGame } from '@/lib/types'
import { getDivisionColor } from '@/lib/divisionColors'
import { teamForm } from '@/lib/standings'
import { nextGameFor } from '@/lib/coachView'

interface Props {
  state: AppState
  readOnly: boolean
  /** Coach view: visually mark this team's row. Admin shell omits it. */
  highlightTeamId?: string
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

function nowKey() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** One record tile in the mobile detail. Tone is reinforcement only — the
 *  value always carries its own letter, so greyscale loses nothing. */
function Tile({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'good' | 'bad' | 'neutral' }) {
  return (
    <div className="bg-white px-2 py-3 text-center">
      <p className={`text-base font-bold ${
        tone === 'good' ? 'text-green-700' : tone === 'bad' ? 'text-red-700' : 'text-gray-900'
      }`}>{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}

export default function StandingsTab({ state, highlightTeamId }: Props) {
  const totalScheduled = state.schedule.games.length
  const totalWithResults = state.schedule.games.filter(g => g.result).length

  // Mobile only: which team's detail is open. Null shows the list.
  // Desktop ignores this entirely — it renders the full table.
  const [detailTeamId, setDetailTeamId] = useState<string | null>(null)

  // Focus management for the list <-> detail swap. Only one detail can be
  // open at a time (detailTeamId is page-wide, not per-division), so a
  // single ref for "the currently mounted back button" is enough. This
  // effect must live above the early return below — StandingsTab bails out
  // before rendering anything when there are no divisions, and hooks can't
  // follow a conditional return or live inside the division .map().
  const backButtonRef = useRef<HTMLButtonElement>(null)
  const prevDetailIdRef = useRef<string | null>(null)
  useEffect(() => {
    const wasOpen = prevDetailIdRef.current
    if (detailTeamId !== null && wasOpen === null) {
      // Detail just opened: the row button that had focus is about to
      // unmount. Move focus into the detail so a screen-reader user isn't
      // dropped at <body>.
      backButtonRef.current?.focus()
    } else if (detailTeamId === null && wasOpen !== null) {
      // Detail just closed: return focus to the list row for the team that
      // was open, so focus doesn't fall back to <body> a second time.
      document.getElementById(`standings-row-${wasOpen}`)?.focus()
    }
    prevDetailIdRef.current = detailTeamId
  }, [detailTeamId])

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

        // detailTeamId is page-wide, so each card must ask whether the open
        // team is one of ITS teams — otherwise opening a detail in one
        // division blanks every other division's card.
        const detailHere = detailTeamId !== null && records.some(x => x.teamId === detailTeamId)

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
              <>
              <div className="hidden sm:block overflow-x-auto">
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
                          className={`border-b last:border-0 ${
                            r.teamId === highlightTeamId
                              ? 'bg-[#eeeef6] ring-1 ring-inset ring-[var(--fd-primary)]'
                              : isLeader && r.GP > 0 ? 'bg-[#f9f9fd]' : 'hover:bg-gray-50'
                          }`}
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

              {/* Mobile: only the columns that fit. The full table above keeps
                  every column for desktop; here the rest lives in the detail. */}
              {!detailHere && (
                <div className="sm:hidden divide-y">
                  {records.map((r, i) => (
                    <button
                      key={r.teamId}
                      id={`standings-row-${r.teamId}`}
                      onClick={() => setDetailTeamId(r.teamId)}
                      className={`w-full min-h-[52px] px-4 flex items-center gap-3 text-left active:bg-gray-50 ${
                        r.teamId === highlightTeamId ? 'bg-[#eeeef6]' : ''
                      }`}
                    >
                      <span className="w-5 shrink-0 text-xs font-semibold text-gray-500">{i + 1}</span>
                      <span className="min-w-0 flex-1 font-medium text-gray-900 truncate">{r.teamName}</span>
                      <span className="shrink-0 text-sm font-semibold text-gray-800">{r.W}-{r.L}{r.T > 0 ? `-${r.T}` : ''}</span>
                      <span className="shrink-0 w-12 text-right text-sm text-gray-600">{fmtPct(r)}</span>
                      <span aria-hidden="true" className="shrink-0 text-gray-300">›</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Mobile detail. Every state here is readable without colour:
                  the streak carries its letter, the dots carry W/L/T, and the
                  result badges carry their outcome. */}
              {detailHere && (() => {
                const r = records.find(x => x.teamId === detailTeamId)
                if (!r) return null
                const rank = records.findIndex(x => x.teamId === detailTeamId) + 1
                const form = teamForm(state.schedule.games, r.teamId, 5)
                const next = nextGameFor(state, r.teamId, nowKey())
                const teamName = (id: string) =>
                  state.divisions.flatMap(d => d.teams).find(t => t.id === id)?.name ?? 'TBD'
                const team = state.divisions.flatMap(d => d.teams).find(t => t.id === r.teamId)
                const totalRuns = r.RF + r.RA
                const forPct = totalRuns > 0 ? Math.round((r.RF / totalRuns) * 100) : 50
                return (
                  <div className="sm:hidden">
                    <div className="px-4 py-3 border-b flex items-center gap-3">
                      <button
                        ref={backButtonRef}
                        onClick={() => setDetailTeamId(null)}
                        className="min-h-[44px] min-w-[44px] -ml-2 flex items-center text-sm font-medium text-[var(--fd-primary)]"
                      >
                        ‹ Standings
                      </button>
                      <span className="min-w-0">
                        <span className="block font-bold text-gray-900 truncate">{r.teamName}</span>
                        <span className="block text-xs text-gray-500">#{rank} in {div.name}</span>
                      </span>
                    </div>

                    {/* Record tiles */}
                    <div className="grid grid-cols-4 gap-px bg-gray-200">
                      <Tile label="Record" value={`${r.W}-${r.L}${r.T > 0 ? `-${r.T}` : ''}`} />
                      <Tile label="PCT" value={fmtPct(r)} />
                      <Tile label="Games back" value={leader ? calcGB(leader, r) : '—'} />
                      <Tile
                        label="Streak"
                        value={form.streak ? `${form.streak.kind}${form.streak.count}` : '—'}
                        tone={form.streak?.kind === 'W' ? 'good' : form.streak?.kind === 'L' ? 'bad' : 'neutral'}
                      />
                    </div>

                    {/* Last 5 */}
                    <div className="px-4 py-3 border-b">
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">Last 5</p>
                      {form.last5.length === 0 ? (
                        <p className="text-sm text-gray-500">No games played yet.</p>
                      ) : (
                        <div className="flex gap-1.5">
                          {form.last5.map((o, idx) => (
                            <span
                              key={idx}
                              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                                o === 'W' ? 'bg-green-100 text-green-800'
                                : o === 'L' ? 'bg-red-100 text-red-800'
                                : 'bg-gray-100 text-gray-700'
                              }`}
                            >
                              {o}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Runs split */}
                    <div className="px-4 py-3 border-b">
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">Runs</p>
                      <div className="h-2 rounded-full overflow-hidden bg-red-200 flex" role="presentation">
                        <div className="bg-green-500 h-full" style={{ width: `${forPct}%` }} />
                      </div>
                      <p className="text-xs text-gray-600 mt-1.5">{r.RF} for · {r.RA} against</p>
                    </div>

                    {/* Recent results */}
                    {form.recentResults.length > 0 && (
                      <div className="border-b">
                        <p className="px-4 pt-3 pb-1.5 text-xs font-bold uppercase tracking-wider text-gray-500">Recent results</p>
                        {form.recentResults.slice(0, 5).map(res => (
                          <div key={res.gameId} className="px-4 py-2.5 flex items-center gap-3 border-t">
                            <span className={`w-6 h-6 shrink-0 rounded flex items-center justify-center text-xs font-bold ${
                              res.outcome === 'W' ? 'bg-green-100 text-green-800'
                              : res.outcome === 'L' ? 'bg-red-100 text-red-800'
                              : 'bg-gray-100 text-gray-700'
                            }`}>{res.outcome}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm text-gray-900 truncate">vs {teamName(res.opponentTeamId)}</span>
                              <span className="block text-xs text-gray-500">{res.date}</span>
                            </span>
                            <span className="shrink-0 text-sm font-semibold text-gray-800">{res.scoreFor}–{res.scoreAgainst}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Next game */}
                    {next && (
                      <div className="px-4 py-3 border-b">
                        <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">Next game</p>
                        <p className="text-sm font-medium text-gray-900">
                          {next.type === 'game'
                            ? `${teamName(next.homeTeamId)} vs ${teamName(next.awayTeamId)}`
                            : `${r.teamName} practice`}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">{next.date} · {state.fields.find(f => f.id === next.fieldId)?.name ?? ''}</p>
                        {(() => {
                          const f = state.fields.find(x => x.id === next.fieldId)
                          const url = f?.geocoords
                            ? `https://www.google.com/maps/search/?api=1&query=${f.geocoords.lat},${f.geocoords.lon}`
                            : f?.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(f.address)}` : null
                          return url ? (
                            <a href={url} target="_blank" rel="noopener noreferrer"
                               className="mt-2 min-h-[44px] w-full flex items-center justify-center rounded-lg border border-gray-300 text-sm font-semibold text-gray-700">
                              Directions
                            </a>
                          ) : null
                        })()}
                      </div>
                    )}

                    {/* Coaches */}
                    {(team?.coaches?.length ?? 0) > 0 && (
                      <div className="px-4 py-3">
                        <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">Coaches</p>
                        {team!.coaches!.map(co => (
                          <div key={co.id} className="flex items-center gap-2 py-1.5">
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm text-gray-900 truncate">{co.name}</span>
                              {co.role && <span className="block text-xs text-gray-500">{co.role === 'head' ? 'Head Coach' : 'Assistant'}</span>}
                            </span>
                            {co.phone && (
                              <a href={`tel:${co.phone}`} className="min-h-[44px] px-3 flex items-center rounded-lg border border-gray-300 text-sm font-medium text-gray-700">Call</a>
                            )}
                            {co.email && (
                              <a href={`mailto:${co.email}`} className="min-h-[44px] px-3 flex items-center rounded-lg border border-gray-300 text-sm font-medium text-gray-700">Email</a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
