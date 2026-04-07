import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseServer, getSupabaseServiceRole } from '@/lib/supabase-server'
import { checkLimits } from '@/lib/plans'
import type { AppState } from '@/lib/types'

const schema = z.object({
  state: z.unknown(),
  userName: z.string().max(100),
})

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

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

  const serviceSupabase = getSupabaseServiceRole()

  // Check subscription limits
  const { data: sub } = await serviceSupabase
    .from('user_subscriptions')
    .select('leagues_limit, divisions_limit, teams_limit')
    .eq('user_id', session.user.id)
    .single()

  const limits = sub ?? { leagues_limit: 1, divisions_limit: 2, teams_limit: 8 }

  // Count owned leagues
  const { count: ownedCount } = await serviceSupabase
    .from('leagues')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', session.user.id)

  const state = parsed.data.state as unknown as AppState
  const limitCheck = checkLimits(
    { leaguesLimit: limits.leagues_limit, divisionsLimit: limits.divisions_limit, teamsLimit: limits.teams_limit },
    (ownedCount ?? 0) + 1,  // +1 for the league we're about to create
    state.divisions ?? []
  )

  if (!limitCheck.allowed) {
    return NextResponse.json(
      { error: limitCheck.reason, limitType: limitCheck.limitType },
      { status: 403 }
    )
  }

  // Generate unique code (retry up to 10 times)
  let code = ''
  for (let i = 0; i < 10; i++) {
    const candidate = generateCode()
    const { data: existing } = await serviceSupabase
      .from('leagues')
      .select('id')
      .eq('id', candidate)
      .single()
    if (!existing) { code = candidate; break }
  }

  if (!code) {
    return NextResponse.json({ error: 'Could not generate a unique code. Try again.' }, { status: 500 })
  }

  const { error: insertError } = await serviceSupabase
    .from('leagues')
    .insert({
      id: code,
      data: state,
      updated_at: new Date().toISOString(),
      updated_by: parsed.data.userName,
      owner_id: session.user.id,
    })

  if (insertError) {
    return NextResponse.json({ error: 'Failed to create league.' }, { status: 500 })
  }

  return NextResponse.json({ code })
}
