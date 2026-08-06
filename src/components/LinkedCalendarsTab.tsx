'use client'
import { useState } from 'react'
import type { AppState } from '@/lib/types'
import { extractViewToken } from '@/lib/linkedCalendars'
import { loadLeagueByViewToken } from '@/lib/sync'
import FieldCalendarTab from './FieldCalendarTab'

interface Props { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; readOnly?: boolean }

const noop: React.Dispatch<React.SetStateAction<AppState>> = () => {}

export default function LinkedCalendarsTab({ state, setState, readOnly = false }: Props) {
  const linked = state.linkedCalendars ?? []
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [viewing, setViewing] = useState<{ name: string; data: AppState } | null>(null)
  const [loadingView, setLoadingView] = useState(false)

  async function addLink() {
    setError('')
    const token = extractViewToken(input)
    if (!token) { setError('That doesn’t look like a share link. Paste the full link or its token.'); return }
    if (linked.some(l => l.token === token)) { setError('That calendar is already linked.'); return }
    setBusy(true)
    const rec = await loadLeagueByViewToken(token)
    setBusy(false)
    if (!rec) { setError('Link not found. Ask the other admin for a current share link.'); return }
    const name = rec.data.season?.leagueName?.trim() || 'Untitled League'
    setState(s => ({ ...s, linkedCalendars: [...(s.linkedCalendars ?? []), { name, token }] }))
    setInput('')
  }

  function removeLink(token: string) {
    setState(s => ({ ...s, linkedCalendars: (s.linkedCalendars ?? []).filter(l => l.token !== token) }))
    if (viewing && linked.find(l => l.token === token)?.name === viewing.name) setViewing(null)
  }

  async function openLink(l: { name: string; token: string }) {
    setLoadingView(true)
    setError('')
    const rec = await loadLeagueByViewToken(l.token)
    setLoadingView(false)
    if (!rec) { setError(`“${l.name}” is no longer available — the admin may have revoked the link.`); return }
    setViewing({ name: l.name, data: rec.data })
  }

  if (viewing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setViewing(null)} className="text-sm text-[var(--fd-primary)] underline hover:text-[var(--fd-primary-dark)]">← Back to other leagues</button>
          <h2 className="text-lg font-semibold text-gray-800">{viewing.name} <span className="text-sm font-normal text-gray-400">(read-only)</span></h2>
        </div>
        <FieldCalendarTab state={viewing.data} setState={noop} readOnly />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-800">Other Leagues</h2>
        <p className="text-sm text-gray-500">View read-only calendars from other leagues. Ask their admin for a share link and paste it below.</p>
      </div>

      {!readOnly && (
        <div className="flex gap-2 max-w-xl">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addLink() }}
            placeholder="Paste a league share link…"
            className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--fd-accent)]"
          />
          <button
            onClick={addLink}
            disabled={busy || !input.trim()}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--fd-primary)] text-white disabled:opacity-50"
          >
            {busy ? 'Checking…' : 'Add'}
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loadingView && <p className="text-sm text-gray-500">Loading calendar…</p>}

      {linked.length === 0 ? (
        <p className="text-sm text-gray-400">No linked calendars yet.</p>
      ) : (
        <ul className="divide-y border rounded-lg max-w-xl">
          {linked.map(l => (
            <li key={l.token} className="flex items-center justify-between px-4 py-3">
              <button onClick={() => openLink(l)} className="text-sm font-medium text-[var(--fd-primary)] hover:text-[var(--fd-primary-dark)] hover:underline">
                {l.name}
              </button>
              {!readOnly && (
                <button onClick={() => removeLink(l.token)} className="text-xs text-gray-400 hover:text-red-600">Remove</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
