'use client'
import { useMemo, useState } from 'react'
import type { AppState } from '@/lib/types'
import { getDivisionColor } from '@/lib/divisionColors'
import Icon from './Icon'

interface Props { state: AppState; readOnly?: boolean }

interface CoachEntry {
  /** Dedup key — email (lowercased) or name (lowercased) */
  key: string
  name: string
  phone: string
  email: string
  assignments: {
    role: 'head' | 'assistant'
    teamId: string
    teamName: string
    divisionId: string
    divisionName: string
  }[]
}

function roleBadge(role: 'head' | 'assistant') {
  return role === 'head'
    ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 whitespace-nowrap">Head Coach</span>
    : <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 whitespace-nowrap">Asst. Coach</span>
}

export default function CoachesTab({ state }: Props) {
  const [sortBy, setSortBy] = useState<'name' | 'role' | 'division'>('role')

  const allDivisions = state.divisions

  // Build grouped coach list — one entry per unique person (keyed by email or name)
  const coaches = useMemo<CoachEntry[]>(() => {
    const map = new Map<string, CoachEntry>()

    for (const div of allDivisions) {
      for (const team of div.teams) {
        for (const coach of team.coaches ?? []) {
          const key = coach.email?.trim().toLowerCase()
            ? `email:${coach.email.trim().toLowerCase()}`
            : `name:${coach.name.trim().toLowerCase()}`

          if (!map.has(key)) {
            map.set(key, { key, name: coach.name, phone: coach.phone, email: coach.email, assignments: [] })
          }
          const entry = map.get(key)!
          // Keep most complete contact info
          if (coach.phone && !entry.phone) entry.phone = coach.phone
          if (coach.email && !entry.email) entry.email = coach.email

          entry.assignments.push({
            role: coach.role ?? 'head',
            teamId: team.id,
            teamName: team.name,
            divisionId: div.id,
            divisionName: div.name,
          })
        }
      }
    }

    const list = [...map.values()]

    list.sort((a, b) => {
      if (sortBy === 'role') {
        const aIsHead = a.assignments.some(x => x.role === 'head')
        const bIsHead = b.assignments.some(x => x.role === 'head')
        if (aIsHead !== bIsHead) return aIsHead ? -1 : 1
      }
      if (sortBy === 'division') {
        const aDivs = a.assignments.map(x => x.divisionName).sort().join(',')
        const bDivs = b.assignments.map(x => x.divisionName).sort().join(',')
        const dc = aDivs.localeCompare(bDivs)
        if (dc !== 0) return dc
      }
      return a.name.localeCompare(b.name)
    })

    return list
  }, [allDivisions, sortBy])

  const totalAssignments = coaches.reduce((s, c) => s + c.assignments.length, 0)
  const headCount = coaches.filter(c => c.assignments.some(a => a.role === 'head')).length
  const multiTeamCount = coaches.filter(c => c.assignments.length > 1).length

  if (coaches.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-gray-800">Coaches</h2>
        <div className="text-center py-16 text-gray-400">
          <Icon name="users" className="w-10 h-10 mx-auto mb-3" />
          <p className="font-medium">No coaches added yet</p>
          <p className="text-sm mt-1">Go to <strong>Divisions &amp; Teams</strong> and expand a team to add coaches.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Coaches</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {coaches.length} coach{coaches.length !== 1 ? 'es' : ''} · {totalAssignments} team assignment{totalAssignments !== 1 ? 's' : ''}
            {multiTeamCount > 0 && ` · ${multiTeamCount} multi-team`}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500">Sort:</span>
          {(['role', 'name', 'division'] as const).map(s => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={`px-3 py-1 rounded-lg border text-xs font-medium transition ${sortBy === s ? 'bg-[var(--fd-primary)] text-white border-[var(--fd-primary)]' : 'text-gray-500 border-gray-200 hover:border-gray-400'}`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-lg border p-4 text-center">
          <p className="text-2xl font-bold text-gray-800">{coaches.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Total Coaches</p>
        </div>
        <div className="bg-white rounded-lg border p-4 text-center">
          <p className="text-2xl font-bold text-blue-700">{headCount}</p>
          <p className="text-xs text-gray-500 mt-0.5">Head Coaches</p>
        </div>
        <div className="bg-white rounded-lg border p-4 text-center">
          <p className="text-2xl font-bold text-gray-600">{coaches.length - headCount}</p>
          <p className="text-xs text-gray-500 mt-0.5">Assistants</p>
        </div>
      </div>

      {/* Coach table */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b text-left">
                <th className="px-4 py-2.5 font-medium text-gray-600">Coach</th>
                <th className="px-4 py-2.5 font-medium text-gray-600">Phone</th>
                <th className="px-4 py-2.5 font-medium text-gray-600">Email</th>
                <th className="px-4 py-2.5 font-medium text-gray-600">Team Assignment(s)</th>
              </tr>
            </thead>
            <tbody>
              {coaches.map(coach => {
                const isMulti = coach.assignments.length > 1
                return (
                  <tr key={coach.key} className="border-b last:border-0 hover:bg-gray-50 align-top">
                    {/* Name + role badge(s) */}
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{coach.name}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {/* Show unique roles across all assignments */}
                        {[...new Set(coach.assignments.map(a => a.role))].map(role => (
                          <span key={role}>{roleBadge(role)}</span>
                        ))}
                        {isMulti && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium whitespace-nowrap">
                            {coach.assignments.length} teams
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Phone */}
                    <td className="px-4 py-3 text-gray-600">
                      {coach.phone
                        ? <a href={`tel:${coach.phone}`} className="hover:text-[var(--fd-primary)] transition">{coach.phone}</a>
                        : <span className="text-gray-300">—</span>
                      }
                    </td>

                    {/* Email */}
                    <td className="px-4 py-3 text-gray-600">
                      {coach.email
                        ? <a href={`mailto:${coach.email}`} className="hover:text-[var(--fd-primary)] transition truncate block max-w-[180px]">{coach.email}</a>
                        : <span className="text-gray-300">—</span>
                      }
                    </td>

                    {/* Team assignments */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1.5">
                        {coach.assignments.map((a, idx) => {
                          const c = getDivisionColor(a.divisionId, allDivisions)
                          return (
                            <div key={idx} className="flex items-center gap-2 flex-wrap">
                              {coach.assignments.length > 1 && roleBadge(a.role)}
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg border ${c.bg} ${c.text} ${c.border}`}>
                                {a.divisionName}
                              </span>
                              <span className="text-sm text-gray-700">{a.teamName}</span>
                            </div>
                          )
                        })}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-2 bg-gray-50 border-t text-xs text-gray-400">
          Coaches are managed in the Divisions &amp; Teams tab under each team.
        </div>
      </div>
    </div>
  )
}
