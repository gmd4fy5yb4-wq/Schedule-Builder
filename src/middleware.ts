import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/** Redirect domains → canonical domain (308 Permanent Redirect). */
const REDIRECT_HOSTS = new Set([
  'www.fielddayplanner.app',
  'getfieldday.app',
  'www.getfieldday.app',
  'getfieldday.xyz',
  'www.getfieldday.xyz',
])
const CANONICAL = 'https://fielddayplanner.app'

/** Paths that never require auth or a subscription check. */
const PUBLIC_PREFIXES = [
  '/login',
  '/pricing',
  '/auth/callback',
  '/api/payments',          // all payment routes bypass the subscription gate:
                            //  - /webhook: Stripe hits it without a cookie
                            //  - /create-session & /portal: an UNSUBSCRIBED user
                            //    must be able to reach these to subscribe/manage
                            //    billing. They enforce their own getUser() auth.
  '/_next',
  '/pwa-icon',
  '/api/league/view',       // read-only token route
  '/checkout/success',      // post-payment landing: polls for the row, then forwards to /.
                            //  Must be reachable by an authed user whose webhook hasn't
                            //  committed yet — gating it would re-create the bounce it fixes.
]

const PUBLIC_EXTENSIONS = ['.ico', '.png', '.svg', '.webmanifest', '.txt', '.xml']

// Service worker script must be served without redirects (browser requirement)
const PUBLIC_EXACT = ['/sw.js']

export async function middleware(req: NextRequest) {
  // Redirect alias domains to the canonical domain before any auth logic runs
  const host = req.headers.get('host') ?? ''
  if (REDIRECT_HOSTS.has(host)) {
    const destination = CANONICAL + req.nextUrl.pathname + req.nextUrl.search
    return NextResponse.redirect(destination, { status: 308 })
  }

  const { pathname, searchParams } = req.nextUrl

  // Static assets & public paths — skip auth entirely
  if (
    PUBLIC_PREFIXES.some(p => pathname.startsWith(p)) ||
    PUBLIC_EXTENSIONS.some(ext => pathname.endsWith(ext)) ||
    PUBLIC_EXACT.includes(pathname)
  ) {
    return NextResponse.next()
  }

  // Read-only schedule viewers (coaches, players with view token) — no auth required
  if (searchParams.get('view') === 'readonly' && searchParams.get('token')) {
    return NextResponse.next()
  }

  // Build response first so we can write refreshed session cookies onto it
  let response = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return req.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            req.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // Use getUser() — it revalidates the JWT with the Supabase Auth server.
  // getSession() only reads the cookie and must not be trusted for authz.
  const { data: { user } } = await supabase.auth.getUser()

  // Not logged in
  if (!user) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // Check subscription status
  const { data: sub } = await supabase
    .from('user_subscriptions')
    .select('subscription_status, subscription_end')
    .eq('user_id', user.id)
    .single()

  // A null subscription_end = no expiry (unlimited testers). A past one = lapsed —
  // this is what makes the one-time season pass actually expire after 90 days.
  const notExpired = !sub?.subscription_end || new Date(sub.subscription_end) > new Date()
  const isActive =
    notExpired &&
    (sub?.subscription_status === 'active' ||
     sub?.subscription_status === 'trialing')

  if (!isActive) {
    return NextResponse.redirect(new URL('/pricing', req.url))
  }

  return response
}

export const config = {
  // Run on all paths except Next.js internals and static files
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
