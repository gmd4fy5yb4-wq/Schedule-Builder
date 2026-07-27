/**
 * Cross-app bundle eligibility (Alfred Sports Bundle — 20% off, "bundle20" coupon).
 *
 * A FieldDay user is bundle-eligible iff they have a Prospect Card subscription
 * (`pc_subscriptions`, shared Sports Supabase) whose Stripe-cache `status` is
 * 'active' or 'past_due'. Beta/promo/testing PC users are NOT paying customers
 * (no Stripe-backed row / no matching status) and must NOT be treated as eligible.
 *
 * `row` is the `pc_subscriptions` row for the authed user (or null if none exists).
 * `accountTier` is accepted for interface parity with the spec's mirrored PC-side
 * helper but is not used in FD's eligibility check — FD only cares about the
 * PC-side Stripe status, not FD's own account_tiers row.
 */
export function isProspectCardBundleEligible(
  row: { status?: string | null } | null,
  accountTier?: { payment_status?: string | null } | null
): boolean {
  void accountTier
  if (!row) return false
  return row.status === 'active' || row.status === 'past_due'
}
