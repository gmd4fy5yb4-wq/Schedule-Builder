import type { Division, Field, Umpire, SeasonConfig, ScheduledGame, ScheduledPractice } from './types'

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function roundRobin(ids: string[]): [string, string][] {
  if (ids.length < 2) return []
  const arr = [...ids]
  if (arr.length % 2 !== 0) arr.push('__bye__')
  const n = arr.length
  const half = n / 2
  const fixed = arr[0]
  const rot = arr.slice(1)
  const pairs: [string, string][] = []
  for (let r = 0; r < n - 1; r++) {
    const circle = [fixed, ...rot]
    for (let i = 0; i < half; i++) {
      const a = circle[i], b = circle[n - 1 - i]
      if (a !== '__bye__' && b !== '__bye__') {
        pairs.push(r % 2 === 0 ? [a, b] : [b, a])
      }
    }
    rot.unshift(rot.pop()!)
  }
  return pairs
}

interface Slot { date: string; time: string; fieldId: string }

// Fields are open 8 AM – 7 PM every day. Generate slots at game-duration intervals.
function expandSlots(fields: Field[], startDate: string, endDate: string, durationMinutes: number): Slot[] {
  const slots: Slot[] = []
  const stepMins = Math.max(durationMinutes, 60)
  const openMins  = 8 * 60   // 8:00 AM
  const closeMins = 19 * 60  // 7:00 PM
  const start = new Date(startDate + 'T12:00:00')
  const end   = new Date(endDate   + 'T12:00:00')
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0]
    for (const field of fields) {
      for (let m = openMins; m + durationMinutes <= closeMins; m += stepMins) {
        const h = Math.floor(m / 60)
        const min = m % 60
        const time = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
        slots.push({ date: dateStr, time, fieldId: field.id })
      }
    }
  }
  return slots.sort((a, b) => {
    const dc = a.date.localeCompare(b.date)
    return dc !== 0 ? dc : a.time.localeCompare(b.time)
  })
}

export interface ScheduleResult {
  games: ScheduledGame[]
  practices: ScheduledPractice[]
  warnings: string[]
}

export function generateSchedule(
  divisions: Division[],
  fields: Field[],
  umpires: Umpire[],
  season: SeasonConfig,
  blackoutDates: string[] = []
): ScheduleResult {
  const games: ScheduledGame[] = []
  const practices: ScheduledPractice[] = []
  const warnings: string[] = []

  if (!fields.length) return { games, practices, warnings: ['No fields configured.'] }
  if (!umpires.length) return { games, practices, warnings: ['No umpires configured.'] }
  if (!season.startDate || !season.endDate) return { games, practices, warnings: ['Season dates not set.'] }

  const blackoutSet = new Set(blackoutDates.map(d => d.split('::')[0]))
  const allSlots = expandSlots(fields, season.startDate, season.endDate, season.gameDurationMinutes || 90)
    .filter(s => !blackoutSet.has(s.date))
  const usedSlots = new Set<string>()                          // "date|time|fieldId"
  const umpireBusy = new Map<string, Set<string>>()            // umpireId -> Set<"date|time">
  const teamGameDates = new Map<string, Set<string>>()         // teamId -> Set<date>
  const umpireCount = new Map<string, number>()

  for (const u of umpires) { umpireBusy.set(u.id, new Set()); umpireCount.set(u.id, 0) }
  for (const div of divisions) for (const t of div.teams) teamGameDates.set(t.id, new Set())

  const teamById = new Map(divisions.flatMap(d => d.teams).map(t => [t.id, t]))

  // --- Schedule games ---
  for (const division of divisions) {
    if (division.teams.length < 2) {
      warnings.push(`${division.name}: needs at least 2 teams.`)
      continue
    }
    const basePairs = roundRobin(division.teams.map(t => t.id))
    const totalGames = Math.floor(division.teams.length * division.gamesPerTeam / 2)
    const matchups: [string, string][] = []
    let pass = 0
    while (matchups.length < totalGames) {
      const batch = pass % 2 === 0 ? basePairs : basePairs.map(([a, b]) => [b, a] as [string, string])
      matchups.push(...batch)
      pass++
    }

    for (const [homeId, awayId] of matchups.slice(0, totalGames)) {
      let assigned = false
      for (const slot of allSlots) {
        const slotKey = `${slot.date}|${slot.time}|${slot.fieldId}`
        const timeKey = `${slot.date}|${slot.time}`
        if (usedSlots.has(slotKey)) continue
        if (teamGameDates.get(homeId)?.has(slot.date)) continue
        if (teamGameDates.get(awayId)?.has(slot.date)) continue
        const avail = umpires
          .filter(u => !umpireBusy.get(u.id)?.has(timeKey))
          .sort((a, b) => (umpireCount.get(a.id) || 0) - (umpireCount.get(b.id) || 0))
        if (!avail.length) continue
        const ump = avail[0]
        games.push({ id: uid(), type: 'game' as const, date: slot.date, time: slot.time, durationMinutes: season.gameDurationMinutes, fieldId: slot.fieldId, homeTeamId: homeId, awayTeamId: awayId, umpireId: ump.id, divisionId: division.id })
        usedSlots.add(slotKey)
        teamGameDates.get(homeId)!.add(slot.date)
        teamGameDates.get(awayId)!.add(slot.date)
        umpireBusy.get(ump.id)!.add(timeKey)
        umpireCount.set(ump.id, (umpireCount.get(ump.id) || 0) + 1)
        assigned = true
        break
      }
      if (!assigned) {
        warnings.push(`${division.name}: Could not schedule ${teamById.get(homeId)?.name} vs ${teamById.get(awayId)?.name} — not enough slots.`)
      }
    }
  }

  // --- Schedule practices ---
  const allTeams = divisions.flatMap(d => d.teams.map(t => ({ ...t, divId: d.id })))
  const practiceCount = new Map(allTeams.map(t => [t.id, 0]))

  for (const slot of allSlots) {
    const slotKey = `${slot.date}|${slot.time}|${slot.fieldId}`
    if (usedSlots.has(slotKey)) continue
    const eligible = allTeams
      .filter(t => !teamGameDates.get(t.id)?.has(slot.date))
      .sort((a, b) => (practiceCount.get(a.id) || 0) - (practiceCount.get(b.id) || 0))
    if (!eligible.length) continue
    const team = eligible[0]
    const division = divisions.find(d => d.teams.some(t => t.id === team.id))!
    practices.push({ id: uid(), type: 'practice' as const, date: slot.date, time: slot.time, durationMinutes: season.practiceDurationMinutes, fieldId: slot.fieldId, teamId: team.id, divisionId: division.id })
    usedSlots.add(slotKey)
    practiceCount.set(team.id, (practiceCount.get(team.id) || 0) + 1)
  }

  return { games, practices, warnings }
}
