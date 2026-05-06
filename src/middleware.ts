import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/** Paths that never require auth or a subscription check. */
const PUBLIC_PREFIXES = [
  '/login',
  '/pricing',
  '/auth/callback',
  '/api/payments/webhook',  // Stripe hits this without a cookie
  '/_next',
  '/pwa-icon',
  '/api/league/view',       // read-only token route
]

const PUBLIC_EXTENSIONS = ['.ico', '.png', '.svg', '.webmanifest', '.txt', '.xml']

export async function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl

  // Static assets & public paths — skip auth entirely
  if (
    PUBLIC_PREFIXES.some(p => pathname.startsWith(p)) ||
    PUBLIC_EXTENSIONS.some(ext => pathname.endsWith(ext))
  ) {
    return NextResponse.next()
  }

  // Read-only schedule viewers (coaches, players with view token) — no auth required.
  // We check for `token` alone (not requiring `&view=readonly`) because messaging apps
  // sometimes strip query params from shared URLs.
  if (searchParams.get('token')) {
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

  const { data: { session } } = await supabase.auth.getSession()

  // Not logged in
  if (!session) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // Check subscription status
  const { data: sub } = await supabase
    .from('user_subscriptions')
    .select('subscription_status')
    .eq('user_id', session.user.id)
    .single()

  const isActive =
    sub?.subscription_status === 'active' ||
    sub?.subscription_status === 'trialing'

  if (!isActive) {
    return NextResponse.redirect(new URL('/pricing', req.url))
  }

  return response
}

export const config = {
  // Run on all paths except Next.js internals and static files
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
