'use client'
import { useState } from 'react'
import type { AppState, Field } from '@/lib/types'
import { getSportConfig } from '@/lib/sports'

interface Props { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>> }

function uid() { return Math.random().toString(36).slice(2) }

function mapsUrl(location: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`
}

function MapPinIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
      <path fillRule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 103 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 002.273 1.765 11.842 11.842 0 00.976.544l.062.029.018.008.006.003zM10 11.25a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z" clipRule="evenodd" />
    </svg>
  )
}

export default function FieldsTab({ state, setState }: Props) {
  const sc = getSportConfig(state.season.sport)
  const [newField, setNewField] = useState({ name: '', location: '' })

  function addField() {
    if (!newField.name.trim()) return
    const field: Field = { id: uid(), name: newField.name.trim(), location: newField.location.trim() }
    setState(s => ({ ...s, fields: [...s.fields, field] }))
    setNewField({ name: '', location: '' })
  }

  function removeField(id: string) {
    setState(s => ({ ...s, fields: s.fields.filter(f => f.id !== id) }))
  }

  function updateField(id: string, patch: Partial<Field>) {
    setState(s => ({ ...s, fields: s.fields.map(f => f.id === id ? { ...f, ...patch } : f) }))
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-800">{sc.venuePlural}</h2>
        <p className="text-sm text-gray-500 mt-1">
          All {sc.venuePlural.toLowerCase()} are available <strong>8:00 AM – 8:00 PM every day</strong>. When scheduling an event
          you choose the {sc.venueSingular.toLowerCase()}, start time, and end time — the system automatically checks for conflicts.
        </p>
      </div>

      {/* Add field */}
      <div className="bg-white rounded-lg border p-4">
        <h3 className="font-medium text-gray-700 mb-3">Add {sc.venueSingular}</h3>
        <div className="flex gap-3 flex-wrap">
          <input
            className="border rounded px-3 py-2 text-sm flex-1 min-w-[140px] focus:outline-none focus:ring-2 focus:ring-[var(--fd-accent)]"
            placeholder={`${sc.venueSingular} name (e.g. ${sc.venueSingular} 1)`}
            value={newField.name}
            onChange={e => setNewField(f => ({ ...f, name: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && addField()}
          />
          <input
            className="border rounded px-3 py-2 text-sm flex-1 min-w-[140px] focus:outline-none focus:ring-2 focus:ring-[var(--fd-accent)]"
            placeholder="Location / address (optional)"
            value={newField.location}
            onChange={e => setNewField(f => ({ ...f, location: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && addField()}
          />
          <button
            onClick={addField}
            className="bg-[var(--fd-accent)] text-white px-4 py-2 rounded text-sm hover:bg-[var(--fd-primary)] transition"
          >Add {sc.venueSingular}</button>
        </div>
      </div>

      {state.fields.length === 0 && (
        <p className="text-sm text-gray-400 italic">No {sc.venuePlural.toLowerCase()} added yet.</p>
      )}

      <div className="space-y-3">
        {state.fields.map((field, idx) => (
          <div key={field.id} className="bg-white rounded-lg border shadow-sm flex items-center gap-4 px-4 py-3">
            <span className="w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-full bg-[#eeeef6] text-[var(--fd-accent)] text-xs font-bold">{idx + 1}</span>
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                className="border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--fd-accent)]"
                placeholder={`${sc.venueSingular} name`}
                value={field.name}
                onChange={e => updateField(field.id, { name: e.target.value })}
              />
              <div className="flex gap-1.5">
                <input
                  className="flex-1 min-w-0 border rounded px-3 py-1.5 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-[var(--fd-accent)]"
                  placeholder="Location / address (optional)"
                  value={field.location}
                  onChange={e => updateField(field.id, { location: e.target.value })}
                />
                {field.location.trim() && (
                  <a
                    href={mapsUrl(field.location)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Get directions in Google Maps"
                    className="flex-shrink-0 flex items-center gap-1 border border-blue-200 rounded px-2.5 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 hover:border-blue-400 transition"
                  >
                    <MapPinIcon />
                    <span className="hidden sm:inline">Map</span>
                  </a>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 text-xs text-gray-400">
              <span className="hidden sm:inline">8 AM – 8 PM</span>
              <button onClick={() => removeField(field.id)} className="text-red-400 hover:text-red-600 ml-1 transition">Remove</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
