// Standalone assert-based check (no framework, matches plans.test.ts convention).
// Run: npx tsx src/lib/email.test.ts
import assert from 'node:assert'
import { buildEmailHtml } from './email'

// Mail clients show a snippet next to the subject. We send only `html`, so the
// client derives that snippet by stripping tags — and with no whitespace between
// block elements the words collided: the real send on 2026-08-27 previewed as
// "FieldDay Planner2026 FALL SEASONSchedule update for Force (16U) HerreraHi...".
// The preheader gives the client a clean line to use instead.
const html = buildEmailHtml({
  leagueName: '2026 Fall Season',
  teamName: 'Force (16U) Herrera',
  coachName: 'Jonathan Herrera',
  games: [],
  practices: [],
  teamMap: new Map(),
  fieldMap: new Map(),
})

const preheader = html.slice(html.indexOf('<body'), html.indexOf('<table'))

assert.match(preheader, /Upcoming games and practices for Force \(16U\) Herrera in 2026 Fall Season\./,
  'preheader must name the team and league')
assert.match(preheader, /display:none/, 'preheader must not render visibly')
assert.ok(preheader.includes('&zwnj;&nbsp;'.repeat(10)),
  'preheader needs the padding run, or the scraped body bleeds into the snippet')

// It has to come before the visible header, or the client scrapes that first.
assert.ok(html.indexOf('Upcoming games and practices') < html.indexOf('FieldDay Planner'),
  'preheader must precede the branded header')

console.log('email.test.ts — 4 assertions passed')
