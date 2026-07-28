'use client'
import { useState, useMemo } from 'react'
import type { AppState, ScheduledGame, ScheduledPractice, ScheduledSpecialEvent } from '@/lib/types'
import { getSportConfig } from '@/lib/sports'

// ── Shared types ──────────────────────────────────────────────────────────────
export interface EventForm {
  id: string | null
  type: 'game' | 'practice' | 'special'
  date: string
  divisionId: string
  homeTeamId: string
  awayTeamId: string
  teamId: string
  umpireId: string
  fieldId: string
  time: string      // "HH:MM"
  endTime: string   // "HH:MM"
  result?: { homeScore: number; awayScore: number }
  confirmed?: boolean        // preserved transparently; not user-editable in the form
  // Special event fields
  specialName?: string
  specialLocation?: string
  specialComments?: string
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }

function TrophyIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
      <path d="M17 5h2a2 2 0 0 1-2 4" />
      <path d="M7 5H5a2 2 0 0 0 2 4" />
    </svg>
  )
}
export function toMins(t: string) { const [h, m] = t.split(':').map(Number); return h * 60 + m }
export function minsToTime(mins: number) { const h = Math.floor(mins / 60) % 24; const m = mins % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` }
export function fmtTime(t: string) { if (!t) return ''; const [h, m] = t.split(':').map(Number); return `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}` }

export const FIELD_OPEN  = '08:00'
export const FIELD_CLOSE = '20:00'

export function defaultEndTime(startTime: string, durationMins: number): string {
  return minsToTime(Math.min(toMins(startTime) + durationMins, toMins(FIELD_CLOSE)))
}

export function emptyForm(date = '', gameDuration = 90): EventForm {
  const start = '17:00'
  return { id: null, type: 'game', date, divisionId: '', homeTeamId: '', awayTeamId: '', teamId: '', umpireId: '', fieldId: '', time: start, endTime: defaultEndTime(start, gameDuration), specialName: '', specialLocation: '', specialComments: '' }
}

export function formFromEvent(ev: ScheduledGame | ScheduledPractice | ScheduledSpecialEvent): EventForm {
  const dur = ev.durationMinutes || 90
  const endTime = minsToTime(toMins(ev.time) + dur)
  if (ev.type === 'game') {
    const g = ev as ScheduledGame
    return { id: g.id, type: 'game', date: g.date, divisionId: g.divisionId, homeTeamId: g.homeTeamId, awayTeamId: g.awayTeamId, teamId: '', umpireId: g.umpireId, fieldId: g.fieldId, time: g.time, endTime, result: g.result, confirmed: g.confirmed, specialName: '', specialLocation: '', specialComments: '' }
  } else if (ev.type === 'practice') {
    const p = ev as ScheduledPractice
    return { id: p.id, type: 'practice', date: p.date, divisionId: p.divisionId, homeTeamId: '', awayTeamId: '', teamId: p.teamId, umpireId: '', fieldId: p.fieldId, time: p.time, endTime, specialName: '', specialLocation: '', specialComments: '' }
  } else {
    const s = ev as ScheduledSpecialEvent
    return { id: s.id, type: 'special', date: s.date, divisionId: '', homeTeamId: '', awayTeamId: '', teamId: '', umpireId: '', fieldId: '', time: s.time, endTime, specialName: s.name, specialLocation: s.location ?? '', specialComments: s.comments ?? '' }
  }
}

// ── Repeat utilities ──────────────────────────────────────────────────────────
type RepeatFrequency = 'daily' | 'weekly' | 'monthly'
type RepeatEndType = 'count' | 'date'

interface RepeatConfig {
  enabled: boolean
  frequency: RepeatFrequency
  endType: RepeatEndType
  count: number       // number of total occurrences (including first)
  endDate: string     // YYYY-MM-DD
}

function generateRepeatDates(startDate: string, cfg: RepeatConfig): string[] {
  if (!startDate || !cfg.enabled) return [startDate]

  const dates: string[] = []
  const current = new Date(startDate + 'T12:00:00')
  const limit = cfg.endType === 'count' ? cfg.count : 104 // safety cap at 2 years of weekly
  const endDateObj = cfg.endType === 'date' && cfg.endDate
    ? new Date(cfg.endDate + 'T23:59:59')
    : null

  for (let i = 0; i < limit; i++) {
    if (endDateObj && current > endDateObj) break
    dates.push(current.toISOString().split('T')[0])
    if (cfg.frequency === 'daily')        current.setDate(current.getDate() + 1)
    else if (cfg.frequency === 'weekly')  current.setDate(current.getDate() + 7)
    else if (cfg.frequency === 'monthly') current.setMonth(current.getMonth() + 1)
  }

  return dates
}

// ── Bulk conflict review ──────────────────────────────────────────────────────
interface BulkConflict {
  kind: 'field' | 'team' | 'umpire' | 'hours' | 'teamblackout'
  message: string
}

interface BulkConflictItem {
  date: string
  conflicts: BulkConflict[]
  action: 'skip' | 'keep'   // user's choice; default 'skip'
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  state: AppState
  setState: React.Dispatch<React.SetStateAction<AppState>>
  initialForm: EventForm
  onClose: () => void
}

export default function EventModal({ state, setState, initialForm, onClose }: Props) {
  const sc = getSportConfig(state.season.sport)
  const [form, setForm] = useState<EventForm>(initialForm)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [bulkReview, setBulkReview] = useState<BulkConflictItem[] | null>(null)
  const [repeat, setRepeat] = useState<RepeatConfig>({
    enabled: false,
    frequency: 'weekly',
    endType: 'count',
    count: 4,
    endDate: '',
  })

  const isNew = !initialForm.id
  const f = form

  const fieldMap  = useMemo(() => new Map(state.fields.map(fi => [fi.id, fi])), [state.fields])
  const teamMap   = useMemo(() => new Map(state.divisions.flatMap(d => d.teams).map(t => [t.id, t])), [state.divisions])
  const umpireMap = useMemo(() => new Map(state.umpires.map(u => [u.id, u])), [state.umpires])
  const divMap    = useMemo(() => new Map(state.divisions.map(d => [d.id, d])), [state.divisions])

  const divTeams    = divMap.get(f.divisionId)?.teams ?? []
  const homeOptions = divTeams.filter(t => t.id !== f.awayTeamId)
  const awayOptions = divTeams.filter(t => t.id !== f.homeTeamId)

  function upd(patch: Partial<EventForm>) { setForm(prev => ({ ...prev, ...patch })) }
  function updRepeat(patch: Partial<RepeatConfig>) { setRepeat(prev => ({ ...prev, ...patch })) }

  // ── Conflict detection ──────────────────────────────────────────────────────
  const conflicts = useMemo(() => {
    type Conflict = { kind: 'field' | 'team' | 'umpire' | 'hours' | 'teamblackout'; message: string }
    const result: Conflict[] = []
    if (!f.date || !f.time || !f.endTime) return result

    const fStart = toMins(f.time)
    const fEnd   = toMins(f.endTime)

    if (fStart < toMins(FIELD_OPEN))  result.push({ kind: 'hours', message: `Start time is before 8:00 AM — fields open at 8 AM.` })
    if (fEnd > toMins(FIELD_CLOSE))   result.push({ kind: 'hours', message: `End time is after 8:00 PM — fields close at 8 PM.` })
    if (fEnd <= fStart)               result.push({ kind: 'hours', message: `End time must be after start time.` })
    if (fEnd <= fStart) return result

    const others = [...state.schedule.games, ...state.schedule.practices]
      .filter(ev => ev.id !== f.id && ev.date === f.date)

    for (const ev of others) {
      const evStart = toMins(ev.time)
      const evEnd   = evStart + (ev.durationMinutes || 90)
      if (fStart >= evEnd || evStart >= fEnd) continue

      const evRange = `${fmtTime(ev.time)}–${fmtTime(minsToTime(evEnd))}`

      if (f.fieldId && ev.fieldId === f.fieldId) {
        result.push({ kind: 'field', message: `${fieldMap.get(f.fieldId)?.name ?? 'That field'} is already booked ${evRange}` })
      }

      const evTeams = ev.type === 'game'
        ? [(ev as ScheduledGame).homeTeamId, (ev as ScheduledGame).awayTeamId]
        : [(ev as ScheduledPractice).teamId]
      const fTeams = (f.type === 'game' ? [f.homeTeamId, f.awayTeamId] : [f.teamId]).filter(Boolean)
      for (const tid of fTeams) {
        if (tid && evTeams.includes(tid))
          result.push({ kind: 'team', message: `${teamMap.get(tid)?.name ?? 'A team'} already has an event overlapping ${evRange}` })
      }

      if (f.type === 'game' && f.umpireId && ev.type === 'game' && (ev as ScheduledGame).umpireId === f.umpireId)
        result.push({ kind: 'umpire', message: `${umpireMap.get(f.umpireId)?.name ?? 'That umpire'} is already assigned to a game overlapping ${evRange}` })
    }

    // Team blackout dates
    if (f.date) {
      const involvedTeamIds = (f.type === 'game' ? [f.homeTeamId, f.awayTeamId] : [f.teamId]).filter(Boolean)
      for (const tid of involvedTeamIds) {
        const team = teamMap.get(tid)
        const entry = team?.blackoutDates?.find(d => d.split('::')[0] === f.date)
        if (entry) {
          const label = entry.split('::')[1]
          result.push({ kind: 'teamblackout', message: `${team!.name} has a blackout on this date${label ? ` — ${label}` : ''}` })
        }
      }
    }

    return result
  }, [f, state.schedule, fieldMap, teamMap, umpireMap])

  const hasHardConflict = conflicts.some(c => c.kind === 'field' || c.kind === 'hours')

  // ── Field availability for the dropdown ────────────────────────────────────
  // Computed whenever date/time changes so the dropdown reflects current availability.
  const fieldAvailability = useMemo(() => {
    const booked = new Set<string>()
    const blackedOut = new Set<string>()

    // Blackout dates on each field
    if (f.date) {
      for (const fld of state.fields) {
        if (fld.blackoutDates?.some(d => d.split('::')[0] === f.date)) {
          blackedOut.add(fld.id)
        }
      }
    }

    // Time overlap with existing events (excluding this event itself)
    if (f.date && f.time && f.endTime) {
      const fStart = toMins(f.time)
      const fEnd   = toMins(f.endTime)
      if (fEnd > fStart) {
        const others = [...state.schedule.games, ...state.schedule.practices]
          .filter(ev => ev.id !== f.id && ev.date === f.date && ev.fieldId)
        for (const ev of others) {
          const evStart = toMins(ev.time)
          const evEnd   = evStart + (ev.durationMinutes || 90)
          if (fStart < evEnd && evStart < fEnd) {
            booked.add(ev.fieldId)
          }
        }
      }
    }

    return { booked, blackedOut }
  }, [f.date, f.time, f.endTime, f.id, state.fields, state.schedule])

  function canSave() {
    if (!f.date || !f.time || !f.endTime) return false
    if (f.type === 'special') return !!(f.specialName?.trim())
    if (!f.fieldId || !f.divisionId) return false
    if (hasHardConflict) return false
    if (repeat.enabled && repeat.endType === 'date' && !repeat.endDate) return false
    if (f.type === 'game') return !!(f.homeTeamId && f.awayTeamId && f.homeTeamId !== f.awayTeamId)
    return !!f.teamId
  }

  // Preview how many dates will be created
  const repeatDates = useMemo(() => {
    if (!isNew || !repeat.enabled || !f.date) return []
    return generateRepeatDates(f.date, repeat)
  }, [isNew, repeat, f.date])

  // Check a single date for conflicts against the existing schedule
  function detectConflictsForDate(date: string): BulkConflict[] {
    const result: BulkConflict[] = []
    const fStart = toMins(f.time)
    const fEnd   = toMins(f.endTime)
    if (fEnd <= fStart) return result

    const others = [...state.schedule.games, ...state.schedule.practices]
      .filter(ev => ev.date === date)

    for (const ev of others) {
      const evStart = toMins(ev.time)
      const evEnd   = evStart + (ev.durationMinutes || 90)
      if (fStart >= evEnd || evStart >= fEnd) continue

      const evRange = `${fmtTime(ev.time)}–${fmtTime(minsToTime(evEnd))}`

      if (f.fieldId && ev.fieldId === f.fieldId)
        result.push({ kind: 'field', message: `${fieldMap.get(f.fieldId)?.name ?? 'That field'} is already booked ${evRange}` })

      const evTeams = ev.type === 'game'
        ? [(ev as ScheduledGame).homeTeamId, (ev as ScheduledGame).awayTeamId]
        : [(ev as ScheduledPractice).teamId]
      const fTeams = (f.type === 'game' ? [f.homeTeamId, f.awayTeamId] : [f.teamId]).filter(Boolean)
      for (const tid of fTeams) {
        if (tid && evTeams.includes(tid))
          result.push({ kind: 'team', message: `${teamMap.get(tid)?.name ?? 'A team'} already has an event overlapping ${evRange}` })
      }

      if (f.type === 'game' && f.umpireId && ev.type === 'game' && (ev as ScheduledGame).umpireId === f.umpireId)
        result.push({ kind: 'umpire', message: `${umpireMap.get(f.umpireId)?.name ?? 'That umpire'} is already assigned overlapping ${evRange}` })
    }

    // Team blackout dates
    const involvedTeamIds = (f.type === 'game' ? [f.homeTeamId, f.awayTeamId] : [f.teamId]).filter(Boolean)
    for (const tid of involvedTeamIds) {
      const team = teamMap.get(tid)
      const entry = team?.blackoutDates?.find(d => d.split('::')[0] === date)
      if (entry) {
        const label = entry.split('::')[1]
        result.push({ kind: 'teamblackout', message: `${team!.name} has a blackout on this date${label ? ` — ${label}` : ''}` })
      }
    }

    return result
  }

  function commitDates(dates: string[]) {
    const durationMinutes = toMins(f.endTime) - toMins(f.time)
    setState(s => {
      const games         = s.schedule.games.filter(g => g.id !== f.id)
      const practices     = s.schedule.practices.filter(p => p.id !== f.id)
      const specialEvents = (s.schedule.specialEvents ?? []).filter(se => se.id !== f.id)
      for (const date of dates) {
        const id = (!isNew && dates.length === 1) ? (f.id ?? uid()) : uid()
        if (f.type === 'game') {
          games.push({ id, type: 'game', date, time: f.time, durationMinutes, fieldId: f.fieldId, homeTeamId: f.homeTeamId, awayTeamId: f.awayTeamId, umpireId: f.umpireId, divisionId: f.divisionId, ...(f.result !== undefined && { result: f.result }), ...(f.confirmed !== undefined && { confirmed: f.confirmed }) })
        } else if (f.type === 'practice') {
          practices.push({ id, type: 'practice', date, time: f.time, durationMinutes, fieldId: f.fieldId, teamId: f.teamId, divisionId: f.divisionId })
        } else {
          specialEvents.push({ id, type: 'special', date, time: f.time, durationMinutes, name: f.specialName?.trim() ?? '', location: f.specialLocation?.trim() || undefined, comments: f.specialComments?.trim() || undefined })
        }
      }
      return { ...s, schedule: { ...s.schedule, games, practices, specialEvents, generatedAt: new Date().toISOString() } }
    })
    onClose()
  }

  function save() {
    const dates = isNew && repeat.enabled ? generateRepeatDates(f.date, repeat) : [f.date]

    if (dates.length > 1) {
      // Check all dates for conflicts before committing
      const conflictItems: BulkConflictItem[] = []
      for (const date of dates) {
        const c = detectConflictsForDate(date)
        if (c.length > 0) conflictItems.push({ date, conflicts: c, action: 'skip' })
      }
      if (conflictItems.length > 0) {
        setBulkReview(conflictItems)
        return
      }
    }

    commitDates(dates)
  }

  function confirmBulkSave() {
    if (!bulkReview) return
    const conflictDatesToSkip = new Set(bulkReview.filter(i => i.action === 'skip').map(i => i.date))
    const allDates = isNew && repeat.enabled ? generateRepeatDates(f.date, repeat) : [f.date]
    const datesToCreate = allDates.filter(d => !conflictDatesToSkip.has(d))
    setBulkReview(null)
    commitDates(datesToCreate)
  }

  function deleteEvent() {
    setState(s => ({
      ...s,
      schedule: {
        ...s.schedule,
        games:         s.schedule.games.filter(g => g.id !== f.id),
        practices:     s.schedule.practices.filter(p => p.id !== f.id),
        specialEvents: (s.schedule.specialEvents ?? []).filter(se => se.id !== f.id),
      }
    }))
    onClose()
  }

  const fmtDateLong = (s: string) =>
    s ? new Date(s + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '—'

  const saveLabel = isNew && repeat.enabled && repeatDates.length > 1
    ? `Add ${repeatDates.length} Events`
    : f.id ? 'Save Changes' : 'Add Event'

  // ── Bulk conflict review screen ────────────────────────────────────────────
  if (bulkReview) {
    const allDates = isNew && repeat.enabled ? generateRepeatDates(f.date, repeat) : [f.date]
    const conflictDates = new Set(bulkReview.map(i => i.date))
    const cleanCount = allDates.filter(d => !conflictDates.has(d)).length
    const keepCount  = bulkReview.filter(i => i.action === 'keep').length
    const willCreate = cleanCount + keepCount

    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>

          {/* Header */}
          <div className="px-6 py-4 border-b">
            <h3 className="font-semibold text-gray-900 text-base">⚠️ Scheduling Conflicts Found</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              {bulkReview.length} of {allDates.length} dates have conflicts. Choose what to do for each.
            </p>
          </div>

          {/* Conflict list */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            {bulkReview.map((item, idx) => {
              const dateLabel = new Date(item.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
              const hardConflict = item.conflicts.some(c => c.kind === 'field' || c.kind === 'hours')
              return (
                <div key={item.date} className={`rounded-xl border p-3 space-y-2 ${hardConflict ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm font-semibold ${hardConflict ? 'text-red-700' : 'text-amber-700'}`}>{dateLabel}</p>
                    {/* Action toggle */}
                    <div className="flex rounded-lg border overflow-hidden text-xs font-medium shrink-0">
                      <button
                        type="button"
                        onClick={() => setBulkReview(prev => prev!.map((i, j) => j === idx ? { ...i, action: 'skip' } : i))}
                        className={`px-2.5 py-1 transition ${item.action === 'skip' ? 'bg-gray-700 text-white' : 'bg-white text-gray-500 hover:bg-gray-100'}`}
                      >
                        Skip
                      </button>
                      <button
                        type="button"
                        onClick={() => setBulkReview(prev => prev!.map((i, j) => j === idx ? { ...i, action: 'keep' } : i))}
                        className={`px-2.5 py-1 border-l transition ${item.action === 'keep' ? 'bg-[var(--fd-primary)] text-white' : 'bg-white text-gray-500 hover:bg-gray-100'}`}
                      >
                        Keep anyway
                      </button>
                    </div>
                  </div>
                  <ul className={`space-y-1 text-xs ${hardConflict ? 'text-red-600' : 'text-amber-700'}`}>
                    {item.conflicts.map((c, ci) => (
                      <li key={ci} className="flex items-start gap-1.5">
                        <span className="mt-0.5 shrink-0">{c.kind === 'field' || c.kind === 'hours' ? '🔴' : c.kind === 'teamblackout' ? '🟠' : '🟡'}</span>
                        <span><span className="font-semibold capitalize">{c.kind === 'teamblackout' ? 'Blackout' : c.kind}: </span>{c.message}</span>
                      </li>
                    ))}
                  </ul>
                  {item.action === 'skip' && (
                    <p className="text-xs text-gray-400 italic">This date will not be created.</p>
                  )}
                  {item.action === 'keep' && (
                    <p className={`text-xs italic ${hardConflict ? 'text-red-500' : 'text-amber-600'}`}>This event will be created with the conflict.</p>
                  )}
                </div>
              )
            })}

            {/* Summary */}
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-700">
              {willCreate > 0
                ? <><span className="font-semibold">{willCreate} event{willCreate !== 1 ? 's' : ''}</span> will be created ({cleanCount} clean{keepCount > 0 ? `, ${keepCount} kept with conflict` : ''}).</>
                : <span className="font-semibold text-red-600">All dates are set to Skip — nothing will be created.</span>
              }
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t bg-gray-50 rounded-b-2xl flex items-center justify-between">
            <button
              type="button"
              onClick={() => { setBulkReview(null); onClose() }}
              className="text-sm text-red-400 hover:text-red-600 transition"
            >
              Cancel all
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setBulkReview(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition"
              >
                ← Back to edit
              </button>
              <button
                type="button"
                onClick={confirmBulkSave}
                disabled={willCreate === 0}
                className="px-5 py-2 text-sm font-semibold bg-[var(--fd-primary)] text-white rounded-xl hover:bg-[var(--fd-primary-dark)] transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Create {willCreate} Event{willCreate !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b">
          <div>
            <h3 className="font-semibold text-gray-900 text-base">{f.id ? 'Edit Event' : 'New Event'}</h3>
            <p className="text-sm text-gray-500 mt-0.5">{fmtDateLong(f.date)}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none mt-0.5">×</button>
        </div>

        <div className="px-6 py-5 space-y-5">

          {/* Date */}
          <FF label="Date">
            <input
              type="date"
              className="input"
              value={f.date}
              onChange={e => upd({ date: e.target.value })}
            />
          </FF>

          {/* Type toggle */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Event Type</label>
            <div className="grid grid-cols-3 rounded-xl border overflow-hidden">
              <button
                onClick={() => upd({ type: 'game', endTime: defaultEndTime(f.time, state.season.gameDurationMinutes || 90), teamId: '' })}
                className={`py-2.5 text-sm font-medium transition ${f.type === 'game' ? 'bg-[var(--fd-primary)] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >{sc.eventSingular}</button>
              <button
                onClick={() => upd({ type: 'practice', endTime: defaultEndTime(f.time, state.season.practiceDurationMinutes || 90), homeTeamId: '', awayTeamId: '', umpireId: '' })}
                className={`py-2.5 text-sm font-medium border-l transition ${f.type === 'practice' ? 'bg-[var(--fd-primary)] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >Practice</button>
              <button
                onClick={() => upd({ type: 'special', endTime: defaultEndTime(f.time, 60), divisionId: '', homeTeamId: '', awayTeamId: '', teamId: '', umpireId: '', fieldId: '' })}
                className={`py-2.5 text-sm font-medium border-l transition ${f.type === 'special' ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >Special Event</button>
            </div>
          </div>

          {/* Special event fields */}
          {f.type === 'special' && (
            <>
              <FF label="Event Name">
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Opening Day, End-of-Season Party…"
                  value={f.specialName ?? ''}
                  onChange={e => upd({ specialName: e.target.value })}
                  autoFocus
                />
              </FF>
              <FF label="Location (optional)">
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Community Center, 123 Main St…"
                  value={f.specialLocation ?? ''}
                  onChange={e => upd({ specialLocation: e.target.value })}
                />
              </FF>
              <FF label="Comments (optional)">
                <textarea
                  className="input resize-none"
                  rows={3}
                  placeholder="Any notes about this event…"
                  value={f.specialComments ?? ''}
                  onChange={e => upd({ specialComments: e.target.value })}
                />
              </FF>
            </>
          )}

          {/* Division (game/practice only) */}
          {f.type !== 'special' && (
            <FF label="Division">
              <select className="input" value={f.divisionId} onChange={e => upd({ divisionId: e.target.value, homeTeamId: '', awayTeamId: '', teamId: '' })}>
                <option value="">— select division —</option>
                {state.divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </FF>
          )}

          {/* Game fields */}
          {f.type === 'game' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <FF label="Home Team">
                  <select className="input" value={f.homeTeamId} onChange={e => upd({ homeTeamId: e.target.value })} disabled={!f.divisionId}>
                    <option value="">— select —</option>
                    {homeOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </FF>
                <FF label="Away Team">
                  <select className="input" value={f.awayTeamId} onChange={e => upd({ awayTeamId: e.target.value })} disabled={!f.divisionId}>
                    <option value="">— select —</option>
                    {awayOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </FF>
              </div>

              <FF label={sc.officialSingular}>
                <select className="input" value={f.umpireId} onChange={e => upd({ umpireId: e.target.value })}>
                  <option value="">TBD / Unassigned</option>
                  {state.umpires.map(u => <option key={u.id} value={u.id}>{u.name}{u.phone ? ` — ${u.phone}` : ''}</option>)}
                </select>
              </FF>
            </>
          )}

          {/* Practice team */}
          {f.type === 'practice' && (
            <FF label="Team">
              <select className="input" value={f.teamId} onChange={e => upd({ teamId: e.target.value })} disabled={!f.divisionId}>
                <option value="">— select team —</option>
                {divTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </FF>
          )}

          {/* Field (game/practice only) */}
          {f.type !== 'special' && (
            <FF label={sc.venueSingular}>
              <select className="input" value={f.fieldId} onChange={e => upd({ fieldId: e.target.value })}>
                <option value="">— select field —</option>
                {state.fields.map(fld => {
                  const isBlackedOut = fieldAvailability.blackedOut.has(fld.id)
                  const isBooked     = fieldAvailability.booked.has(fld.id)
                  const unavailable  = isBlackedOut || isBooked
                  const suffix = fld.location ? ` — ${fld.location}` : fld.address ? ` — ${fld.address}` : ''
                  const label  = isBlackedOut ? `${fld.name}${suffix} — Blackout`
                               : isBooked     ? `${fld.name}${suffix} — Booked`
                               : `${fld.name}${suffix}`
                  return (
                    <option key={fld.id} value={fld.id} disabled={unavailable}>
                      {label}
                    </option>
                  )
                })}
              </select>
            </FF>
          )}

          {/* Time range */}
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <FF label="Start Time">
                <input type="time" className="input" min={FIELD_OPEN} max={FIELD_CLOSE} value={f.time} onChange={e => upd({ time: e.target.value })} />
              </FF>
              <FF label="End Time">
                <input type="time" className="input" min={FIELD_OPEN} max={FIELD_CLOSE} value={f.endTime} onChange={e => upd({ endTime: e.target.value })} />
              </FF>
            </div>
            <p className="text-xs text-gray-400">
              {f.type !== 'special' && 'Fields are open 8:00 AM – 8:00 PM · '}{f.time && f.endTime && toMins(f.endTime) > toMins(f.time) ? `${toMins(f.endTime) - toMins(f.time)} min` : '—'}
            </p>
          </div>

          {/* ── Repeat section (new game/practice only) ── */}
          {isNew && f.type !== 'special' && (
            <div className="border rounded-xl overflow-hidden">
              {/* Toggle header */}
              <button
                type="button"
                onClick={() => updRepeat({ enabled: !repeat.enabled })}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition"
              >
                <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <span className="text-base">🔁</span> Repeat this event
                </span>
                <span className={`w-9 h-5 rounded-full transition-colors relative ${repeat.enabled ? 'bg-[var(--fd-primary)]' : 'bg-gray-300'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${repeat.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </span>
              </button>

              {/* Repeat options */}
              {repeat.enabled && (
                <div className="px-4 py-4 space-y-4 border-t">

                  {/* Frequency */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Frequency</label>
                    <div className="grid grid-cols-3 rounded-lg border overflow-hidden text-sm">
                      {(['daily', 'weekly', 'monthly'] as RepeatFrequency[]).map(freq => (
                        <button
                          key={freq}
                          type="button"
                          onClick={() => updRepeat({ frequency: freq })}
                          className={`py-2 font-medium capitalize transition border-r last:border-r-0 ${repeat.frequency === freq ? 'bg-[var(--fd-primary)] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                        >
                          {freq}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* End condition */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">End after</label>
                    <div className="grid grid-cols-2 rounded-lg border overflow-hidden text-sm mb-3">
                      <button
                        type="button"
                        onClick={() => updRepeat({ endType: 'count' })}
                        className={`py-2 font-medium transition border-r ${repeat.endType === 'count' ? 'bg-[var(--fd-primary)] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                      >
                        # of occurrences
                      </button>
                      <button
                        type="button"
                        onClick={() => updRepeat({ endType: 'date' })}
                        className={`py-2 font-medium transition ${repeat.endType === 'date' ? 'bg-[var(--fd-primary)] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                      >
                        End date
                      </button>
                    </div>

                    {repeat.endType === 'count' ? (
                      <div className="flex items-center gap-3">
                        <input
                          type="number"
                          min={1}
                          max={104}
                          value={repeat.count}
                          onChange={e => updRepeat({ count: Math.max(1, Math.min(104, Number(e.target.value))) })}
                          className="input w-24 text-center"
                        />
                        <span className="text-sm text-gray-500">
                          occurrence{repeat.count !== 1 ? 's' : ''} total
                        </span>
                      </div>
                    ) : (
                      <input
                        type="date"
                        value={repeat.endDate}
                        min={f.date}
                        onChange={e => updRepeat({ endDate: e.target.value })}
                        className="input"
                      />
                    )}
                  </div>

                  {/* Preview */}
                  {repeatDates.length > 0 && (
                    <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5">
                      <p className="text-xs font-semibold text-blue-700 mb-1">
                        {repeatDates.length} event{repeatDates.length !== 1 ? 's' : ''} will be created
                      </p>
                      <p className="text-xs text-blue-600">
                        {repeatDates.slice(0, 3).map(d =>
                          new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                        ).join(', ')}
                        {repeatDates.length > 3 && ` … ${new Date(repeatDates[repeatDates.length - 1] + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Game Result (edit mode, games only) ── */}
          {!isNew && f.type === 'game' && (
            <div className="border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
                <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <TrophyIcon className="w-4 h-4 text-gray-500" /> Game Result
                </span>
                {f.result !== undefined && (
                  <button
                    type="button"
                    onClick={() => upd({ result: undefined })}
                    className="text-xs text-gray-400 hover:text-red-500 transition"
                  >
                    Clear result
                  </button>
                )}
              </div>
              <div className="px-4 py-4 border-t">
                <div className="grid grid-cols-2 gap-3">
                  <FF label={`${teamMap.get(f.homeTeamId)?.name ?? 'Home'} (Home)`}>
                    <input
                      type="number"
                      min={0}
                      placeholder="0"
                      value={f.result?.homeScore ?? ''}
                      onChange={e => {
                        const val = e.target.value
                        if (val === '') { upd({ result: undefined }); return }
                        upd({ result: { homeScore: Number(val), awayScore: f.result?.awayScore ?? 0 } })
                      }}
                      className="input text-center text-lg font-bold"
                    />
                  </FF>
                  <FF label={`${teamMap.get(f.awayTeamId)?.name ?? 'Away'} (Away)`}>
                    <input
                      type="number"
                      min={0}
                      placeholder="0"
                      value={f.result?.awayScore ?? ''}
                      onChange={e => {
                        const val = e.target.value
                        if (val === '') { upd({ result: undefined }); return }
                        upd({ result: { homeScore: f.result?.homeScore ?? 0, awayScore: Number(val) } })
                      }}
                      className="input text-center text-lg font-bold"
                    />
                  </FF>
                </div>
                {f.result !== undefined && (
                  <p className="text-xs text-center text-gray-500 mt-2">
                    {f.result.homeScore > f.result.awayScore
                      ? `${teamMap.get(f.homeTeamId)?.name ?? 'Home'} wins`
                      : f.result.awayScore > f.result.homeScore
                        ? `${teamMap.get(f.awayTeamId)?.name ?? 'Away'} wins`
                        : 'Tie game'}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Conflicts (not shown for special events) */}
          {f.type !== 'special' && conflicts.length > 0 && (
            <div className="space-y-2">
              {conflicts.map((c, i) => (
                <div key={i} className={`flex items-start gap-2 text-sm px-3 py-2.5 rounded-lg border ${
                  c.kind === 'field' || c.kind === 'hours' ? 'bg-red-50 border-red-200 text-red-700'
                  : c.kind === 'team' ? 'bg-amber-50 border-amber-200 text-amber-700'
                  : c.kind === 'teamblackout' ? 'bg-orange-50 border-orange-200 text-orange-700'
                  : 'bg-yellow-50 border-yellow-200 text-yellow-700'
                }`}>
                  <span>
                    <span className="font-semibold">
                      {c.kind === 'field' ? `${sc.venueSingular} conflict — ` : c.kind === 'hours' ? 'Outside hours — ' : c.kind === 'team' ? 'Team conflict — ' : c.kind === 'teamblackout' ? 'Team blackout — ' : `${sc.officialSingular} conflict — `}
                    </span>
                    {c.message}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50 rounded-b-2xl">
          {f.id ? (
            deleteConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-red-600 font-medium">Delete this event?</span>
                <button onClick={deleteEvent} className="text-sm bg-red-500 text-white px-3 py-1 rounded-lg hover:bg-red-600 transition">Delete</button>
                <button onClick={() => setDeleteConfirm(false)} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setDeleteConfirm(true)} className="text-sm text-red-400 hover:text-red-600 transition">Delete event</button>
            )
          ) : <div />}

          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition">Cancel</button>
            <button
              onClick={save}
              disabled={!canSave()}
              className="px-5 py-2 text-sm font-semibold bg-[var(--fd-primary)] text-white rounded-xl hover:bg-[var(--fd-primary-dark)] transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saveLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function FF({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{label}</label>
      {children}
    </div>
  )
}
