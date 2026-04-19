'use client'
import { useState, useMemo, useRef } from 'react'
import type { AppState, ScheduledGame, ScheduledPractice } from '@/lib/types'
import { exportToExcel, exportToCSV } from '@/lib/export'
import { getDivisionColor } from '@/lib/divisionColors'
import EventModal, { type EventForm, emptyForm, formFromEvent, toMins, minsToTime, fmtTime } from './EventModal'
import { getSportConfig } from '@/lib/sports'

interface Props { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; readOnly?: boolean }

function fmtDateShort(s: string) {
  return new Date(s + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_HEADERS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

export default function ScheduleTab({ state, setState, readOnly = false }: Props) {
  const sc = getSportConfig(state.season.sport)
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [view, setView] = useState<'calendar' | 'list'>('calendar')
  const [modal, setModal] = useState<{ open: boolean; initialForm: EventForm }>({ open: false, initialForm: emptyForm() })
  const [filterDiv, setFilterDiv] = useState('all')
  const [filterTeam, setFilterTeam] = useState('all')
  const [filterType, setFilterType] = useState<'all' | 'game' | 'practice'>('all')
  const [exporting, setExporting] = useState(false)
  const [exportingCsv, setExportingCsv] = useState(false)
  const [clearConfirm, setClearConfirm] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)
  const [dragError, setDragError] = useState<string | null>(null)
  const dragErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [tooltip, setTooltip] = useState<{ ev: ScheduledGame | ScheduledPractice; x: number; y: number } | null>(null)

  const teamMap   = useMemo(() => new Map(state.divisions.flatMap(d => d.teams).map(t => [t.id, t])), [state.divisions])
  const fieldMap  = useMemo(() => new Map(state.fields.map(f => [f.id, f])), [state.fields])
  const umpireMap = useMemo(() => new Map(state.umpires.map(u => [u.id, u])), [state.umpires])
  const divMap    = useMemo(() => new Map(state.divisions.map(d => [d.id, d])), [state.divisions])
  const blackoutSet = useMemo(() => new Set((state.blackoutDates ?? []).map(d => d.split('::')[0])), [state.blackoutDates])

  const eventsByDate = useMemo(() => {
    const map = new Map<string, (ScheduledGame | ScheduledPractice)[]>()
    for (const ev of [...state.schedule.games, ...state.schedule.practices]) {
      if (!map.has(ev.date)) map.set(ev.date, [])
      map.get(ev.date)!.push(ev)
    }
    for (const [, evs] of map) evs.sort((a, b) => a.time.localeCompare(b.time))
    return map
  }, [state.schedule])

  // Teams available in the team filter dropdown (scoped to selected division)
  const teamsForFilter = useMemo(() => {
    if (filterDiv === 'all') return state.divisions.flatMap(d => d.teams)
    return state.divisions.find(d => d.id === filterDiv)?.teams ?? []
  }, [filterDiv, state.divisions])

  function matchesTeamFilter(ev: ScheduledGame | ScheduledPractice): boolean {
    if (filterTeam === 'all') return true
    if (ev.type === 'game') {
      const g = ev as ScheduledGame
      return g.homeTeamId === filterTeam || g.awayTeamId === filterTeam
    }
    return (ev as ScheduledPractice).teamId === filterTeam
  }

  // Filtered event map for the calendar view
  const visibleEventsByDate = useMemo(() => {
    if (filterDiv === 'all' && filterTeam === 'all' && filterType === 'all') return eventsByDate
    const map = new Map<string, (ScheduledGame | ScheduledPractice)[]>()
    for (const [date, evs] of eventsByDate) {
      const filtered = evs
        .filter(ev => filterDiv === 'all' || ev.divisionId === filterDiv)
        .filter(ev => matchesTeamFilter(ev))
        .filter(ev => filterType === 'all' || ev.type === filterType)
      if (filtered.length > 0) map.set(date, filtered)
    }
    return map
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventsByDate, filterDiv, filterTeam, filterType])

  // Calendar helpers
  const firstDow = new Date(year, month, 1).getDay()
  const numDays = new Date(year, month + 1, 0).getDate()
  const todayStr = today.toISOString().split('T')[0]

  function prevMonth() { month === 0 ? (setMonth(11), setYear(y => y - 1)) : setMonth(m => m - 1) }
  function nextMonth() { month === 11 ? (setMonth(0), setYear(y => y + 1)) : setMonth(m => m + 1) }
  function goToday() { setYear(today.getFullYear()); setMonth(today.getMonth()) }

  function openAdd(date: string) {
    setModal({ open: true, initialForm: emptyForm(date, state.season.gameDurationMinutes || 90) })
  }

  function openEdit(ev: ScheduledGame | ScheduledPractice) {
    if (readOnly) return
    setModal({ open: true, initialForm: formFromEvent(ev) })
  }

  function closeModal() { setModal(m => ({ ...m, open: false })) }

  function clearSchedule() {
    setState(s => ({ ...s, schedule: { games: [], practices: [], generatedAt: null, warnings: [] } }))
    setClearConfirm(false)
  }

  function moveEventToDate(eventId: string, newDate: string) {
    const allEvents = [...state.schedule.games, ...state.schedule.practices]
    const ev = allEvents.find(e => e.id === eventId)
    if (!ev || ev.date === newDate) return

    // Check field conflict on new date
    if (ev.fieldId) {
      const evStart = toMins(ev.time)
      const evEnd   = evStart + (ev.durationMinutes || 90)
      const sameDay = allEvents.filter(e => e.id !== eventId && e.date === newDate && e.fieldId === ev.fieldId)
      for (const other of sameDay) {
        const oStart = toMins(other.time)
        const oEnd   = oStart + (other.durationMinutes || 90)
        if (evStart < oEnd && oStart < evEnd) {
          const fieldName = fieldMap.get(ev.fieldId)?.name ?? 'That field'
          showDragError(`${fieldName} is already booked ${fmtTime(other.time)}–${fmtTime(minsToTime(oEnd))} on that day`)
          return
        }
      }
    }

    setState(s => ({
      ...s,
      schedule: {
        ...s.schedule,
        games: s.schedule.games.map(g => g.id === eventId ? { ...g, date: newDate } : g),
        practices: s.schedule.practices.map(p => p.id === eventId ? { ...p, date: newDate } : p),
      }
    }))
  }

  function showDragError(msg: string) {
    setDragError(msg)
    if (dragErrorTimer.current) clearTimeout(dragErrorTimer.current)
    dragErrorTimer.current = setTimeout(() => setDragError(null), 4000)
  }

  function doExport() {
    setExporting(true)
    try { exportToExcel(state.season, state.divisions, state.fields, state.umpires, state.schedule.games, state.schedule.practices) }
    finally { setExporting(false) }
  }

  function doExportCSV() {
    setExportingCsv(true)
    try { exportToCSV(state.season, state.divisions, state.fields, state.schedule.games) }
    finally { setExportingCsv(false) }
  }

  // List view
  const allItems = useMemo(() => {
    return ([...state.schedule.games, ...state.schedule.practices] as (ScheduledGame | ScheduledPractice)[])
      .filter(i => filterDiv === 'all' || i.divisionId === filterDiv)
      .filter(i => matchesTeamFilter(i))
      .filter(i => filterType === 'all' || i.type === filterType)
      .sort((a, b) => { const dc = a.date.localeCompare(b.date); return dc !== 0 ? dc : a.time.localeCompare(b.time) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.schedule, filterDiv, filterTeam, filterType])

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
            <button onClick={() => setView('calendar')} className={`px-3 py-1.5 transition ${view === 'calendar' ? 'bg-[var(--fd-accent)] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>Calendar</button>
            <button onClick={() => setView('list')} className={`px-3 py-1.5 border-l transition ${view === 'list' ? 'bg-[var(--fd-accent)] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>List</button>
          </div>
          {(totalGames + totalPractices) > 0 && !readOnly && (
            <button onClick={doExport} disabled={exporting} className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700 transition disabled:opacity-50">
              {exporting ? 'Exporting…' : 'Export Excel'}
            </button>
          )}
          {totalGames > 0 && !readOnly && (
            <button onClick={doExportCSV} disabled={exportingCsv} className="bg-emerald-600 text-white px-4 py-1.5 rounded text-sm hover:bg-emerald-700 transition disabled:opacity-50">
              {exportingCsv ? 'Exporting…' : 'Export CSV'}
            </button>
          )}
          {(totalGames + totalPractices) > 0 && !readOnly && (
            clearConfirm ? (
              <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded px-2 py-1">
                <span className="text-xs text-red-700 font-medium">Clear all events?</span>
                <button onClick={clearSchedule} className="text-xs bg-red-500 text-white px-2 py-0.5 rounded hover:bg-red-600 transition">Yes, clear</button>
                <button onClick={() => setClearConfirm(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setClearConfirm(true)} className="text-sm text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-3 py-1.5 rounded transition">
                Clear All
              </button>
            )
          )}
        </div>
      </div>

      {/* Drag conflict toast */}
      {dragError && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 rounded-lg">
          <span><span className="font-semibold">{sc.venueSingular} conflict — </span>{dragError}</span>
          <button onClick={() => setDragError(null)} className="ml-auto text-red-400 hover:text-red-600 text-lg leading-none">×</button>
        </div>
      )}

      {/* ── Shared filter bar ── */}
      {(state.divisions.length > 0 || (state.schedule.games.length + state.schedule.practices.length) > 0) && (
        <div className="flex gap-2 flex-wrap items-center bg-white rounded-lg border px-3 py-2.5">
          <span className="text-sm font-medium text-gray-500 mr-1">Filter:</span>
          <select
            className="border rounded px-2 py-1.5 text-sm"
            value={filterDiv}
            onChange={e => { setFilterDiv(e.target.value); setFilterTeam('all') }}
          >
            <option value="all">All Divisions</option>
            {state.divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select
            className="border rounded px-2 py-1.5 text-sm"
            value={filterTeam}
            onChange={e => setFilterTeam(e.target.value)}
          >
            <option value="all">All Teams</option>
            {teamsForFilter.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select
            className="border rounded px-2 py-1.5 text-sm"
            value={filterType}
            onChange={e => setFilterType(e.target.value as 'all' | 'game' | 'practice')}
          >
            <option value="all">All Types</option>
            <option value="game">{sc.eventPlural} Only</option>
            <option value="practice">Practices Only</option>
          </select>
          {(filterDiv !== 'all' || filterTeam !== 'all' || filterType !== 'all') && (
            <button
              onClick={() => { setFilterDiv('all'); setFilterTeam('all'); setFilterType('all') }}
              className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded px-2 py-1.5 transition"
            >
              Clear
            </button>
          )}
          <span className="text-xs text-gray-400 ml-auto">
            {allItems.length} event{allItems.length !== 1 ? 's' : ''}
            {(filterDiv !== 'all' || filterTeam !== 'all' || filterType !== 'all') && (
              <span className="ml-1 text-gray-300">of {state.schedule.games.length + state.schedule.practices.length}</span>
            )}
          </span>
        </div>
      )}

      {/* ── CALENDAR VIEW ── */}
      {view === 'calendar' && (
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          {/* Month nav */}
          <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b">
            <button onClick={prevMonth} className="p-1.5 rounded hover:bg-gray-200 transition text-gray-600 text-lg leading-none">‹</button>
            <h3 className="font-semibold text-gray-800 flex-1 text-center">{MONTHS[month]} {year}</h3>
            <button onClick={nextMonth} className="p-1.5 rounded hover:bg-gray-200 transition text-gray-600 text-lg leading-none">›</button>
            <button onClick={goToday} className="text-xs text-[var(--fd-accent)] hover:text-[#a8102e] border border-[var(--fd-accent)] rounded px-2 py-1 hover:bg-[#f5f5fb] transition">Today</button>
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
              const events = visibleEventsByDate.get(dateStr) ?? []

              const isDragTarget = dragOverDate === dateStr && dragId !== null
              return (
                <div
                  key={day}
                  className={`min-h-[110px] border-b p-1.5 relative group flex flex-col ${col < 6 ? 'border-r' : ''} ${
                    isDragTarget ? 'bg-[#f5f5fb] ring-2 ring-inset ring-green-400' :
                    isBlackout ? 'bg-red-50' : 'hover:bg-slate-50 transition-colors'
                  }`}
                  onDragOver={e => { e.preventDefault(); setDragOverDate(dateStr) }}
                  onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverDate(null) }}
                  onDrop={e => {
                    e.preventDefault()
                    setDragOverDate(null)
                    if (dragId) moveEventToDate(dragId, dateStr)
                    setDragId(null)
                  }}
                >
                  {/* Date number + add button */}
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full ${
                      isToday ? 'bg-[var(--fd-accent)] text-white' : isBlackout ? 'text-red-400' : 'text-gray-600'
                    }`}>{day}</span>
                    {isBlackout
                      ? <span className="text-xs text-red-300 italic">closed</span>
                      : !readOnly && <button onClick={() => openAdd(dateStr)} className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded-full text-[var(--fd-accent)] hover:bg-[#eeeef6] transition text-base leading-none" title="Add event">+</button>
                    }
                  </div>

                  {/* Events — shrink font/spacing as count grows so all fit */}
                  {(() => {
                    const n = events.length
                    const textSize = n <= 4 ? 'text-xs' : n <= 6 ? 'text-[10px]' : 'text-[9px]'
                    const gap      = n <= 6 ? 'space-y-0.5' : 'space-y-px'
                    const pad      = n <= 6 ? 'px-1.5 py-0.5' : 'px-1 py-px'
                    return (
                      <div className={`flex-1 ${gap}`}>
                        {events.map(ev => {
                          const c = getDivisionColor(ev.divisionId, state.divisions)
                          const isPractice = ev.type === 'practice'
                          const g = ev as ScheduledGame
                          const resultSuffix = ev.type === 'game' && g.result !== undefined
                            ? ` · ${g.result.homeScore}-${g.result.awayScore}`
                            : ''
                          const label = ev.type === 'game'
                            ? `${teamMap.get(g.homeTeamId)?.name ?? '?'} vs ${teamMap.get(g.awayTeamId)?.name ?? '?'}${resultSuffix}`
                            : `${teamMap.get((ev as ScheduledPractice).teamId)?.name ?? '?'} practice`
                          return (
                            <button
                              key={ev.id}
                              draggable
                              onDragStart={e => {
                                setDragId(ev.id)
                                setTooltip(null)
                                e.dataTransfer.effectAllowed = 'move'
                                e.dataTransfer.setData('text/plain', ev.id)
                              }}
                              onDragEnd={() => { setDragId(null); setDragOverDate(null) }}
                              onClick={() => { if (!dragId) openEdit(ev) }}
                              onMouseEnter={e => {
                                const rect = e.currentTarget.getBoundingClientRect()
                                setTooltip({ ev, x: rect.left, y: rect.top })
                              }}
                              onMouseLeave={() => setTooltip(null)}
                              className={`w-full text-left ${textSize} ${pad} rounded truncate border transition hover:opacity-75 cursor-grab active:cursor-grabbing ${
                                isPractice ? 'bg-gray-100 text-gray-600 border-gray-200' : `${c.bg} ${c.text} ${c.border}`
                              }`}
                            >
                              <span className="font-medium">{fmtTime(ev.time)}</span> {label}
                            </button>
                          )
                        })}
                      </div>
                    )
                  })()}
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
          <div className="bg-white rounded-lg border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b text-left">
                    {['Date','Start','End','Div','Type','Home / Team','Away','Result',sc.venueSingular,sc.officialSingular,''].map(h => (
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
                            ? <span className="text-xs px-1.5 py-0.5 rounded bg-[#eeeef6] text-[var(--fd-accent)] font-medium">{sc.eventSingular}</span>
                            : <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">Practice</span>}
                        </td>
                        <td className="px-3 py-2 font-medium">
                          {item.type === 'game' ? teamMap.get((item as ScheduledGame).homeTeamId)?.name : teamMap.get((item as ScheduledPractice).teamId)?.name}
                        </td>
                        <td className="px-3 py-2 text-gray-600">
                          {item.type === 'game' ? teamMap.get((item as ScheduledGame).awayTeamId)?.name : ''}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {item.type === 'game' && (item as ScheduledGame).result !== undefined ? (
                            <span className="text-xs font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded">
                              {(item as ScheduledGame).result!.homeScore}–{(item as ScheduledGame).result!.awayScore}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
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
                    <tr><td colSpan={10} className="px-4 py-12 text-center text-gray-400 italic">No events yet — switch to Calendar view and click any day to add one.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-2 text-xs">
        {state.divisions.map(d => { const c = getDivisionColor(d.id, state.divisions); return <span key={d.id} className={`px-2 py-0.5 rounded border ${c.bg} ${c.text} ${c.border}`}>{d.name} {sc.eventSingular.toLowerCase()}</span> })}
        <span className="px-2 py-0.5 rounded border bg-gray-100 text-gray-600 border-gray-200">Practice</span>
        <span className="px-2 py-0.5 rounded border bg-red-50 text-red-400 border-red-200">Blackout date</span>
      </div>

      {modal.open && (
        <EventModal state={state} setState={setState} initialForm={modal.initialForm} onClose={closeModal} />
      )}

      {/* Hover tooltip — fixed so it escapes the calendar's overflow:hidden */}
      {tooltip && (() => {
        const ev = tooltip.ev
        const isGame = ev.type === 'game'
        const g = ev as ScheduledGame
        const p = ev as ScheduledPractice
        const startFmt = fmtTime(ev.time)
        const endFmt   = ev.durationMinutes ? fmtTime(minsToTime(toMins(ev.time) + ev.durationMinutes)) : null
        const field    = fieldMap.get(ev.fieldId)
        const div      = divMap.get(ev.divisionId)
        const c        = getDivisionColor(ev.divisionId, state.divisions)
        return (
          <div
            className="fixed z-50 pointer-events-none"
            style={{ left: tooltip.x, top: tooltip.y - 8, transform: 'translateY(-100%)' }}
          >
            <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs w-52">
              <div className={`text-xs font-semibold uppercase tracking-wide mb-2 ${c.text}`}>
                {div?.name ?? ''} {isGame ? sc.eventSingular : 'Practice'}
              </div>
              {isGame ? (
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Home</span>
                    <span className="font-medium text-gray-800">{teamMap.get(g.homeTeamId)?.name ?? '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Away</span>
                    <span className="font-medium text-gray-800">{teamMap.get(g.awayTeamId)?.name ?? '—'}</span>
                  </div>
                </div>
              ) : (
                <div className="flex justify-between">
                  <span className="text-gray-500">Team</span>
                  <span className="font-medium text-gray-800">{teamMap.get(p.teamId)?.name ?? '—'}</span>
                </div>
              )}
              <div className="border-t border-gray-100 mt-2 pt-2 space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-500">Time</span>
                  <span className="font-medium text-gray-800">{startFmt}{endFmt ? `–${endFmt}` : ''}</span>
                </div>
                {field && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">{sc.venueSingular}</span>
                    <span className="font-medium text-gray-800">{field.name}</span>
                  </div>
                )}
                {field?.location && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Location</span>
                    <span className="font-medium text-gray-800 text-right max-w-[120px] truncate">{field.location}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
