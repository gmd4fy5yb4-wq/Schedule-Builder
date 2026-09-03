import { LEAGUE_CODE_CHARS, LEAGUE_CODE_LENGTH } from './codeHints'

/**
 * Mint a league code.
 *
 * The alphabet and length live in codeHints.ts, which is the file that already
 * had to be right about them; this was the third and fourth copy of the same
 * two literals (api/leagues/create, sync.ts).
 *
 * CSPRNG, not Math.random(). The league code IS the write credential — anyone
 * holding it can edit the league (see "League ownership vs. access" in
 * CLAUDE.md) — and rotation exists specifically to lock a named person out. A
 * V8-seeded PRNG leaks its internal state to anyone who has seen enough of its
 * output, and the person you are rotating away from is holding a previous
 * code. 256 % 32 === 0, so masking bytes into a 32-character alphabet is
 * unbiased and needs no rejection loop.
 */
export function generateLeagueCode(): string {
  const bytes = new Uint8Array(LEAGUE_CODE_LENGTH)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => LEAGUE_CODE_CHARS[b % LEAGUE_CODE_CHARS.length]).join('')
}
