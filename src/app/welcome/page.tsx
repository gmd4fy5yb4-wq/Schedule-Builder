import type { Metadata } from 'next'
import { siteUrl } from '@/lib/siteUrl'
import Landing from '@/components/Landing'

/* The public front door. `middleware.ts` REWRITES `/` to this route for anyone
   who is not signed in, so this page's HTML — and this metadata — is what a
   first-time visitor, a crawler, and a pasted link all get at
   fielddayplanner.app. The URL never changes, which is why `canonical` points
   at the site root rather than at /welcome.

   Why a rewrite instead of branching inside app/page.tsx: middleware already
   resolves the session (and refreshes it), but the refreshed cookies are not
   propagated to the server component, so a second getUser() there can read a
   just-rotated refresh token and fail — handing a signed-in customer the
   marketing page roughly once an hour. Middleware holds the authoritative
   answer; it should do the routing. */

export const metadata: Metadata = {
  title: 'FieldDay Planner — season scheduling for youth & rec leagues',
  description:
    'Build a balanced, conflict-free schedule for every division you run, then share one live link with coaches and parents. Free for 14 days, no credit card.',
  alternates: { canonical: siteUrl('https://fielddayplanner.app') },
  openGraph: {
    type: 'website',
    siteName: 'FieldDay Planner',
    url: siteUrl('https://fielddayplanner.app'),
    title: 'Your whole season, scheduled in an afternoon.',
    description:
      'Auto-scheduling for youth & rec leagues: home/away balanced, field time shared, conflicts caught. Coaches and parents read one live link — no accounts.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Your whole season, scheduled in an afternoon.',
    description:
      'Auto-scheduling for youth & rec leagues. Coaches and parents read one live link — no accounts.',
  },
}

export default function WelcomePage() {
  return <Landing />
}
