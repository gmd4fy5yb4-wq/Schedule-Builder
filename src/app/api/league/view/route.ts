import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServiceRole } from '@/lib/supabase-server'

/**
 * GET /api/league/view?token=UUID
 *
 * Returns league data for a read-only view token.
 * Uses the service role client so it bypasses RLS — safe because we
 * validate the token before returning any data.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.json({ error: 'Missing token.' }, { status: 400 })
  }

  const supabase = getSupabaseServiceRole()
  const { data, error } = await supabase
    .from('leagues')
    .select('data, updated_at, updated_by')
    .eq('view_token', token)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'League not found.' }, { status: 404 })
  }

  return NextResponse.json(data, {
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
