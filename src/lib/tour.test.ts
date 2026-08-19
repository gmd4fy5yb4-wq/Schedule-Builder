// Standalone assert-based check (no framework). Run: npx tsx src/lib/tour.test.ts
import assert from 'node:assert'
import { getActiveStep, advanceTour, TOUR_STEPS, TOTAL_STEPS, type TourState } from './tour'

const fresh: TourState = { step: 1, dismissed: false }

// ── getActiveStep ────────────────────────────────────────────────────────────

// No state at all — the user has never started a tour.
assert.equal(getActiveStep(null, 0), null)

// Dismissed tours stay dismissed regardless of tab.
assert.equal(getActiveStep({ step: 3, dismissed: true }, 2), null)

// Step 1 lives on tab 0 (Dashboard) and resolves there.
assert.equal(getActiveStep(fresh, 0)?.selector, '[data-tour="checklist"]')

// Same step, wrong tab — the user navigated away. Step is suppressed, not lost:
// it resolves again when they come back. This is what makes the tour survive
// someone clicking around mid-tour.
assert.equal(getActiveStep(fresh, 5), null)
assert.equal(getActiveStep(fresh, 0)?.step, 1)

// The complete state (step === TOTAL_STEPS + 1) matches no def on any tab.
const done: TourState = { step: TOTAL_STEPS + 1, dismissed: false }
for (let tab = 0; tab <= 10; tab++) assert.equal(getActiveStep(done, tab), null)

// ── advanceTour ──────────────────────────────────────────────────────────────

assert.deepEqual(advanceTour(fresh), { step: 2, dismissed: false })

// Advancing off the last step lands exactly on the complete sentinel...
assert.deepEqual(
  advanceTour({ step: TOTAL_STEPS, dismissed: false }),
  { step: TOTAL_STEPS + 1, dismissed: false },
)
// ...and never runs past it, however many times it is called.
assert.deepEqual(advanceTour(done), done)
assert.deepEqual(advanceTour(advanceTour(done)), done)

// dismissed is carried through, not reset.
assert.equal(advanceTour({ step: 2, dismissed: true }).dismissed, true)

// ── TOUR_STEPS integrity ─────────────────────────────────────────────────────

assert.equal(TOTAL_STEPS, TOUR_STEPS.length)
assert.equal(TOTAL_STEPS, 7)

// Every step must point at a real tab. TABS in page.tsx has 11 entries (0–10);
// a step aimed at tab 11 would silently never render.
for (const s of TOUR_STEPS) {
  assert.ok(s.tab >= 0 && s.tab <= 10, `step ${s.step} has out-of-range tab ${s.tab}`)
  assert.ok(s.selector.startsWith('[data-tour='), `step ${s.step} selector must be a data-tour attr`)
  assert.ok(s.title.length > 0 && s.body.length > 0, `step ${s.step} missing copy`)
}

// step numbers are 1..N, in order, no gaps — getActiveStep's find() depends on it.
TOUR_STEPS.forEach((s, i) => assert.equal(s.step, i + 1, `step at index ${i} is numbered ${s.step}`))

// Step 5 is the trial-clock warning. fd_014 made schedule generation the billing
// trigger; if this sentence goes missing a customer gets surprise-billed.
assert.match(TOUR_STEPS[4].body, /14-day trial/)

console.log('tour.test.ts: all assertions passed')
