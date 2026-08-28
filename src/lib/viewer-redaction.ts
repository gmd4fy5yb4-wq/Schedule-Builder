import type { AppState } from './types'

/**
 * Strips coach contact details from a league blob before it leaves the server
 * for a read-only share link.
 *
 * The share link is forwardable: anyone who receives it can call
 * /api/league/view directly, so client-side gating (CoachView not rendering
 * these fields) is not a control. CoachView never reads phone/email, so the
 * viewer loses nothing.
 */
export function redactForViewer(state: AppState): AppState {
  if (!state?.divisions) return state
  return {
    ...state,
    divisions: state.divisions.map(d => ({
      ...d,
      teams: (d.teams ?? []).map(t =>
        t.coaches?.length
          ? { ...t, coaches: t.coaches.map(c => ({ ...c, phone: '', email: '' })) }
          : t
      ),
    })),
  }
}
