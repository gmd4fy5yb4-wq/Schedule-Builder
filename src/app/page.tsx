'use client'
import { useState, useEffect, useRef } from 'react'
import type { AppState } from '@/lib/types'
import { loadLeague, loadLeagueByViewToken, saveLeague, saveSnapshot, getOrCreateViewToken } from '@/lib/sync'
import SnapshotModal from '@/components/SnapshotModal'
import SetupTab from '@/components/SetupTab'
import DivisionsTab from '@/components/DivisionsTab'
import FieldsTab from '@/components/FieldsTab'
import UmpiresTab from '@/components/UmpiresTab'
import ScheduleTab from '@/components/ScheduleTab'
import TeamScheduleTab from '@/components/TeamScheduleTab'
import FieldCalendarTab from '@/components/FieldCalendarTab'
import AutoScheduleTab from '@/components/AutoScheduleTab'
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
  // Strip legacy time slots from fields (fields are now open 8 AM–8 PM daily), preserve blackoutDates
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  s.fields = (s.fields ?? []).map((f: any) => ({ id: f.id, name: f.name, location: f.location ?? '', blackoutDates: f.blackoutDates ?? undefined }))
  // Auto-schedule state
  s.autoScheduleConflicts = s.autoScheduleConflicts ?? undefined
  s.autoSchedulePreview = s.autoSchedulePreview ?? undefined
  return s
}

