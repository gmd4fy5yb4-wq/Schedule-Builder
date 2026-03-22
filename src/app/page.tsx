'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import type { AppState } from '@/lib/types'
import { loadLeague, saveLeague } from '@/lib/sync'
import SetupTab from '@/components/SetupTab'
import DivisionsTab from '@/components/DivisionsTab'
import FieldsTab from '@/components/FieldsTab'
import UmpiresTab from '@/components/UmpiresTab'
import ScheduleTab from '@/components/ScheduleTab'
import TeamScheduleTab from '@/components/TeamScheduleTab'
import LeagueGate from '@/components/LeagueGate'

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

function migrateState(s: AppState): AppState {
  if (s.schedule) {
    s.schedule.games = (s.schedule.games ?? []).map(g => ({ ...g, durationMinutes: g.durationMinutes ?? 90 }))
    s.schedule.practices = (s.schedule.practices ?? []).map(p => ({ ...p, durationMinutes: p.durationMinutes ?? 90 }))
  }
  s.blackoutDates = s.blackoutDates ?? []
  return s
}

const TABS = [
  { label: 'Setup', icon: '⚙️' },
  { label: 'Divisions & Teams', icon: '👥' },
  { label: 'Fields', icon: '🏟️' },
  { label: 'Umpires', icon: '👮' },
  { label: 'Schedule', icon: '📅' },
  { label: 'Team Schedules', icon: '🏅' },
]

type SyncStatus = 'synced' | 'saving' | 'error'

export default function Home() {
  const [state, setState] = useState<AppState>(DEFAULT)
  const [tab, setTab] = useState(0)
  const [hydrated, setHydrated] = useState(false)
  const [leagueCode, setLeagueCode] = useState<string | null>(null)
  const [userName, setUserName] = useState('Unknown')
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced')
  const [lastUpdatedBy, setLastUpdatedBy] = useState('')
  const [lastUpdatedAt, setLastUpdatedAt] = useState('')
  const [codeCopied, setCodeCopied] = useState(false)

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSyncedRef = useRef('') // JSON of last confirmed-synced state
  const isSavingRef = useRef(false)
  const localUserRef = useRef('Unknown')

  // On mount: check localStorage for saved league code
  useEffect(() => {
    const code = localStorage.getItem('sb-league-code')
    const name = localStorage.getItem('sb-user-name')
    if (code && name) {
      localUserRef.current = name
      setLeagueCode(code)
      setUserName(name)
      loadLeague(code).then(result => {
        if (result) {
          const s = migrateState(result.data)
          setState(s)
          lastSyncedRef.current = JSON.stringify(s)
          setLastUpdatedBy(result.updatedBy)
          setLastUpdatedAt(result.updatedAt)
        }
        setHydrated(true)
      })
    } else {
      setHydrated(true)
    }
  }, [])

  // Auto-save on state change — debounced 800ms
  useEffect(() => {
    if (!hydrated || !leagueCode) return
    const current = JSON.stringify(state)
    if (current === lastSyncedRef.current) return

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    setSyncStatus('saving')
    saveTimerRef.current = setTimeout(async () => {
      if (isSavingRef.current) return
      isSavingRef.current = true
      const ok = await saveLeague(leagueCode, state, localUserRef.current)
      if (ok) {
        lastSyncedRef.current = current
        setSyncStatus('synced')
      } else {
        setSyncStatus('error')
      }
      isSavingRef.current = false
    }, 800)

    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [state, hydrated, leagueCode])

  // Poll for remote changes every 5 seconds
  useEffect(() => {
    if (!leagueCode || !hydrated) return
    const poll = setInterval(async () => {
      if (isSavingRef.current) return // skip if mid-save
      const result = await loadLeague(leagueCode)
      if (!result) return
      const remote = JSON.stringify(result.data)
      if (remote !== lastSyncedRef.current) {
        // Someone else made a change — pull it in
        const s = migrateState(result.data)
        setState(s)
        lastSyncedRef.current = JSON.stringify(s)
        setLastUpdatedBy(result.updatedBy)
        setLastUpdatedAt(result.updatedAt)
        setSyncStatus('synced')
      }
    }, 5000)
    return () => clearInterval(poll)
  }, [leagueCode, hydrated])

  function handleJoin(code: string, data: AppState, name: string) {
    localStorage.setItem('sb-league-code', code)
    localStorage.setItem('sb-user-name', name)
    localUserRef.current = name
    const s = migrateState(data)
    setState(s)
    lastSyncedRef.current = JSON.stringify(s)
    setLeagueCode(code)
    setUserName(name)
    setHydrated(true)
  }

  function handleLeave() {
    localStorage.removeItem('sb-league-code')
    localStorage.removeItem('sb-user-name')
    setLeagueCode(null)
    setState(DEFAULT)
    lastSyncedRef.current = ''
  }

  function copyCode() {
    if (!leagueCode) return
    navigator.clipboard.writeText(leagueCode)
    setCodeCopied(true)
    setTimeout(() => setCodeCopied(false), 2000)
  }

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-green-700 flex items-center justify-center">
        <div className="text-white text-center">
          <div className="text-5xl mb-4">⚾</div>
          <p className="text-green-200">Loading…</p>
        </div>
      </div>
    )
  }

  if (!leagueCode) {
    return <LeagueGate defaultState={DEFAULT} onJoin={handleJoin} />
  }

  const timeSince = lastUpdatedAt
    ? new Date(lastUpdatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : ''

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-green-700 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-xl font-bold">⚾ {state.season.leagueName || 'Softball Scheduler'}</h1>

          <div className="flex items-center gap-3 flex-wrap">
            {/* League code badge */}
            <div className="flex items-center gap-2 bg-green-800 rounded-lg px-3 py-1.5">
              <span className="text-green-300 text-xs font-medium">LEAGUE</span>
              <span className="font-mono font-bold tracking-widest">{leagueCode}</span>
              <button onClick={copyCode} className="text-green-300 hover:text-white transition text-sm" title="Copy code">
                {codeCopied ? '✓' : '📋'}
              </button>
            </div>

            {/* Sync status */}
            <div className="text-xs">
              {syncStatus === 'saving' && <span className="text-green-200 animate-pulse">💾 Saving…</span>}
              {syncStatus === 'synced' && <span className="text-green-300">✓ Synced</span>}
              {syncStatus === 'error' && <span className="text-red-300">⚠ Save failed — check connection</span>}
            </div>

            {/* User name + leave */}
            <div className="flex items-center gap-2 text-sm text-green-200">
              <span>👤 {userName}</span>
              <button
                onClick={handleLeave}
                className="text-green-400 hover:text-white transition text-xs border border-green-600 hover:border-green-400 rounded px-2 py-0.5"
                title="Leave this league"
              >
                Leave
              </button>
            </div>
          </div>
        </div>

        {/* Last updated bar */}
        {lastUpdatedBy && (
          <div className="max-w-7xl mx-auto px-4 pb-2 text-xs text-green-300">
            Last saved by <strong className="text-green-200">{lastUpdatedBy}</strong>
            {timeSince && <> · {timeSince}</>}
          </div>
        )}
      </header>

      {/* Tab nav */}
      <div className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4">
          <nav className="flex overflow-x-auto">
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
