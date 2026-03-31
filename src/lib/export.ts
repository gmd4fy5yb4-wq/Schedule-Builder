import * as XLSX from 'xlsx'
import type { Division, Field, Umpire, ScheduledGame, ScheduledPractice, SeasonConfig } from './types'

function fmtDate(s: string) {
  return new Date(s + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtDay(s: string) {
  return new Date(s + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' })
}
function fmtTime(t: string) {
  const [h, m] = t.split(':').map(Number)
  return `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}
function endTime(startTime: string, durationMinutes: number): string {
  const total = startTime.split(':').map(Number).reduce((h, m) => h * 60 + m, 0) + durationMinutes
  const h = Math.floor(total / 60) % 24
  const m = total % 60
  return fmtTime(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
}

// ── CSV-specific helpers ──────────────────────────────────────────────────────

/** MM/dd/yyyy */
function fmtDateMMDDYYYY(s: string): string {
  const [y, mo, d] = s.split('-')
  return `${mo}/${d}/${y}`
}

/** HH:mm (24-hour) — stored times are already HH:mm, this just ensures it */
function fmt24(t: string): string {
  const [h, m] = t.split(':').map(Number)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** HH:mm end time in 24-hour */
function endTime24(startTime: string, durationMinutes: number): string {
  const total = startTime.split(':').map(Number).reduce((acc, v, i) => i === 0 ? v * 60 : acc + v, 0) + durationMinutes
  const h = Math.floor(total / 60) % 24
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Week number of the season — 1 for all games in the first 7 days
 * after (and including) the season start date, 2 for the next 7, etc.
 * Falls back to chronological week if startDate is missing.
 */
function roundNo(gameDate: string, seasonStartDate: string): number {
  const start = new Date(seasonStartDate + 'T12:00:00').getTime()
  const game  = new Date(gameDate + 'T12:00:00').getTime()
  const daysDiff = Math.round((game - start) / (1000 * 60 * 60 * 24))
  return Math.floor(Math.max(0, daysDiff) / 7) + 1
}

/** Escape a CSV field — wrap in quotes if it contains commas, quotes, or newlines */
function csvField(v: string | number): string {
  const s = String(v ?? '')
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function csvRow(cells: (string | number)[]): string {
  return cells.map(csvField).join(',')
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  // dispatchEvent is more reliable than .click() across browsers
  a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
  // Delay revocation so the browser has time to start the download
  setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 10000)
}

export function exportToExcel(
  divisions: Division[],
  fields: Field[],
  umpires: Umpire[],
  games: ScheduledGame[],
  practices: ScheduledPractice[]
) {
  try {
    const divMap    = new Map(divisions.map(d => [d.id, d]))
    const teamMap   = new Map(divisions.flatMap(d => d.teams).map(t => [t.id, t]))
    const fieldMap  = new Map(fields.map(f => [f.id, f]))
    const umpireMap = new Map(umpires.map(u => [u.id, u]))

    const allItems = ([...games, ...practices] as (ScheduledGame | ScheduledPractice)[]).sort((a, b) => {
      const dc = a.date.localeCompare(b.date)
      return dc !== 0 ? dc : a.time.localeCompare(b.time)
    })

    const wb = XLSX.utils.book_new()
    const HEADERS = ['Date', 'Day', 'Start Time', 'End Time', 'Division', 'Type', 'Home / Team', 'Away', 'Field', 'Location', 'Umpire']

    function buildRow(item: ScheduledGame | ScheduledPractice): string[] {
      const div      = divMap.get(item.divisionId)?.name     || ''
      const fieldRec = fieldMap.get(item.fieldId)
      const field    = fieldRec?.name     || ''
      const location = fieldRec?.location || ''
      const end      = item.durationMinutes ? endTime(item.time, item.durationMinutes) : ''
      if (item.type === 'game') {
        const g      = item as ScheduledGame
        const umpire = g.umpireId ? (umpireMap.get(g.umpireId)?.name || '') : 'TBD'
        return [fmtDate(item.date), fmtDay(item.date), fmtTime(item.time), end, div, 'Game',
          teamMap.get(g.homeTeamId)?.name || '', teamMap.get(g.awayTeamId)?.name || '', field, location, umpire]
      } else {
        const p = item as ScheduledPractice
        return [fmtDate(item.date), fmtDay(item.date), fmtTime(item.time), end, div, 'Practice',
          teamMap.get(p.teamId)?.name || '', '', field, location, '']
      }
    }

    // Sanitize sheet names — Excel forbids : \ / ? * [ ] and limits to 31 chars
    const usedSheetNames = new Set<string>()
    function sheetName(raw: string): string {
      let name = raw.replace(/[:\\/?\*\[\]]/g, '-').substring(0, 31).trim()
      if (!name) name = 'Sheet'
      let unique = name
      let i = 2
      while (usedSheetNames.has(unique)) unique = name.substring(0, 28) + ` ${i++}`
      usedSheetNames.add(unique)
      return unique
    }

    // Full schedule sheet
    const ws1 = XLSX.utils.aoa_to_sheet([HEADERS, ...allItems.map(buildRow)])
    XLSX.utils.book_append_sheet(wb, ws1, sheetName('Full Schedule'))

    // Per-division sheets
    for (const div of divisions) {
      const rows = allItems.filter(i => i.divisionId === div.id).map(buildRow)
      if (!rows.length) continue
      const ws = XLSX.utils.aoa_to_sheet([[`${div.name} Schedule`], [], HEADERS, ...rows])
      XLSX.utils.book_append_sheet(wb, ws, sheetName(div.name))
    }

    // Per-team sheets
    for (const div of divisions) {
      for (const team of div.teams) {
        const teamItems = allItems.filter(i =>
          (i.type === 'game' && ((i as ScheduledGame).homeTeamId === team.id || (i as ScheduledGame).awayTeamId === team.id)) ||
          (i.type === 'practice' && (i as ScheduledPractice).teamId === team.id)
        )
        if (!teamItems.length) continue
        const rows = teamItems.map(item => {
          const end      = item.durationMinutes ? endTime(item.time, item.durationMinutes) : ''
          const fieldRec = fieldMap.get(item.fieldId)
          const fieldName = fieldRec?.name     || ''
          const location  = fieldRec?.location || ''
          if (item.type === 'game') {
            const g      = item as ScheduledGame
            const isHome = g.homeTeamId === team.id
            const opp    = teamMap.get(isHome ? g.awayTeamId : g.homeTeamId)?.name || ''
            const umpire = g.umpireId ? (umpireMap.get(g.umpireId)?.name || '') : 'TBD'
            return [fmtDate(item.date), fmtDay(item.date), fmtTime(item.time), end, 'Game', opp, isHome ? 'Home' : 'Away', fieldName, location, umpire]
          } else {
            return [fmtDate(item.date), fmtDay(item.date), fmtTime(item.time), end, 'Practice', '', '', fieldName, location, '']
          }
        })
        const ws = XLSX.utils.aoa_to_sheet([
          [`${team.name} — ${div.name}`], [],
          ['Date', 'Day', 'Start Time', 'End Time', 'Type', 'Opponent', 'Home/Away', 'Field', 'Location', 'Umpire'],
          ...rows
        ])
        XLSX.utils.book_append_sheet(wb, ws, sheetName(team.name))
      }
    }

    // Write to ArrayBuffer and download as blob (works in Chrome, Firefox, and Safari)
    const buf  = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    triggerDownload(blob, 'softball-schedule.xlsx')

  } catch (err) {
    console.error('Export error:', err)
    alert('Export failed: ' + String(err) + '\n\nCheck the browser console for details.')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV Export
// Columns: SortOrder, RoundNo, HomeTeam, AwayTeam, MatchDate, StartTime,
//          EndTime, Location, Field
// Only games are included (not practices — they have no home/away teams).
// ─────────────────────────────────────────────────────────────────────────────
export function exportToCSV(
  season: SeasonConfig,
  divisions: Division[],
  fields: Field[],
  games: ScheduledGame[]
) {
  try {
    const teamMap  = new Map(divisions.flatMap(d => d.teams).map(t => [t.id, t]))
    const fieldMap = new Map(fields.map(f => [f.id, f]))

    // Sort games chronologically, then by time
    const sorted = [...games].sort((a, b) => {
      const dc = a.date.localeCompare(b.date)
      return dc !== 0 ? dc : a.time.localeCompare(b.time)
    })

    const HEADERS = ['SortOrder', 'RoundNo', 'HomeTeam', 'AwayTeam', 'MatchDate', 'StartTime', 'EndTime', 'Location', 'Field']

    const rows: string[] = [csvRow(HEADERS)]

    for (const g of sorted) {
      const field    = fieldMap.get(g.fieldId)
      const homeTeam = teamMap.get(g.homeTeamId)?.name ?? ''
      const awayTeam = teamMap.get(g.awayTeamId)?.name ?? ''
      const matchDate = fmtDateMMDDYYYY(g.date)
      const startTime = fmt24(g.time)
      const endT      = g.durationMinutes ? endTime24(g.time, g.durationMinutes) : ''
      const location  = field?.location ?? ''
      const fieldName = field?.name     ?? ''
      const round     = roundNo(g.date, season.startDate)

      rows.push(csvRow(['', round, homeTeam, awayTeam, matchDate, startTime, endT, location, fieldName]))
    }

    const csvContent = rows.join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    triggerDownload(blob, 'softball-schedule.csv')

  } catch (err) {
    console.error('CSV export error:', err)
    alert('CSV export failed: ' + String(err))
  }
}
