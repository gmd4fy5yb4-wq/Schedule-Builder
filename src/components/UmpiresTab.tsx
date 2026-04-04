'use client'
import { useState } from 'react'
import type { AppState, Umpire } from '@/lib/types'
import { getSportConfig } from '@/lib/sports'

interface Props { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>> }

function uid() { return Math.random().toString(36).slice(2) }

export default function UmpiresTab({ state, setState }: Props) {
  const sc = getSportConfig(state.season.sport)
  const [form, setForm] = useState({ name: '', phone: '', email: '' })

  function add() {
    if (!form.name.trim()) return
    const u: Umpire = { id: uid(), name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim() }
    setState(s => ({ ...s, umpires: [...s.umpires, u] }))
    setForm({ name: '', phone: '', email: '' })
  }

  function remove(id: string) {
    setState(s => ({ ...s, umpires: s.umpires.filter(u => u.id !== id) }))
  }

  function update(id: string, key: keyof Umpire, value: string) {
    setState(s => ({ ...s, umpires: s.umpires.map(u => u.id === id ? { ...u, [key]: value } : u) }))
  }

  // Umpire game counts from existing schedule
  const gameCounts = new Map<string, number>()
  for (const g of state.schedule.games) {
    gameCounts.set(g.umpireId, (gameCounts.get(g.umpireId) || 0) + 1)
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-800">{sc.officialPlural} Pool</h2>
      <p className="text-sm text-gray-500">Add all {sc.officialPlural.toLowerCase()} available for the season. The scheduler will distribute games fairly across the pool.</p>

      {/* Add form */}
      <div className="bg-white rounded-lg border p-4">
        <h3 className="font-medium text-gray-700 mb-3">Add {sc.officialSingular}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            className="border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#cd163f]"
            placeholder="Name *"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && add()}
          />
          <input
            className="border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#cd163f]"
            placeholder="Phone (optional)"
            value={form.phone}
            onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
          />
          <input
            className="border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#cd163f]"
            placeholder="Email (optional)"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
          />
        </div>
        <button
          onClick={add}
          className="mt-3 bg-[#cd163f] text-white px-4 py-2 rounded text-sm hover:bg-[#00013a] transition"
        >Add {sc.officialSingular}</button>
      </div>

      {/* List */}
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
                      className="border-0 bg-transparent w-full focus:outline-none focus:ring-1 focus:ring-[#cd163f] rounded px-1"
                      value={u.name}
                      onChange={e => update(u.id, 'name', e.target.value)}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      className="border-0 bg-transparent w-full focus:outline-none focus:ring-1 focus:ring-[#cd163f] rounded px-1 text-gray-600"
                      value={u.phone}
                      onChange={e => update(u.id, 'phone', e.target.value)}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      className="border-0 bg-transparent w-full focus:outline-none focus:ring-1 focus:ring-[#cd163f] rounded px-1 text-gray-600"
                      value={u.email}
                      onChange={e => update(u.id, 'email', e.target.value)}
                    />
                  </td>
                  {state.schedule.generatedAt && (
                    <td className="px-4 py-2 text-center">
                      <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">{gameCounts.get(u.id) || 0}</span>
                    </td>
                  )}
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => remove(u.id)} className="text-red-400 hover:text-red-600">Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2 bg-gray-50 text-xs text-gray-500">{state.umpires.length} {state.umpires.length !== 1 ? sc.officialPlural.toLowerCase() : sc.officialSingular.toLowerCase()}</div>
        </div>
      )}
    </div>
  )
}
