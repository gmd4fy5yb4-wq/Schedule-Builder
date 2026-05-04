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
    const res = await fetch(url, { next: { revalidate: 86400 } })
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
        'User-Agent': 'FieldDayPlanner/1.0 (https://fieldday-planner.vercel.app)',
        'Accept-Language': 'en-US,en',
        'Referer': 'https://fieldday-planner.vercel.app',
      },
      next: { revalidate: 86400 },
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
 * "100 Azalea Rd, Uniondale, NY 11553" → "Uniondale, NY"
 * "Eisenhower Park, East Meadow, NY"   → "East Meadow, NY"
 * Returns null if no city/state pattern is found.
 */
function extractCityState(address: string): string | null {
  const m = address.match(/,\s*([A-Za-z\s]+),\s*([A-Z]{2})(?:\s+\d{5})?/i)
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

  // Stage 4 — Open-Meteo with just city+state extracted from address
  // Handles small parks / venues not in any geocoding index.
  // "100 Azalea Rd, Uniondale, NY 11553" → geocode "Uniondale, NY"
  if (address) {
    const cityState = extractCityState(address)
    if (cityState) {
      const coords = await tryOpenMeteo(cityState)
      if (coords) return NextResponse.json(coords, { headers: CACHE_HEADERS })
    }
  }

  return NextResponse.json({ lat: null, lon: null }, { headers: CACHE_HEADERS })
}
