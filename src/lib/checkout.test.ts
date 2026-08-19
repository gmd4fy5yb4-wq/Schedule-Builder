// Standalone assert-based check (no framework). Run: npx tsx src/lib/checkout.test.ts
import assert from 'node:assert'
import { checkoutCustomerFields, paymentModeOnlyFields } from './checkout'

// ── The gap this closes ──────────────────────────────────────────────────────
// A one-time season pass must force Customer creation. Without it Stripe
// defaults customer_creation to 'if_required', creates nothing, and the webhook
// writes stripe_customer_id NULL — which 404s the billing portal and leaves the
// row untraceable in Stripe. This is what happened to the first real sale.
const seasonPass = checkoutCustomerFields({
  existingCustomerId: null, email: 'coach@example.com', isOneTimePayment: true,
})
assert.deepEqual(seasonPass, { customer_email: 'coach@example.com', customer_creation: 'always' })

// ── Subscription mode must NOT send customer_creation ────────────────────────
// Stripe rejects the field outside mode:'payment', and a rejected session means
// the checkout button dies — a worse failure than the one being fixed.
const annual = checkoutCustomerFields({
  existingCustomerId: null, email: 'coach@example.com', isOneTimePayment: false,
})
assert.deepEqual(annual, { customer_email: 'coach@example.com' })
assert.ok(!('customer_creation' in annual), 'customer_creation is invalid in subscription mode')

// ── An existing customer is reused, never duplicated ─────────────────────────
// Someone who buys annual and later a season pass should be ONE Stripe customer.
for (const oneTime of [true, false]) {
  const reuse = checkoutCustomerFields({
    existingCustomerId: 'cus_existing123', email: 'coach@example.com', isOneTimePayment: oneTime,
  })
  assert.deepEqual(reuse, { customer: 'cus_existing123' }, `reuses the customer (oneTime=${oneTime})`)
  // Stripe accepts EITHER customer OR customer_email — sending both is a 400,
  // which would take the checkout button down entirely.
  assert.ok(!('customer_email' in reuse), 'must never send customer and customer_email together')
  assert.ok(!('customer_creation' in reuse), 'customer_creation is meaningless with an explicit customer')
}

// ── Degenerate inputs ────────────────────────────────────────────────────────
// A Supabase user without an email is possible; omit the key rather than send
// undefined, which Stripe rejects as an invalid string.
assert.deepEqual(
  checkoutCustomerFields({ existingCustomerId: null, email: null, isOneTimePayment: true }),
  { customer_creation: 'always' },
)
assert.deepEqual(
  checkoutCustomerFields({ existingCustomerId: undefined, email: undefined, isOneTimePayment: false }),
  {},
)
// An empty-string customer id is not a customer.
assert.deepEqual(
  checkoutCustomerFields({ existingCustomerId: '', email: 'a@b.co', isOneTimePayment: true }),
  { customer_email: 'a@b.co', customer_creation: 'always' },
)

console.log('checkout.test.ts: all assertions passed')

// ── Fields that are valid ONLY in mode:'payment' ─────────────────────────────
// Stripe rejects these on a subscription session, and a rejected session takes
// the checkout button down — strictly worse than the receipt/customer gaps they
// close. This is the assertion that keeps them behind the guard.
const seasonFields = paymentModeOnlyFields({ isOneTimePayment: true, tier: 'pro' })
assert.deepEqual(seasonFields, {
  metadata: { tier: 'pro', billingPeriod: 'season_3mo' },
  invoice_creation: { enabled: true },
})

const annualFields = paymentModeOnlyFields({ isOneTimePayment: false, tier: 'pro' })
assert.deepEqual(annualFields, {}, 'a subscription session gets none of them')
assert.ok(!('invoice_creation' in annualFields), 'invoice_creation is invalid in subscription mode')
assert.ok(!('metadata' in annualFields), 'subscription mode reads the tier from the price, not metadata')

// The tier must survive verbatim: subscriptionRow.seasonPassRow() looks it up in
// PLANS and refuses the write if it does not match, so a mangled value here
// blocks a paid checkout from provisioning at all.
for (const tier of ['starter', 'pro', 'org']) {
  const f = paymentModeOnlyFields({ isOneTimePayment: true, tier }) as { metadata: { tier: string } }
  assert.equal(f.metadata.tier, tier, `${tier} passes through unchanged`)
}
