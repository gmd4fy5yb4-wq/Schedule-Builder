'use client'
import { useState, useEffect } from 'react'
import type { AppState } from '@/lib/types'
import SetupTab from '@/components/SetupTab'
import DivisionsTab from '@/components/DivisionsTab'
import FieldsTab from '@/components/FieldsTab'
import UmpiresTab from '@/components/UmpiresTab'
import ScheduleTab from '@/components/ScheduleTab'
import TeamScheduleTab from '@/components/TeamScheduleTab'

const DEFAULT: AppState = {
  season: { leagueName: 'My Softball League', startDate: '', endDate: '', gameDurationMinutes: 90, practiceDurationMinutes: 90 },
  divisions: [
    { id: '6u', name: '6U', teams: [], gamesPerTeam: 10 },
    { id: '8u', name: '8U', teams: [], gamesPerTeam: 10 },
    { id: '10u', name: '10U', teams: [], gamesPerTeam: 10 },
    { id: '12u', name: '12U', teams: [], gamesPerTeam: 10 },
  ],
  blackoutDates: [],
  fields: [],
  umpires: [],
  schedule: { games: [], practices: [], generatedAt: null, warnings: [] },
}

const TABS = [
  { label: 'Setup', icon: '⚙️' },
  { label: 'Divisions & Teams', icon: '👥' },
  { label: 'Fields', icon: '🏟️' },
  { label: 'Umpires', icon: '👮' },
  { label: 'Schedule', icon: '📅' },
  { label: 'Team Schedules', icon: '🏅' },
]

export default function Home() {
  const [state, setState] = useState<AppState>(DEFAULT)
  const [tab, setTab] = useState(0)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem('softball-v2') ?? localStorage.getItem('softball-v1')
      if (raw) {
        const saved = JSON.parse(raw) as AppState
        // Migrate: ensure durationMinutes exists on all existing events
        if (saved.schedule) {
          saved.schedule.games = (saved.schedule.games ?? []).map(g => ({
            ...g, durationMinutes: g.durationMinutes ?? saved.season?.gameDurationMinutes ?? 90
          }))
          saved.schedule.practices = (saved.schedule.practices ?? []).map(p => ({
            ...p, durationMinutes: p.durationMinutes ?? saved.season?.practiceDurationMinutes ?? 90
          }))
        }
        saved.blackoutDates = saved.blackoutDates ?? []
        setState(saved)
      }
    } catch {}
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (hydrated) localStorage.setItem('softball-v2', JSON.stringify(state))
  }, [state, hydrated])

  if (!hydrated) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-green-700 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold">⚾ {state.season.leagueName || 'Softball Scheduler'}</h1>
          <span className="text-green-200 text-sm">
            {state.schedule.generatedAt ? `Schedule generated ${new Date(state.schedule.generatedAt).toLocaleDateString()}` : 'No schedule yet'}
          </span>
        </div>
      </header>

      <div className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4">
          <nav className="flex">
            {TABS.map((t, i) => (
              <button
                key={t.label}
                onClick={() => setTab(i)}
                className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  tab === i ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {tab === 0 && <SetupTab state={state} setState={setState} />}
        {tab === 1 && <DivisionsTab state={state} setState={setState} />}
        {tab === 2 && <FieldsTab state={state} setState={setState} />}
        {tab === 3 && <UmpiresTab state={state} setState={setState} />}
        {tab === 4 && <ScheduleTab state={state} setState={setState} />}
        {tab === 5 && <TeamScheduleTab state={state} />}
      </main>
    </div>
  )
}
