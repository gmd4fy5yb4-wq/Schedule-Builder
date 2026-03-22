'use client'
import { useState } from 'react'
import type { AppState, Team } from '@/lib/types'

interface Props { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>> }

function uid() { return Math.random().toString(36).slice(2) }

const DIV_COLORS: Record<string, string> = {
  '6u': 'blue', '8u': 'purple', '10u': 'orange', '12u': 'red'
}
const colorClass = (id: string) => {
  const c = DIV_COLORS[id] || 'green'
  return { badge: `bg-${c}-100 text-${c}-700 border-${c}-200`, header: `border-${c}-300 bg-${c}-50` }
}

export default function DivisionsTab({ state, setState }: Props) {
  const [newTeam, setNewTeam] = useState<Record<string, string>>({})

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
      )
    }))
  }

  function updateGames(divId: string, val: number) {
    setState(s => ({
      ...s,
      divisions: s.divisions.map(d => d.id === divId ? { ...d, gamesPerTeam: val } : d)
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

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-800">Divisions &amp; Teams</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {state.divisions.map(div => {
          const cc = colorClass(div.id)
          return (
            <div key={div.id} className="bg-white rounded-lg border shadow-sm overflow-hidden">
              <div className={`px-4 py-3 border-b ${cc.header} flex items-center justify-between`}>
                <span className={`font-bold text-lg px-2 py-0.5 rounded border ${cc.badge}`}>{div.name}</span>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-600">Games/team:</span>
                  <input
                    type="number" min={1} max={50}
                    className="w-16 border rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-500"
                    value={div.gamesPerTeam}
                    onChange={e => updateGames(div.id, Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="p-4">
                {div.teams.length === 0 && (
                  <p className="text-sm text-gray-400 italic mb-3">No teams yet</p>
                )}
                <div className="space-y-2 mb-3">
                  {div.teams.map(team => (
                    <div key={team.id} className="flex items-center gap-2">
                      <input
                        className="flex-1 border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                        value={team.name}
                        onChange={e => updateTeamName(div.id, team.id, e.target.value)}
                      />
                      <button
                        onClick={() => removeTeam(div.id, team.id)}
                        className="text-red-400 hover:text-red-600 text-lg leading-none px-1"
                        title="Remove team"
                      >×</button>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <input
                    className="flex-1 border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="Team name…"
                    value={newTeam[div.id] || ''}
                    onChange={e => setNewTeam(n => ({ ...n, [div.id]: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && addTeam(div.id)}
                  />
                  <button
                    onClick={() => addTeam(div.id)}
                    className="bg-green-600 text-white px-3 py-1.5 rounded text-sm hover:bg-green-700 transition"
                  >Add</button>
                </div>

                <p className="text-xs text-gray-400 mt-2">{div.teams.length} team{div.teams.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
