'use client'
import { useState } from 'react'
import { PLANS } from '@/lib/plans'

export default function PricingPage() {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function handleSubscribe(tier: 'small' | 'medium' | 'large') {
    setLoading(tier)
    setError('')
    try {
      const res = await fetch('/api/payments/create-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
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
            const isPopular = plan.tier === 'medium'
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
                  <div className="flex items-end gap-1 mb-4">
                    <span className="text-4xl font-bold text-gray-900">${plan.monthlyPriceUsd}</span>
                    <span className="text-gray-400 text-sm mb-1">/month</span>
                  </div>

                  <ul className="space-y-2 text-sm text-gray-600">
                    <li className="flex items-center gap-2">
                      <span className="text-green-500">✓</span>
                      {plan.leaguesLimit >= 999 ? 'Unlimited leagues' : `${plan.leaguesLimit} league${plan.leaguesLimit > 1 ? 's' : ''}`}
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
                      All sports supported
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

                <div className="mt-auto">
                  <button
                    onClick={() => handleSubscribe(plan.tier as 'small' | 'medium' | 'large')}
                    disabled={loading !== null}
                    className={`w-full py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${
                      isPopular
                        ? 'bg-[#00013a] text-white hover:bg-[#000128]'
                        : 'bg-gray-900 text-white hover:bg-gray-800'
                    }`}
                  >
                    {loading === plan.tier ? 'Redirecting…' : 'Get started'}
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
            Sign up and get immediate access: 1 league, up to 2 divisions, up to 8 teams. No credit card required.
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
