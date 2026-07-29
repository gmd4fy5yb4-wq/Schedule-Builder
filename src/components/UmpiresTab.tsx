'use client'
import { useState } from 'react'
import type { AppState, Umpire, FieldStaffMember } from '@/lib/types'
import { getSportConfig } from '@/lib/sports'

interface Props { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>> }

function uid() { return Math.random().toString(36).slice(2) }

const ROLES = ['Concessions', 'Scorer', 'Groundskeeper', 'Announcer', 'First Aid', 'Photographer', 'Volunteer', 'Other']

export default function UmpiresTab({ state, setState }: Props) {
  const sc = getSportConfig(state.season.sport)
  const [umpireForm, setUmpireForm] = useState({ name: '', phone: '', email: '' })
  const [staffForm, setStaffForm] = useState({ name: '', role: 'Concessions', phone: '', email: '' })

  // ── Umpire actions ────────────────────────────────────────────────
  function addUmpire() {
    if (!umpireForm.name.trim()) return
    const u: Umpire = { id: uid(), name: umpireForm.name.trim(), phone: umpireForm.phone.trim(), email: umpireForm.email.trim() }
    setState(s => ({ ...s, umpires: [...s.umpires, u] }))
    setUmpireForm({ name: '', phone: '', email: '' })
  }

  function removeUmpire(id: string) {
    setState(s => ({ ...s, umpires: s.umpires.filter(u => u.id !== id) }))
  }

  function updateUmpire(id: string, key: keyof Umpire, value: string) {
    setState(s => ({ ...s, umpires: s.umpires.map(u => u.id === id ? { ...u, [key]: value } : u) }))
  }

  // ── Field staff actions ───────────────────────────────────────────
  const fieldStaff = state.fieldStaff ?? []

  function addStaff() {
    if (!staffForm.name.trim()) return
    const m: FieldStaffMember = { id: uid(), name: staffForm.name.trim(), role: staffForm.role, phone: staffForm.phone.trim(), email: staffForm.email.trim() }
    setState(s => ({ ...s, fieldStaff: [...(s.fieldStaff ?? []), m] }))
    setStaffForm({ name: '', role: 'Concessions', phone: '', email: '' })
  }

  function removeStaff(id: string) {
    setState(s => ({ ...s, fieldStaff: (s.fieldStaff ?? []).filter(m => m.id !== id) }))
  }

  function updateStaff(id: string, key: keyof FieldStaffMember, value: string) {
    setState(s => ({ ...s, fieldStaff: (s.fieldStaff ?? []).map(m => m.id === id ? { ...m, [key]: value } : m) }))
  }

  // Umpire game counts
  const gameCounts = new Map<string, number>()
  for (const g of state.schedule.games) {
    gameCounts.set(g.umpireId, (gameCounts.get(g.umpireId) || 0) + 1)
  }

  return (
    <div className="space-y-8">

      {/* ── UMPIRES ── */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">{sc.officialPlural} Pool</h2>
          <p className="text-sm text-gray-500 mt-1">Add all {sc.officialPlural.toLowerCase()} available for the season. The scheduler will distribute games fairly across the pool.</p>
        </div>

        {/* Add umpire form */}
        <div className="bg-white rounded-lg border p-4">
          <h3 className="font-medium text-gray-700 mb-3">Add {sc.officialSingular}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--fd-accent)]"
              placeholder="Name *"
              value={umpireForm.name}
              onChange={e => setUmpireForm(f => ({ ...f, name: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && addUmpire()}
            />
            <input
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--fd-accent)]"
              placeholder="Phone (optional)"
              value={umpireForm.phone}
              onChange={e => setUmpireForm(f => ({ ...f, phone: e.target.value }))}
            />
            <input
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--fd-accent)]"
              placeholder="Email (optional)"
              value={umpireForm.email}
              onChange={e => setUmpireForm(f => ({ ...f, email: e.target.value }))}
            />
          </div>
          <button
            onClick={addUmpire}
            className="mt-3 bg-[var(--fd-primary)] text-white px-4 py-2 rounded-lg text-sm hover:bg-[var(--fd-primary-dark)] transition"
          >Add {sc.officialSingular}</button>
        </div>

        {/* Umpire list */}
        {state.umpires.length === 0 && <p className="text-sm text-gray-400 italic">No {sc.officialPlural.toLowerCase()} added yet.</p>}
        {state.umpires.length > 0 && (
          <div className="bg-white rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b text-left">
                  <th className="px-4 py-2 font-medium text-gray-600">Name</th>
                  <th className="px-4 py-2 font-medium text-gray-600">Phone</th>
                  <th className="px-4 py-2 font-medium text-gray-600">Email</th>
                  {state.schedule.generatedAt && <th className="px-4 py-2 font-medium text-gray-600">Games</th>}
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {state.umpires.map(u => (
                  <tr key={u.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <input
                        className="border-0 bg-transparent w-full focus:outline-none focus:ring-1 focus:ring-[var(--fd-accent)] rounded-lg px-1"
                        value={u.name}
                        onChange={e => updateUmpire(u.id, 'name', e.target.value)}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        className="border-0 bg-transparent w-full focus:outline-none focus:ring-1 focus:ring-[var(--fd-accent)] rounded-lg px-1 text-gray-600"
                        value={u.phone}
                        onChange={e => updateUmpire(u.id, 'phone', e.target.value)}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        className="border-0 bg-transparent w-full focus:outline-none focus:ring-1 focus:ring-[var(--fd-accent)] rounded-lg px-1 text-gray-600"
                        value={u.email}
                        onChange={e => updateUmpire(u.id, 'email', e.target.value)}
                      />
                    </td>
                    {state.schedule.generatedAt && (
                      <td className="px-4 py-2 text-center">
                        <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">{gameCounts.get(u.id) || 0}</span>
                      </td>
                    )}
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => removeUmpire(u.id)} className="text-red-400 hover:text-red-600">Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2 bg-gray-50 text-xs text-gray-500">{state.umpires.length} {state.umpires.length !== 1 ? sc.officialPlural.toLowerCase() : sc.officialSingular.toLowerCase()}</div>
          </div>
        )}
      </div>

      {/* ── FIELD STAFF ── */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-gray-800">Field Staff</h2>
            <p className="text-sm text-gray-500 mt-1">Concession workers, scorers, groundskeepers, and other game-day staff.</p>
          </div>
          {fieldStaff.length > 0 && (
            <span className="text-sm text-gray-400">{fieldStaff.length} staff member{fieldStaff.length !== 1 ? 's' : ''}</span>
          )}
        </div>

        {/* Add staff form */}
        <div className="bg-white rounded-lg border p-4">
          <h3 className="font-medium text-gray-700 mb-3">Add Staff Member</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <input
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--fd-accent)]"
              placeholder="Name *"
              value={staffForm.name}
              onChange={e => setStaffForm(f => ({ ...f, name: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && addStaff()}
            />
            <select
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--fd-accent)] bg-white"
              value={staffForm.role}
              onChange={e => setStaffForm(f => ({ ...f, role: e.target.value }))}
            >
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <input
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--fd-accent)]"
              placeholder="Phone (optional)"
              value={staffForm.phone}
              onChange={e => setStaffForm(f => ({ ...f, phone: e.target.value }))}
            />
            <input
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--fd-accent)]"
              placeholder="Email (optional)"
              value={staffForm.email}
              onChange={e => setStaffForm(f => ({ ...f, email: e.target.value }))}
            />
          </div>
          <button
            onClick={addStaff}
            className="mt-3 bg-[var(--fd-primary)] text-white px-4 py-2 rounded-lg text-sm hover:bg-[var(--fd-primary-dark)] transition"
          >Add Staff Member</button>
        </div>

        {/* Staff list */}
        {fieldStaff.length === 0 && <p className="text-sm text-gray-400 italic">No field staff added yet.</p>}
        {fieldStaff.length > 0 && (
          <div className="bg-white rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b text-left">
                  <th className="px-4 py-2 font-medium text-gray-600">Name</th>
                  <th className="px-4 py-2 font-medium text-gray-600">Role</th>
                  <th className="px-4 py-2 font-medium text-gray-600">Phone</th>
                  <th className="px-4 py-2 font-medium text-gray-600">Email</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {fieldStaff.map(m => (
                  <tr key={m.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <input
                        className="border-0 bg-transparent w-full focus:outline-none focus:ring-1 focus:ring-[var(--fd-accent)] rounded-lg px-1 font-medium"
                        value={m.name}
                        onChange={e => updateStaff(m.id, 'name', e.target.value)}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <select
                        className="border-0 bg-transparent focus:outline-none focus:ring-1 focus:ring-[var(--fd-accent)] rounded-lg px-1 text-gray-600 text-sm"
                        value={m.role}
                        onChange={e => updateStaff(m.id, 'role', e.target.value)}
                      >
                        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                        {/* Keep custom role if it's not in the preset list */}
                        {!ROLES.includes(m.role) && <option value={m.role}>{m.role}</option>}
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <input
                        className="border-0 bg-transparent w-full focus:outline-none focus:ring-1 focus:ring-[var(--fd-accent)] rounded-lg px-1 text-gray-600"
                        value={m.phone}
                        onChange={e => updateStaff(m.id, 'phone', e.target.value)}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        className="border-0 bg-transparent w-full focus:outline-none focus:ring-1 focus:ring-[var(--fd-accent)] rounded-lg px-1 text-gray-600"
                        value={m.email}
                        onChange={e => updateStaff(m.id, 'email', e.target.value)}
                      />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => removeStaff(m.id)} className="text-red-400 hover:text-red-600">Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Role summary */}
            <div className="px-4 py-2 bg-gray-50 text-xs text-gray-500 flex flex-wrap gap-3">
              {Array.from(new Set(fieldStaff.map(m => m.role))).sort().map(role => {
                const count = fieldStaff.filter(m => m.role === role).length
                return <span key={role}>{role}: <strong>{count}</strong></span>
              })}
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
