import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseServiceRole } from '@/lib/supabase-server'
import { redactForViewer } from '@/lib/viewer-redaction'

const tokenSchema = z.string().uuid()

/**
 * GET /api/league/view?token=UUID
 *
 * Returns league data for a read-only view token.
 * Uses the service role client so it bypasses RLS — safe because we
 * validate the token is a valid UUID before querying.
 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('token')
  const parsed = tokenSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid token.' }, { status: 400 })
  }
  const token = parsed.data

  const supabase = getSupabaseServiceRole()
  const { data, error } = await supabase
    .from('leagues')
    .select('data, updated_at, updated_by')
    .eq('view_token', token)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'League not found.' }, { status: 404 })
  }

  // The share link is forwardable, so coach contact details are stripped here
  // rather than in the UI — see src/lib/viewer-redaction.ts.
  return NextResponse.json({ ...data, data: redactForViewer(data.data) }, {
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
