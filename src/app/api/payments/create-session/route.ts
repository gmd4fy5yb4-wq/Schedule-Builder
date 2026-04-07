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
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
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

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    customer_email: session.user.email,
    client_reference_id: session.user.id,
    line_items: [{ price: plan.stripePriceId, quantity: 1 }],
    success_url: `${baseUrl}/?checkout=success`,
    cancel_url: `${baseUrl}/pricing?checkout=cancelled`,
  })

  return NextResponse.json({ url: checkoutSession.url })
}
