'use client'
import { useState } from 'react'
import Link from 'next/link'
import { PLANS, minPaidTierForSports } from '@/lib/plans'

const INK = '#00013a'
const CRIMSON = '#cd163f'   // white on this is 5.56:1 — AA for the CTA text

// Shared across every tier, so it says nothing about which plan to buy. Listed
// once below the cards instead of three times inside them (finding 18: three
// identical feature lists made three different products look like one).
const EVERY_PLAN_INCLUDES = [
  'Auto-scheduling with conflict detection',
  'Read-only share links for coaches & parents',
  'Standings, results & coach notifications',
  'Per-field weather on the dashboard',
  'CSV roster import',
  'Snapshots, undo & auto-backup',
  'Real-time sync across devices',
  '6 color themes',
]

const OBJECTIONS = [
  {
    q: 'What happens after the trial?',
    a: 'Your league goes view-only — nothing is deleted, share links keep working. Pick a plan anytime to resume editing, even next season.',
  },
  {
    q: 'Only run one season a year?',
    a: 'The 3-month season pass is a one-time payment — no auto-renew, no cancellation dance. Come back next spring and pick up your league where it stands.',
  },
  {
    q: 'Do coaches & parents need accounts?',
    a: 'No. One share link shows the live schedule, standings and field maps on any phone. Only the admin signs in.',
  },
]

function limitLine(n: number, singular: string, plural: string) {
  return n >= 999 ? `Unlimited ${plural}` : `${n} ${n === 1 ? singular : plural}`
}

