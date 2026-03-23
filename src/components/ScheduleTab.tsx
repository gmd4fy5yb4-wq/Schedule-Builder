'use client'
import { useState, useMemo } from 'react'
import type { AppState, ScheduledGame, ScheduledPractice } from '@/lib/types'
import { exportToExcel } from '@/lib/export'
import { getDivisionColor } from '@/lib/divisionColors'

interface Props { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>> }

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }

function toMins(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
function minsToTime(mins: number) {
  const h = Math.floor(mins / 60) % 24
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function fmtTime(t: string) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}
function fmtDateLong(s: string) {
  return new Date(s + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}
function fmtDateShort(s: string) {
  return new Date(s + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_HEADERS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

const FIELD_OPEN  = '08:00'  // 8 AM
const FIELD_CLOSE = '19:00'  // 7 PM

interface EventForm {
  id: string | null
  type: 'game' | 'practice'
  date: string
  divisionId: string
  homeTeamId: string
  awayTeamId: string
  teamId: string
  umpireId: string
  fieldId: string
  time: string      // start time "HH:MM"
  endTime: string   // end time  "HH:MM"
}

function defaultEndTime(startTime: string, durationMins: number): string {
  const end = toMins(startTime) + durationMins
  // clamp to 7 PM
  return minsToTime(Math.min(end, toMins(FIELD_CLOSE)))
}

function emptyForm(date = '', gameDuration = 90): EventForm {
  const start = '17:00'
  return { id: null, type: 'game', date, divisionId: '', homeTeamId: '', awayTeamId: '', teamId: '', umpireId: '', fieldId: '', time: start, endTime: defaultEndTime(start, gameDuration) }
}

export default function ScheduleTab({ state, setState }: Props) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [view, setView] = useState<'calendar' | 'list'>('calendar')
  const [modal, setModal] = useState<{ open: boolean; form: EventForm }>({ open: false, form: emptyForm() })
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [filterDiv, setFilterDiv] = useState('all')
  const [filterType, setFilterType] = useState<'all' | 'game' | 'practice'>('all')
  const [exporting, setExporting] = useState(false)
  const [clearConfirm, setClearConfirm] = useState(false)

  const teamMap = useMemo(() => new Map(state.divisions.flatMap(d => d.teams).map(t => [t.id, t])), [state.divisions])
  const fieldMap = useMemo(() => new Map(state.fields.map(f => [f.id, f])), [state.fields])
  const umpireMap = useMemo(() => new Map(state.umpires.map(u => [u.id, u])), [state.umpires])
  const divMap = useMemo(() => new Map(state.divisions.map(d => [d.id, d])), [state.divisions])
  const blackoutSet = useMemo(() => new Set((state.blackoutDates ?? []).map(d => d.split('::')[0])), [state.blackoutDates])

  // Declare f early so conflict detection useMemo can reference it
  const f = modal.form

  // ── Conflict detection ──────────────────────────────────────────────
  const conflicts = useMemo(() => {
    type Conflict = { kind: 'field' | 'team' | 'umpire' | 'hours'; message: string }
    const result: Conflict[] = []
    if (!f.date || !f.time || !f.endTime) return result

    const fStart = toMins(f.time)
    const fEnd   = toMins(f.endTime)

    // Outside 8 AM – 7 PM window
    if (fStart < toMins(FIELD_OPEN)) {
      result.push({ kind: 'hours', message: `Start time is before 8:00 AM — fields open at 8 AM.` })
    }
    if (fEnd > toMins(FIELD_CLOSE)) {
      result.push({ kind: 'hours', message: `End time is after 7:00 PM — fields close at 7 PM.` })
    }
    if (fEnd <= fStart) {
      result.push({ kind: 'hours', message: `End time must be after start time.` })
    }

    if (fEnd <= fStart) return result  // skip overlap checks if times are invalid

    const others = [
      ...state.schedule.games,
      ...state.schedule.practices,
    ].filter(ev => ev.id !== f.id && ev.date === f.date)

    for (const ev of others) {
      const evStart = toMins(ev.time)
      const evEnd   = evStart + (ev.durationMinutes || 90)
      if (fStart >= evEnd || evStart >= fEnd) continue   // no overlap

      const evRange = `${fmtTime(ev.time)}–${fmtTime(minsToTime(evEnd))}`

      // Field conflict (hard block)
      if (f.fieldId && ev.fieldId === f.fieldId) {
        const name = fieldMap.get(f.fieldId)?.name ?? 'That field'
        result.push({ kind: 'field', message: `${name} is already booked ${evRange}` })
      }

      // Team conflict (warning)
      const evTeams = ev.type === 'game'
        ? [(ev as ScheduledGame).homeTeamId, (ev as ScheduledGame).awayTeamId]
        : [(ev as ScheduledPractice).teamId]
      const fTeams = f.type === 'game'
        ? [f.homeTeamId, f.awayTeamId].filter(Boolean)
        : [f.teamId].filter(Boolean)
      for (const tid of fTeams) {
        if (tid && evTeams.includes(tid)) {
          const tname = teamMap.get(tid)?.name ?? 'A team'
          result.push({ kind: 'team', message: `${tname} already has an event overlapping ${evRange}` })
        }
      }

      // Umpire conflict (warning)
      if (
        f.type === 'game' && f.umpireId &&
        ev.type === 'game' && (ev as ScheduledGame).umpireId === f.umpireId
      ) {
        const uname = umpireMap.get(f.umpireId)?.name ?? 'That umpire'
        result.push({ kind: 'umpire', message: `${uname} is already assigned to a game overlapping ${evRange}` })
      }
    }
    return result
  }, [f, state.schedule, fieldMap, teamMap, umpireMap])

  const hasHardConflict = conflicts.some(c => c.kind === 'field' || c.kind === 'hours')

  const eventsByDate = useMemo(() => {
    const map = new Map<string, (ScheduledGame | ScheduledPractice)[]>()
    for (const ev of [...state.schedule.games, ...state.schedule.practices]) {
      if (!map.has(ev.date)) map.set(ev.date, [])
      map.get(ev.date)!.push(ev)
    }
    for (const [, evs] of map) evs.sort((a, b) => a.time.localeCompare(b.time))
    return map
  }, [state.schedule])

  // Calendar helpers
  const firstDow = new Date(year, month, 1).getDay()
  const numDays = new Date(year, month + 1, 0).getDate()
  const todayStr = today.toISOString().split('T')[0]

  function prevMonth() { month === 0 ? (setMonth(11), setYear(y => y - 1)) : setMonth(m => m - 1) }
  function nextMonth() { month === 11 ? (setMonth(0), setYear(y => y + 1)) : setMonth(m => m + 1) }
  function goToday() { setYear(today.getFullYear()); setMonth(today.getMonth()) }

  // Modal helpers
  const divTeams = divMap.get(f.divisionId)?.teams ?? []
  const homeOptions = divTeams.filter(t => t.id !== f.awayTeamId)
  const awayOptions = divTeams.filter(t => t.id !== f.homeTeamId)

  function openAdd(date: string) {
    setDeleteConfirm(false)
    setModal({ open: true, form: emptyForm(date, state.season.gameDurationMinutes || 90) })
  }

  function openEdit(ev: ScheduledGame | ScheduledPractice) {
    setDeleteConfirm(false)
    const dur = ev.durationMinutes || 90
    const endTime = minsToTime(toMins(ev.time) + dur)
    if (ev.type === 'game') {
      const g = ev as ScheduledGame
      setModal({ open: true, form: { id: g.id, type: 'game', date: g.date, divisionId: g.divisionId, homeTeamId: g.homeTeamId, awayTeamId: g.awayTeamId, teamId: '', umpireId: g.umpireId, fieldId: g.fieldId, time: g.time, endTime } })
    } else {
      const p = ev as ScheduledPractice
      setModal({ open: true, form: { id: p.id, type: 'practice', date: p.date, divisionId: p.divisionId, homeTeamId: '', awayTeamId: '', teamId: p.teamId, umpireId: '', fieldId: p.fieldId, time: p.time, endTime } })
    }
  }

  function closeModal() { setModal(m => ({ ...m, open: false })); setDeleteConfirm(false) }

  function upd(patch: Partial<EventForm>) { setModal(m => ({ ...m, form: { ...m.form, ...patch } })) }

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
      const games = s.schedule.games.filter(g => g.id !== f.id)
      const practices = s.schedule.practices.filter(p => p.id !== f.id)
      if (f.type === 'game') {
        games.push({ id, type: 'game' as const, date: f.date, time: f.time, durationMinutes, fieldId: f.fieldId, homeTeamId: f.homeTeamId, awayTeamId: f.awayTeamId, umpireId: f.umpireId, divisionId: f.divisionId })
      } else {
        practices.push({ id, type: 'practice' as const, date: f.date, time: f.time, durationMinutes, fieldId: f.fieldId, teamId: f.teamId, divisionId: f.divisionId })
      }
      return { ...s, schedule: { ...s.schedule, games, practices, generatedAt: new Date().toISOString() } }
    })
    closeModal()
  }

  function deleteEvent() {
    setState(s => ({
      ...s,
      schedule: {
        ...s.schedule,
        games: s.schedule.games.filter(g => g.id !== f.id),
        practices: s.schedule.practices.filter(p => p.id !== f.id),
      }
    }))
    closeModal()
  }

  function clearSchedule() {
    setState(s => ({ ...s, schedule: { games: [], practices: [], generatedAt: null, warnings: [] } }))
    setClearConfirm(false)
  }

  async function doExport() {
    setExporting(true)
    try { await exportToExcel(state.divisions, state.fields, state.umpires, state.schedule.games, state.schedule.practices) }
    finally { setExporting(false) }
  }

  // List view
  const allItems = useMemo(() => {
    return ([...state.schedule.games, ...state.schedule.practices] as (ScheduledGame | ScheduledPractice)[])
      .filter(i => filterDiv === 'all' || i.divisionId === filterDiv)
      .filter(i => filterType === 'all' || i.type === filterType)
      .sort((a, b) => { const dc = a.date.localeCompare(b.date); return dc !== 0 ? dc : a.time.localeCompare(b.time) })
  }, [state.schedule, filterDiv, filterType])

  const totalGames = state.schedule.games.length
  const totalPractices = state.schedule.practices.length

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-gray-800">Schedule</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-gray-500">{totalGames} game{totalGames !== 1 ? 's' : ''} · {totalPractices} practice{totalPractices !== 1 ? 's' : ''}</span>
          <div className="flex rounded border overflow-hidden text-sm">
            <button onClick={() => setView('calendar')} className={`px-3 py-1.5 transition ${view === 'calendar' ? 'bg-green-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>📅 Calendar</button>
            <button onClick={() => setView('list')} className={`px-3 py-1.5 border-l transition ${view === 'list' ? 'bg-green-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>☰ List</button>
          </div>
          {(totalGames + totalPractices) > 0 && (
            <button onClick={doExport} disabled={exporting} className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700 transition disabled:opacity-50">
              {exporting ? 'Exporting…' : '⬇ Export Excel'}
            </button>
          )}
          {(totalGames + totalPractices) > 0 && (
            clearConfirm ? (
              <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded px-2 py-1">
                <span className="text-xs text-red-700 font-medium">Clear all events?</span>
                <button onClick={clearSchedule} className="text-xs bg-red-500 text-white px-2 py-0.5 rounded hover:bg-red-600 transition">Yes, clear</button>
                <button onClick={() => setClearConfirm(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setClearConfirm(true)} className="text-sm text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-3 py-1.5 rounded transition">
                🗑 Clear All
              </button>
            )
          )}
        </div>
      </div>

      {/* ── CALENDAR VIEW ── */}
      {view === 'calendar' && (
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          {/* Month nav */}
          <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b">
            <button onClick={prevMonth} className="p-1.5 rounded hover:bg-gray-200 transition text-gray-600 text-lg leading-none">‹</button>
            <h3 className="font-semibold text-gray-800 flex-1 text-center">{MONTHS[month]} {year}</h3>
            <button onClick={nextMonth} className="p-1.5 rounded hover:bg-gray-200 transition text-gray-600 text-lg leading-none">›</button>
            <button onClick={goToday} className="text-xs text-green-700 hover:text-green-800 border border-green-300 rounded px-2 py-1 hover:bg-green-50 transition">Today</button>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 border-b bg-gray-50">
            {DAY_HEADERS.map(d => (
              <div key={d} className="text-center text-xs font-semibold text-gray-500 py-2 uppercase tracking-wide">{d}</div>
            ))}
          </div>

          {/* Grid */}
          <div className="grid grid-cols-7">
            {/* Leading blanks */}
            {Array.from({ length: firstDow }).map((_, i) => (
              <div key={`b${i}`} className={`min-h-[110px] bg-gray-50 border-b ${i < 6 ? 'border-r' : ''}`} />
            ))}

            {/* Day cells */}
            {Array.from({ length: numDays }).map((_, i) => {
              const day = i + 1
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const isBlackout = blackoutSet.has(dateStr)
              const isToday = dateStr === todayStr
              const col = (firstDow + i) % 7
              const events = eventsByDate.get(dateStr) ?? []

              return (
                <div
                  key={day}
                  className={`min-h-[110px] border-b p-1.5 relative group flex flex-col ${col < 6 ? 'border-r' : ''} ${isBlackout ? 'bg-red-50' : 'hover:bg-slate-50 transition-colors'}`}
                >
                  {/* Date number + add button */}
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full ${
                      isToday ? 'bg-green-600 text-white' : isBlackout ? 'text-red-400' : 'text-gray-600'
                    }`}>{day}</span>
                    {isBlackout
                      ? <span className="text-xs text-red-300 italic">closed</span>
                      : <button onClick={() => openAdd(dateStr)} className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded-full text-green-600 hover:bg-green-100 transition text-base leading-none" title="Add event">+</button>
                    }
                  </div>

                  {/* Events */}
                  <div className="flex-1 space-y-0.5">
                    {events.slice(0, 4).map(ev => {
                      const c = getDivisionColor(ev.divisionId, state.divisions)
                      const isPractice = ev.type === 'practice'
                      const label = ev.type === 'game'
                        ? `${teamMap.get((ev as ScheduledGame).homeTeamId)?.name ?? '?'} vs ${teamMap.get((ev as ScheduledGame).awayTeamId)?.name ?? '?'}`
                        : `${teamMap.get((ev as ScheduledPractice).teamId)?.name ?? '?'} practice`
                      return (
                        <button
                          key={ev.id}
                          onClick={() => openEdit(ev)}
                          className={`w-full text-left text-xs px-1.5 py-0.5 rounded truncate border transition hover:opacity-75 ${
                            isPractice ? 'bg-gray-100 text-gray-600 border-gray-200' : `${c.bg} ${c.text} ${c.border}`
                          }`}
                          title={`${fmtTime(ev.time)}–${ev.durationMinutes ? fmtTime(minsToTime(toMins(ev.time) + ev.durationMinutes)) : '?'} — ${label}`}
                        >
                          <span className="font-medium">{fmtTime(ev.time)}</span> {label}
                        </button>
                      )
                    })}
                    {events.length > 4 && (
                      <button onClick={() => openAdd(dateStr)} className="text-xs text-gray-400 hover:text-gray-600 px-1.5">
                        +{events.length - 4} more
                      </button>
                    )}
                  </div>
                </div>
              )
            })}

            {/* Trailing blanks */}
            {(() => {
              const used = firstDow + numDays
              const trail = used % 7 === 0 ? 0 : 7 - (used % 7)
              return Array.from({ length: trail }).map((_, i) => (
                <div key={`t${i}`} className={`min-h-[110px] bg-gray-50 border-b ${i < trail - 1 ? 'border-r' : ''}`} />
              ))
            })()}
          </div>
        </div>
      )}

      {/* ── LIST VIEW ── */}
      {view === 'list' && (
        <div className="space-y-3">
          <div className="flex gap-3 flex-wrap items-center bg-white rounded-lg border p-3">
            <span className="text-sm font-medium text-gray-600">Filter:</span>
            <select className="border rounded px-2 py-1.5 text-sm" value={filterType} onChange={e => setFilterType(e.target.value as 'all' | 'game' | 'practice')}>
              <option value="all">All Types</option>
              <option value="game">Games Only</option>
              <option value="practice">Practices Only</option>
            </select>
            <select className="border rounded px-2 py-1.5 text-sm" value={filterDiv} onChange={e => setFilterDiv(e.target.value)}>
              <option value="all">All Divisions</option>
              {state.divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <span className="text-xs text-gray-400 ml-auto">{allItems.length} events</span>
          </div>

          <div className="bg-white rounded-lg border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b text-left">
                    {['Date','Start','End','Div','Type','Home / Team','Away','Field','Umpire',''].map(h => (
                      <th key={h} className="px-3 py-2 font-medium text-gray-600 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allItems.map(item => {
                    const c = getDivisionColor(item.divisionId, state.divisions)
                    return (
                      <tr key={item.id} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="px-3 py-2 whitespace-nowrap text-gray-700">{fmtDateShort(item.date)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{fmtTime(item.time)}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-500">{item.durationMinutes ? fmtTime(minsToTime(toMins(item.time) + item.durationMinutes)) : '—'}</td>
                        <td className="px-3 py-2"><span className={`text-xs px-1.5 py-0.5 rounded font-medium ${c.pill}`}>{divMap.get(item.divisionId)?.name}</span></td>
                        <td className="px-3 py-2">
                          {item.type === 'game'
                            ? <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">Game</span>
                            : <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">Practice</span>}
                        </td>
                        <td className="px-3 py-2 font-medium">
                          {item.type === 'game' ? teamMap.get((item as ScheduledGame).homeTeamId)?.name : teamMap.get((item as ScheduledPractice).teamId)?.name}
                        </td>
                        <td className="px-3 py-2 text-gray-600">
                          {item.type === 'game' ? teamMap.get((item as ScheduledGame).awayTeamId)?.name : ''}
                        </td>
                        <td className="px-3 py-2 text-gray-600">{fieldMap.get(item.fieldId)?.name ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-600">
                          {item.type === 'game' ? ((item as ScheduledGame).umpireId ? umpireMap.get((item as ScheduledGame).umpireId)?.name : 'TBD') : ''}
                        </td>
                        <td className="px-3 py-2">
                          <button onClick={() => openEdit(item)} className="text-blue-500 hover:text-blue-700 text-xs">Edit</button>
                        </td>
                      </tr>
                    )
                  })}
                  {allItems.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400 italic">No events yet — switch to Calendar view and click any day to add one.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-2 text-xs">
        {state.divisions.map(d => { const c = getDivisionColor(d.id, state.divisions); return <span key={d.id} className={`px-2 py-0.5 rounded border ${c.bg} ${c.text} ${c.border}`}>{d.name} game</span> })}
        <span className="px-2 py-0.5 rounded border bg-gray-100 text-gray-600 border-gray-200">Practice</span>
        <span className="px-2 py-0.5 rounded border bg-red-50 text-red-400 border-red-200">Blackout date</span>
      </div>

      {/* ── EVENT MODAL ── */}
      {modal.open && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={closeModal}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-start justify-between px-6 py-4 border-b">
              <div>
                <h3 className="font-semibold text-gray-900 text-base">{f.id ? 'Edit Event' : 'New Event'}</h3>
                <p className="text-sm text-gray-500 mt-0.5">{fmtDateLong(f.date)}</p>
              </div>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-2xl leading-none mt-0.5">×</button>
            </div>

            <div className="px-6 py-5 space-y-5">

              {/* Type toggle */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Event Type</label>
                <div className="grid grid-cols-2 rounded-xl border overflow-hidden">
                  <button
                    onClick={() => upd({ type: 'game', endTime: defaultEndTime(f.time, state.season.gameDurationMinutes || 90), teamId: '' })}
                    className={`py-2.5 text-sm font-medium transition ${f.type === 'game' ? 'bg-green-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  >⚾ Game</button>
                  <button
                    onClick={() => upd({ type: 'practice', endTime: defaultEndTime(f.time, state.season.practiceDurationMinutes || 90), homeTeamId: '', awayTeamId: '', umpireId: '' })}
                    className={`py-2.5 text-sm font-medium border-l transition ${f.type === 'practice' ? 'bg-green-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  >🏃 Practice</button>
                </div>
              </div>

              {/* Division */}
              <Field label="Division">
                <select
                  className="input"
                  value={f.divisionId}
                  onChange={e => upd({ divisionId: e.target.value, homeTeamId: '', awayTeamId: '', teamId: '' })}
                >
                  <option value="">— select division —</option>
                  {state.divisions.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </Field>

              {/* Game fields */}
              {f.type === 'game' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Home Team">
                      <select className="input" value={f.homeTeamId} onChange={e => upd({ homeTeamId: e.target.value })} disabled={!f.divisionId}>
                        <option value="">— select —</option>
                        {homeOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </Field>
                    <Field label="Away Team">
                      <select className="input" value={f.awayTeamId} onChange={e => upd({ awayTeamId: e.target.value })} disabled={!f.divisionId}>
                        <option value="">— select —</option>
                        {awayOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </Field>
                  </div>

                  <Field label="Umpire">
                    <select className="input" value={f.umpireId} onChange={e => upd({ umpireId: e.target.value })}>
                      <option value="">TBD / Unassigned</option>
                      {state.umpires.map(u => <option key={u.id} value={u.id}>{u.name}{u.phone ? ` — ${u.phone}` : ''}</option>)}
                    </select>
                  </Field>
                </>
              )}

              {/* Practice team */}
              {f.type === 'practice' && (
                <Field label="Team">
                  <select className="input" value={f.teamId} onChange={e => upd({ teamId: e.target.value })} disabled={!f.divisionId}>
                    <option value="">— select team —</option>
                    {divTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </Field>
              )}

              {/* Field */}
              <Field label="Field">
                <select className="input" value={f.fieldId} onChange={e => upd({ fieldId: e.target.value })}>
                  <option value="">— select field —</option>
                  {state.fields.map(fld => (
                    <option key={fld.id} value={fld.id}>{fld.name}{fld.location ? ` — ${fld.location}` : ''}</option>
                  ))}
                </select>
              </Field>

              {/* Time range */}
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Start Time">
                    <input
                      type="time"
                      className="input"
                      min={FIELD_OPEN}
                      max={FIELD_CLOSE}
                      value={f.time}
                      onChange={e => upd({ time: e.target.value })}
                    />
                  </Field>
                  <Field label="End Time">
                    <input
                      type="time"
                      className="input"
                      min={FIELD_OPEN}
                      max={FIELD_CLOSE}
                      value={f.endTime}
                      onChange={e => upd({ endTime: e.target.value })}
                    />
                  </Field>
                </div>
                <p className="text-xs text-gray-400">Fields are open 8:00 AM – 7:00 PM · {f.time && f.endTime && toMins(f.endTime) > toMins(f.time) ? `${toMins(f.endTime) - toMins(f.time)} min` : '—'}</p>
              </div>

              {/* Conflict warnings */}
              {conflicts.length > 0 && (
                <div className="space-y-2">
                  {conflicts.map((c, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-2 text-sm px-3 py-2.5 rounded-lg border ${
                        c.kind === 'field' || c.kind === 'hours'
                          ? 'bg-red-50 border-red-200 text-red-700'
                          : c.kind === 'team'
                          ? 'bg-amber-50 border-amber-200 text-amber-700'
                          : 'bg-yellow-50 border-yellow-200 text-yellow-700'
                      }`}
                    >
                      <span className="mt-0.5 flex-shrink-0">
                        {c.kind === 'field' || c.kind === 'hours' ? '🚫' : '⚠️'}
                      </span>
                      <span>
                        <span className="font-semibold">
                          {c.kind === 'field' ? 'Field conflict — '
                            : c.kind === 'hours' ? 'Outside hours — '
                            : c.kind === 'team' ? 'Team conflict — '
                            : 'Umpire conflict — '}
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
                <button onClick={closeModal} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition">Cancel</button>
                <button
                  onClick={save}
                  disabled={!canSave()}
                  className="px-5 py-2 text-sm font-semibold bg-green-600 text-white rounded-xl hover:bg-green-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {f.id ? 'Save Changes' : 'Add Event'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Small helper wrapper for form rows
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{label}</label>
      {children}
    </div>
  )
}
