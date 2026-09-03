/**
 * Authenticated API routes that run their own, more precise write gate, and so
 * must be exempt from the blanket self-plan expiry check in middleware.ts.
 *
 * Middleware only ever sees the requesting user's own user_subscriptions row.
 * It does not know which league a request is for, so it cannot apply the rule
 * that actually governs these writes — a league is gated by its OWNER's plan
 * (saveGate in plans.ts), because the owner is who pays for it.
 *
 * Leaving /api/leagues/save under the generic gate meant a collaborator whose
 * personal plan had lapsed was 403'd in middleware before saveGate ever ran, so
 * the owner-gating rule was unreachable in production for exactly the users it
 * was written for.
 *
 * This list is NOT a public-route list. These paths still require a logged-in
 * user; they just answer the entitlement question themselves.
 */
export const OWNER_GATED_MUTATIONS = [
  // saveGate() weighs the write against the league OWNER's plan.
  '/api/leagues/save',
  // Owner-only, and a security action: rotating the code is how you remove
  // someone's edit access. Paywalling that would hold a lockout hostage to a
  // renewal, and a lapsed owner is precisely who needs it.
  '/api/leagues/rotate-code',
] as const

export function isOwnerGatedMutation(pathname: string): boolean {
  return OWNER_GATED_MUTATIONS.some(p => pathname === p || pathname.startsWith(p + '/'))
}
