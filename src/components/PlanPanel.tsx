'use client'
import type { AppState } from '@/lib/types'
import { getSports } from '@/lib/sports'
import { minPaidTierForSports } from '@/lib/plans'
import { planUsage, type PlanPanelSubscription } from '@/lib/planUsage'

/**
 * "What am I on, how much of it am I using, and what would keeping this cost?"
 * Reads the user_subscriptions row page.tsx already fetches plus the league blob
 * — no new queries, no new columns.
 */
export default function PlanPanel({ state, sub }: { state: AppState; sub: PlanPanelSubscription }) {
  const usage = planUsage(state, sub)
  const fit = minPaidTierForSports(getSports(state.season).length)

  return (
    <section className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Your plan</h3>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900">{usage.planName}</span>
          {usage.trialLabel && (
            <span className="text-[11px] font-bold uppercase tracking-wide bg-emerald-700 text-white rounded-full px-2 py-0.5">
              {usage.trialLabel}
            </span>
          )}
        </div>
      </div>

      <dl className="space-y-3">
        {usage.meters.map(m => (
          <div key={m.label}>
            <div className="flex items-baseline justify-between text-sm">
              <dt className="text-gray-700">{m.label}</dt>
              <dd className={`font-medium ${m.over ? 'text-red-700' : 'text-gray-900'}`}>{m.text}</dd>
            </div>
            <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${m.over ? 'bg-red-600' : 'bg-[var(--fd-primary)]'}`}
                style={{ width: `${m.percent}%` }}
              />
            </div>
          </div>
        ))}
      </dl>

      <div className="mt-5 pt-4 border-t border-gray-100">
        <p className="text-sm text-gray-700">
          Your setup fits <span className="font-semibold">{fit.name}</span> — ${fit.annualPriceUsd}/yr, or $
          {fit.seasonPassPriceUsd} for a one-time 3-month season pass.
        </p>
        <div className="flex gap-4 mt-3">
          <a
            href="/pricing"
            className="text-sm font-semibold bg-[var(--fd-accent)] hover:bg-[var(--fd-accent-hover)] text-white rounded-lg px-3 py-2 transition"
          >
            Keep this setup — ${fit.annualPriceUsd}/yr
          </a>
          <a href="/account" className="text-sm text-gray-600 underline self-center">
            Manage billing
          </a>
        </div>
      </div>
    </section>
  )
}
