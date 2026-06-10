import * as Sentry from '@sentry/nextjs'

// Node.js server runtime. Loaded by src/instrumentation.ts register().
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  tracesSampleRate: 0.2,

  // Attach local variable values to server-side stack frames
  includeLocalVariables: true,

  debug: false,
})
