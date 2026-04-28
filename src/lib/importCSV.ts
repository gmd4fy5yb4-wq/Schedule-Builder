import type { Division, Field, Umpire } from './types'
import { getSportConfig } from './sports'

export interface ImportResult {
  divisions: Division[]
  fields: Field[]
  umpires: Umpire[]
  errors: string[]
  warnings: string[]
}

const DAY_NAMES: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tuesday: 2,
  wed: 3, wednesday: 3,
  thu: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
}

function parseDays(s: string): number[] {
  if (!s.trim()) return []
  return s.split('|').flatMap(d => {
    const t = d.trim().toLowerCase()
    if (t in DAY_NAMES) return [DAY_NAMES[t]]
    const n = parseInt(t)
    return !isNaN(n) && n >= 0 && n <= 6 ? [n] : []
  })
}

function parseDates(s: string): string[] {
  if (!s.trim()) return []
  return s.split('|').map(d => d.trim()).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
}

function toId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item'
}

function uniqueId(base: string, used: Set<string>): string {
  const id = toId(base)
  let candidate = id
  let i = 2
  while (used.has(candidate)) candidate = `${id}-${i++}`
  used.add(candidate)
  return candidate
}

/** Minimal CSV parser — handles quoted fields, escaped quotes, CRLF/LF */
function parseCSVRows(text: string): string[][] {
  const rows: string[][] = []
  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  while (i < src.length) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 2; continue }
        inQuotes = false
      } else {
        field += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        row.push(field); field = ''
      } else if (ch === '\n') {
        row.push(field); field = ''
        rows.push(row); row = []
      } else {
        field += ch
      }
    }
    i++
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows
}

export function parseImportCSV(csvText: string): ImportResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Strip comment rows (first cell starts with #) and blank rows
  const allRows = parseCSVRows(csvText)
  const rows = allRows.filter(r => {
    const first = (r[0] ?? '').trim()
    return first !== '' && !first.startsWith('#')
  })

  if (rows.length < 2) {
    return { divisions: [], fields: [], umpires: [], errors: ['CSV is empty or has no data rows'], warnings: [] }
  }

  const headers = rows[0].map(h => h.trim().toLowerCase().replace(/\s+/g, ''))
  const col = (name: string) => headers.indexOf(name)
  const typeIdx = col('type')

  if (typeIdx === -1) {
    errors.push('Missing "Type" column — ensure the first non-comment row contains column headers')
    return { divisions: [], fields: [], umpires: [], errors, warnings }
  }

  type RawDiv    = { name: string; gamesPerTeam: number; gameDays: number[]; preferredStartTime?: string }
  type RawTeam   = { name: string; divisionName: string; homeField: string; preferredDays: number[]; blackoutDates: string[]; rowNum: number }
  type RawField  = { name: string; location: string; blackoutDates: string[] }
  type RawUmpire = { name: string; phone: string; email: string }

  const rawDivs: RawDiv[] = []
  const rawTeams: RawTeam[] = []
  const rawFields: RawField[] = []
  const rawUmpires: RawUmpire[] = []

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const get = (colName: string) => (row[col(colName)] ?? '').trim()
    const type = get('type').toLowerCase()
    const rowNum = i + 1  // 1-based for user-facing messages

    switch (type) {
      case 'division': {
        const name = get('name')
        if (!name) { warnings.push(`Row ${rowNum}: Division missing Name — skipped`); break }
        const gpt = parseInt(get('gamesperteam') || get('games'))
        rawDivs.push({
          name,
          gamesPerTeam: isNaN(gpt) ? 10 : gpt,
          gameDays: parseDays(get('gamedays') || get('days')),
          preferredStartTime: get('starttime') || undefined,
        })
        break
      }
      case 'team': {
        const name = get('name')
        if (!name) { warnings.push(`Row ${rowNum}: Team missing Name — skipped`); break }
        rawTeams.push({
          name,
          divisionName: get('division'),
          homeField: get('homefield'),
          preferredDays: parseDays(get('preferreddays')),
          blackoutDates: parseDates(get('blackoutdates')),
          rowNum,
        })
        break
      }
      // Accept any venue type name (Field, Court, Pitch, Rink, Venue)
      case 'field':
      case 'court':
      case 'pitch':
      case 'rink':
      case 'venue': {
        const name = get('name')
        if (!name) { warnings.push(`Row ${rowNum}: Venue missing Name — skipped`); break }
        rawFields.push({ name, location: get('location'), blackoutDates: parseDates(get('blackoutdates')) })
        break
      }
      // Accept any official type name (Umpire, Referee, Official)
      case 'umpire':
      case 'referee':
      case 'official': {
        const name = get('name')
        if (!name) { warnings.push(`Row ${rowNum}: Official missing Name — skipped`); break }
        rawUmpires.push({ name, phone: get('phone'), email: get('email') })
        break
      }
      default:
        warnings.push(`Row ${rowNum}: Unknown Type "${type}" — skipped`)
    }
  }

  const usedIds = new Set<string>()

  const fields: Field[] = rawFields.map(f => ({
    id: uniqueId(f.name, usedIds),
    name: f.name,
    location: f.location,
    address: '',
    ...(f.blackoutDates.length ? { blackoutDates: f.blackoutDates } : {}),
  }))

  const fieldByName = new Map(fields.map(f => [f.name.toLowerCase(), f.id]))

  const umpires: Umpire[] = rawUmpires.map(u => ({
    id: uniqueId(u.name, usedIds),
    name: u.name,
    phone: u.phone,
    email: u.email,
  }))

  const divisions: Division[] = rawDivs.map(d => ({
    id: uniqueId(d.name, usedIds),
    name: d.name,
    teams: [],
    gamesPerTeam: d.gamesPerTeam,
    ...(d.gameDays.length ? { gameDays: d.gameDays } : {}),
    ...(d.preferredStartTime ? { preferredStartTime: d.preferredStartTime } : {}),
  }))

  const divByName = new Map(divisions.map(d => [d.name.toLowerCase(), d]))

  for (const t of rawTeams) {
    const div = divByName.get(t.divisionName.toLowerCase())
    if (!div) {
      warnings.push(`Team "${t.name}" (row ${t.rowNum}): division "${t.divisionName || '(blank)'}" not found — skipped`)
      continue
    }
    const homeFieldId = t.homeField ? fieldByName.get(t.homeField.toLowerCase()) : undefined
    if (t.homeField && !homeFieldId) {
      warnings.push(`Team "${t.name}": home field "${t.homeField}" not found — field assignment ignored`)
    }
    div.teams.push({
      id: uniqueId(t.name, usedIds),
      name: t.name,
      divisionId: div.id,
      ...(homeFieldId ? { homeFieldId } : {}),
      ...(t.preferredDays.length ? { preferredDays: t.preferredDays } : {}),
      ...(t.blackoutDates.length ? { blackoutDates: t.blackoutDates } : {}),
    })
  }

  return { divisions, fields, umpires, errors, warnings }
}

