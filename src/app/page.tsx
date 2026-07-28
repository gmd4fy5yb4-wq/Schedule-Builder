'use client'
import { useState, useEffect, useRef } from 'react'
import type { AppState } from '@/lib/types'
import { getSportConfig } from '@/lib/sports'
import { getTheme, buildThemeVars } from '@/lib/themes'
import { loadLeague, loadLeagueByViewToken, saveLeague, saveSnapshot, getOrCreateViewToken } from '@/lib/sync'
import { getSupabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'
import SnapshotModal from '@/components/SnapshotModal'
import SetupTab from '@/components/SetupTab'
import DivisionsTab from '@/components/DivisionsTab'
import FieldsTab from '@/components/FieldsTab'
import UmpiresTab from '@/components/UmpiresTab'
import ScheduleTab from '@/components/ScheduleTab'
import TeamScheduleTab from '@/components/TeamScheduleTab'
import FieldCalendarTab from '@/components/FieldCalendarTab'
import AutoScheduleTab from '@/components/AutoScheduleTab'
import StandingsTab from '@/components/StandingsTab'
import CoachesTab from '@/components/CoachesTab'
import LinkedCalendarsTab from '@/components/LinkedCalendarsTab'
import DashboardTab from '@/components/DashboardTab'
import LeagueGate from '@/components/LeagueGate'

const DEFAULT: AppState = {
  season: { leagueName: 'My League', sport: 'softball', startDate: '', endDate: '', gameDurationMinutes: 90, practiceDurationMinutes: 90 },
  divisions: [],
  blackoutDates: [],
  fields: [],
  umpires: [],
  fieldStaff: [],
  schedule: { games: [], practices: [], specialEvents: [], generatedAt: null, warnings: [] },
}

/**
 * Key-order-stable JSON stringify.
 * PostgreSQL JSONB stores object keys in sorted order, so naïve JSON.stringify
 * of a locally-built object produces a DIFFERENT string than JSON.stringify of
 * the same data returned from Supabase — causing the poll to see a false
 * "remote change" after every save and overwrite unsaved local edits.
 * Using stableStringify on both sides eliminates this class of false positives.
 */
function stableStringify(val: unknown): string {
  if (val === null || typeof val !== 'object') return JSON.stringify(val)
  if (Array.isArray(val)) return '[' + (val as unknown[]).map(stableStringify).join(',') + ']'
  const obj = val as Record<string, unknown>
  const keys = Object.keys(obj).filter(k => obj[k] !== undefined).sort()
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}'
}

function migrateState(s: AppState): AppState {
  if (s.schedule) {
    s.schedule.games = (s.schedule.games ?? []).map(g => ({ ...g, durationMinutes: g.durationMinutes ?? 90 }))
    s.schedule.practices = (s.schedule.practices ?? []).map(p => ({ ...p, durationMinutes: p.durationMinutes ?? 90 }))
    s.schedule.specialEvents = s.schedule.specialEvents ?? []
  }
  s.season.sport = s.season.sport ?? 'softball'
  s.blackoutDates = s.blackoutDates ?? []
  // Strip legacy time slots from fields (fields are now open 8 AM–8 PM daily), preserve blackoutDates + geocoords
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  s.fields = (s.fields ?? []).map((f: any) => ({ id: f.id, name: f.name, location: f.location ?? '', address: f.address ?? '', blackoutDates: f.blackoutDates ?? undefined, geocoords: f.geocoords ?? undefined }))
  // Field staff (added later — default to empty array for old leagues)
  s.fieldStaff = s.fieldStaff ?? []
  // Auto-schedule state
  s.autoScheduleConflicts = s.autoScheduleConflicts ?? undefined
  s.autoSchedulePreview = s.autoSchedulePreview ?? undefined
  return s
}

/**
 * Save an auto-snapshot at the start of each admin session, rate-limited to
 * once per 8 hours per league per device. This gives a rolling recovery point
 * if data is accidentally lost or overwritten.
 */
