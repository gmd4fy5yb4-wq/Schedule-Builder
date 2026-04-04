'use client'
import { useState, useMemo } from 'react'
import type { AppState, ScheduledGame, ScheduledPractice } from '@/lib/types'
import { getDivisionColor } from '@/lib/divisionColors'
import EventModal, { emptyForm, formFromEvent, type EventForm } from './EventModal'
import { getSportConfig } from '@/lib/sports'

interface Props { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; readOnly?: boolean }

function fmtDate(s: string) {
  return new Date(s + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtTime(t: string) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

export default function TeamScheduleTab({ state, setState, readOnly = false }: Props) {
  const sc = getSportConfig(state.season.sport)
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [modal, setModal] = useState<{ open: boolean; initialForm: EventForm }>({ open: false, initialForm: emptyForm() })

  function openAddForTeam() {
    if (!selectedTeamId) return
    const team = teamMap.get(selectedTeamId)
    if (!team) return
    const today = new Date().toISOString().split('T')[0]
    const base = emptyForm(today, state.season.gameDurationMinutes || 90)
    setModal({ open: true, initialForm: { ...base, divisionId: team.divisionId, homeTeamId: selectedTeamId } })
  }

  function openEditEvent(ev: ScheduledGame | ScheduledPractice) {
    setModal({ open: true, initialForm: formFromEvent(ev) })
  }

  function closeModal() { setModal(m => ({ ...m, open: false })) }

  const teamMap = useMemo(() => new Map(state.divisions.flatMap(d => d.teams).map(t => [t.id, t])), [state.divisions])
  const fieldMap = useMemo(() => new Map(state.fields.map(f => [f.id, f])), [state.fields])
  const umpireMap = useMemo(() => new Map(state.umpires.map(u => [u.id, u])), [state.umpires])
  const divMap = useMemo(() => new Map(state.divisions.map(d => [d.id, d])), [state.divisions])

  const selectedTeam = selectedTeamId ? teamMap.get(selectedTeamId) : null
  const selectedDiv = selectedTeam ? divMap.get(selectedTeam.divisionId) : null

  const teamEvents = useMemo(() => {
    if (!selectedTeamId) return []
    const games = state.schedule.games.filter(
      g => g.homeTeamId === selectedTeamId || g.awayTeamId === selectedTeamId
    )
    const practices = state.schedule.practices.filter(
      p => p.teamId === selectedTeamId
    )
    return ([...games, ...practices] as (ScheduledGame | ScheduledPractice)[])
      .sort((a, b) => {
        const dc = a.date.localeCompare(b.date)
        return dc !== 0 ? dc : a.time.localeCompare(b.time)
      })
  }, [selectedTeamId, state.schedule])

  // Stats for selected team
  const gameCount = teamEvents.filter(e => e.type === 'game').length
  const practiceCount = teamEvents.filter(e => e.type === 'practice').length
  const homeCount = teamEvents.filter(e => e.type === 'game' && (e as ScheduledGame).homeTeamId === selectedTeamId).length
  const awayCount = gameCount - homeCount

  const allTeamsCount = state.divisions.flatMap(d => d.teams).length

  return (
    <div className="flex gap-6 min-h-[600px]">

      {/* ── Sidebar ── */}
      <div className="w-56 flex-shrink-0 space-y-3">
        <h2 className="text-base font-semibold text-gray-700">Teams</h2>
        {allTeamsCount === 0 && (
          <p className="text-sm text-gray-400 italic">No teams added yet.</p>
        )}
        {state.divisions.map(div => {
          if (div.teams.length === 0) return null
          const c = getDivisionColor(div.id, state.divisions)
          return (
            <div key={div.id} className="bg-white rounded-lg border overflow-hidden shadow-sm">
              <div className={`px-3 py-1.5 text-xs font-bold text-white uppercase tracking-wide ${c.header}`}>
                {div.name}
              </div>
              <div className="divide-y">
                {div.teams.map(team => {
                  const isSelected = selectedTeamId === team.id
                  const evCount = state.schedule.games.filter(g => g.homeTeamId === team.id || g.awayTeamId === team.id).length
                    + state.schedule.practices.filter(p => p.teamId === team.id).length
                  return (
                    <button
                      key={team.id}
                      onClick={() => setSelectedTeamId(team.id)}
                      className={`w-full text-left px-3 py-2 text-sm transition flex items-center justify-between group ${
                        isSelected
                          ? `border-l-4 ${c.accent} bg-gray-50 font-semibold text-gray-900`
                          : 'border-l-4 border-transparent hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      <span className="truncate">{team.name}</span>
                      {evCount > 0 && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ml-1 flex-shrink-0 ${isSelected ? c.pill : 'bg-gray-100 text-gray-500'}`}>
                          {evCount}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Main panel ── */}
      <div className="flex-1 min-w-0">
        {!selectedTeamId ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-24 text-gray-400">
            <p className="text-lg font-medium text-gray-500">Select a team</p>
            <p className="text-sm mt-1">Click any team name to see their full schedule</p>
          </div>
        ) : (
          <div className="space-y-4">

            {/* Team header */}
            <div className="bg-white rounded-lg border p-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-gray-900">{selectedTeam?.name}</h2>
                  {selectedDiv && (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${getDivisionColor(selectedDiv.id, state.divisions).pill}`}>
                      {selectedDiv.name}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-0.5">{selectedDiv?.name} Division</p>
              </div>

              <div className="flex items-center gap-4 flex-wrap">
                {/* Stats row */}
                <div className="flex gap-4 text-center">
                  <Stat label="Games" value={gameCount} />
                  <Stat label="Home" value={homeCount} />
                  <Stat label="Away" value={awayCount} />
                  <Stat label="Practices" value={practiceCount} />
                </div>
                {!readOnly && (
                  <button
                    onClick={openAddForTeam}
                    className="ml-auto bg-[#cd163f] hover:bg-[#00013a] text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
                  >
                    + Add Event
                  </button>
                )}
              </div>
            </div>

            {/* Schedule table */}
            {teamEvents.length === 0 ? (
              <div className="bg-white rounded-lg border p-12 text-center text-gray-400 italic">
                No events scheduled for {selectedTeam?.name} yet.
                <br />
                <button onClick={openAddForTeam} className="mt-3 text-sm text-[#cd163f] hover:text-[#cd163f] font-medium underline underline-offset-2">
                  Add their first event
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-lg border overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b text-left">
                      <th className="px-4 py-2.5 font-medium text-gray-600">#</th>
                      <th className="px-4 py-2.5 font-medium text-gray-600">Date</th>
                      <th className="px-4 py-2.5 font-medium text-gray-600">Time</th>
                      <th className="px-4 py-2.5 font-medium text-gray-600">Type</th>
                      <th className="px-4 py-2.5 font-medium text-gray-600">Opponent / Note</th>
                      <th className="px-4 py-2.5 font-medium text-gray-600">Home / Away</th>
                      <th className="px-4 py-2.5 font-medium text-gray-600">{sc.venueSingular}</th>
                      <th className="px-4 py-2.5 font-medium text-gray-600">{sc.officialSingular}</th>
                      <th className="px-4 py-2.5 font-medium text-gray-600">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamEvents.map((ev, idx) => {
                      const field = fieldMap.get(ev.fieldId)
                      if (ev.type === 'game') {
                        const g = ev as ScheduledGame
                        const isHome = g.homeTeamId === selectedTeamId
                        const oppId = isHome ? g.awayTeamId : g.homeTeamId
                        const opp = teamMap.get(oppId)
                        const umpire = g.umpireId ? umpireMap.get(g.umpireId) : null
                        return (
                          <tr key={g.id} onClick={() => openEditEvent(g)} className="border-b last:border-0 hover:bg-[#f5f5fb] transition-colors cursor-pointer">
                            <td className="px-4 py-2.5 text-gray-400 text-xs">{idx + 1}</td>
                            <td className="px-4 py-2.5 font-medium text-gray-800 whitespace-nowrap">{fmtDate(g.date)}</td>
                            <td className="px-4 py-2.5 whitespace-nowrap">{fmtTime(g.time)}</td>
                            <td className="px-4 py-2.5">
                              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-[#eeeef6] text-[#cd163f]">{sc.eventSingular}</span>
                            </td>
                            <td className="px-4 py-2.5 font-medium text-gray-800">{opp?.name ?? <span className="text-gray-400 italic">Unknown</span>}</td>
                            <td className="px-4 py-2.5">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded ${isHome ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                                {isHome ? 'Home' : 'Away'}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-gray-600">{field?.name ?? '—'}</td>
                            <td className="px-4 py-2.5 text-gray-600">{umpire?.name ?? <span className="text-gray-400">TBD</span>}</td>
                            <td className="px-4 py-2.5 text-gray-500 text-xs">{g.durationMinutes ? `${g.durationMinutes} min` : '—'}</td>
                          </tr>
                        )
                      } else {
                        const p = ev as ScheduledPractice
                        return (
                          <tr key={p.id} onClick={() => openEditEvent(p)} className="border-b last:border-0 hover:bg-gray-50 transition-colors cursor-pointer">
                            <td className="px-4 py-2.5 text-gray-400 text-xs">{idx + 1}</td>
                            <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap">{fmtDate(p.date)}</td>
                            <td className="px-4 py-2.5 whitespace-nowrap">{fmtTime(p.time)}</td>
                            <td className="px-4 py-2.5">
                              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-gray-100 text-gray-600">Practice</span>
                            </td>
                            <td className="px-4 py-2.5 text-gray-400 italic">—</td>
                            <td className="px-4 py-2.5 text-gray-400">—</td>
                            <td className="px-4 py-2.5 text-gray-600">{field?.name ?? '—'}</td>
                            <td className="px-4 py-2.5 text-gray-400">—</td>
                            <td className="px-4 py-2.5 text-gray-500 text-xs">{p.durationMinutes ? `${p.durationMinutes} min` : '—'}</td>
                          </tr>
                        )
                      }
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {modal.open && (
        <EventModal state={state} setState={setState} initialForm={modal.initialForm} onClose={closeModal} />
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <div className="text-xl font-bold text-gray-800">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  )
}
