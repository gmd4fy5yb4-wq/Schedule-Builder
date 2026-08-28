// Standalone assert-based check (no framework). Run: npx tsx src/lib/viewer-redaction.test.ts
// Guards the share-link PII contract: a forwarded read-only link must never
// carry coach phone numbers or email addresses in the API payload.
import assert from 'node:assert'
import { redactForViewer } from './viewer-redaction'
import type { AppState } from './types'

const state = {
  season: 'Spring 2026',
  divisions: [
    {
      id: 'd1', name: 'Majors',
      teams: [
        { id: 't1', name: 'Reds', divisionId: 'd1', coaches: [
          { id: 'c1', name: 'Pat Doe', role: 'head', phone: '555-123-4567', email: 'pat@example.com' },
        ] },
        { id: 't2', name: 'Blues', divisionId: 'd1' },
      ],
    },
  ],
  schedule: [], fields: [], blackoutDates: [],
} as unknown as AppState

const out = redactForViewer(state)
const json = JSON.stringify(out)

assert.ok(!/example\.com/.test(json), 'coach email leaked to viewer payload')
assert.ok(!/555-123-4567/.test(json), 'coach phone leaked to viewer payload')
assert.strictEqual(out.divisions[0].teams[0].coaches![0].name, 'Pat Doe', 'coach name must survive')
assert.strictEqual(out.divisions[0].teams[1].name, 'Blues', 'teams without coaches pass through')
assert.strictEqual(out.season, 'Spring 2026', 'unrelated state untouched')
// input not mutated — the owner's in-memory state must be unaffected
assert.strictEqual(state.divisions[0].teams[0].coaches![0].email, 'pat@example.com', 'input mutated')

console.log('viewer-redaction: 6/6 OK')
