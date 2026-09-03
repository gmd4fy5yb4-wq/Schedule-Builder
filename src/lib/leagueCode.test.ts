// Standalone assert-based check (no framework). Run: npx tsx src/lib/leagueCode.test.ts
import assert from 'node:assert'
import { generateLeagueCode } from './leagueCode'
import { LEAGUE_CODE_CHARS, LEAGUE_CODE_LENGTH } from './codeHints'

// Shape. Every production code in CLAUDE.md is 6 chars from this alphabet, and
// the join gate's maxLength is 6 — a generator that drifts from either mints
// codes the app itself will not accept.
for (let i = 0; i < 500; i++) {
  const code = generateLeagueCode()
  assert.equal(code.length, LEAGUE_CODE_LENGTH, `wrong length: ${code}`)
  assert.ok([...code].every(c => LEAGUE_CODE_CHARS.includes(c)), `off-alphabet: ${code}`)
  // The alphabet omits these on purpose — they misread aloud and in print, and
  // this code gets read out at a coaches' meeting.
  assert.ok(!/[IO01]/.test(code), `ambiguous character in ${code}`)
}

// Unbiased. 256 % 32 === 0 is what makes the plain byte mask safe; if the
// alphabet ever grows to a length that does not divide 256, the mask silently
// starts favouring early characters and this assertion is the warning.
assert.equal(256 % LEAGUE_CODE_CHARS.length, 0,
  'alphabet no longer divides 256 — the byte mask in generateLeagueCode is now biased')

// Every character must actually be reachable, or the real keyspace is smaller
// than the 32^6 the security argument assumes.
const seen = new Set<string>()
for (let i = 0; i < 20_000; i++) for (const c of generateLeagueCode()) seen.add(c)
assert.equal(seen.size, LEAGUE_CODE_CHARS.length,
  `only ${seen.size}/${LEAGUE_CODE_CHARS.length} characters reachable`)

// No repeats across a realistic batch. Not a strong randomness test — it is a
// smoke alarm for a generator accidentally seeded per-call or returning a
// constant, which would make every new league collide with the last.
const batch = new Set(Array.from({ length: 5000 }, generateLeagueCode))
assert.ok(batch.size > 4990, `${5000 - batch.size} collisions in 5000 codes`)

console.log('leagueCode.test.ts: all assertions passed')
