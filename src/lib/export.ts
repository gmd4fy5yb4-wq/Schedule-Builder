import type { Division, Field, Umpire, ScheduledGame, ScheduledPractice } from './types'

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

export async function exportToExcel(
  divisions: Division[],
  fields: Field[],
  umpires: Umpire[],
  games: ScheduledGame[],
  practices: ScheduledPractice[]
) {
  const XLSX = await import('xlsx')

  const divMap = new Map(divisions.map(d => [d.id, d]))
  const teamMap = new Map(divisions.flatMap(d => d.teams).map(t => [t.id, t]))
  const fieldMap = new Map(fields.map(f => [f.id, f]))
  const umpireMap = new Map(umpires.map(u => [u.id, u]))

  const allItems = ([...games, ...practices] as (ScheduledGame | ScheduledPractice)[]).sort((a, b) => {
    const dc = a.date.localeCompare(b.date)
    return dc !== 0 ? dc : a.time.localeCompare(b.time)
  })

  const wb = XLSX.utils.book_new()

  const HEADERS = ['Date', 'Day', 'Start Time', 'End Time', 'Division', 'Type', 'Home / Team', 'Away', 'Field', 'Umpire']

  function buildRow(item: ScheduledGame | ScheduledPractice): string[] {
    const div = divMap.get(item.divisionId)?.name || ''
    const field = fieldMap.get(item.fieldId)?.name || ''
    const end = item.durationMinutes ? endTime(item.time, item.durationMinutes) : ''
    if (item.type === 'game') {
      const g = item as ScheduledGame
      const umpire = g.umpireId ? (umpireMap.get(g.umpireId)?.name || '') : 'TBD'
      return [fmtDate(item.date), fmtDay(item.date), fmtTime(item.time), end, div, 'Game',
        teamMap.get(g.homeTeamId)?.name || '', teamMap.get(g.awayTeamId)?.name || '', field, umpire]
    } else {
      const p = item as ScheduledPractice
      return [fmtDate(item.date), fmtDay(item.date), fmtTime(item.time), end, div, 'Practice',
        teamMap.get(p.teamId)?.name || '', '', field, '']
    }
  }

  // Full schedule sheet
  const ws1 = XLSX.utils.aoa_to_sheet([HEADERS, ...allItems.map(buildRow)])
  XLSX.utils.book_append_sheet(wb, ws1, 'Full Schedule')

  // Per-division sheets
  for (const div of divisions) {
    const rows = allItems.filter(i => i.divisionId === div.id).map(buildRow)
    if (!rows.length) continue
    const ws = XLSX.utils.aoa_to_sheet([[`${div.name} Schedule`], [], HEADERS, ...rows])
    XLSX.utils.book_append_sheet(wb, ws, div.name)
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
        const end = item.durationMinutes ? endTime(item.time, item.durationMinutes) : ''
        if (item.type === 'game') {
          const g = item as ScheduledGame
          const isHome = g.homeTeamId === team.id
          const opp = teamMap.get(isHome ? g.awayTeamId : g.homeTeamId)?.name || ''
          const umpire = g.umpireId ? (umpireMap.get(g.umpireId)?.name || '') : 'TBD'
          return [fmtDate(item.date), fmtDay(item.date), fmtTime(item.time), end, 'Game', opp, isHome ? 'Home' : 'Away', fieldMap.get(item.fieldId)?.name || '', umpire]
        } else {
          return [fmtDate(item.date), fmtDay(item.date), fmtTime(item.time), end, 'Practice', '', '', fieldMap.get(item.fieldId)?.name || '', '']
        }
      })
      const ws = XLSX.utils.aoa_to_sheet([
        [`${team.name} — ${div.name}`], [],
        ['Date', 'Day', 'Start Time', 'End Time', 'Type', 'Opponent', 'Home/Away', 'Field', 'Umpire'],
        ...rows
      ])
      XLSX.utils.book_append_sheet(wb, ws, team.name.substring(0, 31))
    }
  }

  // Base64 data URI — works reliably in Safari, Chrome, and Firefox
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' })
  const a = document.createElement('a')
  a.href = 'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,' + buf
  a.download = 'softball-schedule.xlsx'
  document.body.appendChild(a)
  a.click()
  setTimeout(() => document.body.removeChild(a), 100)
}
