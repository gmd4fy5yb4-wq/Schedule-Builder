import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { resolveCoords } from '@/lib/geocodeChain'

import type { Coords } from '@/lib/geocodeChain'

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
 * GET /api/geocode?address=<street+address>&location=<venue+name>
 *
 * Resolves a softball field to lat/lon using a 4-stage fallback chain:
 *  1. Nominatim with the full street address         (precise)
 *  2. Open-Meteo geocoding with the full address     (second pass)
 *  3. Open-Meteo geocoding with city+state extracted from the address
 *  4. Open-Meteo geocoding with the venue/park name — LAST, because a bare name
 *     is unconstrained by state and must not outrank anything derived from the
 *     address we were actually given
 *     — nearly always succeeds when the address includes a city name
 *
 * Stage 3 ensures weather shows even for obscure park names. City-level
 * accuracy (~5 mile radius) is plenty for local softball league weather.
 *
 * Results are cached at the edge for 24 h; the browser also caches in
 * localStorage so this endpoint is hit at most once per unique field.
 */
export async function GET(req: NextRequest) {
  const supabase = await getSupabaseServer()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  }

  const address  = req.nextUrl.searchParams.get('address')?.trim()  ?? ''
  const location = req.nextUrl.searchParams.get('location')?.trim() ?? ''

  if (!address && !location) {
    return NextResponse.json({ error: 'address or location is required' }, { status: 400 })
  }

  // The chain itself lives in src/lib/geocodeChain.ts so its ORDER can be
  // tested (src/lib/geocodeChain.test.ts). Order is the entire logic here, and
  // getting it wrong fails silently — it returns a confident, well-formed
  // coordinate for the wrong place.
  const hit = await resolveCoords(address, location, {
    precise: tryNominatim,
    place: tryOpenMeteo,
  })
  if (hit) return NextResponse.json(hit.coords, { headers: CACHE_HEADERS })

  // Don't cache failed lookups — no headers so browser/edge won't store a null result
  return NextResponse.json({ lat: null, lon: null })
}
