import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { getSupabaseServiceRole } from '@/lib/supabase-server'
import {
  seasonPassRow, subscriptionRow, cancellationUpdate, renewalUpdate, resolvePeriodEnd,
} from '@/lib/subscriptionRow'
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
      const customerId = session.customer as string | null

      if (!userId) break

      // One-time season pass (Checkout mode: 'payment') — no subscription object.
      // Grant 90 days, then it simply lapses (no auto-renew, no subscription.* events).
      if (session.mode === 'payment') {
        const result = seasonPassRow({
          userId,
          customerId,
          tier: session.metadata?.tier,
          now: new Date(),
        })
        if (result.kind !== 'row') {
          // Refuse rather than write. The old code defaulted an unknown tier to
          // starter, which silently provisioned a paying customer with the
          // smallest plan. Leaving the row untouched keeps whatever access they
          // already had until this is looked at.
          console.error('[webhook] season pass with unrecognised tier — row NOT written', {
            userId, tier: session.metadata?.tier, sessionId: session.id,
          })
          break
        }
        await supabase.from('user_subscriptions').upsert(result.row)
        break
      }

      const subscriptionId = session.subscription as string
      if (!subscriptionId) break

      const sub = await stripe.subscriptions.retrieve(subscriptionId)
      const firstItem = sub.items.data[0]
      // In Stripe basil API, current_period_end moved onto each item.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const periodEnd = resolvePeriodEnd((firstItem as any)?.current_period_end, undefined, sub.billing_cycle_anchor)

      const result = subscriptionRow({
        userId,
        customerId,
        subscriptionId,
        priceId: firstItem?.price.id,
        periodEnd,
        now: new Date(),
      })
      if (result.kind !== 'row') {
        // A price id this deployment does not know — almost always a missing or
        // wrong-mode STRIPE_PRICE_* env var. The old code fell back to starter
        // limits, so an Org customer paid in full and was provisioned as Starter
        // with nothing logged. Refuse and shout instead.
        console.error('[webhook] paid checkout with unrecognised price — row NOT written', {
          userId, priceId: firstItem?.price.id, subscriptionId,
        })
        break
      }
      await supabase.from('user_subscriptions').upsert(result.row)
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
        // Stripe's basil types moved current_period_end onto the item; the cast is
        // unavoidable. Kept on ONE line so the single disable below covers BOTH
        // casts — a disable comment only applies to the line right after it, so a
        // wrapped expression would leave the second cast unsuppressed.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anySub = sub as any
        const periodEnd = resolvePeriodEnd(
          anySub.items?.data?.[0]?.current_period_end,
          anySub.current_period_end,
          sub.billing_cycle_anchor,
        )

        const now = new Date()
        // deleted -> revert to trial tier and limits so stale elevated
        // entitlements don't linger. updated -> keep tier/limits untouched and
        // only sync status + period end; a renewal must never re-derive
        // entitlements. Both shapes are unit-tested in subscriptionRow.test.ts.
        const patch = event.type === 'customer.subscription.deleted'
          ? cancellationUpdate({ status: sub.status, periodEnd, now })
          : renewalUpdate({ status: sub.status, periodEnd, now })

        await supabase
          .from('user_subscriptions')
          .update(patch)
          .eq('user_id', existing.user_id)
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}
