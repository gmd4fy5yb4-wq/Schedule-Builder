'use client'
import { useState } from 'react'
import type { AppState } from '@/lib/types'
import { SPORTS, getSportConfig } from '@/lib/sports'

interface Props { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>> }

function fmtDate(s: string) {
  return new Date(s + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

export default function SetupTab({ state, setState }: Props) {
  const { season } = state
  const blackouts = state.blackoutDates ?? []
  const [newBlackout, setNewBlackout] = useState('')
  const [blackoutLabel, setBlackoutLabel] = useState('')

  function update(key: keyof typeof season, value: string | number) {
    setState(s => ({ ...s, season: { ...s.season, [key]: value } }))
  }

  function addBlackout() {
    if (!newBlackout) return
    const entry = blackoutLabel.trim() ? `${newBlackout}::${blackoutLabel.trim()}` : newBlackout
    // Prevent duplicate dates
    const existing = (state.blackoutDates ?? []).find(d => d.split('::')[0] === newBlackout)
    if (existing) { setNewBlackout(''); setBlackoutLabel(''); return }
    setState(s => ({
      ...s,
      blackoutDates: [...(s.blackoutDates ?? []), entry].sort()
    }))
    setNewBlackout('')
    setBlackoutLabel('')
  }

  function removeBlackout(date: string) {
    setState(s => ({ ...s, blackoutDates: (s.blackoutDates ?? []).filter(d => d !== date) }))
  }

  return (
    <div className="max-w-xl space-y-6">
      <h2 className="text-xl font-semibold text-gray-800">League Setup</h2>

      {/* Season config */}
      <div className="bg-white rounded-lg border p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Sport</label>
          <select
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#cd163f]"
            value={season.sport ?? 'softball'}
            onChange={e => update('sport', e.target.value)}
          >
            {SPORTS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">League Name</label>
          <input
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#cd163f]"
            value={season.leagueName}
            onChange={e => update('leagueName', e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Season Start</label>
            <input
              type="date"
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#cd163f]"
              value={season.startDate}
              onChange={e => update('startDate', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Season End</label>
            <input
              type="date"
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#cd163f]"
              value={season.endDate}
              onChange={e => update('endDate', e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Game Duration (min)</label>
            <input
              type="number" min={30} max={240} step={15}
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#cd163f]"
              value={season.gameDurationMinutes}
              onChange={e => update('gameDurationMinutes', Number(e.target.value))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Practice Duration (min)</label>
            <input
              type="number" min={30} max={240} step={15}
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#cd163f]"
              value={season.practiceDurationMinutes}
              onChange={e => update('practiceDurationMinutes', Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      {/* Blackout dates */}
      <div className="bg-white rounded-lg border p-6 space-y-4">
        <div>
          <h3 className="font-medium text-gray-800">Blackout Dates</h3>
          <p className="text-xs text-gray-500 mt-0.5">No games or practices will be scheduled on these dates (holidays, field closures, etc.)</p>
        </div>

        {/* Add blackout */}
        <div className="flex gap-2 flex-wrap items-end">
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs text-gray-500 mb-1">Date</label>
            <input
              type="date"
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
              value={newBlackout}
              onChange={e => setNewBlackout(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addBlackout()}
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs text-gray-500 mb-1">Label (optional)</label>
            <input
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
              placeholder="e.g. Memorial Day"
              value={blackoutLabel}
              onChange={e => setBlackoutLabel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addBlackout()}
            />
          </div>
          <button
            onClick={addBlackout}
            disabled={!newBlackout}
            className="bg-red-500 text-white px-4 py-2 rounded text-sm hover:bg-red-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            + Add
          </button>
        </div>

        {/* List */}
        {blackouts.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No blackout dates set.</p>
        ) : (
          <div className="space-y-1">
            {blackouts.map(date => {
              // Labels stored as "date::label" or just "date"
              const [d, label] = date.includes('::') ? date.split('::') : [date, '']
              return (
                <div key={date} className="flex items-center justify-between bg-red-50 border border-red-100 rounded px-3 py-2">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-red-800">{fmtDate(d)}</span>
                    {label && <span className="text-xs text-red-500">{label}</span>}
                  </div>
                  <button
                    onClick={() => removeBlackout(date)}
                    className="text-red-400 hover:text-red-600 text-sm"
                  >Remove</button>
                </div>
              )
            })}
          </div>
        )}

        {blackouts.length > 0 && (
          <p className="text-xs text-gray-400">{blackouts.length} blackout date{blackouts.length !== 1 ? 's' : ''} — regenerate the schedule to apply changes.</p>
        )}
      </div>

      {/* Getting started */}
      {(() => {
        const sc = getSportConfig(season.sport)
        return (
          <div className="bg-[#f5f5fb] border border-[#eeeef6] rounded-lg p-4 text-sm text-green-800">
            <p className="font-medium mb-1">Getting started</p>
            <ol className="list-decimal list-inside space-y-1 text-[#cd163f]">
              <li>Fill in season dates and game duration here</li>
              <li>Add blackout dates for holidays or field closures</li>
              <li>Add teams to each division in <strong>Divisions &amp; Teams</strong></li>
              <li>Add {sc.venuePlural.toLowerCase()} in <strong>{sc.venuePlural}</strong></li>
              <li>Add {sc.officialPlural.toLowerCase()} in <strong>{sc.officialPlural}</strong></li>
              <li>Generate and export your schedule in <strong>Schedule</strong></li>
            </ol>
          </div>
        )
      })()}
    </div>
  )
}
