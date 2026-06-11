import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { stripe } from '@/lib/stripe'
import { PLANS } from '@/lib/plans'
import { getSupabaseServer } from '@/lib/supabase-server'

const schema = z.object({
  tier: z.enum(['small', 'medium', 'large']),
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
  if (!plan?.stripePriceId) {
    return NextResponse.json({ error: 'Plan not configured.' }, { status: 404 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

  try {
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: user.email,
      client_reference_id: user.id,
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      success_url: `${baseUrl}/?checkout=success`,
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
