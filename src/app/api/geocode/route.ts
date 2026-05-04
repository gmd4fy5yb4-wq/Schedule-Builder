import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/geocode?address=<street+address>
 *
 * Server-side proxy for Nominatim geocoding. Running this server-side lets us:
 *  - Set a proper User-Agent (Nominatim policy requires one; browsers cannot)
 *  - Cache responses at the edge so the browser never hits Nominatim directly
 *
 * Nominatim usage policy: max 1 req/sec, identify the app, display attribution.
 * The caller (DashboardTab) serialises requests and caches results in localStorage
 * so Nominatim is hit at most once per unique address per browser.
 */
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')?.trim()
  if (!address) {
    return NextResponse.json({ error: 'address is required' }, { status: 400 })
  }

  const url =
    `https://nominatim.openstreetmap.org/search` +
    `?format=json&limit=1&q=${encodeURIComponent(address)}`

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'FieldDayPlanner/1.0 (https://fieldday-planner.vercel.app)',
        'Accept-Language': 'en-US,en',
        'Referer': 'https://fieldday-planner.vercel.app',
      },
      // Next.js: cache for 24 h — addresses change very rarely
      next: { revalidate: 86400 },
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'Nominatim error' }, { status: 502 })
    }

    const data: Array<{ lat: string; lon: string }> = await res.json()
    if (!data.length) {
      return NextResponse.json({ lat: null, lon: null })
    }

    return NextResponse.json(
      { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) },
      { headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=86400' } },
    )
  } catch (err) {
    console.error('[geocode]', err)
    return NextResponse.json({ error: 'Geocode failed' }, { status: 502 })
  }
}