function maybeAutoSnapshot(code: string, state: AppState, userName: string) {
  const key = `sb-auto-snap-${code}`
  const last = parseInt(localStorage.getItem(key) ?? '0', 10)
  const EIGHT_HOURS = 8 * 60 * 60 * 1000
  if (Date.now() - last < EIGHT_HOURS) return
  localStorage.setItem(key, String(Date.now()))
  const label = new Date().toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
  void saveSnapshot(code, `[Auto] ${label}`, state, userName)
}

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
  const [viewTokenError, setViewTokenError] = useState(false)
  const [roLinkCopied, setRoLinkCopied] = useState(false)
  const [showSnapshots, setShowSnapshots] = useState(false)
  const [pendingRemote, setPendingRemote] = useState<{ data: AppState; updatedBy: string; updatedAt: string } | null>(null)

  const [user, setUser] = useState<User | null>(null)
  const [planLimits, setPlanLimits] = useState<{ sportsLimit: number; divisionsLimit: number; teamsLimit: number; planTier: string } | null>(null)

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSyncedRef = useRef('')
  const isSavingRef = useRef(false)
  const localUserRef = useRef('Unknown')
  const viewTokenRef = useRef<string | null>(null)       // token generated by owner for sharing
  const roTokenRef   = useRef<string | null>(null)       // token this session is viewing (read-only)

  // ── Undo stack ────────────────────────────────────────────────────
  const undoStackRef = useRef<AppState[]>([])
  const isUndoingRef = useRef(false)
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [canUndo, setCanUndo] = useState(false)

  // On mount: check URL params for read-only share link, then localStorage
  useEffect(() => {
    // After a magic-link login the auth callback drops us at '/'.
    // If the login page saved a ?next= destination, navigate there now so the
    // user lands on the right league instead of whatever localStorage holds.
    const loginNext = localStorage.getItem('sb-login-next')
    if (loginNext) {
      localStorage.removeItem('sb-login-next')
      // Only navigate if the destination differs from the current URL
      if (loginNext !== window.location.pathname + window.location.search) {
        window.location.replace(loginNext)
        return
      }
    }

    const params = new URLSearchParams(window.location.search)
    const viewToken = params.get('token')
    const urlCode = params.get('code')?.toUpperCase()
    const isReadOnly = params.get('view') === 'readonly'

    if (viewToken) {
      // Token-based read-only share link — never exposes the admin code
      // Note: we don't require `&view=readonly` here because messaging apps
      // and clipboard tools sometimes strip query params. The token alone is
      // sufficient to identify a view-only link.
      setReadOnly(true)
      roTokenRef.current = viewToken
      loadLeagueByViewToken(viewToken).then(result => {
        if (result) {
          const s = migrateState(result.data)
          setState(s)
          lastSyncedRef.current = stableStringify(s)
          setLastUpdatedBy(result.updatedBy)
          setLastUpdatedAt(result.updatedAt)
          setLeagueCode('VIEW')  // sentinel: lets the render gate pass, no saves possible in readOnly mode
        } else {
          setViewTokenError(true)
        }
        setHydrated(true)
      })
      return
    }

    // Flush any state that was saved to localStorage on the previous tab close
    // (beforeunload backup). Run this before loading so Supabase gets the latest.
    async function flushUnloadBackup(code: string, userName: string) {
      const key = `fd-unload-${code}`
      const raw = localStorage.getItem(key)
      if (!raw) return
      localStorage.removeItem(key)   // always clear, even if flush fails
      try {
        const { state: pending, userName: u, at } = JSON.parse(raw) as {
          state: AppState; userName: string; at: number
        }
        // Only flush if written within the last 30 minutes (stale after that)
        if (Date.now() - at < 30 * 60 * 1000) {
          await saveLeague(code, pending, u || userName)
        }
      } catch { /* ignore parse/save errors */ }
    }

    if (urlCode) {
      // Legacy: code in URL — load as admin (no read-only via code anymore)
      flushUnloadBackup(urlCode, 'Admin').then(() =>
        loadLeague(urlCode).then(result => {
          if (result) {
            const s = migrateState(result.data)
            setState(s)
            lastSyncedRef.current = stableStringify(s)
            setLeagueCode(urlCode)
            setLastUpdatedBy(result.updatedBy)
            setLastUpdatedAt(result.updatedAt)
            maybeAutoSnapshot(urlCode, s, 'Admin')
          }
          setHydrated(true)
        })
      )
      return
    }

    const code = localStorage.getItem('sb-league-code')
    const name = localStorage.getItem('sb-user-name')
    if (code && name) {
      localUserRef.current = name
      setLeagueCode(code)
      setUserName(name)
      flushUnloadBackup(code, name).then(() =>
        loadLeague(code).then(result => {
          if (result) {
            const s = migrateState(result.data)
            setState(s)
            lastSyncedRef.current = stableStringify(s)
            setLastUpdatedBy(result.updatedBy)
            setLastUpdatedAt(result.updatedAt)
            maybeAutoSnapshot(code, s, name)
          }
          setHydrated(true)
        })
      )
    } else {
      setHydrated(true)
    }
  }, [])

  // Track auth state
  useEffect(() => {
    const sb = getSupabase()
    sb.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        const { data: sub } = await sb
          .from('user_subscriptions')
          .select('sports_limit, divisions_limit, teams_limit, plan_tier')
          .eq('user_id', session.user.id)
          .single()
        if (sub) setPlanLimits({ sportsLimit: sub.sports_limit, divisionsLimit: sub.divisions_limit, teamsLimit: sub.teams_limit, planTier: sub.plan_tier })
      }
    })
    const { data: { subscription } } = sb.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
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
    const current = stableStringify(state)
    if (current === lastSyncedRef.current) return

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    setSyncStatus('saving')

    // Capture the code so the closure doesn't go stale if leagueCode changes.
    // leagueCode is guaranteed non-null here (checked above).
    const codeAtSchedule = leagueCode as string

    async function doSave() {
      if (isSavingRef.current) {
        // Another save is in flight — retry in 1 s so we don't silently drop this state
        saveTimerRef.current = setTimeout(doSave, 1000)
        return
      }
      isSavingRef.current = true
      try {
        const result = await saveLeague(codeAtSchedule, state, localUserRef.current)
        if (result.success) {
          lastSyncedRef.current = current
          setSyncStatus('synced')
        } else {
          setSyncStatus('error')
        }
      } catch {
        // Network error — don't leave isSavingRef stuck true (would block all future saves)
        setSyncStatus('error')
      } finally {
        isSavingRef.current = false
      }
    }

    saveTimerRef.current = setTimeout(doSave, 800)

    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, hydrated, leagueCode])

  // Flush any unsaved changes before the page unloads.
  // Strategy: always write to localStorage as a reliable backup (no size limit),
  // AND attempt a keepalive fetch (fast path, works for smaller states < 64 KB).
  // The localStorage backup is flushed to Supabase on the next app load.
  useEffect(() => {
    function handleBeforeUnload() {
      if (!leagueCode || readOnly) return
      const current = stableStringify(state)
      if (current === lastSyncedRef.current) return   // nothing new to save

      // Reliable backup — no size limit, survives any tab close
      try {
        localStorage.setItem(
          `fd-unload-${leagueCode}`,
          JSON.stringify({ state, userName: localUserRef.current, at: Date.now() })
        )
      } catch { /* ignore quota errors */ }

      // Fast path — keepalive fetch (may silently fail if body > 64 KB)
      fetch('/api/leagues/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: leagueCode, state, userName: localUserRef.current }),
        keepalive: true,
      })
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [state, leagueCode, readOnly])

  // Eagerly pre-generate the view token so the clipboard write in copyReadOnlyLink()
  // is synchronous on the first click. Safari iOS drops the user-gesture context
  // across any await, so we need the token ready before the button is ever pressed.
  useEffect(() => {
    if (!leagueCode || readOnly || leagueCode === 'VIEW') return
    if (viewTokenRef.current) return   // already have it
    getOrCreateViewToken(leagueCode).then(token => {
      if (token) viewTokenRef.current = token
    })
  }, [leagueCode, readOnly])

  // Poll for remote changes
  useEffect(() => {
    if (!leagueCode || !hydrated) return
    const interval = readOnly ? 30000 : 5000
    const poll = setInterval(async () => {
      if (isSavingRef.current) return // skip if mid-save
      // In read-only mode, load by view token; in admin mode, load by league code
      const result = readOnly && roTokenRef.current
        ? await loadLeagueByViewToken(roTokenRef.current)
        : await loadLeague(leagueCode)
      if (!result) return
      const migratedRemote = migrateState(result.data)
      const remote = stableStringify(migratedRemote)
      if (remote !== lastSyncedRef.current) {
        if (readOnly) {
          // Read-only viewers always get the latest automatically
          setState(migratedRemote)
          lastSyncedRef.current = remote
          setLastUpdatedBy(result.updatedBy)
          setLastUpdatedAt(result.updatedAt)
        } else {
          // Admins see a review banner — never silently overwrite
          setPendingRemote({ data: migratedRemote, updatedBy: result.updatedBy, updatedAt: result.updatedAt })
        }
      }
    }, interval)
    return () => clearInterval(poll)
  }, [leagueCode, hydrated, readOnly])

  function handleJoin(code: string, data: AppState, name: string) {
    localStorage.setItem('sb-league-code', code)
    localStorage.setItem('sb-user-name', name)
    localUserRef.current = name
    const s = migrateState(data)
    setState(s)
    lastSyncedRef.current = stableStringify(s)
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

  async function handleSignOut() {
    await getSupabase().auth.signOut()
    handleLeave()
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

  function acceptRemoteUpdate() {
    if (!pendingRemote) return
    setState(pendingRemote.data)
    lastSyncedRef.current = stableStringify(pendingRemote.data)
    setLastUpdatedBy(pendingRemote.updatedBy)
    setLastUpdatedAt(pendingRemote.updatedAt)
    setSyncStatus('synced')
    setPendingRemote(null)
  }

  function dismissRemoteUpdate() {
    // Mark the remote version as "seen" so the banner doesn't re-appear for the same version
    if (!pendingRemote) return
    lastSyncedRef.current = stableStringify(pendingRemote.data)
    setPendingRemote(null)
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

  const sc = getSportConfig(state.season.sport)
  const TABS = ['Dashboard', 'Setup', 'Divisions & Teams', sc.venuePlural, `${sc.officialPlural} / Staff`, 'Schedule', 'Team Schedules', `${sc.venueSingular} Calendar`, 'Auto-Schedule', 'Standings', 'Coaches', 'Other Leagues']
  // Visual nav clusters (indices into TABS): overview → day-to-day operation → one-time setup.
  // Content switch/onNavigate() below still key off these same TABS indices unchanged.
  const NAV_GROUPS = [
    { label: 'Overview', indices: [0] },
    { label: 'Operate', indices: [5, 6, 7, 9, 10] },
    { label: 'Setup', indices: [1, 2, 3, 4, 8, 11] },
  ]
  const themeStyle = buildThemeVars(getTheme(state.season.theme))

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-[var(--fd-primary)] flex items-center justify-center">
        <p className="text-[var(--fd-primary-light)]">Loading…</p>
      </div>
    )
  }

  if (viewTokenError) {
    return (
      <div className="min-h-screen bg-[var(--fd-primary)] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center space-y-4">
          <p className="text-2xl">🔗</p>
          <h2 className="text-lg font-semibold text-gray-800">Link not found</h2>
          <p className="text-sm text-gray-500">This view-only link is no longer valid. Ask the league admin to share a new link.</p>
          <a href="/" className="inline-block mt-2 text-sm text-[var(--fd-primary)] underline hover:text-[var(--fd-primary-dark)]">Go to FieldDay Planner</a>
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
    <div className="min-h-screen bg-gray-50" style={themeStyle}>
      <header className="bg-[var(--fd-primary)] text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-xl font-bold">{state.season.leagueName || 'FieldDay Planner'}</h1>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Read-only badge */}
            {readOnly && (
              <span className="bg-yellow-400 text-yellow-900 text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wide">
                View Only
              </span>
            )}

            {/* League code badge — hidden from read-only viewers */}
            {!readOnly && (
              <div className="flex items-center gap-2 bg-[var(--fd-primary)] rounded-lg px-3 py-1.5">
                <span className="text-[var(--fd-primary-muted)] text-xs font-medium">LEAGUE</span>
                <span className="font-mono font-bold tracking-widest">{leagueCode}</span>
                <button onClick={copyCode} className="text-[var(--fd-primary-muted)] hover:text-white transition text-sm" title="Copy league code">
                  {codeCopied ? 'Copied' : 'Copy'}
                </button>
              </div>
            )}

            {/* Undo button */}
            {!readOnly && (
              <button
                onClick={handleUndo}
                disabled={!canUndo}
                className="text-xs bg-[var(--fd-primary)] hover:bg-[var(--fd-primary-dark)] text-[var(--fd-primary-light)] hover:text-white border border-[var(--fd-primary-muted)] rounded-lg px-3 py-1.5 transition disabled:opacity-30 disabled:cursor-not-allowed"
                title="Undo last change"
              >
                Undo
              </button>
            )}

            {/* Snapshots button */}
            {!readOnly && (
              <button
                onClick={() => setShowSnapshots(true)}
                className="text-xs bg-[var(--fd-primary)] hover:bg-[var(--fd-primary-dark)] text-[var(--fd-primary-light)] hover:text-white border border-[var(--fd-primary-muted)] rounded-lg px-3 py-1.5 transition"
                title="Save or restore a schedule snapshot"
              >
                Snapshots
              </button>
            )}

            {/* Share read-only link (admins only) */}
            {!readOnly && (
              <button
                onClick={copyReadOnlyLink}
                className="text-xs bg-[var(--fd-primary)] hover:bg-[var(--fd-primary-dark)] text-[var(--fd-primary-light)] hover:text-white border border-[var(--fd-primary-muted)] rounded-lg px-3 py-1.5 transition"
                title="Copy a view-only link for coaches/parents"
              >
                {roLinkCopied ? 'Copied!' : 'Share View-Only Link'}
              </button>
            )}

            {/* Sync status */}
            {!readOnly && (
              <div className="text-xs">
                {syncStatus === 'saving' && <span className="text-[var(--fd-primary-light)] animate-pulse">Saving…</span>}
                {syncStatus === 'synced' && <span className="text-[var(--fd-primary-muted)]">Synced</span>}
                {syncStatus === 'error' && <span className="text-red-300">Save failed — check connection</span>}
              </div>
            )}

            {/* User name + leave + account */}
            {!readOnly ? (
              <div className="flex items-center gap-2 text-sm text-[var(--fd-primary-light)]">
                <span>{userName}</span>
                {user && (
                  <a
                    href="/account"
                    className="text-[var(--fd-primary-light)] hover:text-white transition text-xs border border-[var(--fd-primary-muted)] rounded px-2 py-0.5"
                    title="Account & billing"
                  >
                    Account
                  </a>
                )}
                {user ? (
                  <button
                    onClick={handleSignOut}
                    className="text-[var(--fd-primary-light)] hover:text-white transition text-xs border border-[var(--fd-primary-muted)] rounded px-2 py-0.5"
                    title="Sign out"
                  >
                    Sign Out
                  </button>
                ) : (
                  <button
                    onClick={handleLeave}
                    className="text-[var(--fd-primary-light)] hover:text-white transition text-xs border border-[var(--fd-primary-muted)] rounded px-2 py-0.5"
                    title="Leave this league"
                  >
                    Leave
                  </button>
                )}
              </div>
            ) : (
              <span className="text-xs text-[var(--fd-primary-muted)]">Live schedule — auto-updates every 30s</span>
            )}
          </div>
        </div>

        {/* Last updated bar */}
        {lastUpdatedBy && (
          <div className="max-w-7xl mx-auto px-4 pb-2 text-xs text-[var(--fd-primary-muted)]">
            Last saved by <strong className="text-[var(--fd-primary-light)]">{lastUpdatedBy}</strong>
            {timeSince && <> · {timeSince}</>}
          </div>
        )}
      </header>

      {/* Remote update review banner */}
      {pendingRemote && (
        <div className="bg-amber-50 border-b border-amber-200">
          <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2 text-sm text-amber-800">
              <span className="text-base">🔄</span>
              <span>
                <strong>{pendingRemote.updatedBy}</strong> updated this schedule.
                {pendingRemote.updatedAt && (
                  <> &middot; {new Date(pendingRemote.updatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</>
                )}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={acceptRemoteUpdate}
                className="text-xs bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-lg px-3 py-1.5 transition"
              >
                Load changes
              </button>
              <button
                onClick={dismissRemoteUpdate}
                className="text-xs text-amber-700 hover:text-amber-900 border border-amber-300 rounded-lg px-3 py-1.5 transition"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab nav — hide setup/admin tabs in read-only mode.
          Grouped into Overview / Operate / Setup so the 11 tabs read as clusters
          instead of one flat row; indices stay the ones the switch below and
          onNavigate() calls expect, only the visual order changes. */}
      <div className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4">
          <nav className="flex overflow-x-auto">
            {NAV_GROUPS.map((group, gi) => {
              const visible = group.indices.filter(i => !(readOnly && (i >= 1 && i <= 4 || i === 8 || i === 11)))
              if (visible.length === 0) return null
              return (
                <div key={group.label} className="flex items-stretch">
                  {gi > 0 && <span className="w-px my-2.5 bg-gray-200" />}
                  {visible.map(i => (
                    <button
                      key={TABS[i]}
                      onClick={() => setTab(i)}
                      className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                        tab === i ? 'border-[var(--fd-primary)] text-[var(--fd-primary)]' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      {TABS[i]}
                    </button>
                  ))}
                </div>
              )
            })}
          </nav>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {tab === 0  && <DashboardTab state={state} setState={setState} readOnly={readOnly} onNavigate={setTab} />}
        {tab === 1  && <SetupTab state={state} setState={setState} planLimits={planLimits ?? undefined} />}
        {tab === 2  && <DivisionsTab state={state} setState={setState} planLimits={planLimits ?? undefined} />}
        {tab === 3  && <FieldsTab state={state} setState={setState} />}
        {tab === 4  && <UmpiresTab state={state} setState={setState} />}
        {tab === 5  && <ScheduleTab state={state} setState={setState} readOnly={readOnly} />}
        {tab === 6  && <TeamScheduleTab state={state} setState={setState} readOnly={readOnly} />}
        {tab === 7  && <FieldCalendarTab state={state} setState={setState} readOnly={readOnly} />}
        {tab === 8  && <AutoScheduleTab state={state} setState={setState} />}
        {tab === 9  && <StandingsTab state={state} readOnly={readOnly} />}
        {tab === 10 && <CoachesTab state={state} readOnly={readOnly} />}
        {tab === 11 && <LinkedCalendarsTab state={state} setState={setState} readOnly={readOnly} />}
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
