'use client'
import { useState, useMemo } from 'react'
import type { AppState, ScheduledGame, ScheduledPractice } from '@/lib/types'
import { getSportConfig } from '@/lib/sports'
import { getDivisionColor } from '@/lib/divisionColors'
import EventModal, { emptyForm, formFromEvent, type EventForm, toMins, minsToTime, fmtTime } from './EventModal'

interface Props { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; readOnly?: boolean }

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_HEADERS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

export default function FieldCalendarTab({ state, setState, readOnly = false }: Props) {
  const sc = getSportConfig(state.season.sport)
  const today = new Date()
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null)
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [modal, setModal] = useState<{ open: boolean; initialForm: EventForm }>({ open: false, initialForm: emptyForm() })

  const todayStr = today.toISOString().split('T')[0]
  const blackoutSet = useMemo(() => new Set((state.blackoutDates ?? []).map(d => d.split('::')[0])), [state.blackoutDates])
  const teamMap = useMemo(() => new Map(state.divisions.flatMap(d => d.teams).map(t => [t.id, t])), [state.divisions])

  // All events at selected field
  const fieldEvents = useMemo(() => {
    if (!selectedFieldId) return []
    return ([...state.schedule.games, ...state.schedule.practices] as (ScheduledGame | ScheduledPractice)[])
      .filter(ev => ev.fieldId === selectedFieldId)
  }, [selectedFieldId, state.schedule])

  // Grouped by date, sorted by time
  const eventsByDate = useMemo(() => {
    const map = new Map<string, (ScheduledGame | ScheduledPractice)[]>()
    for (const ev of fieldEvents) {
      if (!map.has(ev.date)) map.set(ev.date, [])
      map.get(ev.date)!.push(ev)
    }
    for (const [, evs] of map) evs.sort((a, b) => a.time.localeCompare(b.time))
    return map
  }, [fieldEvents])

  // Event count per field for sidebar badges
  const countByField = useMemo(() => {
    const map = new Map<string, number>()
    for (const ev of [...state.schedule.games, ...state.schedule.practices]) {
      map.set(ev.fieldId, (map.get(ev.fieldId) ?? 0) + 1)
    }
    return map
  }, [state.schedule])

  const firstDow = new Date(year, month, 1).getDay()
  const numDays  = new Date(year, month + 1, 0).getDate()

  function prevMonth() { month === 0 ? (setMonth(11), setYear(y => y - 1)) : setMonth(m => m - 1) }
  function nextMonth() { month === 11 ? (setMonth(0), setYear(y => y + 1)) : setMonth(m => m + 1) }
  function goToday()   { setYear(today.getFullYear()); setMonth(today.getMonth()) }

  function openAdd(date: string) {
    const base = emptyForm(date, state.season.gameDurationMinutes || 90)
    setModal({ open: true, initialForm: { ...base, fieldId: selectedFieldId! } })
  }

  function openEdit(ev: ScheduledGame | ScheduledPractice) {
    if (readOnly) return
    setModal({ open: true, initialForm: formFromEvent(ev) })
  }

  function closeModal() { setModal(m => ({ ...m, open: false })) }

  // Colour-code how booked a day is (12 hrs available = 720 min)
  function dayBusyness(events: (ScheduledGame | ScheduledPractice)[]) {
    const mins = events.reduce((s, ev) => s + (ev.durationMinutes || 90), 0)
    if (mins === 0)   return 'free'
    if (mins < 180)  return 'light'     // < 3 hrs
    if (mins < 420)  return 'moderate'  // < 7 hrs
    return 'busy'
  }

  const selectedField = state.fields.find(f => f.id === selectedFieldId)

  return (
    <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 sm:min-h-[600px]">

      {/* ── Sidebar ── */}
      <div className="w-full sm:w-48 flex-shrink-0 sm:space-y-2">
        <h2 className="text-base font-semibold text-gray-700">{sc.venuePlural}</h2>
        {state.fields.length === 0 && (
          <p className="text-sm text-gray-400 italic">No {sc.venuePlural.toLowerCase()} added yet. Go to the {sc.venuePlural} tab to add some.</p>
        )}
        <div className="flex sm:block gap-2 sm:gap-0 overflow-x-auto sm:overflow-visible sm:space-y-2 pb-1 sm:pb-0">
        {state.fields.map(field => {
          const isSelected = selectedFieldId === field.id
          const count = countByField.get(field.id) ?? 0
          return (
            <button
              key={field.id}
              onClick={() => setSelectedFieldId(field.id)}
              className={`w-auto shrink-0 whitespace-nowrap sm:w-full sm:whitespace-normal text-left px-3 py-2.5 rounded-lg border text-sm transition ${
                isSelected
                  ? 'bg-[var(--fd-primary)] text-white border-[var(--fd-primary)] font-semibold shadow-sm'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-[var(--fd-primary)] hover:bg-[#f5f5fb]'
              }`}
            >
              <div className="font-medium truncate">{field.name}</div>
              {(field.location || field.address) && (
                <div className={`text-xs mt-0.5 truncate ${isSelected ? 'text-[#d0d8f0]' : 'text-gray-400'}`}>
                  {field.location || field.address}
                </div>
              )}
              <div className={`text-xs mt-1 ${isSelected ? 'text-[var(--fd-primary-light)]' : 'text-gray-400'}`}>
                {count > 0 ? `${count} event${count !== 1 ? 's' : ''}` : 'No events yet'}
              </div>
            </button>
          )
        })}
        </div>
      </div>

      {/* ── Main panel ── */}
      <div className="flex-1 min-w-0">
        {!selectedFieldId ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-24 text-gray-400">
            <p className="text-lg font-medium text-gray-500">Select a {sc.venueSingular.toLowerCase()}</p>
            <p className="text-sm mt-1">Click a {sc.venueSingular.toLowerCase()} to view its calendar and book events</p>
          </div>
        ) : (
          <div className="space-y-4">

            {/* Field header */}
            <div className="bg-white rounded-lg border p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{selectedField?.name}</h2>
                {selectedField?.location && (
                  <p className="text-sm text-gray-500 mt-0.5">{selectedField.location}</p>
                )}
                {selectedField?.address && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedField.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-500 hover:text-blue-700 hover:underline mt-0.5 inline-flex items-center gap-1"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3"><path fillRule="evenodd" d="M7.752 15.146c.192.094.304.074.304.074s.112.02.304-.074l.002-.001.005-.002.015-.007a5.146 5.146 0 00.225-.112c.148-.077.356-.192.606-.346.496-.308 1.156-.773 1.82-1.412C12.24 11.99 13.6 9.994 13.6 7.2a5.6 5.6 0 10-11.2 0c0 2.794 1.36 4.79 2.684 6.066a10.987 10.987 0 001.82 1.412c.25.154.458.27.606.346a5.15 5.15 0 00.225.112l.015.007.005.002.002.001zM8 9a1.8 1.8 0 100-3.6A1.8 1.8 0 008 9z" clipRule="evenodd"/></svg>
                    {selectedField.address}
                  </a>
                )}
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-500">
                <span>Open 8:00 AM – 8:00 PM</span>
                <span className="font-medium text-gray-700">{fieldEvents.length} event{fieldEvents.length !== 1 ? 's' : ''} this season</span>
              </div>
            </div>

            {/* Calendar */}
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
                  <div key={`b${i}`} className={`min-h-[56px] sm:min-h-[120px] bg-gray-50 border-b ${i < 6 ? 'border-r' : ''}`} />
                ))}

                {/* Day cells */}
                {Array.from({ length: numDays }).map((_, i) => {
                  const day = i + 1
                  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                  const isBlackout = blackoutSet.has(dateStr)
                  const isToday = dateStr === todayStr
                  const col = (firstDow + i) % 7
                  const events = eventsByDate.get(dateStr) ?? []
                  const busyness = dayBusyness(events)

                  const dotColor = isBlackout ? '' :
                    busyness === 'free'     ? 'bg-green-400' :
                    busyness === 'light'    ? 'bg-yellow-400' :
                    busyness === 'moderate' ? 'bg-orange-400' :
                    'bg-red-400'

                  const dotTitle = busyness === 'free' ? 'Available all day' :
                    busyness === 'light'    ? 'Lightly booked' :
                    busyness === 'moderate' ? 'Moderately booked' :
                    'Heavily booked'

                  return (
                    <div
                      key={day}
                      className={`min-h-[56px] sm:min-h-[120px] border-b p-1.5 relative group flex flex-col ${col < 6 ? 'border-r' : ''} ${
                        isBlackout ? 'bg-red-50' : 'hover:bg-slate-50 transition-colors'
                      }`}
                    >
                      {/* Date number + indicators */}
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full ${
                          isToday ? 'bg-[var(--fd-primary)] text-white' : isBlackout ? 'text-red-400' : 'text-gray-600'
                        }`}>{day}</span>

                        <div className="flex items-center gap-1">
                          {!isBlackout && (
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} title={dotTitle} />
                          )}
                          {isBlackout
                            ? <span className="text-xs text-red-300 italic">closed</span>
                            : !readOnly && <button
                                onClick={() => openAdd(dateStr)}
                                className="hidden sm:flex opacity-0 group-hover:opacity-100 w-5 h-5 shrink-0 items-center justify-center rounded-full text-[var(--fd-primary)] hover:bg-[#eeeef6] transition text-base leading-none"
                                title="Add event at this field"
                              >+</button>
                          }
                        </div>
                      </div>

                      {/* Events — shrink font/spacing as count grows so all fit */}
                      {(() => {
                        const n = events.length
                        const textSize = n <= 3 ? 'text-xs' : n <= 5 ? 'text-[10px]' : 'text-[9px]'
                        const gap      = n <= 5 ? 'space-y-0.5' : 'space-y-px'
                        const pad      = n <= 5 ? 'px-1.5 py-0.5' : 'px-1 py-px'
                        return (
                          <>
                          <div className={`hidden sm:block flex-1 ${gap}`}>
                            {events.map(ev => {
                              const c = getDivisionColor(ev.divisionId, state.divisions)
                              const isPractice = ev.type === 'practice'
                              const endMins = toMins(ev.time) + (ev.durationMinutes || 90)
                              const label = ev.type === 'game'
                                ? `${teamMap.get((ev as ScheduledGame).homeTeamId)?.name ?? '?'} vs ${teamMap.get((ev as ScheduledGame).awayTeamId)?.name ?? '?'}`
                                : `${teamMap.get((ev as ScheduledPractice).teamId)?.name ?? '?'} practice`
                              return (
                                <button
                                  key={ev.id}
                                  onClick={() => openEdit(ev)}
                                  className={`w-full text-left ${textSize} ${pad} rounded-lg truncate border transition hover:opacity-75 ${
                                    isPractice ? 'bg-gray-100 text-gray-600 border-gray-200' : `${c.bg} ${c.text} ${c.border}`
                                  }`}
                                  title={`${fmtTime(ev.time)}–${fmtTime(minsToTime(endMins))} — ${label}`}
                                >
                                  <span className="font-medium">{fmtTime(ev.time)}</span> {label}
                                </button>
                              )
                            })}
                          </div>
                          {/* Phones: a count, not chips. Seven columns across
                              390px leaves ~50px per cell, where a chip is
                              unreadable and untappable. */}
                          {n > 0 && (
                            <span className="sm:hidden mx-auto mb-1 flex items-center justify-center w-6 h-6 rounded-full bg-[var(--fd-primary)] text-white text-[11px] font-bold">
                              {n}
                              <span className="sr-only"> event{n === 1 ? '' : 's'} scheduled</span>
                            </span>
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
                    <div key={`t${i}`} className={`min-h-[56px] sm:min-h-[120px] bg-gray-50 border-b ${i < trail - 1 ? 'border-r' : ''}`} />
                  ))
                })()}
              </div>
              <p className="sm:hidden px-4 py-3 text-xs text-center text-gray-500">
                Counts only on phones — open a {sc.venueSingular.toLowerCase()} on a larger screen to see and edit individual events.
              </p>
            </div>

            {/* Availability legend */}
            <div className="flex flex-wrap gap-4 text-xs text-gray-500 items-center">
              <span className="font-medium text-gray-600">Availability:</span>
              {[
                { color: 'bg-green-400',  label: 'Open all day' },
                { color: 'bg-yellow-400', label: 'Lightly booked (< 3 hrs)' },
                { color: 'bg-orange-400', label: 'Moderately booked (3–7 hrs)' },
                { color: 'bg-red-400',    label: 'Heavily booked (7+ hrs)' },
              ].map(({ color, label }) => (
                <span key={label} className="flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${color} inline-block flex-shrink-0`} />
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {modal.open && (
        <EventModal state={state} setState={setState} initialForm={modal.initialForm} onClose={closeModal} />
      )}

      {/* Mobile add-event FAB. A per-day `+` cannot fit a 51px month cell
          beside the day number, so on phones adding is done here and the
          date is chosen in the editor. Mirrors the Schedule tab's FAB.
          Gated on selectedFieldId too — openAdd() writes selectedFieldId as
          the event's fieldId, and with no field selected the calendar grid
          (and this button's only reachable context) isn't even shown. */}
      {!readOnly && selectedFieldId && (
        <button
          onClick={() => openAdd(new Date().toISOString().split('T')[0])}
          aria-label="Add event"
          className="sm:hidden fixed right-4 bottom-24 z-30 w-14 h-14 rounded-full bg-[var(--fd-accent)] text-white shadow-lg flex items-center justify-center text-3xl leading-none active:opacity-90"
        >
          +
        </button>
      )}
    </div>
  )
}
