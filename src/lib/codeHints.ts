/**
 * FieldDay asks people for two different codes, and they get mixed up:
 *
 *   sign-in code — 8 DIGITS, emailed by Supabase, entered at /login
 *   league code  — 6 CHARACTERS from ABCDEFGHJKLMNPQRSTUVWXYZ23456789,
 *                  given out by a league admin, entered at the join gate
 *
 * Entering one where the other belongs used to dead-end in "double-check the
 * code and try again" — advice that traps you, because the code you are
 * holding is fine, it is just the wrong kind of code. These two functions
 * name the actual mistake.
 *
 * Both are HINTS and never gates. The league charset includes 2-9, so an
 * all-digit league code is possible (8/32)^6 ≈ 1 in 4,096 — rare enough to be
 * worth warning about, common enough that refusing one would lock a real
 * league out of its own app. Callers must show the text and still submit.
 */

/** The league-code alphabet. No I, O, 0 or 1 — they misread aloud and in print. */
export const LEAGUE_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const LEAGUE_CODE_LENGTH = 6
export const SIGN_IN_CODE_LENGTH = 8

/**
 * Someone typing a league code who is really holding their sign-in code.
 * Fires only at full length: below that an all-digit prefix is just a code
 * being typed, and warning mid-entry would nag every legitimate user whose
 * code happens to start with digits.
 */
export function leagueCodeHint(code: string): string | null {
  if (code.length < LEAGUE_CODE_LENGTH) return null
  if (!/^[0-9]+$/.test(code)) return null
  return `That looks like the ${SIGN_IN_CODE_LENGTH}-digit sign-in code from your email — a different code. A league code is ${LEAGUE_CODE_LENGTH} characters from your league admin, usually with letters in it.`
}

/**
 * Someone entering a sign-in code who is really holding their league code.
 * A letter is decisive: the sign-in code is digits only, so one letter means
 * this cannot be it — fire immediately rather than making them finish.
 */
export function signInCodeHint(code: string): string | null {
  if (!/[A-Za-z]/.test(code)) return null
  return `That looks like a league code — a different code. Your sign-in code is the ${SIGN_IN_CODE_LENGTH} digits in the email we just sent.`
}
