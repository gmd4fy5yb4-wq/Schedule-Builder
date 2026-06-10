import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseServer, getSupabaseServiceRole } from '@/lib/supabase-server'

const schema = z.object({ code: z.string().length(6) })

/**
 * POST /api/league/share-token
 *
 * Returns the read-only view token for a league, creating one if needed.
 * Auth model matches /api/leagues/save: the league code is the shared access
 * credential — any authenticated user who knows the code can mint the
 * read-only share link. The underlying RPC is service-role-only as of
 * migration 008, so anonymous PostgREST callers can no longer mint tokens.
 */
export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServer()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  }

  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 422 })
  }
  const code = parsed.data.code.toUpperCase()

  const serviceSupabase = getSupabaseServiceRole()
  const { data, error } = await serviceSupabase.rpc('get_or_create_view_token', {
    league_id: code,
  })

  if (error || !data) {
    return NextResponse.json({ error: 'League not found.' }, { status: 404 })
  }

  return NextResponse.json(
    { token: data },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
}
