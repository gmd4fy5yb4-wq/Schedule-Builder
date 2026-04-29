'use client'
import { useState, useEffect } from 'react'
import { leagueExists, loadLeague, createLeague } from '@/lib/sync'
import type { AppState } from '@/lib/types'
import { SPORTS } from '@/lib/sports'
import { getSupabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

interface Props {
  defaultState: AppState
  onJoin: (code: string, state: AppState, userName: string) => void
}

type Mode = 'choose' | 'create' | 'join'

export default function LeagueGate({ defaultState, onJoin }: Props) {
  const [mode, setMode] = useState<Mode>('choose')
  const [name, setName] = useState('')
  const [sport, setSport] = useState('softball')
  const [joinCode, setJoinCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [user, setUser] = useState<User | null | undefined>(undefined) // undefined = loading

  // Resolve auth state once on mount
  useEffect(() => {
    getSupabase().auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    })
  }, [])

  async function handleCreate() {
    if (!name.trim()) { setError('Please enter your name'); return }
    setLoading(true); setError('')

    const initialState = { ...defaultState, season: { ...defaultState.season, sport } }
    const result = await createLeague(initialState, name.trim())

    if ('code' in result) {
      onJoin(result.code, initialState, name.trim())
    } else {
      setError(result.error ?? 'Could not create league — check your connection and try again.')
    }
    setLoading(false)
  }

  async function handleJoin() {
    if (!name.trim()) { setError('Please enter your name'); return }
    const code = joinCode.trim().toUpperCase()
    if (code.length !== 6) { setError('League code must be 6 characters'); return }
    setLoading(true); setError('')
    const result = await loadLeague(code)
    if (result) {
      onJoin(code, result.data, name.trim())
    } else {
      setError('League not found — double-check the code and try again.')
    }
    setLoading(false)
  }

  // While resolving auth, show nothing (avoids flash)
  if (user === undefined) {
    return (
      <div className="min-h-screen bg-[var(--fd-primary)] flex items-center justify-center">
        <div className="text-white/50 text-sm">Loading…</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--fd-primary)] flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">

        {/* Logo / title */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white">FieldDay Planner</h1>
          <p className="text-[var(--fd-primary-light)] mt-1">Schedule any sport, any league</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">

          {/* Choose mode */}
          {mode === 'choose' && (
            <div className="p-8 space-y-3">
              {/* If not logged in, show sign-in prompt for create */}
              {!user && (
                <div className="mb-2 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm text-center">
                  <a href={`/login?next=${encodeURIComponent(window.location.search || '/')}`} className="font-semibold underline">Sign in</a> to create or manage a league.
                </div>
              )}
              <button
                onClick={() => {
                  if (!user) { window.location.href = `/login?next=${encodeURIComponent(window.location.search || '/')}`; return }
                  setMode('create'); setError('')
                }}
                className="w-full bg-[var(--fd-accent)] text-white py-3.5 rounded-xl font-semibold text-base hover:bg-[var(--fd-primary)] transition"
              >
                Create New League
              </button>
              <button
                onClick={() => { setMode('join'); setError('') }}
                className="w-full border-2 border-[var(--fd-accent)] text-[var(--fd-accent)] py-3.5 rounded-xl font-semibold text-base hover:bg-[#f5f5fb] transition"
              >
                Join Existing League
              </button>
              {user && (
                <a
                  href="/account"
                  className="block text-center text-sm text-gray-400 hover:text-gray-600 mt-2"
                >
                  My Account
                </a>
              )}
            </div>
          )}

          {/* Create */}
          {mode === 'create' && (
            <div className="p-8 space-y-5">
              <button onClick={() => { setMode('choose'); setError('') }} className="text-sm text-gray-400 hover:text-gray-600 flex items-center gap-1">
                ← Back
              </button>
              <div>
                <h2 className="text-lg font-semibold text-gray-800 mb-4">Create a new league</h2>
                <label className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
                <input
                  autoFocus
                  className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--fd-accent)]"
                  placeholder="e.g. Coach Johnson"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sport</label>
                <select
                  className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--fd-accent)]"
                  value={sport}
                  onChange={e => setSport(e.target.value)}
                >
                  {SPORTS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <button
                onClick={handleCreate}
                disabled={loading || !name.trim()}
                className="w-full bg-[var(--fd-accent)] text-white py-3 rounded-xl font-semibold hover:bg-[var(--fd-primary)] transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Creating league…' : 'Create League'}
              </button>
            </div>
          )}

          {/* Join */}
          {mode === 'join' && (
            <div className="p-8 space-y-5">
              <button onClick={() => { setMode('choose'); setError('') }} className="text-sm text-gray-400 hover:text-gray-600">
                ← Back
              </button>
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-gray-800">Join an existing league</h2>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
                  <input
                    autoFocus
                    className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--fd-accent)]"
                    placeholder="e.g. Assistant Coach"
                    value={name}
                    onChange={e => setName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">League Code</label>
                  <input
                    className="w-full border rounded-lg px-3 py-2.5 font-mono text-xl tracking-[0.3em] text-center uppercase focus:outline-none focus:ring-2 focus:ring-[var(--fd-accent)]"
                    placeholder="ABC123"
                    value={joinCode}
                    onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                    maxLength={6}
                    onKeyDown={e => e.key === 'Enter' && handleJoin()}
                  />
                </div>
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <button
                onClick={handleJoin}
                disabled={loading || !name.trim() || joinCode.length !== 6}
                className="w-full bg-[var(--fd-accent)] text-white py-3 rounded-xl font-semibold hover:bg-[var(--fd-primary)] transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Joining…' : 'Join League'}
              </button>
              {/* Claim prompt for authenticated users */}
              {user && (
                <p className="text-xs text-gray-400 text-center pt-2">
                  Is this your league?{' '}
                  <a href="/account" className="underline text-gray-500">Claim it</a> in My Account to link it to your profile.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer links */}
        <div className="text-center text-sm text-[var(--fd-primary-light)] space-x-4">
          {user ? (
            <span>Signed in as <span className="font-medium text-white">{user.email}</span></span>
          ) : (
            <a href="/login" className="underline hover:text-white">Sign in</a>
          )}
          <span>·</span>
          <a href="/pricing" className="underline hover:text-white">Plans & pricing</a>
        </div>
      </div>
    </div>
  )
}
