// Standalone assert-based check (no framework, matches plans.test.ts convention).
// Run: npx tsx src/lib/bundle.test.ts
import assert from 'node:assert'
import { isProspectCardBundleEligible } from './bundle'

assert.equal(isProspectCardBundleEligible(null), false, 'no pc_subscriptions row → not eligible')
assert.equal(isProspectCardBundleEligible({ status: 'active' }), true, "status 'active' → eligible")
assert.equal(isProspectCardBundleEligible({ status: 'past_due' }), true, "status 'past_due' → eligible")
assert.equal(isProspectCardBundleEligible({ status: 'canceled' }), false, "status 'canceled' → not eligible")
assert.equal(isProspectCardBundleEligible({ status: 'incomplete' }), false, "status 'incomplete' → not eligible")
assert.equal(isProspectCardBundleEligible({ status: null }), false, 'null status → not eligible')

console.log('✓ bundle.ts — all checks passed')
