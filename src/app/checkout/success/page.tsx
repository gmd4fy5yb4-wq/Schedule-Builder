'use client'
import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'

// Stripe redirects here after checkout. The webhook that writes user_subscriptions
// races the browser redirect, so we poll the row until it's active, then forward
// into the app. Gating this page would re-introduce the bounce it exists to fix.
export default function CheckoutSuccessPage() {
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    const sb = getSupabase()
    let cancelled = false
    let tries = 0

    async function poll() {
      if (cancelled) return
      const { data: { session } } = await sb.auth.getSession()
      if (!session) { window.location.replace('/login'); return }

      const { data: sub } = await sb
        .from('user_subscriptions')
        .select('subscription_status, subscription_end')
        .eq('user_id', session.user.id)
        .single()

      const notExpired = !sub?.subscription_end || new Date(sub.subscription_end) > new Date()
      const active =
        notExpired &&
        (sub?.subscription_status === 'active' || sub?.subscription_status === 'trialing')

      if (active) { window.location.replace('/'); return }
      if (++tries >= 12) { setTimedOut(true); return }   // ~6s of polling
      setTimeout(poll, 500)
    }

    poll()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
        {!timedOut ? (
          <>
            <div className="text-4xl mb-3">🎉</div>
            <h1 className="text-lg font-semibold text-gray-900 mb-1">Payment received</h1>
            <p className="text-gray-500 text-sm">Setting up your subscription…</p>
          </>
        ) : (
          <>
            <div className="text-4xl mb-3">✅</div>
            <h1 className="text-lg font-semibold text-gray-900 mb-1">Payment received</h1>
            <p className="text-gray-500 text-sm mb-5">
              We&apos;re finalizing your subscription — this can take a few seconds.
            </p>
            <a
              href="/"
              className="inline-block w-full py-2.5 px-4 rounded-lg bg-[#00013a] text-white text-sm font-semibold hover:bg-[#000128] transition-colors"
            >
              Continue to app
            </a>
          </>
        )}
      </div>
    </div>
  )
}
