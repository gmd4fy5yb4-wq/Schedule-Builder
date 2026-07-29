'use client'
import { useState } from 'react'
import type { AppState } from '@/lib/types'
import { SPORTS, getSportConfig, getSports } from '@/lib/sports'
import { THEMES } from '@/lib/themes'
import { minPaidTierForSports, getPlan, type PlanLimits, type PlanTier } from '@/lib/plans'
import type { ImportResult } from '@/lib/importCSV'
import ImportModal from './ImportModal'
import UpgradePrompt from './UpgradePrompt'
import PlanPanel from './PlanPanel'
import type { PlanPanelSubscription } from '@/lib/planUsage'

interface Props {
  state: AppState
  setState: React.Dispatch<React.SetStateAction<AppState>>
  planLimits?: Pick<PlanLimits, 'sportsLimit'> & { planTier?: string }
  sub?: PlanPanelSubscription
}

function fmtDate(s: string) {
  return new Date(s + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

export default function SetupTab({ state, setState, planLimits, sub }: Props) {
  const { season } = state
  const selectedSports = getSports(season)
  const sportsLimit = planLimits?.sportsLimit ?? 3
  const atSportsLimit = selectedSports.length >= sportsLimit
  const neededPlan = minPaidTierForSports(selectedSports.length)

  // Multi-sport selection. Mirror sports[0] into the legacy `sport` field so the
  // ~16 getSportConfig(season.sport) vocabulary sites keep reading a primary sport
  // unchanged. Always keep at least one sport selected.
  function toggleSport(id: string) {
    setState(s => {
      const cur = getSports(s.season)
      const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]
      if (next.length === 0) return s
      return { ...s, season: { ...s.season, sports: next, sport: next[0] } }
    })
  }
  const blackouts = state.blackoutDates ?? []
  const [newBlackout, setNewBlackout] = useState('')
  const [blackoutLabel, setBlackoutLabel] = useState('')
  const [showImport, setShowImport] = useState(false)

  function handleImport(result: ImportResult) {
    setState(s => ({ ...s, divisions: result.divisions, fields: result.fields, umpires: result.umpires }))
    setShowImport(false)
  }

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
      {/* Usage against the plan, where the limits are actually being spent. */}
      {sub && <PlanPanel state={state} sub={sub} />}

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800">League Setup</h2>
        <button
          onClick={() => setShowImport(true)}
          className="text-sm font-medium text-[var(--fd-primary)] border border-[var(--fd-primary)] rounded-lg px-3 py-1.5 hover:bg-[#f5f5fb] transition"
        >
          Import from CSV
        </button>
      </div>

      {/* Season config */}
      <div className="bg-white rounded-lg border p-6 space-y-4">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-sm font-medium text-gray-700">Sports</label>
            <span className="text-xs text-gray-500">
              {selectedSports.length} of {sportsLimit === 999 ? '∞' : sportsLimit} · fits{' '}
              <span className="font-semibold text-gray-700">{neededPlan.name}</span>
            </span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {SPORTS.map(s => {
              const active = selectedSports.includes(s.id)
              const disabled = !active && atSportsLimit
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleSport(s.id)}
                  disabled={disabled}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition ${
                    active
                      ? 'border-[var(--fd-primary)] bg-[#f5f5fb] text-[var(--fd-primary)] ring-1 ring-[var(--fd-primary)]'
                      : disabled
                        ? 'border-gray-100 text-gray-300 cursor-not-allowed'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {s.name}
                </button>
              )
            })}
          </div>
          {atSportsLimit && (
            <UpgradePrompt
              limitType="sports"
              planName={getPlan((planLimits?.planTier ?? 'trial') as PlanTier).name}
              planTier={planLimits?.planTier ?? 'trial'}
              neededPlanName={neededPlan.name}
            />
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Theme</label>
          <div className="flex gap-2 flex-wrap">
            {THEMES.map(t => {
              const active = (season.theme ?? 'fieldday') === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => update('theme', t.id)}
                  title={t.name}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition ${
                    active ? 'border-gray-400 shadow-sm ring-2 ring-offset-1' : 'border-gray-200 hover:border-gray-300'
                  }`}
                  style={{}}
                >
                  <span className="w-4 h-4 rounded-full flex-shrink-0 border border-white/30 shadow-sm" style={{ background: t.accent }} />
                  <span style={{ color: active ? t.accent : undefined }}>{t.name}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">League Name</label>
          <input
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--fd-accent)]"
            value={season.leagueName}
            onChange={e => update('leagueName', e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Season Start</label>
            <input
              type="date"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--fd-accent)]"
              value={season.startDate}
              onChange={e => update('startDate', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Season End</label>
            <input
              type="date"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--fd-accent)]"
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
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--fd-accent)]"
              value={season.gameDurationMinutes}
              onChange={e => update('gameDurationMinutes', Number(e.target.value))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Practice Duration (min)</label>
            <input
              type="number" min={30} max={240} step={15}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--fd-accent)]"
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
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--fd-accent)]"
              value={newBlackout}
              onChange={e => setNewBlackout(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addBlackout()}
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs text-gray-500 mb-1">Label (optional)</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--fd-accent)]"
              placeholder="e.g. Memorial Day"
              value={blackoutLabel}
              onChange={e => setBlackoutLabel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addBlackout()}
            />
          </div>
          <button
            onClick={addBlackout}
            disabled={!newBlackout}
            className="bg-[var(--fd-accent)] text-white px-4 py-2 rounded-lg text-sm hover:bg-[var(--fd-accent-hover)] transition disabled:opacity-40 disabled:cursor-not-allowed"
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
                <div key={date} className="flex items-center justify-between bg-red-50 border border-red-100 rounded-lg px-3 py-2">
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

      {showImport && (
        <ImportModal state={state} onImport={handleImport} onClose={() => setShowImport(false)} />
      )}

      {/* Getting started */}
      {(() => {
        const sc = getSportConfig(selectedSports[0])
        return (
          <div className="bg-[#f5f5fb] border border-[#eeeef6] rounded-lg p-4 text-sm text-gray-700">
            <p className="font-medium mb-1 text-gray-800">Getting started</p>
            <ol className="list-decimal list-inside space-y-1">
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
