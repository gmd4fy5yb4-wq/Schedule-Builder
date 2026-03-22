export interface SeasonConfig {
  leagueName: string
  startDate: string
  endDate: string
  gameDurationMinutes: number
  practiceDurationMinutes: number
}

export interface Team {
  id: string
  name: string
  divisionId: string
}

export interface Division {
  id: string
  name: string
  teams: Team[]
  gamesPerTeam: number
}

export interface FieldSlot {
  id: string
  dayOfWeek: number  // 0=Sun … 6=Sat
  time: string       // "HH:MM"
}

export interface Field {
  id: string
  name: string
  location: string
  slots: FieldSlot[]
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
}
