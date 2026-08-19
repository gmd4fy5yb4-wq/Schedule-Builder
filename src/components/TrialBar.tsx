'use client'
import type { TrialBanner } from '@/lib/trial'

/**
 * The top bar's only voice about time running out.
 *
 * Two audiences, deliberately different colours. A trial is emerald — it is an
 * invitation, and Phase 0 deferred its clock to first schedule generation, which
 * made the trial fair and invisible at the same time. An ending PAID plan is
 * amber: that customer has already given you money and is about to lose write
 * access, which is news rather than an invitation.
 *
 * The lapsed state renders nothing here on purpose — the amber renew banner in
 * page.tsx owns it, and two bars stacked in the same region is worse than one.
 */
export default function TrialBar({ banner }: { banner: TrialBanner }) {
  const ending = banner.kind === 'ending'
  const days = banner.kind === 'not_started' ? 0 : banner.daysLeft
  const dayWord = `${days} day${days === 1 ? '' : 's'}`

  const message =
    banner.kind === 'not_started'
      ? 'Full Pro access — your 14-day clock starts when you generate your first schedule'
      : ending
        // Say what actually happens. "Expires" is vague; people assume deletion.
        ? `Your season pass ends in ${dayWord} — after that your league becomes read-only. Nothing is deleted.`
        : `Full Pro access · ${dayWord} left`

  // The full sentence is the desktop message; a 390px screen gets the pill,
  // the countdown, and the CTA on one line. Same component, same placement —
  // a phone-sized variant, not a second bar.
  const shortMessage =
    banner.kind === 'not_started'
      ? 'Starts at your first schedule'
      : ending
        ? `Ends in ${dayWord} — then read-only`
        : `${dayWord} left`

  // emerald-700 / amber-800, not -600: white on -600 fails AA at 11px.
  const tone = ending
    ? { bar: 'bg-amber-50 border-amber-200', text: 'text-amber-900',
        pill: 'bg-amber-800 text-white', cta: 'text-amber-900 border-amber-300 hover:bg-amber-100' }
    : { bar: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-900',
        pill: 'bg-emerald-700 text-white', cta: 'text-emerald-900 border-emerald-300 hover:bg-emerald-100' }

  return (
    <div className={`${tone.bar} border-b`} role={ending ? 'status' : undefined}>
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-3 sm:flex-wrap">
        <p className={`text-sm ${tone.text} flex items-center gap-2 min-w-0`}>
          <span className={`shrink-0 text-[11px] font-bold uppercase tracking-wide ${tone.pill} rounded-full px-2 py-0.5`}>
            {ending ? 'Season Pass' : 'Free Trial'}
          </span>
          <span className="hidden sm:inline">{message}</span>
          <span className="sm:hidden truncate">{shortMessage}</span>
        </p>
        <a
          href="/pricing"
          className={`shrink-0 text-xs font-semibold border rounded-lg px-3 py-1.5 transition ${tone.cta}`}
        >
          <span className="hidden sm:inline">
            {banner.kind === 'not_started' ? 'See plans'
              : ending ? 'Renew — from $39'
              : 'Keep my league — from $99/yr'}
          </span>
          <span className="sm:hidden">
            {banner.kind === 'not_started' ? 'Plans' : ending ? 'Renew' : 'Keep it'}
          </span>
        </a>
      </div>
    </div>
  )
}
