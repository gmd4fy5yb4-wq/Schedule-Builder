export interface SeasonConfig {
  leagueName: string
  sport: string           // sport id from sports.ts, e.g. 'softball'
  startDate: string
  endDate: string
  gameDurationMinutes: number
  practiceDurationMinutes: number
}

export interface Team {
  id: string
  name: string
  divisionId: string
  blackoutDates?: string[]  // "YYYY-MM-DD" or "YYYY-MM-DD::Label"
  homeFieldId?: string
  preferredDays?: number[]  // coach preferred days, 0-6
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
  location: string
  blackoutDates?: string[]  // "YYYY-MM-DD" or "YYYY-MM-DD::Label"
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

export type ScheduledItem = ScheduledGame | ScheduledPractice

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
  schedule: {
    games: ScheduledGame[]
    practices: ScheduledPractice[]
    generatedAt: string | null
    warnings: string[]
  }
  autoScheduleConflicts?: ScheduleConflict[]
  autoSchedulePreview?: ScheduledGame[] | null
}
