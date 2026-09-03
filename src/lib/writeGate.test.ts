// Standalone assert-based check (no framework). Run: npx tsx src/lib/writeGate.test.ts
import assert from 'node:assert'
import { isOwnerGatedMutation, OWNER_GATED_MUTATIONS } from './writeGate'

// THE ONE THAT MATTERS. /api/leagues/save must be exempt from middleware's
// self-plan expiry check, or saveGate()'s owner-gating rule is dead code in
// production: middleware 403s the collaborator first. That is the bug reported
// 2026-09-03 (achic107@gmail.com locked out of YWWM8G, owned by an unlimited
// account). If this assertion is ever removed, the bug is back.
assert.ok(isOwnerGatedMutation('/api/leagues/save'))

// Rotating the code is how an owner removes someone's access. It must not be
// gated on a live plan — a lapsed owner is exactly who needs to lock someone out.
assert.ok(isOwnerGatedMutation('/api/leagues/rotate-code'))

// Everything else keeps the generic gate. /api/leagues/create in particular:
// a new league is always your OWN, so your own plan is the correct rule and
// exempting it would let a lapsed user create unlimited leagues.
assert.equal(isOwnerGatedMutation('/api/leagues/create'), false)
assert.equal(isOwnerGatedMutation('/api/leagues/claim'), false)
assert.equal(isOwnerGatedMutation('/api/notify-coaches'), false)
assert.equal(isOwnerGatedMutation('/api/league/share-token'), false)
assert.equal(isOwnerGatedMutation('/'), false)

// Prefix matching must stop at a path segment. A startsWith() check would have
// exempted anything merely beginning with an exempt path — /api/leagues/saveXYZ
// is a different route and gets no free pass.
assert.equal(isOwnerGatedMutation('/api/leagues/saveXYZ'), false)
assert.equal(isOwnerGatedMutation('/api/leagues/save-everything'), false)
assert.ok(isOwnerGatedMutation('/api/leagues/save/'))

// This list is not a public-route list; nothing here may bypass authentication.
// Middleware applies it AFTER the getUser() check — see middleware.ts.
for (const p of OWNER_GATED_MUTATIONS) {
  assert.ok(p.startsWith('/api/'), `${p} is not an API route`)
}

console.log('writeGate.test.ts: all assertions passed')
