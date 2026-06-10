import * as Sentry from '@sentry/nextjs'

// Browser / client runtime. Next.js loads this automatically (the modern
// replacement for sentry.client.config.ts).
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Capture 20% of traces — adjust up if you need more performance data
  tracesSampleRate: 0.2,

  // Record a session replay for every error, no routine session recording
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0,

  integrations: [
    Sentry.replayIntegration(),
  ],

  // Disable verbose Sentry output in production
  debug: false,
})

// Instruments App Router client-side navigations as spans.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
