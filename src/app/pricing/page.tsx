'use client'
import { useState } from 'react'
import { PLANS } from '@/lib/plans'

export default function PricingPage() {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function handleSubscribe(tier: 'starter' | 'pro' | 'org', billingPeriod: 'annual' | 'season_3mo' = 'annual') {
    setLoading(tier + billingPeriod)
    setError('')
    try {
      const res = await fetch('/api/payments/create-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier, billingPeriod }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = '/login'
          return
        }
        setError(data.error ?? 'Something went wrong.')
        setLoading(null)
        return
      }
      window.location.href = data.url
    } catch {
      setError('Network error. Please try again.')
      setLoading(null)
    }
  }

  const paid = PLANS.filter(p => p.tier !== 'trial')

  return (
    <div className="min-h-screen bg-gray-50 py-16 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <a href="/" className="inline-flex items-center gap-2 text-gray-500 text-sm mb-8 hover:text-gray-700">
            ← Back to app
          </a>
          <h1 className="text-4xl font-bold text-gray-900 font-[Oswald] mb-3">Choose your plan</h1>
          <p className="text-gray-500 text-lg">Start with a free trial. Upgrade as your league grows.</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm text-center">
            {error}
          </div>
        )}

        {/* Plan cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-10">
          {paid.map(plan => {
            const isPopular = plan.tier === 'pro'
            return (
              <div
                key={plan.tier}
                className={`relative bg-white rounded-2xl border-2 p-8 flex flex-col ${
                  isPopular ? 'border-[#00013a] shadow-lg' : 'border-gray-200 shadow-sm'
                }`}
              >
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-[#00013a] text-white text-xs font-semibold px-3 py-1 rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <h2 className="text-xl font-bold text-gray-900 font-[Oswald] mb-1">{plan.name}</h2>
                  <div className="flex items-end gap-1 mb-1">
                    <span className="text-4xl font-bold text-gray-900">${plan.annualPriceUsd}</span>
                    <span className="text-gray-400 text-sm mb-1">/year</span>
                  </div>
                  <p className="text-xs text-gray-400 mb-4">or ${plan.seasonPassPriceUsd} for a 3-month season pass</p>

                  <ul className="space-y-2 text-sm text-gray-600">
                    <li className="flex items-center gap-2">
                      <span className="text-green-500">✓</span>
                      {plan.sportsLimit >= 999 ? 'Unlimited sports' : `${plan.sportsLimit} sport${plan.sportsLimit > 1 ? 's' : ''}`}
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-green-500">✓</span>
                      {plan.divisionsLimit >= 999 ? 'Unlimited divisions' : `Up to ${plan.divisionsLimit} divisions`}
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-green-500">✓</span>
                      {plan.teamsLimit >= 999 ? 'Unlimited teams' : `Up to ${plan.teamsLimit} teams`}
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-green-500">✓</span>
                      Shared fields &amp; calendar across all sports
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-green-500">✓</span>
                      Auto-scheduling
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-green-500">✓</span>
                      Read-only share links
                    </li>
                  </ul>
                </div>

                <div className="mt-auto space-y-2">
                  <button
                    onClick={() => handleSubscribe(plan.tier as 'starter' | 'pro' | 'org', 'annual')}
                    disabled={loading !== null}
                    className={`w-full py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${
                      isPopular
                        ? 'bg-[#00013a] text-white hover:bg-[#000128]'
                        : 'bg-gray-900 text-white hover:bg-gray-800'
                    }`}
                  >
                    {loading === plan.tier + 'annual' ? 'Redirecting…' : `Get started — $${plan.annualPriceUsd}/yr`}
                  </button>
                  <button
                    onClick={() => handleSubscribe(plan.tier as 'starter' | 'pro' | 'org', 'season_3mo')}
                    disabled={loading !== null}
                    className="w-full py-2 rounded-xl text-xs font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50"
                  >
                    {loading === plan.tier + 'season_3mo' ? 'Redirecting…' : `or 3-month pass — $${plan.seasonPassPriceUsd}`}
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Free trial note */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 text-center shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-1">Free Trial</h3>
          <p className="text-gray-500 text-sm">
            Sign up and get full Pro access free for 14 days — up to 3 sports and 10 divisions. No credit card required.
          </p>
          <a
            href="/login"
            className="inline-block mt-4 text-sm font-semibold text-[#00013a] underline"
          >
            Start free trial →
          </a>
        </div>

        <p className="text-center text-gray-400 text-xs mt-8">
          Already have an account?{' '}
          <a href="/login" className="underline text-gray-500">Sign in</a>
        </p>
      </div>
    </div>
  )
}
