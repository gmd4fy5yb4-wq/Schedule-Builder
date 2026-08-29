// Standalone assert-based check (no framework). Run: npx tsx src/lib/codeHints.test.ts
import assert from 'node:assert'
import { leagueCodeHint, signInCodeHint, LEAGUE_CODE_CHARS, LEAGUE_CODE_LENGTH } from './codeHints'

// ── leagueCodeHint ──────────────────────────────────────────────────────────

// The mistake it exists for: an 8-digit sign-in code pasted into the league
// field, where maxLength has already clipped it to 6 digits.
assert.ok(leagueCodeHint('84019273'.slice(0, 6)), 'clipped sign-in code should hint')
assert.match(leagueCodeHint('123456')!, /sign-in code/)

// Real league codes must never be hinted at.
for (const code of ['YWWM8G', 'UC2YE8', 'JF9ZDS', 'D7USBR', 'NRAMGV', 'ZKP833']) {
  assert.equal(leagueCodeHint(code), null, `${code} is a real production league code`)
}

// Silent until the field is full — a code being typed is not a mistake yet.
assert.equal(leagueCodeHint(''), null)
assert.equal(leagueCodeHint('8'), null)
assert.equal(leagueCodeHint('84019'), null)

// THE ONE THAT MATTERS: an all-digit league code is legal (charset has 2-9),
// so the hint may fire on one — but it must stay a hint. Nothing here blocks,
// and the caller is required to submit anyway. If this test ever grows an
// assertion that a valid code is REJECTED, the feature has become a bug.
const allDigitLeagueCode = '234567'
assert.ok([...allDigitLeagueCode].every(c => LEAGUE_CODE_CHARS.includes(c)), 'is a codegen-reachable code')
assert.equal(allDigitLeagueCode.length, LEAGUE_CODE_LENGTH)
assert.ok(leagueCodeHint(allDigitLeagueCode), 'may warn about it')

// ── signInCodeHint ──────────────────────────────────────────────────────────

// A single letter is decisive — the sign-in code is digits only.
assert.ok(signInCodeHint('Y'), 'one letter is enough to know')
assert.match(signInCodeHint('YWWM8G')!, /league code/)
assert.ok(signInCodeHint('ywwm8g'), 'lowercase too — the join field uppercases, this one does not')

// Digits are what belongs here, at any length.
assert.equal(signInCodeHint(''), null)
assert.equal(signInCodeHint('8'), null)
assert.equal(signInCodeHint('84019273'), null)

console.log('codeHints: all assertions passed')
