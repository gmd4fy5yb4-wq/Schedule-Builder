import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseMiddleware } from '@/lib/supabase-middleware'

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

  // Read-only schedule viewers (coaches, players with view token) — no auth required
  if (searchParams.get('view') === 'readonly' && searchParams.get('token')) {
    return NextResponse.next()
  }

  const res = NextResponse.next()
  const supabase = getSupabaseMiddleware(req, res)

  const { data: { session } } = await supabase.auth.getSession()

  // Not logged in
  if (!session) {
    const loginUrl = new URL('/login', req.url)
    return NextResponse.redirect(loginUrl)
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
    const pricingUrl = new URL('/pricing', req.url)
    return NextResponse.redirect(pricingUrl)
  }

  return res
}

export const config = {
  // Run on all paths except Next.js internals and static files
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
