'use client'
import { useState, useMemo } from 'react'
import type { AppState, ScheduledGame, ScheduledPractice } from '@/lib/types'

// ── Shared types ──────────────────────────────────────────────────────────────
export interface EventForm {
  id: string | null
  type: 'game' | 'practice'
  date: string
  divisionId: string
  homeTeamId: string
  awayTeamId: string
  teamId: string
  umpireId: string
  fieldId: string
  time: string      // "HH:MM"
  endTime: string   // "HH:MM"
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }
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
  return { id: null, type: 'game', date, divisionId: '', homeTeamId: '', awayTeamId: '', teamId: '', umpireId: '', fieldId: '', time: start, endTime: defaultEndTime(start, gameDuration) }
}

export function formFromEvent(ev: ScheduledGame | ScheduledPractice): EventForm {
  const dur = ev.durationMinutes || 90
  const endTime = minsToTime(toMins(ev.time) + dur)
  if (ev.type === 'game') {
    const g = ev as ScheduledGame
    return { id: g.id, type: 'game', date: g.date, divisionId: g.divisionId, homeTeamId: g.homeTeamId, awayTeamId: g.awayTeamId, teamId: '', umpireId: g.umpireId, fieldId: g.fieldId, time: g.time, endTime }
  } else {
    const p = ev as ScheduledPractice
    return { id: p.id, type: 'practice', date: p.date, divisionId: p.divisionId, homeTeamId: '', awayTeamId: '', teamId: p.teamId, umpireId: '', fieldId: p.fieldId, time: p.time, endTime }
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  state: AppState
  setState: React.Dispatch<React.SetStateAction<AppState>>
  initialForm: EventForm
  onClose: () => void
}

export default function EventModal({ state, setState, initialForm, onClose }: Props) {
  const [form, setForm] = useState<EventForm>(initialForm)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  const f = form

  const fieldMap  = useMemo(() => new Map(state.fields.map(fi => [fi.id, fi])), [state.fields])
  const teamMap   = useMemo(() => new Map(state.divisions.flatMap(d => d.teams).map(t => [t.id, t])), [state.divisions])
  const umpireMap = useMemo(() => new Map(state.umpires.map(u => [u.id, u])), [state.umpires])
  const divMap    = useMemo(() => new Map(state.divisions.map(d => [d.id, d])), [state.divisions])

  const divTeams    = divMap.get(f.divisionId)?.teams ?? []
  const homeOptions = divTeams.filter(t => t.id !== f.awayTeamId)
  const awayOptions = divTeams.filter(t => t.id !== f.homeTeamId)

  function upd(patch: Partial<EventForm>) { setForm(prev => ({ ...prev, ...patch })) }

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

  function canSave() {
    if (!f.date || !f.time || !f.endTime || !f.fieldId || !f.divisionId) return false
    if (hasHardConflict) return false
    if (f.type === 'game') return !!(f.homeTeamId && f.awayTeamId && f.homeTeamId !== f.awayTeamId)
    return !!f.teamId
  }

  function save() {
    const id = f.id ?? uid()
    const durationMinutes = toMins(f.endTime) - toMins(f.time)
    setState(s => {
      const games     = s.schedule.games.filter(g => g.id !== f.id)
      const practices = s.schedule.practices.filter(p => p.id !== f.id)
      if (f.type === 'game') {
        games.push({ id, type: 'game', date: f.date, time: f.time, durationMinutes, fieldId: f.fieldId, homeTeamId: f.homeTeamId, awayTeamId: f.awayTeamId, umpireId: f.umpireId, divisionId: f.divisionId })
      } else {
        practices.push({ id, type: 'practice', date: f.date, time: f.time, durationMinutes, fieldId: f.fieldId, teamId: f.teamId, divisionId: f.divisionId })
      }
      return { ...s, schedule: { ...s.schedule, games, practices, generatedAt: new Date().toISOString() } }
    })
    onClose()
  }

  function deleteEvent() {
    setState(s => ({
      ...s,
      schedule: {
        ...s.schedule,
        games:     s.schedule.games.filter(g => g.id !== f.id),
        practices: s.schedule.practices.filter(p => p.id !== f.id),
      }
    }))
    onClose()
  }

  const fmtDateLong = (s: string) =>
    s ? new Date(s + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '—'

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

          {/* Date (editable so Team Schedule tab can set it too) */}
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
            <div className="grid grid-cols-2 rounded-xl border overflow-hidden">
              <button
                onClick={() => upd({ type: 'game', endTime: defaultEndTime(f.time, state.season.gameDurationMinutes || 90), teamId: '' })}
                className={`py-2.5 text-sm font-medium transition ${f.type === 'game' ? 'bg-[#cd163f] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >Game</button>
              <button
                onClick={() => upd({ type: 'practice', endTime: defaultEndTime(f.time, state.season.practiceDurationMinutes || 90), homeTeamId: '', awayTeamId: '', umpireId: '' })}
                className={`py-2.5 text-sm font-medium border-l transition ${f.type === 'practice' ? 'bg-[#cd163f] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >Practice</button>
            </div>
          </div>

          {/* Division */}
          <FF label="Division">
            <select className="input" value={f.divisionId} onChange={e => upd({ divisionId: e.target.value, homeTeamId: '', awayTeamId: '', teamId: '' })}>
              <option value="">— select division —</option>
              {state.divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </FF>

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

              <FF label="Umpire">
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

          {/* Field */}
          <FF label="Field">
            <select className="input" value={f.fieldId} onChange={e => upd({ fieldId: e.target.value })}>
              <option value="">— select field —</option>
              {state.fields.map(fld => <option key={fld.id} value={fld.id}>{fld.name}{fld.location ? ` — ${fld.location}` : ''}</option>)}
            </select>
          </FF>

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
              Fields are open 8:00 AM – 8:00 PM · {f.time && f.endTime && toMins(f.endTime) > toMins(f.time) ? `${toMins(f.endTime) - toMins(f.time)} min` : '—'}
            </p>
          </div>

          {/* Conflicts */}
          {conflicts.length > 0 && (
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
                      {c.kind === 'field' ? 'Field conflict — ' : c.kind === 'hours' ? 'Outside hours — ' : c.kind === 'team' ? 'Team conflict — ' : c.kind === 'teamblackout' ? 'Team blackout — ' : 'Umpire conflict — '}
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
              className="px-5 py-2 text-sm font-semibold bg-[#cd163f] text-white rounded-xl hover:bg-[#00013a] transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {f.id ? 'Save Changes' : 'Add Event'}
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
