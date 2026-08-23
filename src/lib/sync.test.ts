// Standalone assert-based check (no framework). Run: npx tsx src/lib/sync.test.ts
// Guards the network-failure contracts: fetch() THROWING (connection drop, tab
// closing mid-request) must produce the same failure returns as a bad status,
// never an unhandled rejection. This was FIELDDAY-PLANNER-2 in Sentry.
import assert from 'node:assert'
import { saveLeague, createLeague, getOrCreateViewToken, loadLeagueByViewToken } from './sync'
import type { AppState } from './types'

const state = {} as AppState

async function main() {
  globalThis.fetch = () => Promise.reject(new TypeError('Failed to fetch'))

  const save = await saveLeague('ABC123', state, 'Greg')
  assert.strictEqual(save.success, false)
  assert.ok(save.error?.includes('Network error'))

  const create = await createLeague(state, 'Greg')
  assert.ok('error' in create && create.error.includes('Network error'))

  assert.strictEqual(await getOrCreateViewToken('ABC123'), null)
  assert.strictEqual(await loadLeagueByViewToken('tok'), null)

  // A non-JSON error response (HTML 500 page) must not throw either
  globalThis.fetch = () =>
    Promise.resolve(new Response('<html>oops</html>', { status: 500 }))
  const save500 = await saveLeague('ABC123', state, 'Greg')
  assert.strictEqual(save500.success, false)

  console.log('sync.test.ts: all assertions passed')
}

main()