const TABS = ['Setup', 'Divisions & Teams', 'Fields', 'Umpires', 'Schedule', 'Team Schedules', 'Field Calendar', 'Auto-Schedule']

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
  const [readOnly, setReadOnly] = useState(false)
  const [roLinkCopied, setRoLinkCopied] = useState(false)
  const [showSnapshots, setShowSnapshots] = useState(false)

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSyncedRef = useRef('')
  const isSavingRef = useRef(false)
  const localUserRef = useRef('Unknown')
  const viewTokenRef = useRef<string | null>(null)

  // ── Undo stack ────────────────────────────────────────────────────
  const undoStackRef = useRef<AppState[]>([])
  const isUndoingRef = useRef(false)
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [canUndo, setCanUndo] = useState(false)

  // On mount: check URL params for read-only share link, then localStorage
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const viewToken = params.get('token')
    const urlCode = params.get('code')?.toUpperCase()
    const isReadOnly = params.get('view') === 'readonly'

    if (viewToken && isReadOnly) {
      // Token-based read-only share link — never exposes the admin code
      setReadOnly(true)
      loadLeagueByViewToken(viewToken).then(result => {
        if (result) {
          const s = migrateState(result.data)
          setState(s)
          lastSyncedRef.current = JSON.stringify(s)
          setLastUpdatedBy(result.updatedBy)
          setLastUpdatedAt(result.updatedAt)
        }
        setHydrated(true)
      })
      return
    }

    if (urlCode) {
      // Legacy: code in URL — load as admin (no read-only via code anymore)
      loadLeague(urlCode).then(result => {
        if (result) {
          const s = migrateState(result.data)
          setState(s)
          lastSyncedRef.current = JSON.stringify(s)
          setLeagueCode(urlCode)
          setLastUpdatedBy(result.updatedBy)
          setLastUpdatedAt(result.updatedAt)
        }
        setHydrated(true)
      })
      return
    }

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

  // Push to undo stack on state change (debounced 1s, skipped during undo)
  useEffect(() => {
    if (!hydrated || isUndoingRef.current) return
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    undoTimerRef.current = setTimeout(() => {
      const current = JSON.stringify(state)
      const last = undoStackRef.current[undoStackRef.current.length - 1]
      if (last && JSON.stringify(last) === current) return  // no change
      undoStackRef.current = [...undoStackRef.current.slice(-19), state]
      setCanUndo(undoStackRef.current.length > 1)
    }, 1000)
    return () => { if (undoTimerRef.current) clearTimeout(undoTimerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, hydrated])

  // Auto-save on state change — debounced 800ms (skip in read-only mode)
  useEffect(() => {
    if (!hydrated || !leagueCode || readOnly) return
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
    }, readOnly ? 30000 : 5000)  // read-only viewers poll every 30s
    return () => clearInterval(poll)
  }, [leagueCode, hydrated, readOnly])

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

  function handleUndo() {
    const stack = undoStackRef.current
    if (stack.length < 2) return
    const prev = stack[stack.length - 2]
    undoStackRef.current = stack.slice(0, -1)
    setCanUndo(undoStackRef.current.length > 1)
    isUndoingRef.current = true
    setState(prev)
    setTimeout(() => { isUndoingRef.current = false }, 100)
  }

  function handleRestore(restoredState: AppState, snapshotName: string) {
    // Push current state to undo stack before restoring
    undoStackRef.current = [...undoStackRef.current.slice(-19), state]
    setCanUndo(true)
    isUndoingRef.current = true
    setState(migrateState({ ...restoredState }))
    setTimeout(() => { isUndoingRef.current = false }, 100)
    void saveSnapshot(leagueCode!, `[Auto] Before restoring "${snapshotName}"`, state, localUserRef.current)
  }

  async function copyReadOnlyLink() {
    if (!leagueCode) return
    if (!viewTokenRef.current) {
      viewTokenRef.current = await getOrCreateViewToken(leagueCode)
    }
    if (!viewTokenRef.current) { alert('Could not generate share link — check your connection.'); return }
    const url = `${window.location.origin}${window.location.pathname}?token=${viewTokenRef.current}&view=readonly`
    try {
      await navigator.clipboard.writeText(url)
      setRoLinkCopied(true)
      setTimeout(() => setRoLinkCopied(false), 2500)
    } catch {
      alert('Could not copy to clipboard. Link: ' + url)
    }
  }

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-[#00013a] flex items-center justify-center">
        <p className="text-[#b0c0e0]">Loading…</p>
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
      <header className="bg-[#00013a] text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-xl font-bold">{state.season.leagueName || 'Softball Scheduler'}</h1>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Read-only badge */}
            {readOnly && (
              <span className="bg-yellow-400 text-yellow-900 text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wide">
                View Only
              </span>
            )}

            {/* League code badge — hidden from read-only viewers */}
            {!readOnly && (
              <div className="flex items-center gap-2 bg-[#00013a] rounded-lg px-3 py-1.5">
                <span className="text-[#8898c0] text-xs font-medium">LEAGUE</span>
                <span className="font-mono font-bold tracking-widest">{leagueCode}</span>
                <button onClick={copyCode} className="text-[#8898c0] hover:text-white transition text-sm" title="Copy league code">
                  {codeCopied ? 'Copied' : 'Copy'}
                </button>
              </div>
            )}

            {/* Undo button */}
            {!readOnly && (
              <button
                onClick={handleUndo}
                disabled={!canUndo}
                className="text-xs bg-[#00013a] hover:bg-[#000128] text-[#b0c0e0] hover:text-white border border-[#8898c0] rounded-lg px-3 py-1.5 transition disabled:opacity-30 disabled:cursor-not-allowed"
                title="Undo last change"
              >
                Undo
              </button>
            )}

            {/* Snapshots button */}
            {!readOnly && (
              <button
                onClick={() => setShowSnapshots(true)}
                className="text-xs bg-[#00013a] hover:bg-[#000128] text-[#b0c0e0] hover:text-white border border-[#8898c0] rounded-lg px-3 py-1.5 transition"
                title="Save or restore a schedule snapshot"
              >
                Snapshots
              </button>
            )}

            {/* Share read-only link (admins only) */}
            {!readOnly && (
              <button
                onClick={copyReadOnlyLink}
                className="text-xs bg-[#00013a] hover:bg-[#000128] text-[#b0c0e0] hover:text-white border border-[#cd163f] rounded-lg px-3 py-1.5 transition"
                title="Copy a view-only link for coaches/parents"
              >
                {roLinkCopied ? 'Copied!' : 'Share View-Only Link'}
              </button>
            )}

            {/* Sync status */}
            {!readOnly && (
              <div className="text-xs">
                {syncStatus === 'saving' && <span className="text-[#b0c0e0] animate-pulse">Saving…</span>}
                {syncStatus === 'synced' && <span className="text-[#8898c0]">Synced</span>}
                {syncStatus === 'error' && <span className="text-red-300">Save failed — check connection</span>}
              </div>
            )}

            {/* User name + leave */}
            {!readOnly ? (
              <div className="flex items-center gap-2 text-sm text-[#b0c0e0]">
                <span>{userName}</span>
                <button
                  onClick={handleLeave}
                  className="text-[#cd163f] hover:text-white transition text-xs border border-[#cd163f] hover:border-[#cd163f] rounded px-2 py-0.5"
                  title="Leave this league"
                >
                  Leave
                </button>
              </div>
            ) : (
              <span className="text-xs text-[#8898c0]">Live schedule — auto-updates every 30s</span>
            )}
          </div>
        </div>

        {/* Last updated bar */}
        {lastUpdatedBy && (
          <div className="max-w-7xl mx-auto px-4 pb-2 text-xs text-[#8898c0]">
            Last saved by <strong className="text-[#b0c0e0]">{lastUpdatedBy}</strong>
            {timeSince && <> · {timeSince}</>}
          </div>
        )}
      </header>

      {/* Tab nav — hide setup/admin tabs in read-only mode */}
      <div className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4">
          <nav className="flex overflow-x-auto">
            {TABS.map((label, i) => {
              if (readOnly && i < 4) return null
              return (
                <button
                  key={label}
                  onClick={() => setTab(i)}
                  className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    tab === i ? 'border-[#cd163f] text-[#cd163f]' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </nav>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {tab === 0 && <SetupTab state={state} setState={setState} />}
        {tab === 1 && <DivisionsTab state={state} setState={setState} />}
        {tab === 2 && <FieldsTab state={state} setState={setState} />}
        {tab === 3 && <UmpiresTab state={state} setState={setState} />}
        {tab === 4 && <ScheduleTab state={state} setState={setState} readOnly={readOnly} />}
        {tab === 5 && <TeamScheduleTab state={state} setState={setState} readOnly={readOnly} />}
        {tab === 6 && <FieldCalendarTab state={state} setState={setState} readOnly={readOnly} />}
        {tab === 7 && <AutoScheduleTab state={state} setState={setState} />}
      </main>

      {showSnapshots && leagueCode && (
        <SnapshotModal
          leagueCode={leagueCode}
          userName={userName}
          currentState={state}
          onRestore={handleRestore}
          onClose={() => setShowSnapshots(false)}
        />
      )}
    </div>
  )
}
