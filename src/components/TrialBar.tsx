'use client'
import type { TrialBanner } from '@/lib/trial'

/**
 * The trial's only voice in the app. Phase 0 deferred the clock to first schedule
 * generation, which made the trial fair and invisible at the same time — a brand-new
 * league was told nothing at all. Rendered directly under the header; the lapsed
 * state deliberately renders nothing here (the amber renew banner owns it).
 */
export default function TrialBar({ banner }: { banner: TrialBanner }) {
  const message =
    banner.kind === 'not_started'
      ? 'Full Pro access — your 14-day clock starts when you generate your first schedule'
      : `Full Pro access · ${banner.daysLeft} day${banner.daysLeft === 1 ? '' : 's'} left`

  // The full sentence is the desktop message; a 390px screen gets the pill,
  // the countdown, and the CTA on one line. Same component, same placement —
  // a phone-sized variant, not a second bar.
  const shortMessage =
    banner.kind === 'not_started'
      ? 'Starts at your first schedule'
      : `${banner.daysLeft} day${banner.daysLeft === 1 ? '' : 's'} left`

  return (
    <div className="bg-emerald-50 border-b border-emerald-200">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-3 sm:flex-wrap">
        <p className="text-sm text-emerald-900 flex items-center gap-2 min-w-0">
          {/* emerald-700, not -600: white on -600 is 3.77:1, under AA for 11px text. */}
          <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide bg-emerald-700 text-white rounded-full px-2 py-0.5">
            Free Trial
          </span>
          <span className="hidden sm:inline">{message}</span>
          <span className="sm:hidden truncate">{shortMessage}</span>
        </p>
        <a
          href="/pricing"
          className="shrink-0 text-xs font-semibold text-emerald-900 border border-emerald-300 rounded-lg px-3 py-1.5 hover:bg-emerald-100 transition"
        >
          <span className="hidden sm:inline">
            {banner.kind === 'not_started' ? 'See plans' : 'Keep my league — from $99/yr'}
          </span>
          <span className="sm:hidden">{banner.kind === 'not_started' ? 'Plans' : 'Keep it'}</span>
        </a>
      </div>
    </div>
  )
}