/** Generate a downloadable CSV template with instructions as comment rows */
export function generateTemplate(sportId = 'softball'): string {
  const sc = getSportConfig(sportId)
  const venueType = sc.venueSingular   // e.g. Field, Court, Pitch, Rink
  const officialType = sc.officialSingular  // e.g. Umpire, Referee, Official

  const rows = [
    `# FieldDay Planner — Import Template (${sc.name})`,
    `# Rows starting with # are comments and will be ignored.`,
    `# Use | (pipe) to separate multiple values in GameDays, PreferredDays, and BlackoutDates.`,
    `# Columns not needed for a given Type can be left blank.`,
    `Type,Name,Division,GamesPerTeam,GameDays,StartTime,Location,HomeField,PreferredDays,BlackoutDates,Phone,Email`,
    `# --- DIVISIONS ---`,
    `# GamesPerTeam: number of games each team plays (default: 10)`,
    `# GameDays: days of the week games are played — e.g. Tue|Thu or Mon|Wed|Fri`,
    `# StartTime: preferred game start time in 24hr format — e.g. 18:00 (6:00 PM)`,
    `Division,6U,,10,Tue|Thu,18:00,,,,,,`,
    `Division,8U,,12,Mon|Wed,18:30,,,,,,`,
    `Division,10U,,14,Sat,09:00,,,,,,`,
    `# --- TEAMS ---`,
    `# Division: must exactly match a Division Name above`,
    `# HomeField: must exactly match a ${venueType} Name below (optional)`,
    `# PreferredDays: coach's preferred practice days — e.g. Mon|Wed`,
    `# BlackoutDates: dates this team cannot play — e.g. 2025-07-04|2025-08-15`,
    `Team,Tigers,6U,,,,,Riverside ${venueType},Tue|Thu,,,`,
    `Team,Lions,6U,,,,,,,,,`,
    `Team,Sharks,8U,,,,,Memorial ${venueType},,,,`,
    `Team,Eagles,8U,,,,,,,,,`,
    `Team,Hawks,10U,,,,,,,2025-07-04,,`,
    `# --- ${sc.venuePlural.toUpperCase()} ---`,
    `# Location: full address or description`,
    `# BlackoutDates: dates this venue is unavailable — e.g. 2025-07-04|2025-08-15`,
    `${venueType},Riverside ${venueType},,,,,100 River Rd,,,,, `,
    `${venueType},Memorial ${venueType},,,,,200 Oak Ave,,,2025-07-04,,`,
    `# --- ${sc.officialPlural.toUpperCase()} ---`,
    `${officialType},John Smith,,,,,,,,,555-0100,john@example.com`,
    `${officialType},Jane Doe,,,,,,,,,555-0101,jane@example.com`,
  ]
  return rows.join('\r\n')
}
