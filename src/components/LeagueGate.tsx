'use client'
import { useState } from 'react'
import { leagueExists, loadLeague, saveLeague, generateCode } from '@/lib/sync'
import type { AppState } from '@/lib/types'

interface Props {
  defaultState: AppState
  onJoin: (code: string, state: AppState, userName: string) => void
}

type Mode = 'choose' | 'create' | 'join'

export default function LeagueGate({ defaultState, onJoin }: Props) {
  const [mode, setMode] = useState<Mode>('choose')
  const [name, setName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  async function handleCreate() {
    if (!name.trim()) { setError('Please enter your name'); return }
    setLoading(true); setError('')
    let code = generateCode()
    let exists = await leagueExists(code)
    while (exists) { code = generateCode(); exists = await leagueExists(code) }
    const ok = await saveLeague(code, defaultState, name.trim())
    if (ok) {
      onJoin(code, defaultState, name.trim())
    } else {
      setError('Could not create league — check your connection and try again.')
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

  return (
    <div className="min-h-screen bg-[#00013a] flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">

        {/* Logo / title */}
        <div className="text-center">
          <div className="text-6xl mb-3">⚾</div>
          <h1 className="text-3xl font-bold text-white">Softball Scheduler</h1>
          <p className="text-[#b0c0e0] mt-1">Collaborative league scheduling</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">

          {/* Choose mode */}
          {mode === 'choose' && (
            <div className="p-8 space-y-3">
              <button
                onClick={() => { setMode('create'); setError('') }}
                className="w-full bg-[#cd163f] text-white py-3.5 rounded-xl font-semibold text-base hover:bg-[#00013a] transition"
              >
                Create New League
              </button>
              <button
                onClick={() => { setMode('join'); setError('') }}
                className="w-full border-2 border-[#cd163f] text-[#cd163f] py-3.5 rounded-xl font-semibold text-base hover:bg-[#f5f5fb] transition"
              >
                Join Existing League
              </button>
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
                  className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#cd163f]"
                  placeholder="e.g. Coach Johnson"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                />
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <button
                onClick={handleCreate}
                disabled={loading || !name.trim()}
                className="w-full bg-[#cd163f] text-white py-3 rounded-xl font-semibold hover:bg-[#00013a] transition disabled:opacity-50 disabled:cursor-not-allowed"
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
                    className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#cd163f]"
                    placeholder="e.g. Assistant Coach"
                    value={name}
                    onChange={e => setName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">League Code</label>
                  <input
                    className="w-full border rounded-lg px-3 py-2.5 font-mono text-xl tracking-[0.3em] text-center uppercase focus:outline-none focus:ring-2 focus:ring-[#cd163f]"
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
                className="w-full bg-[#cd163f] text-white py-3 rounded-xl font-semibold hover:bg-[#00013a] transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Joining…' : 'Join League'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
