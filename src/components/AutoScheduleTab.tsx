'use client'
import { useState, useMemo } from 'react'
import type { AppState, ScheduleConflict, ScheduledGame } from '@/lib/types'
import { getDivisionColor } from '@/lib/divisionColors'
import { generateSchedule, rescheduleMatchupRelaxed } from '@/lib/autoScheduler'
import { getSportConfig } from '@/lib/sports'

interface Props {
  state: AppState
  setState: React.Dispatch<React.SetStateAction<AppState>>
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function generateTimeOptions(): string[] {
  const times: string[] = []
  for (let h = 8; h <= 20; h++) {
    times.push(`${String(h).padStart(2, '0')}:00`)
    if (h < 20) times.push(`${String(h).padStart(2, '0')}:30`)
  }
  return times
}

const TIME_OPTIONS = generateTimeOptions()

function fmtTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

function fmtDate(s: string): string {
  return new Date(s + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })
}

function fmtDateShort(s: string): string {
  return new Date(s + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

export default function AutoScheduleTab({ state, setState }: Props) {
  const [configOpen, setConfigOpen] = useState(true)
  const [conflictIndex, setConflictIndex] = useState(0)
  const [showAllConflicts, setShowAllConflicts] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [commitMode, setCommitMode] = useState<null | 'append' | 'replace'>(null)

  // Field blackout local state for UI (add form)
  const [fieldBlackoutDate, setFieldBlackoutDate] = useState<Record<string, string>>({})
  const [fieldBlackoutLabel, setFieldBlackoutLabel] = useState<Record<string, string>>({})

  const conflicts = state.autoScheduleConflicts ?? []
  const preview = state.autoSchedulePreview ?? null

  const pendingConflicts = conflicts.filter(c => c.resolution === 'pending')
  const currentConflict = pendingConflicts[conflictIndex] ?? pendingConflicts[0] ?? null

  const divisionMap = useMemo(
    () => new Map(state.divisions.map(d => [d.id, d])),
    [state.divisions]
  )
  const teamMap = useMemo(
    () => new Map(state.divisions.flatMap(d => d.teams).map(t => [t, t])),
    [state.divisions]
  )
  const allTeams = useMemo(
    () => state.divisions.flatMap(d => d.teams),
    [state.divisions]
  )

  // ── Division config updates ──────────────────────────────────────

  function toggleDivisionDay(divId: string, day: number) {
    setState(s => ({
      ...s,
      divisions: s.divisions.map(d => {
        if (d.id !== divId) return d
        const current = d.gameDays ?? []
        const next = current.includes(day) ? current.filter(x => x !== day) : [...current, day].sort()
        return { ...d, gameDays: next }
      }),
    }))
  }

  function setDivisionStartTime(divId: string, time: string) {
    setState(s => ({
      ...s,
      divisions: s.divisions.map(d =>
        d.id === divId ? { ...d, preferredStartTime: time || undefined } : d
      ),
    }))
  }

  // ── Team config updates ──────────────────────────────────────────

  function setTeamHomeField(divId: string, teamId: string, fieldId: string) {
    setState(s => ({
      ...s,
      divisions: s.divisions.map(d =>
        d.id === divId
          ? {
              ...d,
              teams: d.teams.map(t =>
                t.id === teamId ? { ...t, homeFieldId: fieldId || undefined } : t
              ),
            }
          : d
      ),
    }))
  }

  function toggleTeamPreferredDay(divId: string, teamId: string, day: number) {
    setState(s => ({
      ...s,
      divisions: s.divisions.map(d => {
        if (d.id !== divId) return d
        return {
          ...d,
          teams: d.teams.map(t => {
            if (t.id !== teamId) return t
            const current = t.preferredDays ?? []
            const next = current.includes(day)
              ? current.filter(x => x !== day)
              : [...current, day].sort()
            return { ...t, preferredDays: next }
          }),
        }
      }),
    }))
  }

  // ── Field blackout updates ───────────────────────────────────────

  function addFieldBlackout(fieldId: string) {
    const date = fieldBlackoutDate[fieldId]
    if (!date) return
    const label = fieldBlackoutLabel[fieldId]?.trim()
    const entry = label ? `${date}::${label}` : date
    setState(s => ({
      ...s,
      fields: s.fields.map(f => {
        if (f.id !== fieldId) return f
        const existing = f.blackoutDates ?? []
        if (existing.some(e => e.split('::')[0] === date)) return f
        return { ...f, blackoutDates: [...existing, entry].sort() }
      }),
    }))
    setFieldBlackoutDate(v => ({ ...v, [fieldId]: '' }))
    setFieldBlackoutLabel(v => ({ ...v, [fieldId]: '' }))
  }

  function removeFieldBlackout(fieldId: string, entry: string) {
    setState(s => ({
      ...s,
      fields: s.fields.map(f =>
        f.id === fieldId
          ? { ...f, blackoutDates: (f.blackoutDates ?? []).filter(e => e !== entry) }
          : f
      ),
    }))
  }

  // ── Schedule generation ──────────────────────────────────────────

  function handleGenerate() {
    setGenerating(true)
    setTimeout(() => {
      try {
        const result = generateSchedule({
          divisions: state.divisions,
          fields: state.fields,
          season: state.season,
          leagueBlackouts: state.blackoutDates ?? [],
          existingGames: state.schedule.games,
        })
        setState(s => ({
          ...s,
          autoSchedulePreview: result.games,
          autoScheduleConflicts: result.conflicts,
        }))
        setConflictIndex(0)
      } finally {
        setGenerating(false)
      }
    }, 50)
  }

  // ── Conflict resolution ──────────────────────────────────────────

  function resolveConflict(conflictId: string, resolution: 'skipped' | 'deferred') {
    setState(s => ({
      ...s,
      autoScheduleConflicts: (s.autoScheduleConflicts ?? []).map(c =>
        c.id === conflictId ? { ...c, resolution } : c
      ),
    }))
    setConflictIndex(i => Math.min(i, pendingConflicts.length - 2))
  }

  function tryRelaxedConstraints(conflict: ScheduleConflict) {
    const result = rescheduleMatchupRelaxed({
      homeTeamId: conflict.homeTeamId,
      awayTeamId: conflict.awayTeamId,
      divisionId: conflict.divisionId,
      divisions: state.divisions,
      fields: state.fields,
      season: state.season,
      leagueBlackouts: state.blackoutDates ?? [],
      existingGames: state.schedule.games,
      previewGames: state.autoSchedulePreview ?? [],
    })

    if (result) {
      setState(s => ({
        ...s,
        autoSchedulePreview: [...(s.autoSchedulePreview ?? []), result],
        autoScheduleConflicts: (s.autoScheduleConflicts ?? []).map(c =>
          c.id === conflict.id ? { ...c, resolution: 'resolved' } : c
        ),
      }))
      setConflictIndex(i => Math.min(i, pendingConflicts.length - 2))
    } else {
      // Still can't schedule — mark details with relaxed attempt note
      setState(s => ({
        ...s,
        autoScheduleConflicts: (s.autoScheduleConflicts ?? []).map(c =>
          c.id === conflict.id
            ? {
                ...c,
                details: [...c.details, 'Tried relaxed constraints (ignored preferred days/fields) — still no slot available'],
                suggestions: [...c.suggestions.filter(sg => !sg.includes('relaxed')), 'Manually schedule this game in the Schedule tab'],
              }
            : c
        ),
      }))
    }
  }

  // ── Preview commit / discard ─────────────────────────────────────

  function commitPreview(mode: 'append' | 'replace') {
    if (!preview || preview.length === 0) return
    setState(s => ({
      ...s,
      schedule: {
        ...s.schedule,
        games: mode === 'replace' ? preview : [...s.schedule.games, ...preview],
        practices: mode === 'replace' ? [] : s.schedule.practices,
        generatedAt: new Date().toISOString(),
      },
      autoSchedulePreview: null,
      autoScheduleConflicts: (s.autoScheduleConflicts ?? []).filter(c => c.resolution === 'pending'),
    }))
    setCommitMode(null)
  }

  function discardPreview() {
    setState(s => ({ ...s, autoSchedulePreview: null }))
    setCommitMode(null)
  }

  // ── Computed stats ───────────────────────────────────────────────

  const previewStats = useMemo(() => {
    if (!preview || preview.length === 0) return null
    const byDivision = new Map<string, number>()
    for (const g of preview) {
      byDivision.set(g.divisionId, (byDivision.get(g.divisionId) ?? 0) + 1)
    }
    const totalPossible = state.divisions.reduce((sum, d) => {
      if (d.teams.length < 2) return sum
      return sum + Math.ceil((d.teams.length * d.gamesPerTeam) / 2)
    }, 0)
    const coverage = totalPossible > 0 ? Math.round((preview.length / totalPossible) * 100) : 0
    return { total: preview.length, byDivision, totalPossible, coverage }
  }, [preview, state.divisions])

  const sortedPreview = useMemo(() => {
    if (!preview) return []
    return [...preview].sort((a, b) => {
      const dc = a.date.localeCompare(b.date)
      return dc !== 0 ? dc : a.time.localeCompare(b.time)
    })
  }, [preview])

  const fieldMap = useMemo(() => new Map(state.fields.map(f => [f.id, f])), [state.fields])

  const sc = getSportConfig(state.season.sport)

  const getTeamName = (id: string) => {
    for (const t of allTeams) {
      if (t.id === id) return t.name
    }
    return id
  }

  const hasExistingGames = state.schedule.games.length > 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800" style={{ fontFamily: 'Oswald, sans-serif' }}>
          Auto-Schedule
        </h2>
        <span className="text-sm text-gray-500">
          {state.divisions.length} division{state.divisions.length !== 1 ? 's' : ''} ·{' '}
          {allTeams.length} team{allTeams.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── HOW THIS WORKS + WARNINGS ────────────────────────────── */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
        <div className="flex items-start gap-2">
          <div>
            <p className="font-semibold text-blue-800 text-sm" style={{ fontFamily: 'Oswald, sans-serif' }}>
              How Auto-Schedule Works
            </p>
            <ol className="mt-1.5 text-sm text-blue-700 space-y-1 list-decimal list-inside">
              <li><strong>Configure</strong> game days, preferred start times, home fields, and team preferences below.</li>
              <li><strong>Generate</strong> — the scheduler builds a round-robin matchup list and finds the best available slot for each game based on your constraints.</li>
              <li><strong>Resolve conflicts</strong> — any game that couldn&apos;t be placed automatically appears here for you to skip, defer, or retry with relaxed constraints.</li>
              <li><strong>Preview &amp; commit</strong> — review the proposed schedule, then choose to <em>append</em> it to your existing games or <em>replace</em> the entire schedule.</li>
            </ol>
          </div>
        </div>

        <div className="border-t border-blue-200 pt-3 space-y-2">
          <div className="flex items-start gap-2">
            <p className="text-sm text-yellow-800">
              <strong>Replace mode is permanent</strong> — it wipes all existing games and practices and cannot be undone from this screen.
              Use the <strong>Snapshots</strong> button in the header to save your current schedule before generating if you want a safety net.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <p className="text-sm text-yellow-800">
              <strong>Append mode adds games on top of your existing schedule.</strong>{' '}
              If you&apos;ve already run Auto-Schedule once, appending again will duplicate matchups.
              Check your existing schedule first or use Replace instead.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <p className="text-sm text-blue-700">
              The scheduler respects league-wide blackout dates, field blackout dates, and team blackout dates
              that you&apos;ve entered in the other tabs. Set those up <strong>before</strong> generating.
            </p>
          </div>
        </div>
      </div>

      {/* ── STEP 1: CONFIGURE PARAMETERS ─────────────────────────── */}
      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-[#f5f5fb] transition"
          onClick={() => setConfigOpen(v => !v)}
        >
          <div className="flex items-center gap-3">
            <span className="w-7 h-7 rounded-full bg-[var(--fd-primary)] text-white text-sm font-bold flex items-center justify-center flex-shrink-0">1</span>
            <span className="font-semibold text-gray-800" style={{ fontFamily: 'Oswald, sans-serif' }}>
              Configure Parameters
            </span>
          </div>
          <span className="text-gray-400 text-lg">{configOpen ? '▲' : '▼'}</span>
        </button>

        {configOpen && (
          <div className="border-t px-5 py-5 space-y-8">
            {/* Division settings */}
            <div>
              <h3 className="font-semibold text-[var(--fd-primary)] mb-4 text-sm uppercase tracking-wide" style={{ fontFamily: 'Oswald, sans-serif' }}>
                Division Game Days &amp; Preferred Start Time
              </h3>
              {state.divisions.length === 0 && (
                <p className="text-sm text-gray-400 italic">No divisions configured yet.</p>
              )}
              <div className="space-y-4">
                {state.divisions.map(div => {
                  const c = getDivisionColor(div.id, state.divisions)
                  return (
                    <div key={div.id} className={`rounded-lg border p-4 ${c.bg}`}>
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                        <span className={`font-bold text-sm min-w-[80px] ${c.text}`} style={{ fontFamily: 'Oswald, sans-serif' }}>
                          {div.name}
                        </span>

                        {/* Game days */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs text-gray-500 mr-1">Play days:</span>
                          {DAY_NAMES.map((name, i) => {
                            const checked = (div.gameDays ?? []).includes(i)
                            return (
                              <button
                                key={i}
                                onClick={() => toggleDivisionDay(div.id, i)}
                                className={`text-xs px-2 py-1 rounded border font-medium transition ${
                                  checked
                                    ? 'bg-[var(--fd-primary)] text-white border-[var(--fd-primary)]'
                                    : 'bg-white text-gray-500 border-gray-300 hover:border-[var(--fd-primary)] hover:text-[var(--fd-primary)]'
                                }`}
                              >
                                {name}
                              </button>
                            )
                          })}
                          {(div.gameDays ?? []).length === 0 && (
                            <span className="text-xs text-gray-400 italic">Any day</span>
                          )}
                        </div>

                        {/* Preferred start time */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">Start time:</span>
                          <select
                            className="border rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--fd-accent)]"
                            value={div.preferredStartTime ?? ''}
                            onChange={e => setDivisionStartTime(div.id, e.target.value)}
                          >
                            <option value="">Any time</option>
                            {TIME_OPTIONS.map(t => (
                              <option key={t} value={t}>{fmtTime(t)}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Team settings within division */}
                      {div.teams.length > 0 && (
                        <div className="mt-4 space-y-2">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Team Preferences</p>
                          {div.teams.map(team => (
                            <div key={team.id} className="bg-white rounded border px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                              <span className="text-sm font-medium text-gray-700 min-w-[100px]">{team.name}</span>

                              {/* Home field */}
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-gray-500">Home field:</span>
                                <select
                                  className="border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--fd-accent)]"
                                  value={team.homeFieldId ?? ''}
                                  onChange={e => setTeamHomeField(div.id, team.id, e.target.value)}
                                >
                                  <option value="">None</option>
                                  {state.fields.map(f => (
                                    <option key={f.id} value={f.id}>{f.name}</option>
                                  ))}
                                </select>
                              </div>

                              {/* Preferred days */}
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs text-gray-500">Prefer:</span>
                                {DAY_NAMES.map((name, i) => {
                                  const checked = (team.preferredDays ?? []).includes(i)
                                  return (
                                    <button
                                      key={i}
                                      onClick={() => toggleTeamPreferredDay(div.id, team.id, i)}
                                      className={`text-xs px-1.5 py-0.5 rounded border transition ${
                                        checked
                                          ? 'bg-[var(--fd-accent)] text-white border-[var(--fd-accent)]'
                                          : 'bg-gray-50 text-gray-400 border-gray-200 hover:border-gray-400'
                                      }`}
                                    >
                                      {name}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Field blackout dates */}
            <div>
              <h3 className="font-semibold text-[var(--fd-primary)] mb-4 text-sm uppercase tracking-wide" style={{ fontFamily: 'Oswald, sans-serif' }}>
                {sc.venueSingular} Blackout Dates
              </h3>
              {state.fields.length === 0 && (
                <p className="text-sm text-gray-400 italic">No {sc.venuePlural.toLowerCase()} configured yet. Add {sc.venuePlural} in the {sc.venuePlural} tab.</p>
              )}
              <div className="space-y-4">
                {state.fields.map(field => {
                  const blackouts = field.blackoutDates ?? []
                  return (
                    <div key={field.id} className="bg-white rounded-lg border p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-medium text-gray-800">{field.name}</span>
                        {blackouts.length > 0 && (
                          <span className="text-xs text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">
                            {blackouts.length} blackout{blackouts.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>

                      {/* Blackout chips */}
                      {blackouts.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {blackouts.map(entry => {
                            const [date, label] = entry.split('::')
                            const display = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
                              month: 'short', day: 'numeric', year: 'numeric',
                            })
                            return (
                              <span key={entry} className="inline-flex items-center gap-1 text-xs bg-orange-50 border border-orange-200 text-orange-700 px-2 py-0.5 rounded-full">
                                {display}{label ? ` — ${label}` : ''}
                                <button
                                  onClick={() => removeFieldBlackout(field.id, entry)}
                                  className="text-orange-400 hover:text-red-500 leading-none ml-0.5"
                                >
                                  ×
                                </button>
                              </span>
                            )
                          })}
                        </div>
                      )}

                      {/* Add blackout */}
                      <div className="flex gap-2 flex-wrap items-end">
                        <input
                          type="date"
                          className="border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
                          value={fieldBlackoutDate[field.id] ?? ''}
                          onChange={e => setFieldBlackoutDate(v => ({ ...v, [field.id]: e.target.value }))}
                        />
                        <input
                          className="flex-1 min-w-[100px] border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
                          placeholder="Reason (optional)"
                          value={fieldBlackoutLabel[field.id] ?? ''}
                          onChange={e => setFieldBlackoutLabel(v => ({ ...v, [field.id]: e.target.value }))}
                          onKeyDown={e => e.key === 'Enter' && addFieldBlackout(field.id)}
                        />
                        <button
                          onClick={() => addFieldBlackout(field.id)}
                          disabled={!fieldBlackoutDate[field.id]}
                          className="text-xs bg-orange-500 text-white px-3 py-1.5 rounded hover:bg-orange-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Add Blackout
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── STEP 2: GENERATE ─────────────────────────────────────── */}
      <div className="bg-white rounded-lg border shadow-sm px-5 py-5">
        <div className="flex items-center gap-3 mb-4">
          <span className="w-7 h-7 rounded-full bg-[var(--fd-primary)] text-white text-sm font-bold flex items-center justify-center flex-shrink-0">2</span>
          <span className="font-semibold text-gray-800" style={{ fontFamily: 'Oswald, sans-serif' }}>
            Generate Schedule
          </span>
        </div>

        {hasExistingGames && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 text-sm text-amber-800">
            <span>
              Your schedule already has <strong>{state.schedule.games.length} game{state.schedule.games.length !== 1 ? 's' : ''}</strong>.
              This will generate a <strong>preview</strong> — your current schedule won&apos;t change until you commit.
              New games will be added without overwriting existing ones.
            </span>
          </div>
        )}

        {(!state.season.startDate || !state.season.endDate) && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 text-sm text-red-800">
            <span>Set a season start and end date in the <strong>Setup</strong> tab before generating.</span>
          </div>
        )}

        {state.fields.length === 0 && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 text-sm text-red-800">
            <span>Add at least one {sc.venueSingular.toLowerCase()} in the <strong>{sc.venuePlural}</strong> tab before generating.</span>
          </div>
        )}

        <button
          onClick={handleGenerate}
          disabled={generating || !state.season.startDate || !state.season.endDate || state.fields.length === 0}
          className="bg-[var(--fd-accent)] text-white px-8 py-3 rounded-lg font-semibold text-base hover:bg-[var(--fd-primary)] transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          style={{ fontFamily: 'Oswald, sans-serif' }}
        >
          {generating ? (
            <>
              <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
              Generating…
            </>
          ) : (
            <>Generate Schedule</>
          )}
        </button>

        {preview !== null && !generating && (
          <p className="text-sm text-gray-500 mt-3">
            Last generated: <strong>{preview.length} game{preview.length !== 1 ? 's' : ''}</strong> in preview
            {conflicts.length > 0 && (
              <span className="ml-2 text-orange-600">
                · <strong>{conflicts.filter(c => c.resolution === 'pending').length}</strong> conflict{conflicts.filter(c => c.resolution === 'pending').length !== 1 ? 's' : ''} to resolve
              </span>
            )}
          </p>
        )}
      </div>

      {/* ── STEP 3: CONFLICT RESOLUTION ──────────────────────────── */}
      {conflicts.length > 0 && (
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b bg-[#f5f5fb] flex items-center gap-3">
            <span className="w-7 h-7 rounded-full bg-[var(--fd-accent)] text-white text-sm font-bold flex items-center justify-center flex-shrink-0">3</span>
            <span className="font-semibold text-gray-800" style={{ fontFamily: 'Oswald, sans-serif' }}>
              Conflict Resolution
            </span>
            {pendingConflicts.length > 0 && (
              <span className="ml-auto bg-[var(--fd-accent)] text-white text-xs font-bold px-2.5 py-1 rounded-full">
                {pendingConflicts.length} to resolve
              </span>
            )}
            {pendingConflicts.length === 0 && (
              <span className="ml-auto bg-green-100 text-green-700 text-xs font-bold px-2.5 py-1 rounded-full">
                All resolved
              </span>
            )}
          </div>

          {/* Current conflict card */}
          {currentConflict && (
            <div className="px-5 py-5">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs text-gray-500">
                  Conflict {conflictIndex + 1} of {pendingConflicts.length}
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setConflictIndex(i => Math.max(0, i - 1))}
                    disabled={conflictIndex === 0}
                    className="px-2 py-1 rounded border text-xs disabled:opacity-30 hover:bg-gray-50 transition"
                  >
                    ‹ Prev
                  </button>
                  <button
                    onClick={() => setConflictIndex(i => Math.min(pendingConflicts.length - 1, i + 1))}
                    disabled={conflictIndex >= pendingConflicts.length - 1}
                    className="px-2 py-1 rounded border text-xs disabled:opacity-30 hover:bg-gray-50 transition"
                  >
                    Next ›
                  </button>
                </div>
              </div>

              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <div className="flex items-start gap-3">
                  <div>
                    <p className="font-semibold text-red-800 text-sm">
                      {getTeamName(currentConflict.homeTeamId)} vs {getTeamName(currentConflict.awayTeamId)}
                    </p>
                    <p className="text-xs text-red-600 mt-0.5">
                      {divisionMap.get(currentConflict.divisionId)?.name ?? currentConflict.divisionId}
                    </p>
                    <p className="text-sm text-red-700 mt-2">{currentConflict.reason}</p>
                  </div>
                </div>

                {currentConflict.details.length > 0 && (
                  <div className="mt-3 ml-8">
                    <p className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-1">Details</p>
                    <ul className="text-xs text-red-700 space-y-1 list-disc list-inside">
                      {currentConflict.details.map((d, i) => <li key={i}>{d}</li>)}
                    </ul>
                  </div>
                )}

                {currentConflict.suggestions.length > 0 && (
                  <div className="mt-3 ml-8">
                    <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Suggestions</p>
                    <ul className="text-xs text-amber-700 space-y-1 list-disc list-inside">
                      {currentConflict.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => resolveConflict(currentConflict.id, 'skipped')}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 transition"
                >
                  Skip this game
                </button>
                <button
                  onClick={() => resolveConflict(currentConflict.id, 'deferred')}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-blue-300 text-sm text-blue-700 bg-blue-50 hover:bg-blue-100 transition"
                >
                  Schedule manually
                </button>
                <button
                  onClick={() => tryRelaxedConstraints(currentConflict)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[var(--fd-primary)] text-sm text-[var(--fd-primary)] bg-[#f5f5fb] hover:bg-[#eeeef6] transition"
                >
                  Try relaxed constraints
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                &ldquo;Schedule manually&rdquo; will appear in the conflict log below — you can schedule it yourself in the Schedule tab.
              </p>
            </div>
          )}

          {/* View all conflicts toggle */}
          <div className="border-t px-5 py-3">
            <button
              onClick={() => setShowAllConflicts(v => !v)}
              className="text-xs text-[var(--fd-accent)] hover:underline"
            >
              {showAllConflicts ? '▲ Hide all conflicts' : `▼ View all conflicts (${conflicts.length})`}
            </button>
          </div>

          {/* Conflict repository table */}
          {showAllConflicts && (
            <div className="border-t overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b text-left">
                    <th className="px-4 py-2 font-medium text-gray-600">Teams</th>
                    <th className="px-4 py-2 font-medium text-gray-600">Division</th>
                    <th className="px-4 py-2 font-medium text-gray-600">Reason</th>
                    <th className="px-4 py-2 font-medium text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {conflicts.map(c => {
                    const divName = divisionMap.get(c.divisionId)?.name ?? c.divisionId
                    const statusLabel = {
                      pending: { label: 'Pending', cls: 'bg-orange-100 text-orange-700' },
                      skipped: { label: 'Skipped', cls: 'bg-gray-100 text-gray-600' },
                      deferred: { label: 'Deferred', cls: 'bg-blue-100 text-blue-700' },
                      resolved: { label: 'Resolved', cls: 'bg-green-100 text-green-700' },
                    }[c.resolution]
                    return (
                      <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium">
                          {getTeamName(c.homeTeamId)} vs {getTeamName(c.awayTeamId)}
                        </td>
                        <td className="px-4 py-2 text-gray-600">{divName}</td>
                        <td className="px-4 py-2 text-gray-500 text-xs max-w-[240px] truncate" title={c.reason}>{c.reason}</td>
                        <td className="px-4 py-2">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusLabel.cls}`}>
                            {statusLabel.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── STEP 4: PREVIEW ──────────────────────────────────────── */}
      {preview !== null && (
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b bg-[#f5f5fb] flex items-center gap-3">
            <span className="w-7 h-7 rounded-full bg-[var(--fd-primary)] text-white text-sm font-bold flex items-center justify-center flex-shrink-0">4</span>
            <span className="font-semibold text-gray-800" style={{ fontFamily: 'Oswald, sans-serif' }}>
              Preview
            </span>
            {previewStats && (
              <span className="ml-auto text-sm text-gray-500">
                {previewStats.total} game{previewStats.total !== 1 ? 's' : ''} · {previewStats.coverage}% of target
              </span>
            )}
          </div>

          {preview.length === 0 ? (
            <div className="px-5 py-8 text-center text-gray-400 italic">
              No games were successfully scheduled. Adjust parameters and try again.
            </div>
          ) : (
            <>
              {/* Stats summary */}
              {previewStats && (
                <div className="px-5 py-4 border-b bg-gray-50 flex flex-wrap gap-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-[var(--fd-primary)]" style={{ fontFamily: 'Oswald, sans-serif' }}>
                      {previewStats.total}
                    </div>
                    <div className="text-xs text-gray-500">Total Games</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-[var(--fd-accent)]" style={{ fontFamily: 'Oswald, sans-serif' }}>
                      {previewStats.coverage}%
                    </div>
                    <div className="text-xs text-gray-500">Coverage</div>
                  </div>
                  {state.divisions.map(div => {
                    const count = previewStats.byDivision.get(div.id) ?? 0
                    const c = getDivisionColor(div.id, state.divisions)
                    return (
                      <div key={div.id} className="text-center">
                        <div className={`text-2xl font-bold ${c.text}`} style={{ fontFamily: 'Oswald, sans-serif' }}>
                          {count}
                        </div>
                        <div className="text-xs text-gray-500">{div.name}</div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Game list */}
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-gray-100 border-b text-left">
                      <th className="px-4 py-2 font-medium text-gray-600">Date</th>
                      <th className="px-4 py-2 font-medium text-gray-600">Time</th>
                      <th className="px-4 py-2 font-medium text-gray-600">Home</th>
                      <th className="px-4 py-2 font-medium text-gray-600">Away</th>
                      <th className="px-4 py-2 font-medium text-gray-600">{sc.venueSingular}</th>
                      <th className="px-4 py-2 font-medium text-gray-600">Division</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPreview.map(g => {
                      const c = getDivisionColor(g.divisionId, state.divisions)
                      return (
                        <tr key={g.id} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="px-4 py-2 whitespace-nowrap text-gray-700">{fmtDateShort(g.date)}</td>
                          <td className="px-4 py-2 whitespace-nowrap">{fmtTime(g.time)}</td>
                          <td className="px-4 py-2 font-medium">{getTeamName(g.homeTeamId)}</td>
                          <td className="px-4 py-2 text-gray-600">{getTeamName(g.awayTeamId)}</td>
                          <td className="px-4 py-2 text-gray-600">{fieldMap.get(g.fieldId)?.name ?? '—'}</td>
                          <td className="px-4 py-2">
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${c.pill}`}>
                              {divisionMap.get(g.divisionId)?.name ?? g.divisionId}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Commit / Discard */}
              <div className="px-5 py-4 border-t bg-gray-50 flex flex-wrap items-center gap-3">
                {commitMode === 'append' ? (
                  <>
                    <span className="text-sm font-medium text-gray-700">
                      Add {preview.length} game{preview.length !== 1 ? 's' : ''} to your existing schedule?
                    </span>
                    <button onClick={() => commitPreview('append')} className="bg-[var(--fd-accent)] text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-[var(--fd-primary)] transition">
                      Yes, Append
                    </button>
                    <button onClick={() => setCommitMode(null)} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">Cancel</button>
                  </>
                ) : commitMode === 'replace' ? (
                  <>
                    <span className="text-sm font-medium text-red-700">
                      Replace ALL existing games &amp; practices with these {preview.length} game{preview.length !== 1 ? 's' : ''}? Save a snapshot first if you want a backup!
                    </span>
                    <button onClick={() => commitPreview('replace')} className="bg-red-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-red-700 transition">
                      Yes, Replace Everything
                    </button>
                    <button onClick={() => setCommitMode(null)} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">Cancel</button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setCommitMode('append')}
                      className="bg-[var(--fd-accent)] text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-[var(--fd-primary)] transition"
                    >
                      Append to Existing Schedule
                    </button>
                    <button
                      onClick={() => setCommitMode('replace')}
                      className="bg-white border-2 border-red-400 text-red-600 px-5 py-2 rounded-lg text-sm font-semibold hover:bg-red-50 transition"
                    >
                      Replace Existing Schedule
                    </button>
                    <button
                      onClick={discardPreview}
                      className="border border-gray-300 text-gray-600 px-5 py-2 rounded-lg text-sm font-semibold hover:bg-gray-100 transition"
                    >
                      Discard Preview
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Empty state */}
      {preview === null && conflicts.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="font-medium text-gray-600">Ready to auto-schedule</p>
          <p className="text-sm mt-1">Configure parameters above, then click &ldquo;Generate Schedule&rdquo;.</p>
        </div>
      )}
    </div>
  )
}
