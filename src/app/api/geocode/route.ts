import { NextRequest, NextResponse } from 'next/server'

type Coords = { lat: number; lon: number }

const CACHE_HEADERS = { 'Cache-Control': 'public, max-age=86400, s-maxage=86400' }

/**
 * Try Nominatim (OpenStreetMap) geocoding.
 * We set a real User-Agent server-side; browsers can't do this.
 */
async function tryNominatim(query: string): Promise<Coords | null> {
  try {
    const url =
      `https://nominatim.openstreetmap.org/search` +
      `?format=json&limit=1&q=${encodeURIComponent(query)}`
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
 * Try Open-Meteo's geocoding API as a fallback.
 * Works well for place/venue names (parks, schools, etc.).
 * Same vendor as our weather API — guaranteed to be reachable.
 */
async function tryOpenMeteo(query: string): Promise<Coords | null> {
  try {
    const url =
      `https://geocoding-api.open-meteo.com/v1/search` +
      `?name=${encodeURIComponent(query)}&count=1&language=en&format=json`
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
 * GET /api/geocode?address=<primary>&location=<fallback>
 *
 * Geocodes a field location using two sources in order:
 *  1. Nominatim (street-address quality) with the `address` param
 *  2. Open-Meteo geocoding (place-name quality) with the `address` param
 *  3. Open-Meteo geocoding with the `location` param (venue / park name)
 *
 * Results are cached at the edge for 24 h; the browser also caches in
 * localStorage so this endpoint is hit at most once per unique address.
 */
export async function GET(req: NextRequest) {
  const address  = req.nextUrl.searchParams.get('address')?.trim()  ?? ''
  const location = req.nextUrl.searchParams.get('location')?.trim() ?? ''

  if (!address && !location) {
    return NextResponse.json({ error: 'address or location is required' }, { status: 400 })
  }

  // Stage 1 — Nominatim with street address
  if (address) {
    const coords = await tryNominatim(address)
    if (coords) {
      return NextResponse.json(coords, { headers: CACHE_HEADERS })
    }
  }

  // Stage 2 — Open-Meteo geocoding with street address
  if (address) {
    const coords = await tryOpenMeteo(address)
    if (coords) {
      return NextResponse.json(coords, { headers: CACHE_HEADERS })
    }
  }

  // Stage 3 — Open-Meteo geocoding with venue/park name
  if (location) {
    const coords = await tryOpenMeteo(location)
    if (coords) {
      return NextResponse.json(coords, { headers: CACHE_HEADERS })
    }
  }

  // All stages failed
  return NextResponse.json({ lat: null, lon: null }, { headers: CACHE_HEADERS })
}
