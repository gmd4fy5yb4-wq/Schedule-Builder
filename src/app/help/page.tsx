import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Help — FieldDay Planner' }

const TOPICS = [
  { href: '/help/setting-up-your-season', title: 'Setting up your season', blurb: 'Name your league, set the dates, pick your sport.' },
  { href: '/help/divisions-and-teams', title: 'Divisions & teams', blurb: 'How divisions work and why each needs at least two teams.' },
  { href: '/help/fields-and-availability', title: 'Fields & availability', blurb: 'Add fields, set blackout dates, control when play happens.' },
  { href: '/help/auto-scheduling', title: 'Auto-scheduling', blurb: 'How the scheduler builds a conflict-free season — and what starts your trial.' },
  { href: '/help/sharing-with-coaches', title: 'Sharing with coaches', blurb: 'View-only links, league codes, and what coaches can see.' },
]

export default function HelpIndex() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-5 py-10">
        <h1 className="text-3xl font-bold text-gray-900">Help</h1>
        <p className="mt-2 text-gray-600">
          Everything you need to run a season. Most leagues are set up in under 30 minutes.
        </p>
        <ul className="mt-8 space-y-3">
          {TOPICS.map(t => (
            <li key={t.href}>
              <Link href={t.href} className="block bg-white rounded-lg border border-gray-200 p-4 hover:border-[var(--fd-accent)] transition">
                <span className="block font-semibold text-gray-900">{t.title}</span>
                <span className="block text-sm text-gray-600 mt-0.5">{t.blurb}</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-sm text-gray-500">
          Prefer a walkthrough? Open the app and tap the <strong>?</strong> button in the bottom corner, then “Take the tour”.
        </p>
      </div>
    </main>
  )
}
