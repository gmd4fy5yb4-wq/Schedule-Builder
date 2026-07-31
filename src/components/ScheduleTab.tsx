'use client'
import { useState, useMemo, useRef } from 'react'
import type { AppState, ScheduledGame, ScheduledPractice, ScheduledSpecialEvent } from '@/lib/types'
import { exportToExcel, exportToCSV } from '@/lib/export'
import { getDivisionColor } from '@/lib/divisionColors'
import EventModal, { type EventForm, emptyForm, formFromEvent, toMins, minsToTime, fmtTime } from './EventModal'
import { getSportConfig } from '@/lib/sports'
import Icon from './Icon'

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
  // Agenda-first below 640px: a month grid on a 390px screen renders event
  // chips too small to read, let alone tap. Read once on mount rather than
  // through a live listener — rotating the phone should not throw away the
  // view the user just chose.
  const [view, setView] = useState<'calendar' | 'list' | 'day'>(
    () => (typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches ? 'list' : 'calendar')
  )
  const [selectedDay, setSelectedDay] = useState(() => new Date().toISOString().split('T')[0])
  const [modal, setModal] = useState<{ open: boolean; initialForm: EventForm }>({ open: false, initialForm: emptyForm() })
  const [filterDiv, setFilterDiv] = useState('all')
  const [filterTeam, setFilterTeam] = useState('all')
  const [filterType, setFilterType] = useState<'all' | 'game' | 'practice' | 'special'>('all')
  const [exporting, setExporting] = useState(false)
  const [exportingCsv, setExportingCsv] = useState(false)
  const [clearConfirm, setClearConfirm] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)
  const [dragError, setDragError] = useState<string | null>(null)
  const dragErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [tooltip, setTooltip] = useState<{ ev: ScheduledGame | ScheduledPractice | ScheduledSpecialEvent; x: number; y: number } | null>(null)

  // Coach notification state
  const [notifyModal, setNotifyModal] = useState(false)
  const [notifyTeamIds, setNotifyTeamIds] = useState<Set<string>>(new Set())
  const [notifySending, setNotifySending] = useState(false)
  const [notifyResult, setNotifyResult] = useState<{ sent: number; failed: { coachName: string; teamName: string; error?: string }[] } | null>(null)

  const teamMap   = useMemo(() => new Map(state.divisions.flatMap(d => d.teams).map(t => [t.id, t])), [state.divisions])
  const fieldMap  = useMemo(() => new Map(state.fields.map(f => [f.id, f])), [state.fields])
  const umpireMap = useMemo(() => new Map(state.umpires.map(u => [u.id, u])), [state.umpires])
  const divMap    = useMemo(() => new Map(state.divisions.map(d => [d.id, d])), [state.divisions])
  const blackoutSet = useMemo(() => new Set((state.blackoutDates ?? []).map(d => d.split('::')[0])), [state.blackoutDates])

  const eventsByDate = useMemo(() => {
    const map = new Map<string, (ScheduledGame | ScheduledPractice | ScheduledSpecialEvent)[]>()
    for (const ev of [...state.schedule.games, ...state.schedule.practices, ...(state.schedule.specialEvents ?? [])]) {
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

  function matchesTeamFilter(ev: ScheduledGame | ScheduledPractice | ScheduledSpecialEvent): boolean {
    if (filterTeam === 'all') return true
    if (ev.type === 'special') return false  // special events don't belong to a team
    if (ev.type === 'game') {
      const g = ev as ScheduledGame
      return g.homeTeamId === filterTeam || g.awayTeamId === filterTeam
    }
    return (ev as ScheduledPractice).teamId === filterTeam
  }

  // Filtered event map for the calendar view
  const visibleEventsByDate = useMemo(() => {
    if (filterDiv === 'all' && filterTeam === 'all' && filterType === 'all') return eventsByDate
    const map = new Map<string, (ScheduledGame | ScheduledPractice | ScheduledSpecialEvent)[]>()
    for (const [date, evs] of eventsByDate) {
      const filtered = evs
        .filter(ev => ev.type === 'special' ? filterDiv === 'all' : (filterDiv === 'all' || (ev as ScheduledGame | ScheduledPractice).divisionId === filterDiv))
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

  function openEdit(ev: ScheduledGame | ScheduledPractice | ScheduledSpecialEvent) {
    if (readOnly) return
    setModal({ open: true, initialForm: formFromEvent(ev) })
  }

  function closeModal() { setModal(m => ({ ...m, open: false })) }

  function clearSchedule() {
    setState(s => ({ ...s, schedule: { games: [], practices: [], specialEvents: [], generatedAt: null, warnings: [] } }))
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
    exportToExcel(state.season, state.divisions, state.fields, state.umpires, state.schedule.games, state.schedule.practices)
      .finally(() => setExporting(false))
  }

  function doExportCSV() {
    setExportingCsv(true)
    try { exportToCSV(state.season, state.divisions, state.fields, state.schedule.games) }
    finally { setExportingCsv(false) }
  }

  // List view
  const allItems = useMemo(() => {
    return ([...state.schedule.games, ...state.schedule.practices, ...(state.schedule.specialEvents ?? [])] as (ScheduledGame | ScheduledPractice | ScheduledSpecialEvent)[])
      .filter(i => i.type === 'special' ? filterDiv === 'all' : (filterDiv === 'all' || (i as ScheduledGame | ScheduledPractice).divisionId === filterDiv))
      .filter(i => matchesTeamFilter(i))
      .filter(i => filterType === 'all' || i.type === filterType)
      .sort((a, b) => { const dc = a.date.localeCompare(b.date); return dc !== 0 ? dc : a.time.localeCompare(b.time) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.schedule, filterDiv, filterTeam, filterType])

  const totalGames = state.schedule.games.length
  const totalPractices = state.schedule.practices.length
  const totalSpecial = (state.schedule.specialEvents ?? []).length

  // Teams that have at least one coach with an email address
  const teamsWithCoachEmails = useMemo(() =>
    state.divisions.flatMap(d => d.teams).filter(t => t.coaches?.some(c => c.email)),
    [state.divisions]
  )

  function openNotifyModal() {
    setNotifyTeamIds(new Set(teamsWithCoachEmails.map(t => t.id)))
    setNotifyResult(null)
    setNotifyModal(true)
  }

  async function sendNotifications() {
    setNotifySending(true)
    setNotifyResult(null)
    try {
      const res = await fetch('/api/notify-coaches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leagueCode: localStorage.getItem('sb-league-code'),
          teamIds: [...notifyTeamIds],
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Send failed')
      setNotifyResult({ sent: data.sent, failed: data.failed ?? [] })
    } catch (e) {
      setNotifyResult({ sent: 0, failed: [{ coachName: '', teamName: '', error: e instanceof Error ? e.message : 'Unknown error' }] })
    }
    setNotifySending(false)
  }

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-gray-800">Schedule</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-gray-500">{totalGames} game{totalGames !== 1 ? 's' : ''} · {totalPractices} practice{totalPractices !== 1 ? 's' : ''}{totalSpecial > 0 ? ` · ${totalSpecial} special` : ''}</span>
          <div className="flex rounded-lg border overflow-hidden text-sm">
            {/* Phones get two choices with mobile vocabulary; Day view is a
                desktop timeline and stays there. */}
            <button onClick={() => setView('list')} className={`sm:hidden min-h-[44px] px-4 transition ${view === 'list' ? 'bg-[var(--fd-primary)] text-white' : 'bg-white text-gray-600'}`}>Agenda</button>
            <button onClick={() => setView('calendar')} className={`sm:hidden min-h-[44px] px-4 border-l transition ${view === 'calendar' ? 'bg-[var(--fd-primary)] text-white' : 'bg-white text-gray-600'}`}>Month</button>
            <button onClick={() => setView('calendar')} className={`hidden sm:block px-3 py-1.5 transition ${view === 'calendar' ? 'bg-[var(--fd-primary)] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>Calendar</button>
            <button onClick={() => setView('day')} className={`hidden sm:block px-3 py-1.5 border-l transition ${view === 'day' ? 'bg-[var(--fd-primary)] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>Day</button>
            <button onClick={() => setView('list')} className={`hidden sm:block px-3 py-1.5 border-l transition ${view === 'list' ? 'bg-[var(--fd-primary)] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>List</button>
          </div>
          {(totalGames + totalPractices) > 0 && !readOnly && (
            <button onClick={doExport} disabled={exporting} className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-blue-700 transition disabled:opacity-50">
              {exporting ? 'Exporting…' : 'Export Excel'}
            </button>
          )}
          {totalGames > 0 && !readOnly && (
            <button onClick={doExportCSV} disabled={exportingCsv} className="bg-emerald-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-emerald-700 transition disabled:opacity-50">
              {exportingCsv ? 'Exporting…' : 'Export CSV'}
            </button>
          )}
          {teamsWithCoachEmails.length > 0 && !readOnly && (
            <button
              onClick={openNotifyModal}
              className="bg-violet-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-violet-700 transition"
              title="Send schedule emails to coaches"
            >
              Notify Coaches
            </button>
          )}
          {(totalGames + totalPractices + totalSpecial) > 0 && !readOnly && (
            clearConfirm ? (
              <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-2 py-1">
                <span className="text-xs text-red-700 font-medium">Clear all events?</span>
                <button onClick={clearSchedule} className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-lg hover:bg-red-600 transition">Yes, clear</button>
                <button onClick={() => setClearConfirm(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setClearConfirm(true)} className="text-sm text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-lg transition">
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
            className="border rounded-lg px-2 py-1.5 text-sm"
            value={filterDiv}
            onChange={e => { setFilterDiv(e.target.value); setFilterTeam('all') }}
          >
            <option value="all">All Divisions</option>
            {state.divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select
            className="border rounded-lg px-2 py-1.5 text-sm"
            value={filterTeam}
            onChange={e => setFilterTeam(e.target.value)}
          >
            <option value="all">All Teams</option>
            {teamsForFilter.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select
            className="border rounded-lg px-2 py-1.5 text-sm"
            value={filterType}
            onChange={e => setFilterType(e.target.value as 'all' | 'game' | 'practice' | 'special')}
          >
            <option value="all">All Types</option>
            <option value="game">{sc.eventPlural} Only</option>
            <option value="practice">Practices Only</option>
            <option value="special">Special Events Only</option>
          </select>
          {(filterDiv !== 'all' || filterTeam !== 'all' || filterType !== 'all') && (
            <button
              onClick={() => { setFilterDiv('all'); setFilterTeam('all'); setFilterType('all') }}
              className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-2 py-1.5 transition"
            >
              Clear
            </button>
          )}
          <span className="text-xs text-gray-400 ml-auto">
            {allItems.length} event{allItems.length !== 1 ? 's' : ''}
            {(filterDiv !== 'all' || filterTeam !== 'all' || filterType !== 'all') && (
              <span className="ml-1 text-gray-300">of {state.schedule.games.length + state.schedule.practices.length + (state.schedule.specialEvents ?? []).length}</span>
            )}
          </span>
        </div>
      )}

      {/* ── CALENDAR VIEW ── */}
      {view === 'calendar' && (
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          {/* Month nav */}
          <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b">
            <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-200 transition text-gray-600 text-lg leading-none">‹</button>
            <h3 className="font-semibold text-gray-800 flex-1 text-center">{MONTHS[month]} {year}</h3>
            <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-200 transition text-gray-600 text-lg leading-none">›</button>
            <button onClick={goToday} className="text-xs text-[var(--fd-primary)] hover:text-[var(--fd-primary-dark)] border border-[var(--fd-primary)] rounded-lg px-2 py-1 hover:bg-[#f5f5fb] transition">Today</button>
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
              <div key={`b${i}`} className={`min-h-[56px] sm:min-h-[110px] bg-gray-50 border-b ${i < 6 ? 'border-r' : ''}`} />
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
                  className={`min-h-[56px] sm:min-h-[110px] border-b p-1.5 relative group flex flex-col ${col < 6 ? 'border-r' : ''} ${
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
                    <span
                      onClick={() => {
                        setSelectedDay(dateStr)
                        // Day view is a desktop timeline; on a phone the grid is
                        // a date picker and the agenda is the destination.
                        setView(window.matchMedia('(max-width: 639px)').matches ? 'list' : 'day')
                      }}
                      className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full cursor-pointer hover:ring-2 hover:ring-[var(--fd-accent)] transition ${
                        isToday ? 'bg-[var(--fd-primary)] text-white' : isBlackout ? 'text-red-400' : 'text-gray-600'
                      }`}
                      title="View day schedule"
                    >{day}</span>
                    {isBlackout
                      ? <span className="text-xs text-red-300 italic">closed</span>
                      : !readOnly && <button onClick={() => openAdd(dateStr)} className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 w-7 h-7 sm:w-5 sm:h-5 flex items-center justify-center rounded-full text-[var(--fd-primary)] hover:bg-[#eeeef6] transition text-base leading-none" title="Add event">+</button>
                    }
                  </div>

                  {/* Events — shrink font/spacing as count grows so all fit */}
                  {(() => {
                    const n = events.length
                    const textSize = n <= 4 ? 'text-xs' : n <= 6 ? 'text-[10px]' : 'text-[9px]'
                    const gap      = n <= 6 ? 'space-y-0.5' : 'space-y-px'
                    const pad      = n <= 6 ? 'px-1.5 py-0.5' : 'px-1 py-px'
                    return (
                      <>
                      <div className={`hidden sm:block flex-1 ${gap}`}>
                        {events.map(ev => {
                          const isSpecial  = ev.type === 'special'
                          const isPractice = ev.type === 'practice'
                          const c = isSpecial ? null : getDivisionColor((ev as ScheduledGame | ScheduledPractice).divisionId, state.divisions)
                          const g = ev as ScheduledGame
                          const resultSuffix = ev.type === 'game' && g.result !== undefined
                            ? ` · ${g.result.homeScore}-${g.result.awayScore}`
                            : ''
                          const label = isSpecial
                            ? (ev as ScheduledSpecialEvent).name
                            : ev.type === 'game'
                              ? `${teamMap.get(g.homeTeamId)?.name ?? '?'} vs ${teamMap.get(g.awayTeamId)?.name ?? '?'}${resultSuffix}`
                              : `${teamMap.get((ev as ScheduledPractice).teamId)?.name ?? '?'} practice`
                          return (
                            <button
                              key={ev.id}
                              draggable={!isSpecial}
                              onDragStart={e => {
                                if (isSpecial) return
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
                              className={`w-full text-left ${textSize} ${pad} rounded-lg truncate border transition hover:opacity-75 ${isSpecial ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'} ${
                                isSpecial   ? 'bg-amber-50 text-amber-700 border-amber-300'
                                : isPractice ? 'bg-gray-100 text-gray-600 border-gray-200'
                                : `${c!.bg} ${c!.text} ${c!.border}`
                              }`}
                            >
                              <span className="font-medium">{fmtTime(ev.time)}</span> {label}
                            </button>
                          )
                        })}
                      </div>
                      {/* Phones: one dot with a count. A chip in a 390px/7-column
                          cell is ~50px wide — unreadable and untappable. */}
                      {n > 0 && (
                        <button
                          onClick={() => { setSelectedDay(dateStr); setView('list') }}
                          className="sm:hidden mx-auto mb-1 flex items-center justify-center w-6 h-6 rounded-full bg-[var(--fd-accent)] text-white text-[11px] font-bold"
                          aria-label={`${n} event${n === 1 ? '' : 's'} on ${dateStr}`}
                        >
                          {n}
                        </button>
                      )}
                      </>
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
                <div key={`t${i}`} className={`min-h-[56px] sm:min-h-[110px] bg-gray-50 border-b ${i < trail - 1 ? 'border-r' : ''}`} />
              ))
            })()}
          </div>
          <p className="sm:hidden px-4 py-3 text-xs text-center text-gray-500">
            Tap a day to jump to it in the agenda — no tiny event chips.
          </p>
        </div>
      )}

      {/* ── LIST VIEW ── */}
      {view === 'list' && (
        <div className="space-y-3">
          <div className="bg-white rounded-lg border overflow-hidden">
            <div className="hidden sm:block overflow-x-auto">
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
                    const isSpecial = item.type === 'special'
                    const c = isSpecial ? null : getDivisionColor((item as ScheduledGame | ScheduledPractice).divisionId, state.divisions)
                    const sp = item as ScheduledSpecialEvent
                    return (
                      <tr key={item.id} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="px-3 py-2 whitespace-nowrap text-gray-700">{fmtDateShort(item.date)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{fmtTime(item.time)}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-500">{item.durationMinutes ? fmtTime(minsToTime(toMins(item.time) + item.durationMinutes)) : '—'}</td>
                        <td className="px-3 py-2">
                          {isSpecial
                            ? <span className="text-xs text-gray-400 italic">—</span>
                            : <span className={`text-xs px-1.5 py-0.5 rounded-lg font-medium ${c!.pill}`}>{divMap.get((item as ScheduledGame | ScheduledPractice).divisionId)?.name}</span>
                          }
                        </td>
                        <td className="px-3 py-2">
                          {item.type === 'game'
                            ? <span className="text-xs px-1.5 py-0.5 rounded-lg bg-[#eeeef6] text-[var(--fd-primary)] font-medium">{sc.eventSingular}</span>
                            : item.type === 'special'
                              ? <span className="text-xs px-1.5 py-0.5 rounded-lg bg-amber-100 text-amber-700 font-medium">Special</span>
                              : <span className="text-xs px-1.5 py-0.5 rounded-lg bg-gray-100 text-gray-600 font-medium">Practice</span>}
                        </td>
                        <td className="px-3 py-2 font-medium">
                          {isSpecial ? sp.name : item.type === 'game' ? teamMap.get((item as ScheduledGame).homeTeamId)?.name : teamMap.get((item as ScheduledPractice).teamId)?.name}
                        </td>
                        <td className="px-3 py-2 text-gray-600">
                          {isSpecial ? (sp.location ?? '') : item.type === 'game' ? teamMap.get((item as ScheduledGame).awayTeamId)?.name : ''}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {item.type === 'game' && (item as ScheduledGame).result !== undefined ? (
                            <span className="text-xs font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-lg">
                              {(item as ScheduledGame).result!.homeScore}–{(item as ScheduledGame).result!.awayScore}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-600">{isSpecial ? '—' : (fieldMap.get((item as ScheduledGame | ScheduledPractice).fieldId)?.name ?? '—')}</td>
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

            {/* ── Agenda (phones) ── */}
            <div className="sm:hidden">
              {allItems.length === 0 && (
                <p className="px-4 py-12 text-center text-gray-500 italic text-sm">
                  No events yet — switch to Month and tap any day to add one.
                </p>
              )}
              {(() => {
                // Group the already-sorted, already-filtered list by date. One
                // pass, no extra memo — allItems is at most a season's events.
                const groups: { date: string; items: typeof allItems }[] = []
                for (const item of allItems) {
                  const last = groups[groups.length - 1]
                  if (last && last.date === item.date) last.items.push(item)
                  else groups.push({ date: item.date, items: [item] })
                }
                return groups.map(g => (
                  <section key={g.date}>
                    <h3 className="sticky top-0 z-[1] bg-gray-50 border-y px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-gray-500">
                      {fmtDateShort(g.date)}
                    </h3>
                    {g.items.map(item => {
                      const isSpecial = item.type === 'special'
                      const c = isSpecial ? null : getDivisionColor((item as ScheduledGame | ScheduledPractice).divisionId, state.divisions)
                      const sp = item as ScheduledSpecialEvent
                      const title = isSpecial
                        ? sp.name
                        : item.type === 'game'
                          ? `${teamMap.get((item as ScheduledGame).homeTeamId)?.name ?? 'TBD'} vs ${teamMap.get((item as ScheduledGame).awayTeamId)?.name ?? 'TBD'}`
                          : `${teamMap.get((item as ScheduledPractice).teamId)?.name ?? 'TBD'} practice`
                      const where = isSpecial
                        ? (sp.location ?? '')
                        : (fieldMap.get((item as ScheduledGame | ScheduledPractice).fieldId)?.name ?? '')
                      return (
                        <button
                          key={item.id}
                          onClick={() => openEdit(item)}
                          className="w-full min-h-[64px] px-4 py-3 flex items-start gap-3 border-b last:border-0 text-left active:bg-gray-50"
                        >
                          <span className="w-16 shrink-0 text-sm font-semibold text-gray-800 pt-0.5">
                            {fmtTime(item.time)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium text-gray-900 truncate">{title}</span>
                            <span className="block text-xs text-gray-500 truncate">
                              {where}
                              {item.type === 'game' && (item as ScheduledGame).result !== undefined && (
                                <> · {(item as ScheduledGame).result!.homeScore}–{(item as ScheduledGame).result!.awayScore}</>
                              )}
                            </span>
                          </span>
                          {c && (
                            <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-lg font-medium ${c.pill}`}>
                              {divMap.get((item as ScheduledGame | ScheduledPractice).divisionId)?.name}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </section>
                ))
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── DAY VIEW ── */}
      {view === 'day' && (() => {
        const PX_PER_HOUR = 80
        const HOUR_START  = 8   // 8 AM
        const HOUR_END    = 21  // 9 PM (last slot)
        const HOURS       = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i)

        // Prev / next day navigation
        const goPrev = () => {
          const d = new Date(selectedDay + 'T12:00:00'); d.setDate(d.getDate() - 1)
          setSelectedDay(d.toISOString().split('T')[0])
        }
        const goNext = () => {
          const d = new Date(selectedDay + 'T12:00:00'); d.setDate(d.getDate() + 1)
          setSelectedDay(d.toISOString().split('T')[0])
        }
        const todayStr = new Date().toISOString().split('T')[0]
        const dayLabel = new Date(selectedDay + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

        // Events for this day, sorted by start time
        const dayEvents = ([...state.schedule.games, ...state.schedule.practices, ...(state.schedule.specialEvents ?? [])] as (ScheduledGame | ScheduledPractice | ScheduledSpecialEvent)[])
          .filter(ev => ev.date === selectedDay)
          .sort((a, b) => a.time.localeCompare(b.time))

        // Assign columns to handle overlapping events
        type Lane = { ev: ScheduledGame | ScheduledPractice | ScheduledSpecialEvent; col: number; totalCols: number }
        const lanes: Lane[] = []
        const cols: number[] = [] // tracks end-minute of last event in each column

        for (const ev of dayEvents) {
          const start = toMins(ev.time)
          const end   = start + (ev.durationMinutes || 90)
          let col = cols.findIndex(endMin => endMin <= start)
          if (col === -1) col = cols.length
          cols[col] = end
          lanes.push({ ev, col, totalCols: 0 })
        }

        // Second pass: count actual columns needed for overlapping groups
        for (let i = 0; i < lanes.length; i++) {
          const start = toMins(lanes[i].ev.time)
          const end   = start + (lanes[i].ev.durationMinutes || 90)
          let maxCol = lanes[i].col
          for (let j = 0; j < lanes.length; j++) {
            if (i === j) continue
            const s2 = toMins(lanes[j].ev.time)
            const e2 = s2 + (lanes[j].ev.durationMinutes || 90)
            if (start < e2 && s2 < end) maxCol = Math.max(maxCol, lanes[j].col)
          }
          lanes[i].totalCols = maxCol + 1
        }

        return (
          <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
            {/* Day nav header */}
            <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b">
              <button onClick={goPrev} className="p-1.5 rounded-lg hover:bg-gray-200 transition text-gray-600 text-lg leading-none">‹</button>
              <h3 className="font-semibold text-gray-800 flex-1 text-center">{dayLabel}</h3>
              <button onClick={goNext} className="p-1.5 rounded-lg hover:bg-gray-200 transition text-gray-600 text-lg leading-none">›</button>
              {selectedDay !== todayStr && (
                <button onClick={() => setSelectedDay(todayStr)} className="text-xs text-[var(--fd-primary)] hover:text-[var(--fd-primary-dark)] border border-[var(--fd-primary)] rounded-lg px-2 py-1 hover:bg-[#f5f5fb] transition">Today</button>
              )}
              {!readOnly && (
                <button onClick={() => openAdd(selectedDay)} className="text-xs bg-[var(--fd-primary)] text-white rounded-lg px-2 py-1 hover:bg-[var(--fd-primary-dark)] transition">+ Add</button>
              )}
            </div>

            {/* Timeline */}
            <div className="overflow-y-auto max-h-[calc(100vh-280px)]">
              <div className="flex">
                {/* Hour labels */}
                <div className="flex-shrink-0 w-16 border-r">
                  {HOURS.map(h => (
                    <div key={h} className="border-b flex items-start justify-end pr-2 pt-1" style={{ height: PX_PER_HOUR }}>
                      <span className="text-xs text-gray-400">{h === 12 ? '12 PM' : h < 12 ? `${h} AM` : `${h - 12} PM`}</span>
                    </div>
                  ))}
                </div>

                {/* Event area */}
                <div className="flex-1 relative" style={{ height: HOURS.length * PX_PER_HOUR }}>
                  {/* Hour grid lines */}
                  {HOURS.map(h => (
                    <div key={h} className="absolute w-full border-b border-gray-100" style={{ top: (h - HOUR_START) * PX_PER_HOUR, height: PX_PER_HOUR }} />
                  ))}
                  {/* Half-hour grid lines */}
                  {HOURS.map(h => (
                    <div key={`h-${h}`} className="absolute w-full border-b border-gray-50" style={{ top: (h - HOUR_START) * PX_PER_HOUR + PX_PER_HOUR / 2 }} />
                  ))}

                  {/* Events */}
                  {lanes.map(({ ev, col, totalCols }) => {
                    const startMins  = toMins(ev.time)
                    const dur        = ev.durationMinutes || 90
                    const top        = (startMins - HOUR_START * 60) / 60 * PX_PER_HOUR
                    const height     = Math.max(dur / 60 * PX_PER_HOUR, 28)
                    const width      = `calc(${100 / totalCols}% - 6px)`
                    const left       = `calc(${(col / totalCols) * 100}% + 3px)`
                    const isSpecial  = ev.type === 'special'
                    const isGame     = ev.type === 'game'
                    const c          = isSpecial ? null : getDivisionColor((ev as ScheduledGame | ScheduledPractice).divisionId, state.divisions)
                    const g          = ev as ScheduledGame
                    const p          = ev as ScheduledPractice
                    const sp         = ev as ScheduledSpecialEvent
                    const field      = isSpecial ? null : fieldMap.get((ev as ScheduledGame | ScheduledPractice).fieldId)
                    const endFmt     = fmtTime(minsToTime(startMins + dur))

                    // Scale font based on how many columns are competing for space
                    const textSize = totalCols <= 1 ? 'text-xs' : totalCols === 2 ? 'text-[11px]' : 'text-[10px]'
                    const homeName = isGame ? (teamMap.get(g.homeTeamId)?.name ?? '?') : null
                    const awayName = isGame ? (teamMap.get(g.awayTeamId)?.name ?? '?') : null

                    return (
                      <div
                        key={ev.id}
                        onClick={() => openEdit(ev)}
                        className={`absolute rounded-lg border cursor-pointer hover:opacity-90 transition overflow-hidden shadow-sm ${
                          isSpecial ? 'bg-amber-50 border-amber-300' : `${c!.bg} ${c!.border}`
                        }`}
                        style={{ top, height, width, left }}
                      >
                        <div className={`w-full h-1 flex-shrink-0 ${isSpecial ? 'bg-amber-400' : c!.header}`} />
                        <div className={`px-2 py-1 ${textSize} leading-tight`}>
                          {isSpecial ? (
                            <div className="font-semibold truncate text-amber-700">{sp.name}</div>
                          ) : isGame ? (
                            <>
                              <div className={`font-semibold truncate ${c!.text}`}>{homeName}</div>
                              <div className={`font-semibold truncate ${c!.text} opacity-80`}>{awayName}</div>
                            </>
                          ) : (
                            <div className={`font-semibold truncate ${c!.text}`}>
                              {teamMap.get(p.teamId)?.name ?? '?'} — Practice
                            </div>
                          )}
                          {height > 52 && (
                            <div className="text-gray-500 truncate mt-0.5">
                              {fmtTime(ev.time)}–{endFmt}{!isSpecial && field ? ` · ${field.name}` : isSpecial && sp.location ? ` · ${sp.location}` : ''}
                            </div>
                          )}
                          {height > 72 && !isSpecial && field?.location && (
                            <div className="text-gray-400 truncate">{field.location}</div>
                          )}
                        </div>
                      </div>
                    )
                  })}

                  {/* Empty state */}
                  {dayEvents.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <p className="text-gray-400 text-sm italic">No events scheduled for this day</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Legend */}
      <div className="flex flex-wrap gap-2 text-xs">
        {state.divisions.map(d => { const c = getDivisionColor(d.id, state.divisions); return <span key={d.id} className={`px-2 py-0.5 rounded-lg border ${c.bg} ${c.text} ${c.border}`}>{d.name} {sc.eventSingular.toLowerCase()}</span> })}
        <span className="px-2 py-0.5 rounded-lg border bg-gray-100 text-gray-600 border-gray-200">Practice</span>
        <span className="px-2 py-0.5 rounded-lg border bg-amber-50 text-amber-700 border-amber-300">Special Event</span>
        <span className="px-2 py-0.5 rounded-lg border bg-red-50 text-red-400 border-red-200">Blackout date</span>
      </div>

      {modal.open && (
        <EventModal state={state} setState={setState} initialForm={modal.initialForm} onClose={closeModal} />
      )}

      {/* Hover tooltip — fixed so it escapes the calendar's overflow:hidden */}
      {tooltip && (() => {
        const ev = tooltip.ev
        const isSpecial = ev.type === 'special'
        const isGame = ev.type === 'game'
        const g  = ev as ScheduledGame
        const p  = ev as ScheduledPractice
        const sp = ev as ScheduledSpecialEvent
        const startFmt = fmtTime(ev.time)
        const endFmt   = ev.durationMinutes ? fmtTime(minsToTime(toMins(ev.time) + ev.durationMinutes)) : null
        const field    = isSpecial ? null : fieldMap.get((ev as ScheduledGame | ScheduledPractice).fieldId)
        const div      = isSpecial ? null : divMap.get((ev as ScheduledGame | ScheduledPractice).divisionId)
        const c        = isSpecial ? null : getDivisionColor((ev as ScheduledGame | ScheduledPractice).divisionId, state.divisions)
        const TOOLTIP_W = 288 + 8   // w-72 = 288px + a little breathing room
        const safeLeft = Math.min(tooltip.x, window.innerWidth - TOOLTIP_W)
        return (
          <div
            className="fixed z-50 pointer-events-none"
            style={{ left: safeLeft, top: tooltip.y - 8, transform: 'translateY(-100%)' }}
          >
            <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-4 text-sm w-72">
              <div className={`text-xs font-semibold uppercase tracking-wide mb-2 ${isSpecial ? 'text-amber-600' : c!.text}`}>
                {isSpecial
                  ? <span className="flex items-center gap-1"><Icon name="star" className="w-3.5 h-3.5" />Special Event</span>
                  : `${div?.name ?? ''} ${isGame ? sc.eventSingular : 'Practice'}`}
              </div>
              {isSpecial ? (
                <div className="space-y-1">
                  <div className="font-semibold text-gray-800">{sp.name}</div>
                  {sp.location && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Location</span>
                      <span className="text-gray-700 text-right max-w-[160px]">{sp.location}</span>
                    </div>
                  )}
                  {sp.comments && (
                    <div className="mt-1 text-gray-500 text-xs italic">{sp.comments}</div>
                  )}
                </div>
              ) : isGame ? (() => {
                const r = g.result
                const homeWon = r !== undefined && r.homeScore > r.awayScore
                const awayWon = r !== undefined && r.awayScore > r.homeScore
                const tied    = r !== undefined && r.homeScore === r.awayScore
                const homeName = teamMap.get(g.homeTeamId)?.name ?? '—'
                const awayName = teamMap.get(g.awayTeamId)?.name ?? '—'
                return (
                  <div className="space-y-1">
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-gray-500 flex-shrink-0">Home</span>
                      <span className={`font-medium truncate ${homeWon ? 'text-green-700' : 'text-gray-800'}`}>{homeName}</span>
                      {homeWon && <span className="text-[10px] font-bold bg-green-100 text-green-700 px-1.5 py-0.5 rounded-lg flex-shrink-0">WIN</span>}
                    </div>
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-gray-500 flex-shrink-0">Away</span>
                      <span className={`font-medium truncate ${awayWon ? 'text-green-700' : 'text-gray-800'}`}>{awayName}</span>
                      {awayWon && <span className="text-[10px] font-bold bg-green-100 text-green-700 px-1.5 py-0.5 rounded-lg flex-shrink-0">WIN</span>}
                    </div>
                    {r !== undefined && (
                      <div className="flex justify-between items-center pt-1 border-t border-gray-100 mt-1">
                        <span className="text-gray-500">{tied ? 'Final (Tie)' : 'Final'}</span>
                        <span className="font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded-lg text-xs tracking-wide">
                          {r.homeScore}–{r.awayScore}
                        </span>
                      </div>
                    )}
                  </div>
                )
              })() : (
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
                {!isSpecial && field && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">{sc.venueSingular}</span>
                    <span className="font-medium text-gray-800">{field.name}</span>
                  </div>
                )}
                {!isSpecial && field?.location && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Location</span>
                    <span className="font-medium text-gray-800 text-right max-w-[120px] truncate">{field.location}</span>
                  </div>
                )}
                {!isSpecial && field?.address && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Address</span>
                    <span className="text-gray-600 text-right max-w-[120px] truncate">{field.address}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Notify Coaches modal ── */}
      {notifyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-violet-600 px-6 py-4">
              <h2 className="text-lg font-bold text-white">Notify Coaches</h2>
              <p className="text-violet-200 text-sm mt-0.5">Send each coach their team&apos;s schedule by email.</p>
            </div>

            <div className="px-6 py-4 space-y-4">
              {!notifyResult ? (
                <>
                  <p className="text-sm text-gray-600">Select which teams to notify. Only coaches with an email address will receive a message.</p>

                  {/* Select all / none */}
                  <div className="flex gap-3 text-xs">
                    <button onClick={() => setNotifyTeamIds(new Set(teamsWithCoachEmails.map(t => t.id)))} className="text-violet-600 hover:underline">Select all</button>
                    <button onClick={() => setNotifyTeamIds(new Set())} className="text-gray-400 hover:underline">Clear</button>
                  </div>

                  {/* Team list */}
                  <div className="max-h-64 overflow-y-auto space-y-1 border rounded-lg p-2">
                    {teamsWithCoachEmails.map(team => {
                      const emailCount = team.coaches?.filter(c => c.email).length ?? 0
                      const checked = notifyTeamIds.has(team.id)
                      return (
                        <label key={team.id} className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const next = new Set(notifyTeamIds)
                              checked ? next.delete(team.id) : next.add(team.id)
                              setNotifyTeamIds(next)
                            }}
                            className="accent-violet-600"
                          />
                          <span className="flex-1 text-sm font-medium text-gray-800">{team.name}</span>
                          <span className="text-xs text-gray-400">{emailCount} coach email{emailCount !== 1 ? 's' : ''}</span>
                        </label>
                      )
                    })}
                  </div>

                  <div className="flex gap-3 justify-end pt-1">
                    <button onClick={() => setNotifyModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border rounded-lg transition">Cancel</button>
                    <button
                      onClick={sendNotifications}
                      disabled={notifySending || notifyTeamIds.size === 0}
                      className="px-4 py-2 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {notifySending ? 'Sending…' : `Send to ${notifyTeamIds.size} team${notifyTeamIds.size !== 1 ? 's' : ''}`}
                    </button>
                  </div>
                </>
              ) : (
                /* Result view */
                <div className="space-y-4">
                  <div className={`flex items-center gap-3 p-3 rounded-lg ${notifyResult.sent > 0 ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                    <span className="text-xl">{notifyResult.sent > 0 ? '✅' : '❌'}</span>
                    <div>
                      <p className="font-semibold text-sm">{notifyResult.sent} email{notifyResult.sent !== 1 ? 's' : ''} sent successfully</p>
                      {notifyResult.failed.length > 0 && (
                        <p className="text-xs mt-0.5">{notifyResult.failed.length} failed</p>
                      )}
                    </div>
                  </div>

                  {notifyResult.failed.length > 0 && (
                    <div className="text-xs space-y-1">
                      <p className="font-medium text-gray-700">Failed:</p>
                      {notifyResult.failed.map((f, i) => (
                        <p key={i} className="text-red-600">{f.coachName ? `${f.coachName} (${f.teamName})` : ''}: {f.error}</p>
                      ))}
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button onClick={() => setNotifyModal(false)} className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition">Close</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
