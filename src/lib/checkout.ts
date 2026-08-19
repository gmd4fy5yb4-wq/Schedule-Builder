/**
 * Pure decisions for building a Stripe Checkout Session.
 *
 * React-free and I/O-free so it runs under `npx tsx`, like the rest of src/lib.
 */

/**
 * Stripe accepts EITHER an existing `customer` OR `customer_email` — never both.
 * `customer_creation` is valid only for mode:'payment'; subscription mode always
 * creates a Customer and rejects the field.
 */
export type CheckoutCustomerFields =
  | { customer: string }
  | { customer_email?: string; customer_creation?: 'always' }

/**
 * Which customer fields belong on a Checkout Session.
 *
 * The gap this closes: for mode:'payment' Stripe defaults `customer_creation` to
 * 'if_required', so a one-time season pass created NO Customer object at all. The
 * webhook then wrote `stripe_customer_id: null`, which means /api/payments/portal
 * answers 404 "No billing account found" for that customer and the row cannot be
 * traced back to Stripe for a receipt or a refund. Subscription checkouts were
 * unaffected because Stripe always creates a Customer for them — which is exactly
 * why the first season-pass sale (2026-08-19) exposed it and the earlier annual
 * ones did not.
 *
 * An existing customer is reused rather than duplicated: a buyer who takes an
 * annual plan and later a season pass should be one Customer in Stripe, not two.
 *
 * Tradeoff accepted: if a stored `stripe_customer_id` ever points at a customer
 * deleted in Stripe, session creation 400s and the buyer sees the checkout error
 * the route already surfaces (502 with Stripe's own message). That is loud and
 * rare — Stripe customers are effectively never deleted, and the id only reaches
 * the DB from a real session — and the alternative, verifying the customer on
 * every checkout, is a round trip on the hot path to guard a case that has never
 * happened.
 */
export function checkoutCustomerFields(input: {
  existingCustomerId: string | null | undefined
  email: string | null | undefined
  isOneTimePayment: boolean
}): CheckoutCustomerFields {
  if (input.existingCustomerId) return { customer: input.existingCustomerId }

  const fields: { customer_email?: string; customer_creation?: 'always' } = {}
  if (input.email) fields.customer_email = input.email
  if (input.isOneTimePayment) fields.customer_creation = 'always'
  return fields
}
