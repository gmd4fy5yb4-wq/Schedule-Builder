import { NextRequest, NextResponse } from 'next/server'

type Coords = { lat: number; lon: number }

const CACHE_HEADERS = { 'Cache-Control': 'public, max-age=86400, s-maxage=86400' }

/**
 * Open-Meteo's geocoding API — same vendor as our weather API so it's
 * always reachable, no rate-limit issues, handles city names well.
 */
async function tryOpenMeteo(query: string): Promise<Coords | null> {
  if (!query.trim()) return null
  try {
    const url =
      `https://geocoding-api.open-meteo.com/v1/search` +
      `?name=${encodeURIComponent(query.trim())}&count=1&language=en&format=json`
    // cache: 'no-store' — skip Next.js data cache so stale null results
    // from a previous failed lookup don't block future attempts.
    // The route handler's own Cache-Control response headers handle caching.
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    const data: { results?: Array<{ latitude: number; longitude: number }> } =
      await res.json()
    if (!data.results?.length) return null
    return { lat: data.results[0].latitude, lon: data.results[0].longitude }
  } catch {
    return null
  }
}

/**
 * Nominatim (OpenStreetMap) — good for full street addresses.
 * Server-side only so we can set the required User-Agent header.
 */
async function tryNominatim(query: string): Promise<Coords | null> {
  if (!query.trim()) return null
  try {
    const url =
      `https://nominatim.openstreetmap.org/search` +
      `?format=json&limit=1&q=${encodeURIComponent(query.trim())}`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'FieldDayPlanner/1.0 (contact@alfreddigital.com)',
        'Accept-Language': 'en-US,en',
      },
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data: Array<{ lat: string; lon: string }> = await res.json()
    if (!data.length) return null
    return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) }
  } catch {
    return null
  }
}

/**
 * Extract "City, ST" from a US street address.
 * Handles both comma-separated and space-separated city/state formats:
 *   "100 Azalea Rd, Uniondale, NY 11553" → "Uniondale, NY"
 *   "100 Periwinkle Rd, Levittown NY 11756" → "Levittown, NY"
 *   "Eisenhower Park, East Meadow, NY"   → "East Meadow, NY"
 * Returns null if no city/state pattern is found.
 */
function extractCityState(address: string): string | null {
  // Format 1: "..., City, ST [zip]" — comma before state abbreviation
  let m = address.match(/,\s*([A-Za-z][A-Za-z\s]*),\s*([A-Z]{2})(?:\s+\d{5})?/i)
  if (m) return `${m[1].trim()}, ${m[2].toUpperCase()}`
  // Format 2: "..., City ST [zip]" — space (no comma) before state abbreviation
  m = address.match(/,\s*([A-Za-z][A-Za-z\s]*?)\s+([A-Z]{2})(?:\s+\d{5})?$/i)
  if (m) return `${m[1].trim()}, ${m[2].toUpperCase()}`
  return null
}

/**
 * GET /api/geocode?address=<street+address>&location=<venue+name>
 *
 * Resolves a softball field to lat/lon using a 4-stage fallback chain:
 *  1. Open-Meteo geocoding with the venue/park name  (fast, reliable)
 *  2. Nominatim with the full street address         (precise, slower)
 *  3. Open-Meteo geocoding with the full address     (second pass)
 *  4. Open-Meteo geocoding with city+state extracted from the address
 *     — nearly always succeeds when the address includes a city name
 *
 * Stage 4 ensures weather shows even for obscure park names. City-level
 * accuracy (~5 mile radius) is plenty for local softball league weather.
 *
 * Results are cached at the edge for 24 h; the browser also caches in
 * localStorage so this endpoint is hit at most once per unique field.
 */
export async function GET(req: NextRequest) {
  const address  = req.nextUrl.searchParams.get('address')?.trim()  ?? ''
  const location = req.nextUrl.searchParams.get('location')?.trim() ?? ''

  if (!address && !location) {
    return NextResponse.json({ error: 'address or location is required' }, { status: 400 })
  }

  // Stage 1 — Open-Meteo with venue/park name (fastest, most reliable)
  if (location) {
    const coords = await tryOpenMeteo(location)
    if (coords) return NextResponse.json(coords, { headers: CACHE_HEADERS })
  }

  // Stage 2 — Nominatim with full street address (most precise)
  if (address) {
    const coords = await tryNominatim(address)
    if (coords) return NextResponse.json(coords, { headers: CACHE_HEADERS })
  }

  // Stage 3 — Open-Meteo with full street address
  if (address) {
    const coords = await tryOpenMeteo(address)
    if (coords) return NextResponse.json(coords, { headers: CACHE_HEADERS })
  }

  // Stage 4 — extract city+state from address, then try multiple geocoders.
  // Handles small parks / venues not in any geocoding index.
  // "100 Azalea Rd, Uniondale, NY 11553" → "Uniondale, NY" / "Uniondale"
  // "100 Perrwinkle Rd, Levittown NY 11756" → "Levittown, NY" / "Levittown"
  //
  // NOTE: Open-Meteo searches GeoNames by exact city name, so "Levittown, NY"
  // does NOT match the stored entry "Levittown" — always try the city name alone
  // as a second pass.
  if (address) {
    const cityState = extractCityState(address)
    if (cityState) {
      const city = cityState.split(',')[0].trim()

      // 4a — Nominatim with city+state (handles US "City, ST" well)
      const n = await tryNominatim(cityState)
      if (n) return NextResponse.json(n, { headers: CACHE_HEADERS })

      // 4b — Open-Meteo with city name only (most reliable; GeoNames exact match)
      const om = await tryOpenMeteo(city)
      if (om) return NextResponse.json(om, { headers: CACHE_HEADERS })

      // 4c — Open-Meteo with "City, ST" (some locales include state in GeoNames)
      const oms = await tryOpenMeteo(cityState)
      if (oms) return NextResponse.json(oms, { headers: CACHE_HEADERS })
    }
  }

  // Don't cache failed lookups — no headers so browser/edge won't store a null result
  return NextResponse.json({ lat: null, lon: null })
}
