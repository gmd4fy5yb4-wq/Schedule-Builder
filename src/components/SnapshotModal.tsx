'use client'
import { useState, useEffect } from 'react'
import type { AppState } from '@/lib/types'
import { saveSnapshot, listSnapshots, deleteSnapshot, type Snapshot } from '@/lib/sync'

interface Props {
  leagueCode: string
  userName: string
  currentState: AppState
  onRestore: (state: AppState, snapshotName: string) => void
  onClose: () => void
}

export default function SnapshotModal({ leagueCode, userName, currentState, onRestore, onClose }: Props) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newName, setNewName] = useState('')
  const [restoreConfirm, setRestoreConfirm] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listSnapshots(leagueCode).then(s => { setSnapshots(s); setLoading(false) })
  }, [leagueCode])

  async function handleSave() {
    const name = newName.trim()
    if (!name) return
    setSaving(true)
    setError(null)
    const ok = await saveSnapshot(leagueCode, name, currentState, userName)
    if (ok) {
      const updated = await listSnapshots(leagueCode)
      setSnapshots(updated)
      setNewName('')
    } else {
      setError('Failed to save snapshot — check your connection.')
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    await deleteSnapshot(id)
    setSnapshots(s => s.filter(x => x.id !== id))
    setDeleteConfirm(null)
  }

  function handleRestore(snapshot: Snapshot) {
    onRestore(snapshot.data, snapshot.name)
    onClose()
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit'
    })
  }

  const gameCount = (s: AppState) => s.schedule?.games?.length ?? 0
  const practiceCount = (s: AppState) => s.schedule?.practices?.length ?? 0

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900" style={{ fontFamily: 'Oswald, sans-serif' }}>Schedule Snapshots</h2>
            <p className="text-sm text-gray-500 mt-0.5">Save and restore named backups of your schedule</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        {/* Save new snapshot */}
        <div className="px-6 py-4 border-b flex-shrink-0 bg-gray-50">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Save Current State</p>
          <div className="flex gap-2">
            <input
              className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--fd-accent)]"
              placeholder='e.g. "Before Opening Weekend", "Week 3 Final"'
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
            />
            <button
              onClick={handleSave}
              disabled={!newName.trim() || saving}
              className="bg-[var(--fd-primary)] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[var(--fd-primary-dark)] transition disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1.5">
            Current state: {gameCount(currentState)} game{gameCount(currentState) !== 1 ? 's' : ''} · {practiceCount(currentState)} practice{practiceCount(currentState) !== 1 ? 's' : ''}
          </p>
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        </div>

        {/* Snapshot list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400">
              <span className="animate-pulse">Loading snapshots…</span>
            </div>
          ) : snapshots.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400 text-center">
              <p className="font-medium">No snapshots yet</p>
              <p className="text-sm mt-1">Save your first snapshot above to protect your work.</p>
            </div>
          ) : (
            <div className="divide-y">
              {snapshots.map(snap => (
                <div key={snap.id} className="px-6 py-3 hover:bg-gray-50 transition">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">{snap.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {fmtDate(snap.createdAt)}
                        {snap.createdBy && <> · by <span className="font-medium">{snap.createdBy}</span></>}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {gameCount(snap.data)} game{gameCount(snap.data) !== 1 ? 's' : ''} · {practiceCount(snap.data)} practice{practiceCount(snap.data) !== 1 ? 's' : ''}
                        {' · '}{snap.data.divisions?.length ?? 0} division{(snap.data.divisions?.length ?? 0) !== 1 ? 's' : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Restore */}
                      {restoreConfirm === snap.id ? (
                        <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
                          <span className="text-xs text-amber-700 font-medium">Replace current schedule?</span>
                          <button onClick={() => handleRestore(snap)} className="text-xs bg-amber-500 text-white px-2 py-0.5 rounded-lg hover:bg-amber-600 transition">Restore</button>
                          <button onClick={() => setRestoreConfirm(null)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setRestoreConfirm(snap.id)}
                          className="text-xs border border-[var(--fd-accent)] text-[var(--fd-accent)] hover:bg-[var(--fd-accent)] hover:text-white px-3 py-1.5 rounded-lg transition font-medium"
                        >
                          Restore
                        </button>
                      )}

                      {/* Delete */}
                      {deleteConfirm === snap.id ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleDelete(snap.id)} className="text-xs text-red-500 hover:text-red-700 font-medium">Delete</button>
                          <button onClick={() => setDeleteConfirm(null)} className="text-xs text-gray-400 hover:text-gray-600">·Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => setDeleteConfirm(snap.id)} className="text-gray-300 hover:text-red-400 transition text-lg leading-none px-1" title="Delete snapshot">×</button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t bg-gray-50 rounded-b-2xl flex-shrink-0">
          <p className="text-xs text-gray-400 text-center">Snapshots are stored in the cloud and shared across all admins for this league.</p>
        </div>
      </div>
    </div>
  )
}
