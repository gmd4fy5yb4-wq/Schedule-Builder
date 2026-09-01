// Standalone assert-based check (no framework). Run: npx tsx src/lib/geocodeChain.test.ts
import assert from 'node:assert'
import { resolveCoords, extractCityState, type Coords } from './geocodeChain'

const LEVITTOWN: Coords = { lat: 40.721775, lon: -73.512558 }
const RED_WING_MN: Coords = { lat: 44.56247, lon: -92.5338 }
const STEWART_AVE: Coords = { lat: 40.74819, lon: -73.540721 }

/** Build fake lookups from an exact query -> coords table, recording call order. */
function fakes(precise: Record<string, Coords>, place: Record<string, Coords>) {
  const calls: string[] = []
  return {
    calls,
    lookup: {
      precise: async (q: string) => { calls.push(`precise:${q}`); return precise[q] ?? null },
      place:   async (q: string) => { calls.push(`place:${q}`);   return place[q]   ?? null },
    },
  }
}

async function main() {
  // ── extractCityState ─────────────────────────────────────────────────────────

  assert.equal(extractCityState('Red Wing Lane, Levittown NY 11756'), 'Levittown, NY')
  assert.equal(extractCityState('275 Loring Rd, Levittown, NY 11756'), 'Levittown, NY')
  assert.equal(extractCityState('nowhere in particular'), null)

  // ── THE REGRESSION: a venue named after a distant town ───────────────────────
  // "Red Wing" is a real city in Minnesota. The address resolves nowhere, so the
  // chain WILL reach the bare-name stage — the only thing that keeps it honest is
  // that the city extracted from the address is consulted first.

  {
    const { calls, lookup } = fakes(
      { 'Levittown, NY': LEVITTOWN },                 // the address itself: no hit
      { 'Red Wing': RED_WING_MN },                    // the bare name: Minnesota
    )
    const got = await resolveCoords('Red Wing Lane, Levittown NY 11756', 'Red Wing', lookup)
    assert.deepEqual(got?.coords, LEVITTOWN,
      'the city from the address must win over a venue name that matches a distant town')
    assert.equal(got?.stage, 'city:precise')
    assert.ok(!calls.includes('place:Red Wing'),
      'and the bare name must not even be reached once the city resolved')
  }

  // The bare name is still a real fallback when there is no address at all.
  {
    const { lookup } = fakes({}, { 'Red Wing': RED_WING_MN })
    const got = await resolveCoords('', 'Red Wing', lookup)
    assert.deepEqual(got?.coords, RED_WING_MN, 'with nothing better, the name is used')
    assert.equal(got?.stage, 'venueName:place')
  }

  // ── ordering: a real address always beats everything downstream ──────────────

  {
    const { calls, lookup } = fakes(
      { '52 Stewart Ave, Hicksville, NY 11801': STEWART_AVE, 'Hicksville, NY': LEVITTOWN },
      { Hicksville: LEVITTOWN },
    )
    const got = await resolveCoords('52 Stewart Ave, Hicksville, NY 11801', 'Hicksville', lookup)
    assert.deepEqual(got?.coords, STEWART_AVE, 'the street address is the most specific evidence')
    assert.equal(calls.length, 1, 'and nothing after it is called')
  }

  // Nothing resolves anywhere -> null, rather than a confident wrong answer.
  assert.equal(await resolveCoords('Somewhere, XX 00000', 'Nowhere', fakes({}, {}).lookup), null)

  console.log('geocodeChain.test.ts: all assertions passed')
}

main().catch(e => { console.error(e); process.exit(1) })
