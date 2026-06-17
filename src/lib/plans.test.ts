// Standalone assert-based check (no framework). Run: npx tsx src/lib/plans.test.ts
import assert from 'node:assert'
import { checkLimits, getPlan } from './plans'

const div = (teams = 0) => ({ teams: Array(teams).fill(0) })
const starter = getPlan('starter')   // sports 1, divisions 3, teams 24
const pro = getPlan('pro')            // sports 3, divisions 10, teams 100

// headline gate: sports
assert.equal(checkLimits(starter, 2, []).limitType, 'sports', '2 sports on Starter → blocked')
assert.equal(checkLimits(pro, 3, [div()]).allowed, true, '3 sports on Pro → ok')

// guard: divisions
assert.equal(checkLimits(starter, 1, [div(), div(), div(), div()]).limitType, 'divisions', '4 divisions on Starter → blocked')

// guard: teams (mega-division abuse — 3 divisions of 9 = 27 > 24)
assert.equal(checkLimits(starter, 1, [div(9), div(9), div(9)]).limitType, 'teams', '27 teams on Starter → blocked')

// happy path: 1 sport / 3 divisions / 24 teams exactly → ok
assert.equal(checkLimits(starter, 1, [div(8), div(8), div(8)]).allowed, true, 'at-limit Starter → ok')

// boundaries
assert.equal(getPlan('org').sportsLimit, 999)
assert.equal(getPlan('trial').divisionsLimit, getPlan('pro').divisionsLimit, 'trial mirrors Pro limits')
assert.equal(getPlan('bogus' as never).tier, 'trial', 'unknown tier falls back to first plan')

console.log('✓ plans.ts — all checks passed')
