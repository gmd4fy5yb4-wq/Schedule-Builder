// Standalone assert-based check (no framework, matches plans.test.ts convention).
// Run: npx tsx src/lib/welcomeEmail.test.ts
import assert from 'node:assert'
import { sendWelcomeEmail, SENT_KEY } from './welcomeEmail'

async function main() {
  process.env.RESEND_API_KEY = 'test-key'
  const sends: Array<Record<string, unknown>> = []
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    sends.push(JSON.parse(String(init?.body)))
    return new Response('{}', { status: 200 })
  }) as typeof fetch
  const marks: Array<[string, Record<string, unknown>]> = []
  const svc = { auth: { admin: { updateUserById: async (id: string, a: { app_metadata: Record<string, unknown> }) => { marks.push([id, a.app_metadata]); return {} } } } }

  const user = { id: 'u1', email: 'coach@example.com', app_metadata: {} }
  assert.equal(await sendWelcomeEmail(user, svc), 'sent', 'first sign-in sends')
  assert.equal(sends.length, 1)
  assert.deepEqual(sends[0].to, ['coach@example.com'])
  assert.equal(sends[0].subject, 'Welcome to FieldDay Planner — your season starts here', 'subject parsed from the template comment')
  assert.match(String(sends[0].html), /href="https:\/\/fielddayplanner\.app"/, 'CTA points at the app')
  assert.equal(marks[0][0], 'u1')
  assert.ok(typeof marks[0][1][SENT_KEY] === 'string', 'sent marker written to app_metadata')

  assert.equal(await sendWelcomeEmail({ ...user, app_metadata: marks[0][1] }, svc), 'already-sent', 'marked user is not re-sent')
  assert.equal(sends.length, 1, 'no second send')

  console.log('✓ welcomeEmail.ts — all checks passed')
}
main()