export default function PricingPage() {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [billing, setBilling] = useState<'annual' | 'season_3mo'>('annual')
  // The whole fit-finder: one number. minPaidTierForSports already answers the
  // question — this page just asks it.
  const [sportCount, setSportCount] = useState(1)

  async function handleSubscribe(tier: 'starter' | 'pro' | 'org') {
    setLoading(tier + billing)
    setError('')
    try {
      const res = await fetch('/api/payments/create-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier, billingPeriod: billing }),
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
  const fit = minPaidTierForSports(sportCount)
  const isAnnual = billing === 'annual'

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-5xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 text-gray-500 text-sm mb-8 hover:text-gray-700">
          ← Back to app
        </Link>

        {/* ── Trial hero. The trial is the product you're selling here; the plans
            are what happens after it works. Routes to league creation, not to a
            login form (finding 19). ─────────────────────────────────────────── */}
        <section className="text-center mb-4">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-3">
            Run your whole season free for 14 days
          </h1>
          <p className="text-gray-600 text-lg max-w-2xl mx-auto">
            Full Pro access — 3 sports, 10 divisions, 100 teams, auto-scheduling. No credit card.
          </p>
          <Link
            href="/"
            className="inline-block mt-6 px-7 py-3.5 rounded-xl text-white font-semibold shadow-sm hover:opacity-90 transition"
            style={{ backgroundColor: CRIMSON }}
          >
            Start free — create your league
          </Link>
          <p className="text-xs text-gray-500 mt-3">
            Takes 2 minutes · Your 14-day clock starts the first time you save a schedule with anything on it
          </p>
        </section>

        {/* The wedge, in the buyer's terms: what the per-team competitors charge for. */}
        <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-sm text-gray-600 mb-14">
          {['No per-team fees', 'No transaction cuts', 'No sales call'].map(w => (
            <li key={w} className="flex items-center gap-1.5">
              <span className="text-emerald-700" aria-hidden="true">✓</span>
              {w}
            </li>
          ))}
        </ul>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm text-center">
            {error}
          </div>
        )}

        {/* ── Fit-finder ─────────────────────────────────────────────────────── */}
        <section className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 mb-10">
          <div className="flex items-center justify-between gap-6 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">How many sports does your league run?</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Softball + baseball counts as 2. Divisions and teams share one field pool on every plan.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSportCount(n => Math.max(1, n - 1))}
                  disabled={sportCount <= 1}
                  aria-label="One fewer sport"
                  className="w-9 h-9 rounded-lg border border-gray-300 text-gray-700 text-lg leading-none hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  −
                </button>
                <span className="text-2xl font-bold text-gray-900 w-8 text-center" aria-live="polite">
                  {sportCount}
                </span>
                <button
                  onClick={() => setSportCount(n => Math.min(9, n + 1))}
                  disabled={sportCount >= 9}
                  aria-label="One more sport"
                  className="w-9 h-9 rounded-lg border border-gray-300 text-gray-700 text-lg leading-none hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  +
                </button>
              </div>
              <p className="text-sm text-gray-600">
                Your fit: <span className="font-semibold" style={{ color: INK }}>{fit.name}</span>
              </p>
            </div>
          </div>
        </section>

        {/* ── Billing toggle ─────────────────────────────────────────────────── */}
        <div className="flex flex-col items-center gap-2 mb-8">
          <h2 className="text-xl font-semibold text-gray-900">When you&rsquo;re ready to keep it</h2>
          <div className="inline-flex bg-gray-200 rounded-xl p-1" role="group" aria-label="Billing period">
            {([['annual', 'Annual'], ['season_3mo', '3-month season pass']] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setBilling(value)}
                aria-pressed={billing === value}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  billing === value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Plan cards — only what differs between them ─────────────────────── */}
        <div className="grid md:grid-cols-3 gap-6 mb-10">
          {paid.map(plan => {
            const fits = plan.tier === fit.tier
            const price = isAnnual ? plan.annualPriceUsd : plan.seasonPassPriceUsd
            return (
              <div
                key={plan.tier}
                className={`relative bg-white rounded-xl border-2 p-8 flex flex-col ${
                  fits ? 'shadow-lg' : 'border-gray-200 shadow-sm'
                }`}
                style={fits ? { borderColor: INK } : undefined}
              >
                {fits && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap">
                    <span className="text-white text-xs font-semibold px-3 py-1 rounded-full" style={{ backgroundColor: INK }}>
                      Fits your {sportCount} sport{sportCount === 1 ? '' : 's'}
                    </span>
                  </div>
                )}

                <h3 className="text-xl font-bold text-gray-900 mb-1">{plan.name}</h3>
                <div className="flex items-end gap-1">
                  <span className="text-4xl font-bold text-gray-900">${price}</span>
                  <span className="text-gray-500 text-sm mb-1">{isAnnual ? '/year' : 'once'}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1 mb-6">
                  {isAnnual
                    ? `or $${plan.seasonPassPriceUsd} for a 3-month season pass`
                    : `3 months, no auto-renew · or $${plan.annualPriceUsd}/yr`}
                </p>

                <ul className="space-y-2 text-sm text-gray-700 mb-6">
                  {[
                    limitLine(plan.sportsLimit, 'sport', 'sports'),
                    limitLine(plan.divisionsLimit, 'division', 'divisions'),
                    limitLine(plan.teamsLimit, 'team', 'teams'),
                  ].map(line => (
                    <li key={line} className="flex items-center gap-2">
                      <span className="text-emerald-700" aria-hidden="true">✓</span>
                      {line}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSubscribe(plan.tier as 'starter' | 'pro' | 'org')}
                  disabled={loading !== null}
                  className="mt-auto w-full py-3 rounded-xl text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: fits ? CRIMSON : INK }}
                >
                  {loading === plan.tier + billing
                    ? 'Redirecting…'
                    : isAnnual
                      ? `Get ${plan.name} — $${price}/yr`
                      : `Season pass — $${price}`}
                </button>
              </div>
            )
          })}
        </div>

        {/* ── Shared feature strip ───────────────────────────────────────────── */}
        <section className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 mb-10">
          <h2 className="font-semibold text-gray-900 mb-4">Every plan includes</h2>
          <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-2 text-sm text-gray-700">
            {EVERY_PLAN_INCLUDES.map(f => (
              <li key={f} className="flex items-center gap-2">
                <span className="text-emerald-700" aria-hidden="true">✓</span>
                {f}
              </li>
            ))}
          </ul>
        </section>

        {/* ── Objections ─────────────────────────────────────────────────────── */}
        <div className="grid md:grid-cols-3 gap-6 mb-10">
          {OBJECTIONS.map(o => (
            <div key={o.q} className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
              <h3 className="font-semibold text-gray-900 mb-2">{o.q}</h3>
              <p className="text-sm text-gray-600">{o.a}</p>
            </div>
          ))}
        </div>

        <p className="text-center text-gray-600 text-sm">
          Also use Prospect Card? Your Alfred Sports Bundle takes 20% off — applied automatically at checkout.
        </p>

        <p className="text-center text-gray-500 text-xs mt-4">
          Already have an account?{' '}
          <a href="/login" className="underline text-gray-600">Sign in</a>
        </p>
      </div>
    </div>
  )
}
