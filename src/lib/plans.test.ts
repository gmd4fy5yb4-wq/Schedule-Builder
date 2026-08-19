// Standalone assert-based check (no framework). Run: npx tsx src/lib/plans.test.ts
import assert from 'node:assert'
import { checkLimits, getPlan, minPaidTierForSports, isWritable, saveGate, planDisplayName } from './plans'

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

// live onboarding badge: cheapest paid tier that fits a sport count
assert.equal(minPaidTierForSports(0).tier, 'starter', '0 sports → Starter (min 1)')
assert.equal(minPaidTierForSports(1).tier, 'starter', '1 sport → Starter')
assert.equal(minPaidTierForSports(2).tier, 'pro', '2 sports → Pro')
assert.equal(minPaidTierForSports(3).tier, 'pro', '3 sports → Pro')
assert.equal(minPaidTierForSports(4).tier, 'org', '4 sports → Org')

// isWritable — the write gate. Middleware, /api/leagues/save and /api/leagues/create
// all defer to it, so a wrong answer here either locks out a paying customer or
// hands free edits to a lapsed one.
const future = new Date(Date.now() + 86_400_000).toISOString()
const past   = new Date(Date.now() - 86_400_000).toISOString()

assert.equal(isWritable({ subscription_status: 'active', subscription_end: future }), true, 'active + future end → writable')
assert.equal(isWritable({ subscription_status: 'trialing', subscription_end: future }), true, 'trialing + future end → writable')
assert.equal(isWritable({ subscription_status: 'active', subscription_end: null }), true, 'null end = no expiry (testers)')
assert.equal(isWritable({ subscription_status: 'trialing', subscription_end: null }), true, 'trial whose clock has not started yet')
assert.equal(isWritable({ subscription_status: 'active', subscription_end: past }), false, 'lapsed season pass → read-only')
assert.equal(isWritable({ subscription_status: 'trialing', subscription_end: past }), false, 'burnt-out trial → read-only')
assert.equal(isWritable({ subscription_status: 'canceled', subscription_end: future }), false, 'canceled → read-only even before end date')
assert.equal(isWritable({ subscription_status: 'past_due', subscription_end: future }), false, 'past_due → read-only')
assert.equal(isWritable(null), false, 'no subscription row → read-only, never writable')
assert.equal(isWritable(undefined), false, 'missing row → read-only')
assert.equal(isWritable({}), false, 'empty row → read-only (no status = not active)')

console.log('✓ plans.ts — all checks passed')

// ── saveGate: whose plan governs a write ─────────────────────────────────────
// Regression cover for a real incident (2026-08-19). A tester who bought a
// Starter season pass for his OWN new league was, from that moment, gated by
// Starter limits on a shared test league he neither owns nor pays for — and
// would have lost write access to it entirely when his 90 days SUB_LAPSED.

const OWNER = 'owner-uuid'
const COLLAB = 'collab-uuid'
const SUB_UNLIMITED = { subscription_status: 'active', subscription_end: null,
  sports_limit: 999, divisions_limit: 999, teams_limit: 999 }
const SUB_STARTER = { subscription_status: 'active', subscription_end: '2099-01-01T00:00:00Z',
  sports_limit: 1, divisions_limit: 3, teams_limit: 24 }
const SUB_LAPSED = { subscription_status: 'active', subscription_end: '2020-01-01T00:00:00Z',
  sports_limit: 1, divisions_limit: 3, teams_limit: 24 }
const mkDivs = (n: number, teamsEach = 2) =>
  Array.from({ length: n }, () => ({ teams: Array.from({ length: teamsEach }, () => ({})) }))

// A collaborator on an SUB_UNLIMITED owner's league is governed by the OWNER.
// This is the exact shape of the incident: 4 divisions exceeds the collaborator's
// Starter limit of 3, but the owner is SUB_UNLIMITED, so the save must be allowed.
assert.equal(
  saveGate({ ownerId: OWNER, savingUserId: COLLAB, savingUserSub: SUB_STARTER,
    ownerSub: SUB_UNLIMITED, sportCount: 1, divisions: mkDivs(4) }).allowed,
  true,
  "a collaborator must not be capped by their own plan on someone else's league",
)

