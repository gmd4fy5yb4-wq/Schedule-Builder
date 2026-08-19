import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { stripe } from '@/lib/stripe'
import { PLANS } from '@/lib/plans'
import { getSupabaseServer, getSupabaseServiceRole } from '@/lib/supabase-server'
import { isProspectCardBundleEligible } from '@/lib/bundle'
import { checkoutCustomerFields, paymentModeOnlyFields } from '@/lib/checkout'
import { siteUrl } from '@/lib/siteUrl'

const schema = z.object({
  tier: z.enum(['starter', 'pro', 'org']),
  billingPeriod: z.enum(['annual', 'season_3mo']).default('annual'),
})

export async function POST(req: NextRequest) {
  if (!stripe) {
    return NextResponse.json({ error: 'Payments are not configured.' }, { status: 503 })
  }

  const supabase = await getSupabaseServer()
  // getUser() revalidates the JWT with Supabase Auth; getSession() only reads
  // the cookie and must not be trusted for authorization.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  }

  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid tier.' }, { status: 422 })
  }

  const plan = PLANS.find(p => p.tier === parsed.data.tier)
  const isSeason = parsed.data.billingPeriod === 'season_3mo'
  const priceId = isSeason ? plan?.stripePriceIdSeason : plan?.stripePriceIdAnnual
  if (!priceId) {
    return NextResponse.json({ error: 'Plan not configured.' }, { status: 404 })
  }

  const baseUrl = siteUrl()

  // Alfred Sports Bundle: 20% off if this user has a paying Prospect Card
  // subscription. Best-effort — any failure here must never block checkout.
  let bundleEligible = false
  // Reuse this buyer's existing Stripe customer if they have one, so an annual
  // subscriber who later buys a season pass stays a single customer in Stripe
  // rather than accumulating a second record.
  let existingCustomerId: string | null = null
  try {
    const svc = getSupabaseServiceRole()
    // pc_subscriptions' Stripe-cache column is `subscription_status`
    // (see softball-recruiter/src/db/migrations/014_pc_subscriptions.sql).
    const [{ data: pcSub }, { data: fdSub }] = await Promise.all([
      svc.from('pc_subscriptions').select('subscription_status').eq('user_id', user.id).maybeSingle(),
      svc.from('user_subscriptions').select('stripe_customer_id').eq('user_id', user.id).maybeSingle(),
    ])
    bundleEligible = isProspectCardBundleEligible(
      pcSub ? { status: pcSub.subscription_status } : null
    )
    existingCustomerId = fdSub?.stripe_customer_id ?? null
  } catch (err) {
    console.error('[create-session] bundle/customer lookup failed (continuing):', err)
  }

  try {
    const checkoutSession = await stripe.checkout.sessions.create({
      // Season pass = one-time payment (no auto-renew); annual = recurring subscription.
      mode: isSeason ? 'payment' : 'subscription',
      payment_method_types: ['card'],
      // Stripe takes EITHER an existing customer OR customer_email, and
      // customer_creation is only valid for mode:'payment' — where it must be
      // 'always', or a one-time season pass creates no Customer at all and the
      // webhook writes stripe_customer_id NULL. See src/lib/checkout.ts.
      ...checkoutCustomerFields({
        existingCustomerId,
        email: user.email,
        isOneTimePayment: isSeason,
      }),
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      // metadata.tier and invoice_creation are BOTH payment-mode only; Stripe
      // rejects either on a subscription session. See src/lib/checkout.ts.
      ...paymentModeOnlyFields({ isOneTimePayment: isSeason, tier: parsed.data.tier }),
      ...(bundleEligible ? { discounts: [{ coupon: 'bundle20' }] } : {}),
      // Land on a subscription-exempt page that polls until the webhook writes the
      // row, then forwards into the app — avoids the race that bounced paid users to /pricing.
      success_url: `${baseUrl}/checkout/success`,
      cancel_url: `${baseUrl}/pricing?checkout=cancelled`,
    })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (err) {
    // Surface the real Stripe failure instead of letting the route 500 with an
    // HTML page (which the client misreports as a generic "network error").
    console.error('[create-session] Stripe checkout creation failed:', err)
    const message = err instanceof Error ? err.message : 'Unknown Stripe error.'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
