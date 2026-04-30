'use client'
import { useState, useMemo } from 'react'
import type { AppState, ScheduledGame, ScheduledPractice, Coach } from '@/lib/types'
import { getDivisionColor } from '@/lib/divisionColors'
import EventModal, { emptyForm, formFromEvent, type EventForm } from './EventModal'
import { getSportConfig } from '@/lib/sports'

interface Props {
  state: AppState
  setState: React.Dispatch<React.SetStateAction<AppState>>
  readOnly?: boolean
  onNavigate: (tab: number) => void   // tab index in page.tsx (after Dashboard = 0)
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(t: string) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

function dayLabel(dateStr: string): string {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  const d = new Date(dateStr + 'T00:00:00')
  const short = d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })
  if (d.getTime() === today.getTime()) return `Today · ${short}`
  if (d.getTime() === tomorrow.getTime()) return `Tomorrow · ${short}`
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function dateRange(start: Date, end: Date): string {
  return (
    start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' – ' +
    end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  )
}

function mapsUrl(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PinIcon() {
  return (
    <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function EditIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  )
}

function CoachList({ label, coaches }: { label: string; coaches: Coach[] }) {
  const sorted = [...coaches].sort((a, b) => {
    if (a.role === 'head' && b.role !== 'head') return -1
    if (b.role === 'head' && a.role !== 'head') return 1
    return a.name.localeCompare(b.name)
  })
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{label}</p>
      <div className="space-y-2">
        {sorted.map(coach => (
          <div key={coach.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
            <span className="font-semibold text-gray-800">{coach.name}</span>
            {coach.role && (
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                coach.role === 'head' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {coach.role === 'head' ? 'Head Coach' : 'Assistant'}
              </span>
            )}
            {coach.phone && (
              <a href={`tel:${coach.phone}`} className="text-gray-500 hover:text-blue-600 transition-colors">
                {coach.phone}
              </a>
            )}
            {coach.email && (
              <a href={`mailto:${coach.email}`} className="text-blue-600 hover:underline">
                {coach.email}
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DashboardTab({ state, setState, readOnly = false, onNavigate }: Props) {
  const sc = getSportConfig(state.season.sport)
  const [modal, setModal] = useState<{ open: boolean; initialForm: EventForm }>({
    open: false, initialForm: emptyForm()
  })

  const [confirmTip, setConfirmTip] = useState<{ x: number; y: number } | null>(null)

  const teamMap   = useMemo(() => new Map(state.divisions.flatMap(d => d.teams).map(t => [t.id, t])), [state.divisions])
  const fieldMap  = useMemo(() => new Map(state.fields.map(f => [f.id, f])), [state.fields])
  const umpireMap = useMemo(() => new Map(state.umpires.map(u => [u.id, u])), [state.umpires])
  const divMap    = useMemo(() => new Map(state.divisions.map(d => [d.id, d])), [state.divisions])

  // Week window: today → today + 6 days
  const todayStart = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d }, [])
  const weekEnd    = useMemo(() => { const d = new Date(todayStart); d.setDate(d.getDate() + 6); d.setHours(23,59,59,999); return d }, [todayStart])

  const eventsByDate = useMemo(() => {
    const all: (ScheduledGame | ScheduledPractice)[] = [
      ...state.schedule.games,
      ...state.schedule.practices,
    ].filter(e => {
      const d = new Date(e.date + 'T00:00:00')
      return d >= todayStart && d <= weekEnd
    }).sort((a, b) => {
      const dc = a.date.localeCompare(b.date)
      return dc !== 0 ? dc : a.time.localeCompare(b.time)
    })

    const map = new Map<string, (ScheduledGame | ScheduledPractice)[]>()
    for (const e of all) {
      if (!map.has(e.date)) map.set(e.date, [])
      map.get(e.date)!.push(e)
    }
    return map
  }, [state.schedule, todayStart, weekEnd])

  const totalEvents = useMemo(() =>
    [...eventsByDate.values()].reduce((s, v) => s + v.length, 0),
    [eventsByDate]
  )

  function toggleConfirm(gameId: string) {
    setState(s => ({
      ...s,
      schedule: {
        ...s.schedule,
        games: s.schedule.games.map(g =>
          g.id === gameId ? { ...g, confirmed: !g.confirmed } : g
        ),
      },
    }))
  }

  function openEdit(ev: ScheduledGame | ScheduledPractice) {
    setModal({ open: true, initialForm: formFromEvent(ev) })
  }

  return (
    <div className="space-y-8">

      {/* ── Page header ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Week at a Glance</h2>
          <p className="text-sm text-gray-500 mt-0.5">{dateRange(todayStart, weekEnd)}</p>
        </div>
        <button
          onClick={() => onNavigate(5)}
          className="text-sm text-[var(--fd-accent)] hover:underline font-medium"
        >
          View full schedule →
        </button>
      </div>

      {/* ── Empty state ───────────────────────────────────────────────── */}
      {totalEvents === 0 && (
        <div className="bg-white rounded-xl border p-16 text-center">
          <div className="text-5xl mb-4">📅</div>
          <p className="text-xl font-semibold text-gray-600">No events this week</p>
          <p className="text-sm text-gray-400 mt-1">Nothing scheduled for {dateRange(todayStart, weekEnd)}</p>
          <button
            onClick={() => onNavigate(5)}
            className="mt-5 text-sm bg-[var(--fd-accent)] hover:bg-[var(--fd-primary)] text-white font-semibold px-5 py-2 rounded-lg transition"
          >
            View full schedule
          </button>
        </div>
      )}

      {/* ── Day groups ────────────────────────────────────────────────── */}
      {[...eventsByDate.entries()].map(([date, events]) => (
        <section key={date}>

          {/* Day header */}
          <div className="flex items-center gap-3 mb-4">
            <h3 className="text-base font-bold text-gray-700 whitespace-nowrap">{dayLabel(date)}</h3>
            <div className="flex-1 border-t border-gray-200" />
            <span className="text-xs text-gray-400 whitespace-nowrap">
              {events.length} event{events.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Event cards */}
          <div className="space-y-4">
            {events.map(ev => {
              const div   = divMap.get(ev.divisionId)
              const c     = div ? getDivisionColor(div.id, state.divisions) : getDivisionColor('', state.divisions)
              const field = fieldMap.get(ev.fieldId)

              if (ev.type === 'game') {
                const g          = ev as ScheduledGame
                const homeTeam   = teamMap.get(g.homeTeamId)
                const awayTeam   = teamMap.get(g.awayTeamId)
                const umpire     = g.umpireId ? umpireMap.get(g.umpireId) : null
                const homeCoaches = homeTeam?.coaches ?? []
                const awayCoaches = awayTeam?.coaches ?? []
                const hasCoaches  = homeCoaches.length > 0 || awayCoaches.length > 0

                return (
                  <div
                    key={g.id}
                    className={`bg-white rounded-xl border border-gray-200 shadow-sm ${g.confirmed ? 'ring-1 ring-green-300' : ''}`}
                  >
                    <div className="flex">
                      {/* Division color strip */}
                      <div className={`w-1.5 flex-shrink-0 ${c.header} rounded-tl-xl rounded-bl-xl`} />

                      <div className="flex-1 min-w-0">
                        {/* Card header */}
                        <div className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap bg-gray-50 border-b rounded-tr-xl">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${c.pill}`}>
                              {div?.name ?? 'Unknown Division'}
                            </span>
                            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-[#eeeef6] text-[var(--fd-accent)]">
                              {sc.eventSingular}
                            </span>
                            <span className="text-sm font-semibold text-gray-800">{fmtTime(g.time)}</span>
                            {g.durationMinutes > 0 && (
                              <span className="text-xs text-gray-400">{g.durationMinutes} min</span>
                            )}
                            {g.confirmed && (
                              <span className="text-xs font-semibold text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                                ✓ Confirmed
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {/* Confirm checkbox with tooltip */}
                            {!readOnly && (
                              <div
                                className="flex items-center gap-1.5"
                                onMouseEnter={e => {
                                  const r = e.currentTarget.getBoundingClientRect()
                                  setConfirmTip({ x: r.left + r.width / 2, y: r.top })
                                }}
                                onMouseLeave={() => setConfirmTip(null)}
                              >
                                <input
                                  type="checkbox"
                                  id={`confirm-${g.id}`}
                                  checked={!!g.confirmed}
                                  onChange={() => toggleConfirm(g.id)}
                                  className="w-4 h-4 rounded cursor-pointer accent-green-600"
                                />
                                <label
                                  htmlFor={`confirm-${g.id}`}
                                  className={`text-xs font-medium cursor-pointer select-none transition-colors ${
                                    g.confirmed ? 'text-green-600' : 'text-gray-500'
                                  }`}
                                >
                                  Confirm
                                </label>
                              </div>
                            )}

                            {/* Edit button */}
                            {!readOnly && (
                              <button
                                onClick={() => openEdit(g)}
                                className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-[var(--fd-accent)] hover:bg-[#eeeef6] px-2.5 py-1.5 rounded-lg transition"
                              >
                                <EditIcon />
                                Edit
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Card body */}
                        <div className="px-5 py-4 space-y-3.5">

                          {/* Teams matchup */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xl font-bold text-gray-900">{homeTeam?.name ?? 'TBD'}</span>
                              <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-semibold">Home</span>
                            </div>
                            <span className="text-lg text-gray-400 font-medium">vs</span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xl font-bold text-gray-900">{awayTeam?.name ?? 'TBD'}</span>
                              <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-semibold">Away</span>
                            </div>
                          </div>

                          {/* Field / Location */}
                          {field && (
                            <div className="flex items-center gap-2 text-sm">
                              <PinIcon />
                              <span className="font-medium text-gray-700">{field.name}</span>
                              {(field.location || field.address) && (
                                <>
                                  <span className="text-gray-300">·</span>
                                  {field.address ? (
                                    <a
                                      href={mapsUrl(field.address)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-600 hover:underline"
                                    >
                                      {field.location || field.address}
                                    </a>
                                  ) : (
                                    <span className="text-gray-600">{field.location}</span>
                                  )}
                                </>
                              )}
                            </div>
                          )}

                          {/* Umpire */}
                          <div className="flex items-start gap-2 text-sm">
                            <span className="font-semibold text-gray-500 w-20 flex-shrink-0 pt-0.5">
                              {sc.officialSingular}:
                            </span>
                            {umpire ? (
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                                <span className="font-medium text-gray-800">{umpire.name}</span>
                                {umpire.phone && (
                                  <a href={`tel:${umpire.phone}`} className="text-gray-500 hover:text-blue-600 transition-colors">
                                    {umpire.phone}
                                  </a>
                                )}
                                {umpire.email && (
                                  <a href={`mailto:${umpire.email}`} className="text-blue-600 hover:underline">
                                    {umpire.email}
                                  </a>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-400 italic">TBD</span>
                            )}
                          </div>

                          {/* Game result (if recorded) */}
                          {g.result !== undefined && (
                            <div className="flex items-center gap-2 text-sm">
                              <span className="font-semibold text-gray-500 w-20 flex-shrink-0">Result:</span>
                              <span className="font-bold text-gray-800">
                                {homeTeam?.name ?? 'Home'} {g.result.homeScore} – {g.result.awayScore} {awayTeam?.name ?? 'Away'}
                              </span>
                              {g.result.homeScore !== g.result.awayScore && (
                                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-green-100 text-green-700">
                                  {g.result.homeScore > g.result.awayScore ? homeTeam?.name : awayTeam?.name} Win
                                </span>
                              )}
                            </div>
                          )}

                          {/* Coaches */}
                          {hasCoaches && (
                            <div className="border-t border-gray-100 pt-3.5 mt-0.5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                              {homeCoaches.length > 0 && (
                                <CoachList
                                  label={`${homeTeam?.name ?? 'Home'} Coaches`}
                                  coaches={homeCoaches}
                                />
                              )}
                              {awayCoaches.length > 0 && (
                                <CoachList
                                  label={`${awayTeam?.name ?? 'Away'} Coaches`}
                                  coaches={awayCoaches}
                                />
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )

              } else {
                // ── Practice card ──────────────────────────────────────
                const p       = ev as ScheduledPractice
                const team    = teamMap.get(p.teamId)
                const coaches = team?.coaches ?? []

                return (
                  <div
                    key={p.id}
                    className="bg-white rounded-xl border border-gray-200 shadow-sm opacity-90"
                  >
                    <div className="flex">
                      {/* Division color strip (lighter for practice) */}
                      <div className={`w-1.5 flex-shrink-0 ${c.header} opacity-50 rounded-tl-xl rounded-bl-xl`} />

                      <div className="flex-1 min-w-0">
                        {/* Card header */}
                        <div className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap bg-gray-50 border-b rounded-tr-xl">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${c.pill}`}>
                              {div?.name ?? 'Unknown Division'}
                            </span>
                            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                              Practice
                            </span>
                            <span className="text-sm font-semibold text-gray-800">{fmtTime(p.time)}</span>
                            {p.durationMinutes > 0 && (
                              <span className="text-xs text-gray-400">{p.durationMinutes} min</span>
                            )}
                          </div>
                          {!readOnly && (
                            <button
                              onClick={() => openEdit(p)}
                              className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-[var(--fd-accent)] hover:bg-[#eeeef6] px-2.5 py-1.5 rounded-lg transition"
                            >
                              <EditIcon />
                              Edit
                            </button>
                          )}
                        </div>

                        {/* Card body */}
                        <div className="px-5 py-4 space-y-3">
                          <div className="text-xl font-bold text-gray-900">
                            {team?.name ?? 'Unknown Team'}{' '}
                            <span className="text-gray-400 font-normal text-base">Practice</span>
                          </div>

                          {field && (
                            <div className="flex items-center gap-2 text-sm">
                              <PinIcon />
                              <span className="font-medium text-gray-700">{field.name}</span>
                              {(field.location || field.address) && (
                                <>
                                  <span className="text-gray-300">·</span>
                                  {field.address ? (
                                    <a
                                      href={mapsUrl(field.address)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-600 hover:underline"
                                    >
                                      {field.location || field.address}
                                    </a>
                                  ) : (
                                    <span className="text-gray-600">{field.location}</span>
                                  )}
                                </>
                              )}
                            </div>
                          )}

                          {coaches.length > 0 && (
                            <CoachList label="Coaches" coaches={coaches} />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              }
            })}
          </div>
        </section>
      ))}

      {/* Confirm tooltip — rendered fixed so it escapes card stacking contexts */}
      {confirmTip && (
        <div
          className="fixed pointer-events-none"
          style={{ left: confirmTip.x, top: confirmTip.y - 10, transform: 'translate(-50%, -100%)', zIndex: 9999 }}
        >
          <div className="w-72 bg-gray-900 text-white text-xs rounded-lg px-3 py-2.5 leading-relaxed shadow-xl">
            Check this box once you&apos;ve confirmed the game with all coaches, the {sc.officialSingular.toLowerCase()}, and field staff. A green ring will appear around the card.
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-gray-900" />
          </div>
        </div>
      )}

      {modal.open && (
        <EventModal
          state={state}
          setState={setState}
          initialForm={modal.initialForm}
          onClose={() => setModal(m => ({ ...m, open: false }))}
        />
      )}
    </div>
  )
}
