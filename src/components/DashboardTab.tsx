'use client'
import { useState, useMemo, useEffect, useRef } from 'react'
import type { AppState, ScheduledGame, ScheduledPractice, Coach } from '@/lib/types'
import { getDivisionColor } from '@/lib/divisionColors'
import EventModal, { emptyForm, formFromEvent, type EventForm } from './EventModal'
import { getSportConfig } from '@/lib/sports'
import {
  type DayWeather,
  weatherEmoji,
  weatherDesc,
  geocodeField,
  fetchDailyWeather,
} from '@/lib/weather'
import Icon from './Icon'
import FirstRunChecklist from './FirstRunChecklist'

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

function CalendarIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <rect x="3" y="5" width="18" height="16" rx="2" strokeLinecap="round" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 3v4M8 3v4M3 10h18" />
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
              <span className={`text-xs px-1.5 py-0.5 rounded-lg font-medium ${
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

/** Square weather card shown alongside each event card. */
function WeatherCard({ data, loading, inline = false }: { data?: DayWeather; loading?: boolean; inline?: boolean }) {
  if (loading && !data) {
    return (
      <div className="w-32 flex-shrink-0 bg-sky-50 border border-sky-100 rounded-xl flex flex-col items-center justify-center gap-2 p-3 animate-pulse">
        <div className="w-10 h-10 bg-sky-200 rounded-full" />
        <div className="w-14 h-3 bg-sky-200 rounded-lg" />
        <div className="w-10 h-4 bg-sky-200 rounded-lg" />
        <div className="w-12 h-3 bg-sky-200 rounded-lg" />
      </div>
    )
  }
  if (!data) return null
  const desc = weatherDesc(data.weatherCode)
  const isRainy = data.precipChance >= 30
  const isWindy = data.windSpeed >= 15
  if (inline) {
    // Phone variant: a 128px square beside a 390px card leaves ~240px for the
    // matchup. Same data, one row, inside the card instead of beside it.
    return (
      <div className="flex items-center gap-2 text-sm bg-sky-50 border border-sky-200 rounded-lg px-3 py-2">
        <span className="text-xl leading-none" role="img" aria-label={desc}>{weatherEmoji(data.weatherCode)}</span>
        <span className="font-bold text-gray-800">{data.tempHigh}°</span>
        <span className="text-gray-500">/ {data.tempLow}°</span>
        <span className="text-xs text-sky-700 truncate">{desc}</span>
        {isRainy && (
          <span className="ml-auto shrink-0 text-xs font-medium text-blue-700 flex items-center gap-1">
            <Icon name="droplet" className="w-3.5 h-3.5" />{data.precipChance}%
          </span>
        )}
      </div>
    )
  }
  return (
    <div className="w-32 flex-shrink-0 bg-gradient-to-b from-sky-50 to-blue-50 border border-sky-200 rounded-xl flex flex-col items-center justify-center gap-1.5 p-4 text-center shadow-sm">
      <span className="text-4xl leading-none" role="img" aria-label={desc}>
        {weatherEmoji(data.weatherCode)}
      </span>
      <p className="text-[11px] font-semibold text-sky-600 leading-tight">{desc}</p>
      <div className="mt-0.5">
        <p className="text-2xl font-bold text-gray-800 leading-none">{data.tempHigh}°</p>
        <p className="text-xs text-gray-400 mt-0.5">Low {data.tempLow}°</p>
      </div>
      {isRainy && (
        <p className="text-xs font-medium text-blue-600 flex items-center gap-1"><Icon name="droplet" className="w-3.5 h-3.5" />{data.precipChance}%</p>
      )}
      {isWindy && (
        <p className="text-xs text-gray-500 flex items-center gap-1"><Icon name="wind" className="w-3.5 h-3.5" />{data.windSpeed} mph</p>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DashboardTab({ state, setState, readOnly = false, onNavigate }: Props) {
  const sc = getSportConfig(state.season.sport)
  const [modal, setModal] = useState<{ open: boolean; initialForm: EventForm }>({
    open: false, initialForm: emptyForm()
  })

  // Which game's Confirm explanation is open. A real disclosure, not a hover
  // tooltip: the old mouseenter version was invisible to touch and keyboard.
  const [confirmHelpFor, setConfirmHelpFor] = useState<string | null>(null)

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

  // ── Weather ───────────────────────────────────────────────────────────────
  const [weatherByDate, setWeatherByDate] = useState<Map<string, DayWeather>>(new Map())
  const [weatherLoading, setWeatherLoading] = useState(false)
  // In-memory geocode cache; also backed by localStorage so addresses only
  // hit the geocode proxy once per unique address across sessions.
  const geoCache = useRef<Map<string, { lat: number; lon: number } | null>>(new Map())

  useEffect(() => {
    if (eventsByDate.size === 0) return
    let cancelled = false
    setWeatherLoading(true)

    async function loadWeather() {
      // For each date find the first event whose field has any location info.
      // Cache key = "address||location" so we try both in the proxy.
      type FieldGeoKey = {
        address: string; location: string; cacheKey: string
        fieldId: string; storedCoords?: { lat: number; lon: number }
      }
      const dateToField = new Map<string, FieldGeoKey>()
      for (const [date, evs] of eventsByDate) {
        for (const ev of evs) {
          const field = fieldMap.get(ev.fieldId)
          if (field && (field.address || field.location)) {
            dateToField.set(date, {
              address:      field.address  ?? '',
              location:     field.location ?? '',
              cacheKey:     `${field.address}||${field.location}`,
              fieldId:      field.id,
              storedCoords: field.geocoords,   // coords persisted from admin → shared with view-only
            })
            break
          }
        }
      }
      if (dateToField.size === 0) { setWeatherLoading(false); return }

      // Pre-populate in-memory geocache from localStorage once per session.
      // Only load successful (non-null) results — failed lookups should retry
      // on next session in case the API was temporarily unavailable.
      if (geoCache.current.size === 0) {
        try {
          const stored: Record<string, { lat: number; lon: number } | null> =
            JSON.parse(localStorage.getItem('fd-geocache-v2') ?? '{}')
          for (const [k, v] of Object.entries(stored)) {
            if (v !== null) geoCache.current.set(k, v)
          }
        } catch { /* ignore */ }
      }

      // Geocode unique field entries not yet in cache
      const uniqueFields = [...new Map(
        [...dateToField.values()].map(f => [f.cacheKey, f])
      ).values()]

      for (const f of uniqueFields) {
        if (cancelled) return
        // Skip only if we have a successful (non-null) cached result.
        // Null-cached entries are retried so transient API failures don't
        // permanently break weather for a field.
        if (geoCache.current.get(f.cacheKey)) continue

        let coords: { lat: number; lon: number } | null = null

        if (f.storedCoords) {
          // Use geocoords already saved in the field — no API call needed.
          // These are persisted to Supabase by the admin and are available
          // to view-only users without them having to geocode anything.
          coords = f.storedCoords
        } else {
          // Geocode via the server-side proxy
          coords = await geocodeField(f.address, f.location)
          // In admin mode, save newly resolved coords back to the field so
          // they're persisted to Supabase and shared with view-only users.
          if (!readOnly && coords && !cancelled) {
            setState(s => ({
              ...s,
              fields: s.fields.map(sf =>
                `${sf.address ?? ''}||${sf.location ?? ''}` === f.cacheKey && !sf.geocoords
                  ? { ...sf, geocoords: coords! }
                  : sf
              ),
            }))
          }
        }

        // Always store in in-memory cache (even null) to avoid duplicate calls
        // within the same session. Only persist successes to localStorage.
        geoCache.current.set(f.cacheKey, coords)
        if (coords) {
          try {
            const stored: Record<string, { lat: number; lon: number } | null> =
              JSON.parse(localStorage.getItem('fd-geocache-v2') ?? '{}')
            stored[f.cacheKey] = coords
            localStorage.setItem('fd-geocache-v2', JSON.stringify(stored))
          } catch { /* ignore */ }
        }
      }
      if (cancelled) return

      // Use any successfully geocoded field as a fallback for fields that
      // couldn't be resolved — all local league fields are within ~20 miles.
      let fallbackCoords: { lat: number; lon: number } | null = null
      for (const f of uniqueFields) {
        const c = geoCache.current.get(f.cacheKey)
        if (c) { fallbackCoords = c; break }
      }

      // Fetch Open-Meteo forecast per unique coordinate pair
      const weatherByCoordKey = new Map<string, Map<string, DayWeather>>()
      for (const f of uniqueFields) {
        if (cancelled) return
        const coords = geoCache.current.get(f.cacheKey) ?? fallbackCoords
        if (!coords) continue
        const key = `${coords.lat.toFixed(2)},${coords.lon.toFixed(2)}`
        if (!weatherByCoordKey.has(key)) {
          weatherByCoordKey.set(key, await fetchDailyWeather(coords.lat, coords.lon))
        }
      }
      if (cancelled) return

      // Build final date → DayWeather map (use fallback coords if field failed)
      const result = new Map<string, DayWeather>()
      for (const [date, f] of dateToField) {
        const coords = geoCache.current.get(f.cacheKey) ?? fallbackCoords
        if (!coords) continue
        const key = `${coords.lat.toFixed(2)},${coords.lon.toFixed(2)}`
        const w = weatherByCoordKey.get(key)?.get(date)
        if (w) result.set(date, w)
      }
      setWeatherByDate(result)
      if (!cancelled) setWeatherLoading(false)
    }

    loadWeather().catch(() => { if (!cancelled) setWeatherLoading(false) })
    // Don't call setWeatherLoading(false) on cleanup — skeleton stays visible during
    // any effect re-run (e.g. when geocoords are saved back to state) instead of
    // flashing to nothing and then reappearing.
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventsByDate, fieldMap])

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

      {/* First-run checklist — removes itself once the schedule is generated. */}
      {!readOnly && <FirstRunChecklist state={state} onNavigate={onNavigate} />}

      {/* ── Page header ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Week at a Glance</h2>
          <p className="text-sm text-gray-500 mt-0.5">{dateRange(todayStart, weekEnd)}</p>
        </div>
        <button
          onClick={() => onNavigate(5)}
          className="text-sm text-[var(--fd-primary)] hover:underline font-medium"
        >
          View full schedule →
        </button>
      </div>

      {/* ── Empty state ───────────────────────────────────────────────── */}
      {totalEvents === 0 && (
        <div className="bg-white rounded-xl border p-16 text-center">
          <CalendarIcon className="w-12 h-12 mb-4 mx-auto text-gray-300" />
          <p className="text-xl font-semibold text-gray-600">No events this week</p>
          <p className="text-sm text-gray-400 mt-1">Nothing scheduled for {dateRange(todayStart, weekEnd)}</p>
          <button
            onClick={() => onNavigate(5)}
            className="mt-5 text-sm bg-[var(--fd-primary)] hover:bg-[var(--fd-primary-dark)] text-white font-semibold px-5 py-2 rounded-lg transition"
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
                  <div key={g.id} className="flex items-stretch gap-3">
                  <div
                    className={`flex-1 min-w-0 bg-white rounded-xl border border-gray-200 shadow-sm ${g.confirmed ? 'ring-1 ring-green-300' : ''}`}
                  >
                    <div className="flex">
                      <div className="flex-1 min-w-0">
                        {/* Card header */}
                        <div className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap bg-gray-50 border-b rounded-t-xl">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-lg border ${c.pill} ${c.border}`}>
                              {div?.name ?? 'Unknown Division'}
                            </span>
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-lg bg-[#eeeef6] text-[var(--fd-primary)]">
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
                            {/* Confirm checkbox with disclosure */}
                            {!readOnly && (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="checkbox"
                                  id={`confirm-${g.id}`}
                                  checked={!!g.confirmed}
                                  onChange={() => toggleConfirm(g.id)}
                                  aria-describedby={confirmHelpFor === g.id ? `confirm-help-${g.id}` : undefined}
                                  className="w-4 h-4 rounded-lg cursor-pointer accent-green-600"
                                />
                                <label
                                  htmlFor={`confirm-${g.id}`}
                                  className={`text-xs font-medium cursor-pointer select-none transition-colors ${
                                    g.confirmed ? 'text-green-600' : 'text-gray-500'
                                  }`}
                                >
                                  Confirm
                                </label>
                                <button
                                  type="button"
                                  onClick={() => setConfirmHelpFor(confirmHelpFor === g.id ? null : g.id)}
                                  aria-expanded={confirmHelpFor === g.id}
                                  aria-controls={`confirm-help-${g.id}`}
                                  aria-label="What does confirming do?"
                                  className="w-6 h-6 shrink-0 flex items-center justify-center rounded-full border border-gray-300 text-xs font-bold text-gray-500 hover:text-gray-800 hover:border-gray-500 outline-none focus-visible:ring-2 focus-visible:ring-[var(--fd-accent)]"
                                >
                                  ?
                                </button>
                              </div>
                            )}

                            {/* Edit button */}
                            {!readOnly && (
                              <button
                                onClick={() => openEdit(g)}
                                className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-[var(--fd-primary)] hover:bg-[#eeeef6] px-2.5 py-1.5 rounded-lg transition"
                              >
                                <EditIcon />
                                Edit
                              </button>
                            )}
                          </div>
                        </div>

                        {confirmHelpFor === g.id && (
                          <div
                            id={`confirm-help-${g.id}`}
                            className="mx-5 mb-3 bg-gray-900 text-white text-xs rounded-lg px-3 py-2.5 leading-relaxed"
                          >
                            Check this box once you&apos;ve confirmed the game with all coaches, the {sc.officialSingular.toLowerCase()}, and field staff. A green ring will appear around the card.
                            <button
                              onClick={() => setConfirmHelpFor(null)}
                              className="mt-2 block min-h-[32px] text-[11px] font-semibold underline underline-offset-2"
                            >
                              Got it
                            </button>
                          </div>
                        )}

                        {/* Card body */}
                        <div className="px-5 py-4 space-y-3.5">

                          {/* Teams matchup */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xl font-bold text-gray-900">{homeTeam?.name ?? 'TBD'}</span>
                              <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-lg font-semibold">Home</span>
                            </div>
                            <span className="text-lg text-gray-400 font-medium">vs</span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xl font-bold text-gray-900">{awayTeam?.name ?? 'TBD'}</span>
                              <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-lg font-semibold">Away</span>
                            </div>
                          </div>

                          {/* Phone: weather folds into the card instead of
                              sitting beside it. `date` is the day group's key,
                              in scope from the enclosing map. */}
                          <div className="sm:hidden">
                            <WeatherCard data={weatherByDate.get(date)} inline />
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
                                <span className="text-xs font-semibold px-2 py-0.5 rounded-lg bg-green-100 text-green-700">
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

                          {/* Phone: the two things a coach standing in a parking
                              lot actually needs. Each renders only when its data
                              exists — no dead buttons. */}
                          {(() => {
                            const headCoach = [...homeCoaches, ...awayCoaches].find(c => c.role === 'head' && c.phone)
                              ?? [...homeCoaches, ...awayCoaches].find(c => c.phone)
                            const directions = field?.geocoords
                              ? `https://www.google.com/maps/search/?api=1&query=${field.geocoords.lat},${field.geocoords.lon}`
                              : field?.address ? mapsUrl(field.address) : null
                            if (!headCoach && !directions) return null
                            return (
                              <div className="sm:hidden flex gap-2 pt-1">
                                {headCoach && (
                                  <a
                                    href={`tel:${headCoach.phone}`}
                                    className="flex-1 min-h-[44px] flex items-center justify-center rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 active:bg-gray-50"
                                  >
                                    Call coach
                                  </a>
                                )}
                                {directions && (
                                  <a
                                    href={directions}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex-1 min-h-[44px] flex items-center justify-center rounded-lg bg-[var(--fd-primary)] text-sm font-semibold text-white active:opacity-90"
                                  >
                                    Directions
                                  </a>
                                )}
                              </div>
                            )
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* Weather square */}
                  <div className="hidden sm:flex shrink-0">
                    <WeatherCard data={weatherByDate.get(date)} loading={weatherLoading} />
                  </div>
                  </div>
                )

              } else {
                // ── Practice card ──────────────────────────────────────
                const p       = ev as ScheduledPractice
                const team    = teamMap.get(p.teamId)
                const coaches = team?.coaches ?? []

                return (
                  <div key={p.id} className="flex items-stretch gap-3">
                  <div
                    className="flex-1 min-w-0 bg-white rounded-xl border border-gray-200 shadow-sm opacity-90"
                  >
                    <div className="flex">
                      <div className="flex-1 min-w-0">
                        {/* Card header */}
                        <div className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap bg-gray-50 border-b rounded-t-xl">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-lg border ${c.pill} ${c.border}`}>
                              {div?.name ?? 'Unknown Division'}
                            </span>
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-lg bg-gray-100 text-gray-600">
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
                              className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-[var(--fd-primary)] hover:bg-[#eeeef6] px-2.5 py-1.5 rounded-lg transition"
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

                          {/* Phone: weather folds into the card instead of
                              sitting beside it. `date` is the day group's key,
                              in scope from the enclosing map. */}
                          <div className="sm:hidden">
                            <WeatherCard data={weatherByDate.get(date)} inline />
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
                  {/* Weather square */}
                  <div className="hidden sm:flex shrink-0">
                    <WeatherCard data={weatherByDate.get(date)} loading={weatherLoading} />
                  </div>
                  </div>
                )
              }
            })}
          </div>
        </section>
      ))}

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
