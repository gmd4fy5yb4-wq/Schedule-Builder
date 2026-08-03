import type { Division, Field, SeasonConfig, ScheduledGame, ScheduleConflict } from './types'

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function toMins(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function minsToTime(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** All YYYY-MM-DD dates between start and end, inclusive */
function dateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = []
  const cur = new Date(startDate + 'T12:00:00')
  const end = new Date(endDate + 'T12:00:00')
  while (cur <= end) {
    dates.push(cur.toISOString().split('T')[0])
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

function dayOfWeek(dateStr: string): number {
  return new Date(dateStr + 'T12:00:00').getDay()
}

/** Parse blackout date entries (may include ::Label) */
function parseBlackoutSet(entries: string[]): Set<string> {
  return new Set(entries.map(e => e.split('::')[0]))
}

/** "1 slot" / "2 slots" — used in conflict detail lines. */
export function slots(n: number): string {
  return `${n} slot${n === 1 ? '' : 's'}`
}

/** Generate round-robin matchup pairs for a list of team IDs */
function generateRoundRobin(teamIds: string[]): Array<[string, string]> {
  const pairs: Array<[string, string]> = []
  for (let i = 0; i < teamIds.length; i++) {
    for (let j = i + 1; j < teamIds.length; j++) {
      pairs.push([teamIds[i], teamIds[j]])
    }
  }
  return pairs
}

interface Slot {
  date: string
  time: string
  fieldId: string
  dow: number
}

export function generateSchedule(params: {
  divisions: Division[]
  fields: Field[]
  season: SeasonConfig
  leagueBlackouts: string[]
  existingGames: ScheduledGame[]
}): { games: ScheduledGame[]; conflicts: ScheduleConflict[] } {
  const { divisions, fields, season, leagueBlackouts, existingGames } = params

  if (!season.startDate || !season.endDate || fields.length === 0) {
    return { games: [], conflicts: [] }
  }

  const gameDuration = season.gameDurationMinutes || 90
  const leagueBlackoutSet = parseBlackoutSet(leagueBlackouts)

  // Build a map of all dates in the season
  const allDates = dateRange(season.startDate, season.endDate)

  // Track booked slots: key = "fieldId::date::time"
  const bookedFieldSlots = new Set<string>()
  // Track team busy dates: key = "teamId::date"
  const teamBusyDates = new Set<string>()

  // Pre-populate from existing games
  for (const g of existingGames) {
    const key = `${g.fieldId}::${g.date}::${g.time}`
    bookedFieldSlots.add(key)
    teamBusyDates.add(`${g.homeTeamId}::${g.date}`)
    teamBusyDates.add(`${g.awayTeamId}::${g.date}`)
  }

  const scheduledGames: ScheduledGame[] = []
  const conflicts: ScheduleConflict[] = []

  for (const division of divisions) {
    if (division.teams.length < 2) continue

    const teamIds = division.teams.map(t => t.id)
    const basePairs = generateRoundRobin(teamIds)
    const totalGamesNeeded = Math.ceil((division.teams.length * division.gamesPerTeam) / 2)

    // Build matchup list, repeated/trimmed to totalGamesNeeded
    // Swap home/away on even rounds for balance
    const matchups: Array<{ home: string; away: string }> = []
    let roundIdx = 0
    while (matchups.length < totalGamesNeeded) {
      const swap = roundIdx % 2 === 1
      for (const [a, b] of basePairs) {
        if (matchups.length >= totalGamesNeeded) break
        matchups.push(swap ? { home: b, away: a } : { home: a, away: b })
      }
      roundIdx++
    }

    // Field blackout sets per field
    const fieldBlackoutSets = new Map<string, Set<string>>()
    for (const field of fields) {
      fieldBlackoutSets.set(field.id, parseBlackoutSet(field.blackoutDates ?? []))
    }

    // Team blackout sets
    const teamBlackoutSets = new Map<string, Set<string>>()
    for (const div of divisions) {
      for (const team of div.teams) {
        teamBlackoutSets.set(team.id, parseBlackoutSet(team.blackoutDates ?? []))
      }
    }

    // Team preference maps
    const teamHomeField = new Map<string, string>()
    const teamPreferredDays = new Map<string, Set<number>>()
    for (const div of divisions) {
      for (const team of div.teams) {
        if (team.homeFieldId) teamHomeField.set(team.id, team.homeFieldId)
        if (team.preferredDays && team.preferredDays.length > 0) {
          teamPreferredDays.set(team.id, new Set(team.preferredDays))
        }
      }
    }

    // Determine times to try
    const defaultTimes = ['10:00', '12:00', '14:00', '16:00', '18:00']
    const timesToTry = division.preferredStartTime
      ? [division.preferredStartTime, ...defaultTimes.filter(t => t !== division.preferredStartTime)]
      : defaultTimes

    // Generate all valid slots for this division
    const validSlots: Slot[] = []
    for (const date of allDates) {
      // League blackout?
      if (leagueBlackoutSet.has(date)) continue

      const dow = dayOfWeek(date)

      // Division game days filter
      if (division.gameDays && division.gameDays.length > 0 && !division.gameDays.includes(dow)) continue

      for (const field of fields) {
        // Field blackout?
        const fieldBlackouts = fieldBlackoutSets.get(field.id) ?? new Set()
        if (fieldBlackouts.has(date)) continue

        for (const time of timesToTry) {
          const startMins = toMins(time)
          const endMins = startMins + gameDuration
          // Field open 8:00–20:00 (8am-8pm)
          if (startMins < 480 || endMins > 1200) continue

          validSlots.push({ date, time, fieldId: field.id, dow })
        }
      }
    }

    // Sort slots by date then time to prefer earlier dates
    validSlots.sort((a, b) => {
      const dc = a.date.localeCompare(b.date)
      return dc !== 0 ? dc : a.time.localeCompare(b.time)
    })

    // Schedule each matchup
    for (const matchup of matchups) {
      const { home, away } = matchup

      // Track why slots failed for conflict details
      const failReasons: Record<string, number> = {
        fieldBooked: 0,
        homeTeamBusy: 0,
        awayTeamBusy: 0,
        homeTeamBlackout: 0,
        awayTeamBlackout: 0,
      }

      const homeBlackouts = teamBlackoutSets.get(home) ?? new Set<string>()
      const awayBlackouts = teamBlackoutSets.get(away) ?? new Set<string>()

      interface ScoredSlot extends Slot { score: number }
      let bestSlot: ScoredSlot | null = null

      for (const slot of validSlots) {
        const { date, time, fieldId } = slot
        const fieldKey = `${fieldId}::${date}::${time}`
        const homeKey = `${home}::${date}`
        const awayKey = `${away}::${date}`

        // Hard blocks
        if (bookedFieldSlots.has(fieldKey)) { failReasons.fieldBooked++; continue }
        if (teamBusyDates.has(homeKey)) { failReasons.homeTeamBusy++; continue }
        if (teamBusyDates.has(awayKey)) { failReasons.awayTeamBusy++; continue }
        if (homeBlackouts.has(date)) { failReasons.homeTeamBlackout++; continue }
        if (awayBlackouts.has(date)) { failReasons.awayTeamBlackout++; continue }

        // Score soft preferences
        let score = 0
        const dow = slot.dow

        // Home field preference (+10)
        const preferredField = teamHomeField.get(home)
        if (preferredField && fieldId === preferredField) score += 10

        // Home team day preference (+5)
        const homeDays = teamPreferredDays.get(home)
        if (homeDays && homeDays.has(dow)) score += 5

        // Away team day preference (+5)
        const awayDays = teamPreferredDays.get(away)
        if (awayDays && awayDays.has(dow)) score += 5

        // Preferred start time (+3)
        if (division.preferredStartTime && time === division.preferredStartTime) score += 3

        // Slight preference for earlier dates (max +2 bonus for first half of season)
        const dateIdx = allDates.indexOf(date)
        const dateFraction = allDates.length > 0 ? dateIdx / allDates.length : 0
        score += (1 - dateFraction) * 2

        if (!bestSlot || score > bestSlot.score) {
          bestSlot = { ...slot, score }
        }
      }

      if (bestSlot) {
        const game: ScheduledGame = {
          id: uid(),
          type: 'game',
          date: bestSlot.date,
          time: bestSlot.time,
          durationMinutes: gameDuration,
          fieldId: bestSlot.fieldId,
          homeTeamId: home,
          awayTeamId: away,
          umpireId: '',
          divisionId: division.id,
        }
        scheduledGames.push(game)

        // Mark as used
        bookedFieldSlots.add(`${bestSlot.fieldId}::${bestSlot.date}::${bestSlot.time}`)
        teamBusyDates.add(`${home}::${bestSlot.date}`)
        teamBusyDates.add(`${away}::${bestSlot.date}`)
      } else {
        // Team names are needed by nearly every line below; resolve once
        // rather than re-scanning every team in the league six times.
        const homeTeamName = divisions.flatMap(d => d.teams).find(t => t.id === home)?.name ?? home
        const awayTeamName = divisions.flatMap(d => d.teams).find(t => t.id === away)?.name ?? away

        const details: string[] = []
        const suggestions: string[] = []

        if (failReasons.fieldBooked > 0) {
          // Not "Diamond 2" — the counter is summed across every field and
          // does not record which. Per-field counters would be more state
          // than a line of explanatory text is worth.
          details.push(`${slots(failReasons.fieldBooked)} — field already booked`)
        }
        if (failReasons.homeTeamBusy > 0) {
          details.push(`${slots(failReasons.homeTeamBusy)} — ${homeTeamName} already play that day`)
        }
        if (failReasons.awayTeamBusy > 0) {
          details.push(`${slots(failReasons.awayTeamBusy)} — ${awayTeamName} already play that day`)
        }
        if (failReasons.homeTeamBlackout > 0) {
          details.push(`${slots(failReasons.homeTeamBlackout)} — ${homeTeamName}'s blackout dates`)
          if (homeBlackouts.size > 0) {
            const dates = Array.from(homeBlackouts).sort().slice(0, 3).join(', ')
            suggestions.push(`Review ${homeTeamName}'s blackout dates: ${dates}${homeBlackouts.size > 3 ? ', …' : ''}`)
          }
        }
        if (failReasons.awayTeamBlackout > 0) {
          details.push(`${slots(failReasons.awayTeamBlackout)} — ${awayTeamName}'s blackout dates`)
          if (awayBlackouts.size > 0) {
            const dates = Array.from(awayBlackouts).sort().slice(0, 3).join(', ')
            suggestions.push(`Review ${awayTeamName}'s blackout dates: ${dates}${awayBlackouts.size > 3 ? ', …' : ''}`)
          }
        }

        if (details.length === 0) {
          if (validSlots.length === 0) {
            details.push('No slots exist for this division')
            if (fields.length === 0) suggestions.push('Add at least one field')
            else if (!season.startDate || !season.endDate) suggestions.push('Set a season start and end date')
            else if (division.gameDays && division.gameDays.length > 0) {
              const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
              suggestions.push(`${division.name} only plays ${division.gameDays.map(d => dayNames[d]).join(', ')} — consider adding game days`)
            }
          } else {
            details.push('No slot survives every constraint')
            suggestions.push('Extend the season end date')
            suggestions.push('Add more fields or reduce team blackout dates')
          }
        }

        if (fields.length > 0 && validSlots.length > 0) {
          suggestions.push('Add more fields or time slots')
          if (leagueBlackouts.length > 0) {
            suggestions.push(`Remove some of the ${leagueBlackouts.length} league blackout dates`)
          }
        }

        conflicts.push({
          id: uid(),
          divisionId: division.id,
          homeTeamId: home,
          awayTeamId: away,
          reason: `Could not find an available slot for ${homeTeamName} vs ${awayTeamName}`,
          details,
          suggestions: suggestions.length > 0 ? suggestions : ['Schedule this game manually in the Schedule tab'],
          resolution: 'pending',
        })
      }
    }
  }

  return { games: scheduledGames, conflicts }
}

/** Re-run a single matchup ignoring soft constraints (relaxed mode) */
export function rescheduleMatchupRelaxed(params: {
  homeTeamId: string
  awayTeamId: string
  divisionId: string
  divisions: Division[]
  fields: Field[]
  season: SeasonConfig
  leagueBlackouts: string[]
  existingGames: ScheduledGame[]
  previewGames: ScheduledGame[]
}): ScheduledGame | null {
  const { homeTeamId, awayTeamId, divisionId, fields, season, leagueBlackouts, existingGames, previewGames } = params

  if (!season.startDate || !season.endDate || fields.length === 0) return null

  const gameDuration = season.gameDurationMinutes || 90
  const leagueBlackoutSet = parseBlackoutSet(leagueBlackouts)
  const allDates = dateRange(season.startDate, season.endDate)

  const bookedFieldSlots = new Set<string>()
  const teamBusyDates = new Set<string>()

  for (const g of [...existingGames, ...previewGames]) {
    bookedFieldSlots.add(`${g.fieldId}::${g.date}::${g.time}`)
    teamBusyDates.add(`${g.homeTeamId}::${g.date}`)
    teamBusyDates.add(`${g.awayTeamId}::${g.date}`)
  }

  const fieldBlackoutSets = new Map<string, Set<string>>()
  for (const field of fields) {
    fieldBlackoutSets.set(field.id, parseBlackoutSet(field.blackoutDates ?? []))
  }

  const division = params.divisions.find(d => d.id === divisionId)
  const defaultTimes = ['10:00', '12:00', '14:00', '16:00', '18:00']
  const timesToTry = division?.preferredStartTime
    ? [division.preferredStartTime, ...defaultTimes.filter(t => t !== division.preferredStartTime)]
    : defaultTimes

  for (const date of allDates) {
    if (leagueBlackoutSet.has(date)) continue

    for (const field of fields) {
      const fieldBlackouts = fieldBlackoutSets.get(field.id) ?? new Set()
      if (fieldBlackouts.has(date)) continue

      for (const time of timesToTry) {
        const startMins = toMins(time)
        const endMins = startMins + gameDuration
        if (startMins < 480 || endMins > 1200) continue

        const fieldKey = `${field.id}::${date}::${time}`
        const homeKey = `${homeTeamId}::${date}`
        const awayKey = `${awayTeamId}::${date}`

        if (bookedFieldSlots.has(fieldKey)) continue
        if (teamBusyDates.has(homeKey)) continue
        if (teamBusyDates.has(awayKey)) continue

        // Relaxed mode: ignore team blackout dates and preferred days/fields
        return {
          id: uid(),
          type: 'game',
          date,
          time,
          durationMinutes: gameDuration,
          fieldId: field.id,
          homeTeamId,
          awayTeamId,
          umpireId: '',
          divisionId,
        }
      }
    }
  }

  return null
}

export { minsToTime, toMins }
