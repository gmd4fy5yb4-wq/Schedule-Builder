import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { getSupabaseServiceRole } from '@/lib/supabase-server'
import { PLANS, type PlanTier } from '@/lib/plans'
import type Stripe from 'stripe'

// Stripe requires the raw body for signature verification
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  if (!stripe) {
    // Return 200 so Stripe doesn't retry — log internally
    console.error('[webhook] Stripe not configured')
    return NextResponse.json({ received: true })
  }

  const sig = req.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!sig || !webhookSecret) {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 })
  }

  const rawBody = await req.text()
  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 })
  }

  const supabase = getSupabaseServiceRole()

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const userId = session.client_reference_id
      const customerId = session.customer as string
      const subscriptionId = session.subscription as string

      if (!userId || !subscriptionId) break

      const sub = await stripe.subscriptions.retrieve(subscriptionId)
      const firstItem = sub.items.data[0]
      const priceId = firstItem?.price.id
      const plan = PLANS.find(p => p.stripePriceId === priceId)
      const tier = (plan?.tier ?? 'small') as PlanTier

      // In Stripe basil API, current_period_end is on each item
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const periodEnd: number = (firstItem as any)?.current_period_end ?? sub.billing_cycle_anchor

      await supabase.from('user_subscriptions').upsert({
        user_id: userId,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        plan_tier: tier,
        subscription_status: 'active',
        subscription_end: new Date(periodEnd * 1000).toISOString(),
        leagues_limit: plan?.leaguesLimit ?? 1,
        divisions_limit: plan?.divisionsLimit ?? 4,
        teams_limit: plan?.teamsLimit ?? 16,
        updated_at: new Date().toISOString(),
      })
      break
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const subscriptionId = sub.id

      // Match by subscription ID — more precise than customer ID alone
      const { data: existing } = await supabase
        .from('user_subscriptions')
        .select('user_id')
        .eq('stripe_subscription_id', subscriptionId)
        .single()

      if (existing) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const periodEnd: number = (sub.items.data[0] as any)?.current_period_end
          ?? (sub as any).current_period_end
          ?? sub.billing_cycle_anchor

        await supabase
          .from('user_subscriptions')
          .update({
            subscription_status: sub.status,
            subscription_end: new Date(periodEnd * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', existing.user_id)
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}
