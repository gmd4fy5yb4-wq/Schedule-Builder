import * as Sentry from '@sentry/nextjs'

// Edge runtime (middleware, edge route handlers). Loaded by
// src/instrumentation.ts register().
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  tracesSampleRate: 0.2,

  debug: false,
})
