export interface SeasonConfig {
  leagueName: string
  sport?: string          // legacy single-sport id — KEPT for back-compat (old blobs + snapshot restores)
  sports?: string[]       // multi-sport — e.g. ['softball'] or ['softball','baseball']. Read via getSports().
  theme?: string          // theme id from themes.ts, e.g. 'fieldday'
  startDate: string
  endDate: string
  gameDurationMinutes: number
  practiceDurationMinutes: number
}

export interface Coach {
  id: string
  name: string
  role?: 'head' | 'assistant'   // head = Head Coach / Manager; assistant = Assistant Coach
  phone: string
  email: string
}

export interface Team {
  id: string
  name: string
  divisionId: string
  blackoutDates?: string[]  // "YYYY-MM-DD" or "YYYY-MM-DD::Label"
  homeFieldId?: string
  preferredDays?: number[]  // preferred game days, 0-6
  coaches?: Coach[]
}

export interface FieldStaffMember {
  id: string
  name: string
  role: string    // e.g. "Concessions", "Scorer", "Groundskeeper"
  phone: string
  email: string
}

export interface Division {
  id: string
  name: string
  teams: Team[]
  gamesPerTeam: number
  gameDays?: number[]          // 0=Sun through 6=Sat
  preferredStartTime?: string  // "HH:MM"
}

export interface Field {
  id: string
  name: string
  location: string   // descriptive location name (e.g. "Eisenhower Park")
  address: string    // street address used for maps/directions
  blackoutDates?: string[]  // "YYYY-MM-DD" or "YYYY-MM-DD::Label"
  geocoords?: { lat: number; lon: number }  // cached geocoded coordinates — shared with view-only users
  // Fields are open 8 AM – 8 PM every day; no slot configuration needed.
}

export interface Umpire {
  id: string
  name: string
  phone: string
  email: string
}

export interface ScheduledGame {
  id: string
  type: 'game'
  date: string
  time: string
  durationMinutes: number
  fieldId: string
  homeTeamId: string
  awayTeamId: string
  umpireId: string        // empty string = TBD
  divisionId: string
  result?: { homeScore: number; awayScore: number }
  confirmed?: boolean   // league admin has verified all parties notified
  umpireConfirmed?: boolean  // the assigned official has accepted this game
}

export interface ScheduledPractice {
  id: string
  type: 'practice'
  date: string
  time: string
  durationMinutes: number
  fieldId: string
  teamId: string
  divisionId: string
}

export interface ScheduledSpecialEvent {
  id: string
  type: 'special'
  name: string
  date: string
  time: string
  durationMinutes: number
  location?: string   // free-text location (not tied to the fields database)
  comments?: string
}

export type ScheduledItem = ScheduledGame | ScheduledPractice | ScheduledSpecialEvent

export interface ScheduleConflict {
  id: string
  divisionId: string
  homeTeamId: string
  awayTeamId: string
  reason: string
  details: string[]
  suggestions: string[]
  resolution: 'pending' | 'skipped' | 'deferred' | 'resolved'
}

export interface AppState {
  season: SeasonConfig
  blackoutDates: string[]   // YYYY-MM-DD
  divisions: Division[]
  fields: Field[]
  umpires: Umpire[]
  fieldStaff: FieldStaffMember[]
  schedule: {
    games: ScheduledGame[]
    practices: ScheduledPractice[]
    specialEvents: ScheduledSpecialEvent[]
    generatedAt: string | null
    warnings: string[]
  }
  autoScheduleConflicts?: ScheduleConflict[]
  autoSchedulePreview?: ScheduledGame[] | null
}
