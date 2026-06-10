import * as Sentry from '@sentry/nextjs'

// Server-side registration hook. Without this, the server/edge Sentry inits
// never run — nothing auto-loads sentry.server.config / sentry.edge.config.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

// Captures unhandled errors thrown in server components, route handlers,
// and server actions (requires @sentry/nextjs >= 8.28.0).
export const onRequestError = Sentry.captureRequestError
