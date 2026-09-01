/**
 * The geocode fallback chain, as a pure function.
 *
 * This lives apart from `src/app/api/geocode/route.ts` so the ORDER can be
 * tested. The order is the whole logic here, and getting it wrong is not a
 * visible failure: it returns a confident, well-formed coordinate for the
 * wrong place. LEv-IT's "Red Wing" field sat 1,609 km away in Minnesota for
 * months, with six real bookings on it, because the chain led with the bare
 * venue name.
 */

export type Coords = { lat: number; lon: number }
export type Lookup = (query: string) => Promise<Coords | null>

/**
 * Extract "City, ST" from a US street address.
 *   "100 Azalea Rd, Uniondale, NY 11553"    → "Uniondale, NY"
 *   "100 Periwinkle Rd, Levittown NY 11756" → "Levittown, NY"
 */
export function extractCityState(address: string): string | null {
  // Format 1: "..., City, ST [zip]" — comma before state abbreviation
  let m = address.match(/,\s*([A-Za-z][A-Za-z\s]*),\s*([A-Z]{2})(?:\s+\d{5})?/i)
  if (m) return `${m[1].trim()}, ${m[2].toUpperCase()}`
  // Format 2: "..., City ST [zip]" — space (no comma) before state abbreviation
  m = address.match(/,\s*([A-Za-z][A-Za-z\s]*?)\s+([A-Z]{2})(?:\s+\d{5})?$/i)
  if (m) return `${m[1].trim()}, ${m[2].toUpperCase()}`
  return null
}

/**
 * Resolve a field to coordinates, most specific evidence first.
 *
 * 1. the full street address (precise geocoder)
 * 2. the full street address (place geocoder)
 * 3. city + state EXTRACTED FROM THAT ADDRESS
 * 4. the bare venue name — LAST RESORT ONLY
 *
 * Step 4 is last on purpose. The place geocoder indexes populated places, not
 * parks, so a bare name only ever matches something city-shaped — an
 * unconstrained city-level guess. The city we can pull out of an address we
 * were actually given is the same granularity but anchored to real input, so
 * it must win. "Red Wing" matches Red Wing, Minnesota; "Red Wing Lane,
 * Levittown NY 11756" yields Levittown. Do not promote step 4.
 */
export async function resolveCoords(
  address: string,
  location: string,
  lookup: { precise: Lookup; place: Lookup },
): Promise<{ coords: Coords; stage: string } | null> {
  const at = async (stage: string, fn: Lookup, q: string) => {
    if (!q.trim()) return null
    const coords = await fn(q)
    return coords ? { coords, stage } : null
  }

  return (
    (await at('address:precise', lookup.precise, address)) ??
    (await at('address:place', lookup.place, address)) ??
    (await (async () => {
      const cityState = address ? extractCityState(address) : null
      if (!cityState) return null
      const city = cityState.split(',')[0].trim()
      return (
        (await at('city:precise', lookup.precise, cityState)) ??
        (await at('city:place', lookup.place, city)) ??
        (await at('cityState:place', lookup.place, cityState))
      )
    })()) ??
    (await at('venueName:place', lookup.place, location))
  )
}
