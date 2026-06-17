export interface SportConfig {
  id: string
  name: string
  venueSingular: string
  venuePlural: string
  eventSingular: string   // "Game" or "Match"
  eventPlural: string
  officialSingular: string  // "Umpire", "Referee", "Official"
  officialPlural: string
}

export const SPORTS: SportConfig[] = [
  { id: 'softball',    name: 'Softball',    venueSingular: 'Field',  venuePlural: 'Fields',  eventSingular: 'Game',  eventPlural: 'Games',   officialSingular: 'Umpire',    officialPlural: 'Umpires'    },
  { id: 'baseball',    name: 'Baseball',    venueSingular: 'Field',  venuePlural: 'Fields',  eventSingular: 'Game',  eventPlural: 'Games',   officialSingular: 'Umpire',    officialPlural: 'Umpires'    },
  { id: 'basketball',  name: 'Basketball',  venueSingular: 'Court',  venuePlural: 'Courts',  eventSingular: 'Game',  eventPlural: 'Games',   officialSingular: 'Referee',   officialPlural: 'Referees'   },
  { id: 'football',    name: 'Football',    venueSingular: 'Field',  venuePlural: 'Fields',  eventSingular: 'Game',  eventPlural: 'Games',   officialSingular: 'Referee',   officialPlural: 'Referees'   },
  { id: 'soccer',      name: 'Soccer',      venueSingular: 'Pitch',  venuePlural: 'Pitches', eventSingular: 'Match', eventPlural: 'Matches', officialSingular: 'Referee',   officialPlural: 'Referees'   },
  { id: 'lacrosse',    name: 'Lacrosse',    venueSingular: 'Field',  venuePlural: 'Fields',  eventSingular: 'Game',  eventPlural: 'Games',   officialSingular: 'Referee',   officialPlural: 'Referees'   },
  { id: 'hockey',      name: 'Hockey',      venueSingular: 'Rink',   venuePlural: 'Rinks',   eventSingular: 'Game',  eventPlural: 'Games',   officialSingular: 'Referee',   officialPlural: 'Referees'   },
  { id: 'cricket',     name: 'Cricket',     venueSingular: 'Pitch',  venuePlural: 'Pitches', eventSingular: 'Match', eventPlural: 'Matches', officialSingular: 'Umpire',    officialPlural: 'Umpires'    },
  { id: 'volleyball',  name: 'Volleyball',  venueSingular: 'Court',  venuePlural: 'Courts',  eventSingular: 'Match', eventPlural: 'Matches', officialSingular: 'Referee',   officialPlural: 'Referees'   },
  { id: 'tennis',      name: 'Tennis',      venueSingular: 'Court',  venuePlural: 'Courts',  eventSingular: 'Match', eventPlural: 'Matches', officialSingular: 'Umpire',    officialPlural: 'Umpires'    },
  { id: 'cornhole',    name: 'Cornhole',    venueSingular: 'Court',  venuePlural: 'Courts',  eventSingular: 'Game',  eventPlural: 'Games',   officialSingular: 'Official',  officialPlural: 'Officials'  },
  { id: 'other',       name: 'Other',       venueSingular: 'Venue',  venuePlural: 'Venues',  eventSingular: 'Game',  eventPlural: 'Games',   officialSingular: 'Official',  officialPlural: 'Officials'  },
]

export const DEFAULT_SPORT = SPORTS[0]

export function getSportConfig(sportId?: string): SportConfig {
  if (!sportId) return DEFAULT_SPORT
  return SPORTS.find(s => s.id === sportId) ?? DEFAULT_SPORT
}

// Single read path for a league's sports — tolerant of legacy single-sport blobs.
// Legacy blob ({sport:'softball'}) → ['softball']; new blob uses {sports:[...]}.
// Never mutates the blob; callers that need one config use getSportConfig(getSports(season)[0]).
export function getSports(season: { sport?: string; sports?: string[] }): string[] {
  return season.sports?.length ? season.sports : [season.sport ?? 'softball']
}
