'use client'
import { useState } from 'react'
import type { AppState, Field, FieldSlot } from '@/lib/types'

interface Props { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>> }

function uid() { return Math.random().toString(36).slice(2) }

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function fmtTime(t: string) {
  const [h, m] = t.split(':').map(Number)
  return `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

export default function FieldsTab({ state, setState }: Props) {
  const [newField, setNewField] = useState({ name: '', location: '' })
  const [slotForm, setSlotForm] = useState<Record<string, { day: number; time: string }>>({})

  // Copy day→day: track which target day is selected per "fieldId-fromDay"
  const [copyDayTo, setCopyDayTo] = useState<Record<string, number>>({})
  // Copy field→field: track which source field is selected per target fieldId
  const [copyFieldFrom, setCopyFieldFrom] = useState<Record<string, string>>({})
  // Flash feedback: set of "fieldId" or "fieldId-day" keys briefly after copy
  const [copied, setCopied] = useState<Set<string>>(new Set())

  function flash(key: string) {
    setCopied(s => new Set(s).add(key))
    setTimeout(() => setCopied(s => { const n = new Set(s); n.delete(key); return n }), 1200)
  }

  function addField() {
    if (!newField.name.trim()) return
    const field: Field = { id: uid(), name: newField.name.trim(), location: newField.location.trim(), slots: [] }
    setState(s => ({ ...s, fields: [...s.fields, field] }))
    setNewField({ name: '', location: '' })
  }

  function removeField(id: string) {
    setState(s => ({ ...s, fields: s.fields.filter(f => f.id !== id) }))
  }

  function addSlot(fieldId: string) {
    const form = slotForm[fieldId] || { day: 1, time: '18:00' }
    setState(s => ({
      ...s,
      fields: s.fields.map(f =>
        f.id === fieldId
          ? { ...f, slots: [...f.slots, { id: uid(), dayOfWeek: form.day, time: form.time }] }
          : f
      )
    }))
  }

  function removeSlot(fieldId: string, slotId: string) {
    setState(s => ({
      ...s,
      fields: s.fields.map(f =>
        f.id === fieldId ? { ...f, slots: f.slots.filter(sl => sl.id !== slotId) } : f
      )
    }))
  }

  // Copy all slots from one day to another day within the same field
  function copyDaySlots(fieldId: string, fromDay: number, toDay: number) {
    setState(s => {
      const field = s.fields.find(f => f.id === fieldId)
      if (!field) return s
      const sourceTimes = field.slots.filter(sl => sl.dayOfWeek === fromDay).map(sl => sl.time)
      const existingTimes = new Set(field.slots.filter(sl => sl.dayOfWeek === toDay).map(sl => sl.time))
      const newSlots: FieldSlot[] = sourceTimes
        .filter(t => !existingTimes.has(t))
        .map(t => ({ id: uid(), dayOfWeek: toDay, time: t }))
      if (!newSlots.length) return s
      return {
        ...s,
        fields: s.fields.map(f =>
          f.id === fieldId ? { ...f, slots: [...f.slots, ...newSlots] } : f
        )
      }
    })
    flash(`${fieldId}-${fromDay}`)
  }

  // Copy all slots from one field to another field
  function copyFieldSlots(targetFieldId: string, sourceFieldId: string) {
    setState(s => {
      const source = s.fields.find(f => f.id === sourceFieldId)
      const target = s.fields.find(f => f.id === targetFieldId)
      if (!source || !target) return s
      const existingKeys = new Set(target.slots.map(sl => `${sl.dayOfWeek}|${sl.time}`))
      const newSlots: FieldSlot[] = source.slots
        .filter(sl => !existingKeys.has(`${sl.dayOfWeek}|${sl.time}`))
        .map(sl => ({ id: uid(), dayOfWeek: sl.dayOfWeek, time: sl.time }))
      if (!newSlots.length) return s
      return {
        ...s,
        fields: s.fields.map(f =>
          f.id === targetFieldId ? { ...f, slots: [...f.slots, ...newSlots] } : f
        )
      }
    })
    flash(targetFieldId)
  }

  function groupedSlots(field: Field) {
    const groups: Record<number, typeof field.slots> = {}
    for (const sl of field.slots) {
      if (!groups[sl.dayOfWeek]) groups[sl.dayOfWeek] = []
      groups[sl.dayOfWeek].push(sl)
    }
    return Object.entries(groups).sort(([a], [b]) => Number(a) - Number(b))
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-800">Fields &amp; Availability</h2>
      <p className="text-sm text-gray-500">Add each field and its recurring weekly time slots. Use the copy shortcuts to duplicate slots across days or fields.</p>

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

      <div className="space-y-4">
        {state.fields.map(field => {
          const otherFields = state.fields.filter(f => f.id !== field.id)
          const selectedSource = copyFieldFrom[field.id] || ''
          const fieldFlashed = copied.has(field.id)

          return (
            <div key={field.id} className="bg-white rounded-lg border shadow-sm">

              {/* Field header */}
              <div className="px-4 py-3 bg-gray-50 border-b flex flex-wrap items-center gap-3 justify-between">
                <div>
                  <span className="font-semibold text-gray-800">{field.name}</span>
                  {field.location && <span className="text-xs text-gray-500 ml-2">{field.location}</span>}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Copy from another field */}
                  {otherFields.length > 0 && (
                    <div className="flex items-center gap-1.5 text-sm">
                      <span className="text-gray-500 text-xs whitespace-nowrap">Copy slots from:</span>
                      <select
                        className="border rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400"
                        value={selectedSource}
                        onChange={e => setCopyFieldFrom(m => ({ ...m, [field.id]: e.target.value }))}
                      >
                        <option value="">— select field —</option>
                        {otherFields.map(f => (
                          <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                      </select>
                      <button
                        disabled={!selectedSource}
                        onClick={() => {
                          copyFieldSlots(field.id, selectedSource)
                          setCopyFieldFrom(m => ({ ...m, [field.id]: '' }))
                        }}
                        className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                          fieldFlashed
                            ? 'bg-green-500 text-white'
                            : 'bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed'
                        }`}
                      >
                        {fieldFlashed ? '✓ Copied!' : 'Copy'}
                      </button>
                    </div>
                  )}

                  <button onClick={() => removeField(field.id)} className="text-red-400 hover:text-red-600 text-xs ml-2">
                    Remove field
                  </button>
                </div>
              </div>

              <div className="p-4">
                {/* Slot display grouped by day */}
                {field.slots.length === 0 && (
                  <p className="text-sm text-gray-400 italic mb-3">No time slots — add some below.</p>
                )}

                {groupedSlots(field).map(([dow, slots]) => {
                  const dayNum = Number(dow)
                  const copyKey = `${field.id}-${dayNum}`
                  const dayFlashed = copied.has(copyKey)
                  const targetDay = copyDayTo[copyKey] ?? ((dayNum + 1) % 7)

                  return (
                    <div key={dow} className="mb-3">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-xs font-semibold text-gray-600 uppercase w-24">{DAY_FULL[dayNum]}</span>

                        {/* Copy this day's slots to another day */}
                        <div className="flex items-center gap-1 text-xs text-gray-400">
                          <span>copy to</span>
                          <select
                            className="border rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                            value={targetDay}
                            onChange={e => setCopyDayTo(m => ({ ...m, [copyKey]: Number(e.target.value) }))}
                          >
                            {DAYS.map((d, i) => i !== dayNum && (
                              <option key={i} value={i}>{d}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => copyDaySlots(field.id, dayNum, targetDay)}
                            className={`px-2 py-0.5 rounded text-xs font-medium transition ${
                              dayFlashed
                                ? 'bg-green-500 text-white'
                                : 'bg-blue-500 text-white hover:bg-blue-600'
                            }`}
                          >
                            {dayFlashed ? '✓' : '→'}
                          </button>
                        </div>
                      </div>

                      {/* Time chips */}
                      <div className="flex flex-wrap gap-2">
                        {slots.sort((a, b) => a.time.localeCompare(b.time)).map(sl => (
                          <span key={sl.id} className="inline-flex items-center gap-1 bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
                            {fmtTime(sl.time)}
                            <button onClick={() => removeSlot(field.id, sl.id)} className="hover:text-red-600 ml-0.5">×</button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                })}

                {/* Add slot row */}
                <div className="flex gap-2 mt-3 flex-wrap items-center border-t pt-3">
                  <select
                    className="border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    value={slotForm[field.id]?.day ?? 1}
                    onChange={e => setSlotForm(f => ({ ...f, [field.id]: { ...f[field.id], day: Number(e.target.value), time: f[field.id]?.time || '18:00' } }))}
                  >
                    {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                  <input
                    type="time"
                    className="border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    value={slotForm[field.id]?.time || '18:00'}
                    onChange={e => setSlotForm(f => ({ ...f, [field.id]: { ...f[field.id], day: f[field.id]?.day ?? 1, time: e.target.value } }))}
                  />
                  <button
                    onClick={() => addSlot(field.id)}
                    className="bg-green-600 text-white px-3 py-1.5 rounded text-sm hover:bg-green-700 transition"
                  >+ Add Slot</button>
                </div>
                <p className="text-xs text-gray-400 mt-1">{field.slots.length} slot{field.slots.length !== 1 ? 's' : ''} total</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
