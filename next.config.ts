import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig: NextConfig = {
  async headers() {
    // Some headers (HTTPS upgrade, HSTS) break local dev because the dev server
    // is plain HTTP on localhost — `upgrade-insecure-requests` rewrites even the
    // /login navigation to https://localhost and fails with ERR_SSL_PROTOCOL_ERROR.
    // Apply those production-grade directives only outside development.
    const isProd = process.env.NODE_ENV === 'production'

    const csp = [
      "default-src 'self'",
      // Scripts: self + Next.js inline chunks + Stripe
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com",
      // Styles: self + Tailwind inline styles + Google Fonts
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      // Images: self + data URIs (for export canvas) + Supabase storage
      `img-src 'self' data: blob: https://${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('https://', '') ?? ''}`,
      // Fonts: self + Google Fonts
      "font-src 'self' https://fonts.gstatic.com",
      // API calls: self + Supabase + Open-Meteo + Stripe + Sentry ingest.
      // CSP wildcards may only replace the *leftmost* label, so `o*.ingest…`
      // is invalid; `*.ingest.de.sentry.io` matches the real DSN host.
      `connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''} https://*.supabase.co wss://*.supabase.co https://api.open-meteo.com https://api.stripe.com https://*.ingest.sentry.io https://*.ingest.de.sentry.io`,
      // Stripe payment iframe
      "frame-src https://js.stripe.com https://hooks.stripe.com",
      // Service worker
      "worker-src 'self' blob:",
      // Forms only submit to self
      "form-action 'self'",
      // Force HTTPS — production only (would break http://localhost in dev)
      ...(isProd ? ["upgrade-insecure-requests"] : []),
    ].join('; ')

    return [
      {
        source: '/(.*)',
        headers: [
          // Prevent clickjacking — page must not be embedded in an iframe on another origin
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },

          // Block MIME-type sniffing
          { key: 'X-Content-Type-Options', value: 'nosniff' },

          // Force HTTPS for 1 year — production only (HSTS is meaningless/harmful on localhost)
          ...(isProd
            ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
            : []),

          // Disable referrer for cross-origin requests
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },

          // Restrict browser APIs (camera, mic, geolocation not needed)
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },

          // Content Security Policy
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
    ]
  },
}

export default withSentryConfig(nextConfig, {
  // Your Sentry org and project — fill these in after creating the project at sentry.io
  org: 'alfred-digital',
  project: 'fieldday-planner',

  // Only print Sentry output during CI builds
  silent: !process.env.CI,

  // Auth token for source map upload (set SENTRY_AUTH_TOKEN in CI / Vercel).
  // Absent locally → upload is skipped with a warning, build still succeeds.
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Upload more complete source maps for better stack traces
  widenClientFileUpload: true,

  // Don't serve source maps to end users — upload to Sentry, then delete
  // from the build output (replaces hideSourceMaps, removed in SDK v8+)
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },

  // Remove Sentry's debug logger statements from the production bundle
  // (replaces the deprecated top-level disableLogger option)
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
})
