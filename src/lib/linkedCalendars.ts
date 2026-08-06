// Linked read-only calendars from other leagues. Stored in AppState.linkedCalendars
// (rides along in the league JSONB blob — no migration). Each entry is just the
// other league's existing view_token; viewing reuses GET /api/league/view.

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

/** Pull a view token out of a pasted share link or a bare token. null if none found. */
export function extractViewToken(input: string): string | null {
  const m = input.match(UUID_RE)
  return m ? m[0].toLowerCase() : null
}
