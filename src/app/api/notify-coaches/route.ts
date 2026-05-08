import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseServer, getSupabaseServiceRole } from '@/lib/supabase-server'
import { sendCoachNotifications } from '@/lib/email'
import type { AppState } from '@/lib/types'

const schema = z.object({
  leagueCode: z.string().length(6),
  teamIds: z.array(z.string()).optional().default([]),
  viewUrl: z.string().url().optional(),
})

export async function POST(req: NextRequest) {
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'Email not configured — add RESEND_API_KEY to your environment.' }, { status: 503 })
  }

  // Require authentication
  const supabase = await getSupabaseServer()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  }

  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 422 })
  }

  const { leagueCode, teamIds, viewUrl } = parsed.data
  const code = leagueCode.toUpperCase()
  const serviceSupabase = getSupabaseServiceRole()

  // Rate limit: 1 batch per league per 5 minutes per user
  const RATE_LIMIT_MS = 5 * 60 * 1000
  const { data: sub } = await serviceSupabase
    .from('user_subscriptions')
    .select('notify_last_sent_at')
    .eq('user_id', session.user.id)
    .single()

  const lastSent = sub?.notify_last_sent_at ? new Date(sub.notify_last_sent_at).getTime() : 0
  if (Date.now() - lastSent < RATE_LIMIT_MS) {
    const retryAfterSec = Math.ceil((RATE_LIMIT_MS - (Date.now() - lastSent)) / 1000)
    return NextResponse.json(
      { error: `Please wait ${retryAfterSec}s before sending another batch.` },
      { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
    )
  }

  // Verify the requesting user owns this league
  const { data: league, error } = await serviceSupabase
    .from('leagues')
    .select('data, owner_id')
    .eq('id', code)
    .single()

  if (error || !league) {
    return NextResponse.json({ error: 'League not found.' }, { status: 404 })
  }

  if (league.owner_id && league.owner_id !== session.user.id) {
    return NextResponse.json({ error: 'You do not have permission to notify coaches for this league.' }, { status: 403 })
  }

  const state = league.data as AppState
  const results = await sendCoachNotifications(state, teamIds, viewUrl)

  // Record send time for rate limiting (fire-and-forget)
  void serviceSupabase
    .from('user_subscriptions')
    .update({ notify_last_sent_at: new Date().toISOString() })
    .eq('user_id', session.user.id)

  const sent = results.filter(r => r.success).length
  const failed = results.filter(r => !r.success)

  return NextResponse.json({ sent, failed, results })
}
