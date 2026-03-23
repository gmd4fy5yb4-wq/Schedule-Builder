'use client'
import { useState } from 'react'
import type { AppState, Field } from '@/lib/types'

interface Props { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>> }

function uid() { return Math.random().toString(36).slice(2) }

export default function FieldsTab({ state, setState }: Props) {
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
        <h2 className="text-xl font-semibold text-gray-800">Fields</h2>
        <p className="text-sm text-gray-500 mt-1">
          All fields are available <strong>8:00 AM – 7:00 PM every day</strong>. When scheduling an event
          you choose the field, start time, and end time — the system automatically checks for conflicts.
        </p>
      </div>

      {/* Add field */}
      <div className="bg-white rounded-lg border p-4">
        <h3 className="font-medium text-gray-700 mb-3">Add Field</h3>
        <div className="flex gap-3 flex-wrap">
          <input
            className="border rounded px-3 py-2 text-sm flex-1 min-w-[140px] focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="Field name (e.g. Field 1)"
            value={newField.name}
            onChange={e => setNewField(f => ({ ...f, name: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && addField()}
          />
          <input
            className="border rounded px-3 py-2 text-sm flex-1 min-w-[140px] focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="Location / address (optional)"
            value={newField.location}
            onChange={e => setNewField(f => ({ ...f, location: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && addField()}
          />
          <button
            onClick={addField}
            className="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700 transition"
          >Add Field</button>
        </div>
      </div>

      {state.fields.length === 0 && (
        <p className="text-sm text-gray-400 italic">No fields added yet.</p>
      )}

      <div className="space-y-3">
        {state.fields.map((field, idx) => (
          <div key={field.id} className="bg-white rounded-lg border shadow-sm flex items-center gap-4 px-4 py-3">
            <span className="w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-full bg-green-100 text-green-700 text-xs font-bold">{idx + 1}</span>
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                className="border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Field name"
                value={field.name}
                onChange={e => updateField(field.id, { name: e.target.value })}
              />
              <input
                className="border rounded px-3 py-1.5 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Location (optional)"
                value={field.location}
                onChange={e => updateField(field.id, { location: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 text-xs text-gray-400">
              <span className="hidden sm:inline">8 AM – 7 PM</span>
              <button onClick={() => removeField(field.id)} className="text-red-400 hover:text-red-600 ml-1 transition">Remove</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
