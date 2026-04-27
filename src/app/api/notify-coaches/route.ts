import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendCoachNotifications } from '@/lib/email'
import type { AppState } from '@/lib/types'

export async function POST(req: Request) {
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'Email not configured — add RESEND_API_KEY to your environment.' }, { status: 503 })
  }

  const body = await req.json() as { leagueCode: string; teamIds?: string[]; viewUrl?: string }
  const { leagueCode, teamIds = [], viewUrl } = body

  if (!leagueCode) {
    return NextResponse.json({ error: 'leagueCode is required' }, { status: 400 })
  }

  // Load state via service role (bypasses RLS so we can read without auth)
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data, error } = await sb
    .from('leagues')
    .select('state_json')
    .eq('code', leagueCode)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'League not found' }, { status: 404 })
  }

  const state = data.state_json as AppState
  const results = await sendCoachNotifications(state, teamIds, viewUrl)

  const sent = results.filter(r => r.success).length
  const failed = results.filter(r => !r.success)

  return NextResponse.json({ sent, failed, results })
}