// ...and still allowed once the collaborator's own plan has SUB_LAPSED entirely.
assert.equal(
  saveGate({ ownerId: OWNER, savingUserId: COLLAB, savingUserSub: SUB_LAPSED,
    ownerSub: SUB_UNLIMITED, sportCount: 1, divisions: mkDivs(1) }).allowed,
  true,
  "a SUB_LAPSED collaborator keeps write access to a league they do not pay for",
)

// Your OWN league is always gated by YOUR plan — no collaborating around a limit.
const ownTooBig = saveGate({ ownerId: COLLAB, savingUserId: COLLAB, savingUserSub: SUB_STARTER,
  ownerSub: null, sportCount: 1, divisions: mkDivs(4) })
assert.equal(ownTooBig.allowed, false, 'your own league is capped by your own plan')
assert.equal(ownTooBig.limitType, 'divisions')
assert.equal(ownTooBig.blockedBy, 'self')

// An expired OWNER takes their league read-only for everyone — the person paying
// for it has stopped paying.
const ownerLapsed = saveGate({ ownerId: OWNER, savingUserId: COLLAB, savingUserSub: SUB_UNLIMITED,
  ownerSub: SUB_LAPSED, sportCount: 1, divisions: mkDivs(1) })
assert.equal(ownerLapsed.allowed, false, "an owner's SUB_LAPSED plan blocks collaborators too")
assert.equal(ownerLapsed.expired, true)
assert.equal(ownerLapsed.blockedBy, 'owner', 'the message must blame the owner, not the saver')

// Your own expiry still blocks your own league, and is attributed to you.
const selfLapsed = saveGate({ ownerId: COLLAB, savingUserId: COLLAB, savingUserSub: SUB_LAPSED,
  ownerSub: null, sportCount: 1, divisions: mkDivs(1) })
assert.equal(selfLapsed.allowed, false)
assert.equal(selfLapsed.blockedBy, 'self')

// The sports gate is the headline quota and applies only to a league you own.
assert.equal(
  saveGate({ ownerId: COLLAB, savingUserId: COLLAB, savingUserSub: SUB_STARTER,
    ownerSub: null, sportCount: 3, divisions: mkDivs(1) }).limitType,
  'sports',
  'multi-sport on your own league is gated by your sports limit',
)
assert.equal(
  saveGate({ ownerId: OWNER, savingUserId: COLLAB, savingUserSub: SUB_STARTER,
    ownerSub: SUB_UNLIMITED, sportCount: 3, divisions: mkDivs(1) }).allowed,
  true,
  "a collaborator does not spend their sports quota on someone else's league",
)

// An unclaimed legacy league (no owner_id, predates migration 001) behaves as
// the saver's own — unchanged from before.
assert.equal(
  saveGate({ ownerId: null, savingUserId: COLLAB, savingUserSub: SUB_STARTER,
    ownerSub: null, sportCount: 1, divisions: mkDivs(4) }).allowed,
  false,
  'an unclaimed league is treated as your own',
)

// A missing owner row falls back to the saver's plan rather than denying — a
// missing row is an anomaly and must not break collaboration outright.
assert.equal(
  saveGate({ ownerId: OWNER, savingUserId: COLLAB, savingUserSub: SUB_UNLIMITED,
    ownerSub: null, sportCount: 1, divisions: mkDivs(9) }).allowed,
  true,
  'a missing owner row falls back to the saver, preserving prior behaviour',
)

// planDisplayName: the DB carries tiers PLANS does not sell. Routing those through
// getPlan() labelled a 999-limit tester and a lapsed paying customer "Free Trial",
// because getPlan falls back to PLANS[0] and PLANS[0].name is a truthy string — so
// the `?? tier` guard that was supposed to catch this could never fire.
assert.equal(planDisplayName('starter'), 'Starter', 'a sold tier keeps its plan name')
assert.equal(planDisplayName('trial'), 'Free Trial', 'trial still reads Free Trial')
assert.equal(planDisplayName('unlimited'), 'Unlimited', 'tester rows are not Free Trial')
assert.equal(planDisplayName('small'), 'Small', 'legacy paid tier is not Free Trial')
assert.equal(planDisplayName(null), 'Free Trial', 'no row at all falls back to trial')
assert.equal(planDisplayName(undefined), 'Free Trial', 'undefined tier falls back to trial')
assert.notEqual(getPlan('unlimited' as never).name, 'Unlimited',
  'getPlan still cannot name an unsold tier — which is why planDisplayName exists')

console.log('plans.test.ts OK')
