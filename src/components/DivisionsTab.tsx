'use client'
import { useState } from 'react'
import type { AppState, Team, Coach } from '@/lib/types'
import { getDivisionColor } from '@/lib/divisionColors'
import UpgradePrompt from './UpgradePrompt'
import type { PlanLimits } from '@/lib/plans'
import { getPlan } from '@/lib/plans'

interface Props {
  state: AppState
  setState: React.Dispatch<React.SetStateAction<AppState>>
  planLimits?: Pick<PlanLimits, 'divisionsLimit' | 'teamsLimit'> & { planTier?: string }
}

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }

export default function DivisionsTab({ state, setState, planLimits }: Props) {
  const [newTeam, setNewTeam] = useState<Record<string, string>>({})
  const [newDivName, setNewDivName] = useState('')
  const [newDivGames, setNewDivGames] = useState(10)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [expandedBlackouts, setExpandedBlackouts] = useState<Record<string, boolean>>({})
  const [newBlackoutDate, setNewBlackoutDate] = useState<Record<string, string>>({})
  const [newBlackoutLabel, setNewBlackoutLabel] = useState<Record<string, string>>({})
  const [expandedCoaches, setExpandedCoaches] = useState<Record<string, boolean>>({})
  const [newCoach, setNewCoach] = useState<Record<string, { name: string; role: 'head' | 'assistant'; phone: string; email: string }>>({})

  // ── Division actions ──────────────────────────────────────────────
  function addDivision() {
    const name = newDivName.trim()
    if (!name) return
    const id = uid()
    setState(s => ({ ...s, divisions: [...s.divisions, { id, name, teams: [], gamesPerTeam: newDivGames }] }))
    setNewDivName('')
    setNewDivGames(10)
  }

  function removeDivision(divId: string) {
    setState(s => ({
      ...s,
      divisions: s.divisions.filter(d => d.id !== divId),
      schedule: {
        ...s.schedule,
        games: s.schedule.games.filter(g => g.divisionId !== divId),
        practices: s.schedule.practices.filter(p => p.divisionId !== divId),
      }
    }))
    setDeleteConfirm(null)
  }

  function renameDivision(divId: string, name: string) {
    setState(s => ({ ...s, divisions: s.divisions.map(d => d.id === divId ? { ...d, name } : d) }))
  }

  function updateGames(divId: string, val: number) {
    setState(s => ({ ...s, divisions: s.divisions.map(d => d.id === divId ? { ...d, gamesPerTeam: val } : d) }))
  }

  // ── Team actions ──────────────────────────────────────────────────
  function addTeam(divId: string) {
    const name = (newTeam[divId] || '').trim()
    if (!name) return
    setState(s => ({
      ...s,
      divisions: s.divisions.map(d =>
        d.id === divId ? { ...d, teams: [...d.teams, { id: uid(), name, divisionId: divId }] } : d
      )
    }))
    setNewTeam(n => ({ ...n, [divId]: '' }))
  }

  function removeTeam(divId: string, teamId: string) {
    setState(s => ({
      ...s,
      divisions: s.divisions.map(d =>
        d.id === divId ? { ...d, teams: d.teams.filter(t => t.id !== teamId) } : d
      ),
      schedule: {
        ...s.schedule,
        games: s.schedule.games.filter(g => g.homeTeamId !== teamId && g.awayTeamId !== teamId),
        practices: s.schedule.practices.filter(p => p.teamId !== teamId),
      }
    }))
  }

  function updateTeamName(divId: string, teamId: string, name: string) {
    setState(s => ({
      ...s,
      divisions: s.divisions.map(d =>
        d.id === divId ? { ...d, teams: d.teams.map((t: Team) => t.id === teamId ? { ...t, name } : t) } : d
      )
    }))
  }

  function updateTeamBlackouts(divId: string, teamId: string, blackoutDates: string[]) {
    setState(s => ({
      ...s,
      divisions: s.divisions.map(d =>
        d.id === divId ? { ...d, teams: d.teams.map((t: Team) => t.id === teamId ? { ...t, blackoutDates } : t) } : d
      )
    }))
  }

  function addTeamBlackout(divId: string, teamId: string, existing: string[]) {
    const date = newBlackoutDate[teamId]
    if (!date) return
    const label = newBlackoutLabel[teamId]?.trim()
    const entry = label ? `${date}::${label}` : date
    if (existing.some(d => d.split('::')[0] === date)) return  // no duplicates
    updateTeamBlackouts(divId, teamId, [...existing, entry].sort())
    setNewBlackoutDate(v => ({ ...v, [teamId]: '' }))
    setNewBlackoutLabel(v => ({ ...v, [teamId]: '' }))
  }

  function removeTeamBlackout(divId: string, teamId: string, existing: string[], entry: string) {
    updateTeamBlackouts(divId, teamId, existing.filter(d => d !== entry))
  }

  // ── Coach actions ─────────────────────────────────────────────────
  function addCoach(divId: string, teamId: string) {
    const f = newCoach[teamId]
    if (!f?.name.trim()) return
    const coach: Coach = { id: uid(), name: f.name.trim(), role: f.role ?? 'head', phone: f.phone?.trim() ?? '', email: f.email?.trim() ?? '' }
    setState(s => ({
      ...s,
      divisions: s.divisions.map(d =>
        d.id === divId ? { ...d, teams: d.teams.map((t: Team) =>
          t.id === teamId ? { ...t, coaches: [...(t.coaches ?? []), coach] } : t
        )} : d
      )
    }))
    setNewCoach(n => ({ ...n, [teamId]: { name: '', role: 'head', phone: '', email: '' } }))
  }

  function removeCoach(divId: string, teamId: string, coachId: string) {
    setState(s => ({
      ...s,
      divisions: s.divisions.map(d =>
        d.id === divId ? { ...d, teams: d.teams.map((t: Team) =>
          t.id === teamId ? { ...t, coaches: (t.coaches ?? []).filter(c => c.id !== coachId) } : t
        )} : d
      )
    }))
  }

  function updateCoach(divId: string, teamId: string, coachId: string, field: keyof Coach, value: string) {
    setState(s => ({
      ...s,
      divisions: s.divisions.map(d =>
        d.id === divId ? { ...d, teams: d.teams.map((t: Team) =>
          t.id === teamId ? { ...t, coaches: (t.coaches ?? []).map(c => c.id === coachId ? { ...c, [field]: value } : c) } : t
        )} : d
      )
    }))
  }

  const totalTeams = state.divisions.reduce((sum, d) => sum + d.teams.length, 0)
  const divisionsAtLimit = planLimits ? state.divisions.length >= planLimits.divisionsLimit : false
  const teamsAtLimit = planLimits ? totalTeams >= planLimits.teamsLimit : false
  const planName = getPlan((planLimits?.planTier ?? 'trial') as Parameters<typeof getPlan>[0]).name

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800">Divisions &amp; Teams</h2>
        <span className="text-sm text-gray-500">{state.divisions.length} division{state.divisions.length !== 1 ? 's' : ''} · {totalTeams} team{totalTeams !== 1 ? 's' : ''}</span>
      </div>

      {/* ── Add Division ── */}
      <div className="bg-white rounded-lg border p-4">
        <h3 className="font-medium text-gray-700 mb-3">Add Division</h3>
        <div className="flex gap-3 flex-wrap items-end">
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs text-gray-500 mb-1">Division Name</label>
            <input
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--fd-accent)]"
              placeholder="e.g. 6U Minors, 10U Majors…"
              value={newDivName}
              onChange={e => setNewDivName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addDivision()}
            />
          </div>
          <div className="w-28">
            <label className="block text-xs text-gray-500 mb-1">Games / team</label>
            <input
              type="number" min={1} max={50}
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--fd-accent)]"
              value={newDivGames}
              onChange={e => setNewDivGames(Number(e.target.value))}
            />
          </div>
          <button
            onClick={addDivision}
            disabled={!newDivName.trim() || divisionsAtLimit}
            className="bg-[var(--fd-accent)] text-white px-4 py-2 rounded text-sm hover:bg-[var(--fd-primary)] transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            + Add Division
          </button>
        </div>
        {divisionsAtLimit && <UpgradePrompt limitType="divisions" planName={planName} />}
      </div>

      {/* ── Division list ── */}
      {state.divisions.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="font-medium">No divisions yet</p>
          <p className="text-sm mt-1">Add your first division above — Minors, Majors, whatever fits your league.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {state.divisions.map(div => {
          const c = getDivisionColor(div.id, state.divisions)
          const scheduleCount =
            state.schedule.games.filter(g => g.divisionId === div.id).length +
            state.schedule.practices.filter(p => p.divisionId === div.id).length
          const isConfirming = deleteConfirm === div.id

          return (
            <div key={div.id} className="bg-white rounded-lg border shadow-sm overflow-hidden">
              {/* Card header */}
              <div className={`px-4 py-3 border-b flex flex-wrap items-center gap-3 ${c.bg}`}>
                {/* Editable division name */}
                <input
                  className={`font-bold text-base bg-transparent border-0 border-b-2 border-transparent focus:border-current focus:outline-none flex-1 min-w-[80px] ${c.text}`}
                  value={div.name}
                  onChange={e => renameDivision(div.id, e.target.value)}
                  title="Click to rename"
                />

                {/* Games per team */}
                <div className="flex items-center gap-1.5 text-xs">
                  <span className={`${c.text} opacity-70`}>Games/team:</span>
                  <input
                    type="number" min={1} max={50}
                    className={`w-14 border rounded px-1.5 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-current bg-white`}
                    value={div.gamesPerTeam}
                    onChange={e => updateGames(div.id, Number(e.target.value))}
                  />
                </div>

                {/* Delete button / confirm */}
                {isConfirming ? (
                  <div className="flex items-center gap-1.5 ml-auto">
                    <span className="text-xs text-red-600 font-medium">
                      {scheduleCount > 0 ? `Delete + ${scheduleCount} scheduled events?` : 'Delete division?'}
                    </span>
                    <button onClick={() => removeDivision(div.id)} className="text-xs bg-red-500 text-white px-2 py-0.5 rounded hover:bg-red-600 transition">Yes</button>
                    <button onClick={() => setDeleteConfirm(null)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirm(div.id)}
                    className="ml-auto text-xs text-red-400 hover:text-red-600 transition"
                    title="Remove division"
                  >Remove</button>
                )}
              </div>

              {/* Teams */}
              <div className="p-4">
                {div.teams.length === 0 && (
                  <p className="text-sm text-gray-400 italic mb-3">No teams yet</p>
                )}
                <div className="space-y-2 mb-3">
                  {div.teams.map(team => {
                    const blackouts = team.blackoutDates ?? []
                    const coaches = team.coaches ?? []
                    const isExpandedBlackouts = expandedBlackouts[team.id]
                    const isExpandedCoaches = expandedCoaches[team.id]
                    const nc = newCoach[team.id] ?? { name: '', phone: '', email: '' }
                    return (
                      <div key={team.id} className="border rounded overflow-hidden">
                        <div className="flex items-center gap-2 px-2 py-1">
                          <input
                            className="flex-1 border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--fd-accent)]"
                            value={team.name}
                            onChange={e => updateTeamName(div.id, team.id, e.target.value)}
                          />
                          <button
                            onClick={() => setExpandedCoaches(v => ({ ...v, [team.id]: !v[team.id] }))}
                            className={`flex-shrink-0 text-xs px-2 py-1 rounded border transition ${coaches.length > 0 ? 'border-blue-300 text-blue-600 bg-blue-50 hover:bg-blue-100' : 'border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}
                            title="Team coaches"
                          >
                            {coaches.length > 0 ? `${coaches.length} Coach${coaches.length !== 1 ? 'es' : ''}` : 'Coaches'}
                          </button>
                          <button
                            onClick={() => setExpandedBlackouts(v => ({ ...v, [team.id]: !v[team.id] }))}
                            className={`flex-shrink-0 text-xs px-2 py-1 rounded border transition ${blackouts.length > 0 ? 'border-orange-300 text-orange-600 bg-orange-50 hover:bg-orange-100' : 'border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}
                            title="Team blackout dates"
                          >
                            {blackouts.length > 0 ? blackouts.length + ' Blackouts' : 'Blackouts'}
                          </button>
                          <button
                            onClick={() => removeTeam(div.id, team.id)}
                            className="text-red-400 hover:text-red-600 text-lg leading-none px-1 flex-shrink-0"
                            title="Remove team"
                          >×</button>
                        </div>

                        {/* Coaches panel */}
                        {isExpandedCoaches && (
                          <div className="border-t bg-blue-50 px-3 py-2.5 space-y-2">
                            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Coaches</p>
                            {coaches.length === 0 && (
                              <p className="text-xs text-gray-400 italic">No coaches added yet.</p>
                            )}
                            {coaches.length > 0 && (
                              <div className="space-y-1">
                                {coaches.map(coach => (
                                  <div key={coach.id} className="flex items-center gap-2 bg-white rounded border border-blue-100 px-2 py-1 flex-wrap">
                                    <select
                                      className="text-xs border-0 bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-400 rounded px-1 text-blue-700 font-semibold flex-shrink-0"
                                      value={coach.role ?? 'head'}
                                      onChange={e => updateCoach(div.id, team.id, coach.id, 'role', e.target.value)}
                                    >
                                      <option value="head">Head Coach</option>
                                      <option value="assistant">Asst. Coach</option>
                                    </select>
                                    <input
                                      className="flex-1 min-w-[80px] text-sm bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded px-1 font-medium"
                                      value={coach.name}
                                      onChange={e => updateCoach(div.id, team.id, coach.id, 'name', e.target.value)}
                                      placeholder="Name"
                                    />
                                    <input
                                      className="w-28 text-xs bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded px-1 text-gray-500"
                                      value={coach.phone}
                                      onChange={e => updateCoach(div.id, team.id, coach.id, 'phone', e.target.value)}
                                      placeholder="Phone"
                                    />
                                    <input
                                      className="w-32 text-xs bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded px-1 text-gray-500"
                                      value={coach.email}
                                      onChange={e => updateCoach(div.id, team.id, coach.id, 'email', e.target.value)}
                                      placeholder="Email"
                                    />
                                    <button onClick={() => removeCoach(div.id, team.id, coach.id)} className="text-red-400 hover:text-red-600 text-base leading-none flex-shrink-0">×</button>
                                  </div>
                                ))}
                              </div>
                            )}
                            {/* Add coach form */}
                            <div className="flex gap-2 flex-wrap items-center">
                              <select
                                className="border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white text-blue-700 font-semibold flex-shrink-0"
                                value={nc.role ?? 'head'}
                                onChange={e => setNewCoach(n => ({ ...n, [team.id]: { ...nc, role: e.target.value as 'head' | 'assistant' } }))}
                              >
                                <option value="head">Head Coach</option>
                                <option value="assistant">Asst. Coach</option>
                              </select>
                              <input
                                className="flex-1 min-w-[100px] border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                                placeholder="Coach name *"
                                value={nc.name}
                                onChange={e => setNewCoach(n => ({ ...n, [team.id]: { ...nc, name: e.target.value } }))}
                                onKeyDown={e => e.key === 'Enter' && addCoach(div.id, team.id)}
                              />
                              <input
                                className="w-28 border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                                placeholder="Phone"
                                value={nc.phone}
                                onChange={e => setNewCoach(n => ({ ...n, [team.id]: { ...nc, phone: e.target.value } }))}
                              />
                              <input
                                className="w-32 border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                                placeholder="Email"
                                value={nc.email}
                                onChange={e => setNewCoach(n => ({ ...n, [team.id]: { ...nc, email: e.target.value } }))}
                              />
                              <button
                                onClick={() => addCoach(div.id, team.id)}
                                disabled={!nc.name.trim()}
                                className="text-xs bg-blue-500 text-white px-3 py-1.5 rounded hover:bg-blue-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
                              >Add</button>
                            </div>
                          </div>
                        )}

                        {isExpandedBlackouts && (
                          <div className="border-t bg-orange-50 px-3 py-2.5 space-y-2">
                            <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide">Team Blackout Dates</p>
                            {blackouts.length === 0 && (
                              <p className="text-xs text-gray-400 italic">No blackout dates for this team yet.</p>
                            )}
                            <div className="flex flex-wrap gap-1.5">
                              {blackouts.map(entry => {
                                const [date, label] = entry.split('::')
                                const display = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                return (
                                  <span key={entry} className="inline-flex items-center gap-1 text-xs bg-white border border-orange-200 text-orange-700 px-2 py-0.5 rounded-full">
                                    {display}{label ? ` — ${label}` : ''}
                                    <button onClick={() => removeTeamBlackout(div.id, team.id, blackouts, entry)} className="text-orange-400 hover:text-red-500 leading-none ml-0.5">×</button>
                                  </span>
                                )
                              })}
                            </div>
                            <div className="flex gap-2 flex-wrap items-end">
                              <input
                                type="date"
                                className="border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
                                value={newBlackoutDate[team.id] || ''}
                                onChange={e => setNewBlackoutDate(v => ({ ...v, [team.id]: e.target.value }))}
                              />
                              <input
                                className="flex-1 min-w-[100px] border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
                                placeholder="Reason (optional)"
                                value={newBlackoutLabel[team.id] || ''}
                                onChange={e => setNewBlackoutLabel(v => ({ ...v, [team.id]: e.target.value }))}
                                onKeyDown={e => e.key === 'Enter' && addTeamBlackout(div.id, team.id, blackouts)}
                              />
                              <button
                                onClick={() => addTeamBlackout(div.id, team.id, blackouts)}
                                disabled={!newBlackoutDate[team.id]}
                                className="text-xs bg-orange-500 text-white px-3 py-1.5 rounded hover:bg-orange-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
                              >Add</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                <div className="flex gap-2">
                  <input
                    className="flex-1 border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--fd-accent)]"
                    placeholder="Team name…"
                    value={newTeam[div.id] || ''}
                    onChange={e => setNewTeam(n => ({ ...n, [div.id]: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && addTeam(div.id)}
                  />
                  <button
                    onClick={() => addTeam(div.id)}
                    disabled={teamsAtLimit}
                    className="bg-[var(--fd-accent)] text-white px-3 py-1.5 rounded text-sm hover:bg-[var(--fd-primary)] transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >Add</button>
                </div>
                {teamsAtLimit && <UpgradePrompt limitType="teams" planName={planName} />}
                <p className="text-xs text-gray-400 mt-2">{div.teams.length} team{div.teams.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
