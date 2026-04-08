import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseServer, getSupabaseServiceRole } from '@/lib/supabase-server'
import { checkLimits } from '@/lib/plans'
import type { AppState } from '@/lib/types'

const schema = z.object({
  code: z.string().length(6),
  state: z.unknown(),
  userName: z.string().min(1).max(100).trim(),
})

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
  const state = parsed.data.state as unknown as AppState
  const serviceSupabase = getSupabaseServiceRole()

  // Verify the user owns this league (or it's unclaimed)
  const { data: league } = await serviceSupabase
    .from('leagues')
    .select('owner_id')
    .eq('id', code)
    .single()

  if (league && league.owner_id && league.owner_id !== session.user.id) {
    return NextResponse.json({ error: 'You do not have permission to edit this league.' }, { status: 403 })
  }

  // Check subscription limits
  const { data: sub } = await serviceSupabase
    .from('user_subscriptions')
    .select('leagues_limit, divisions_limit, teams_limit')
    .eq('user_id', session.user.id)
    .single()

  const limits = sub ?? { leagues_limit: 1, divisions_limit: 2, teams_limit: 8 }

  // Count owned leagues (excluding the current one being saved)
  const { count: ownedCount } = await serviceSupabase
    .from('leagues')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', session.user.id)

  const limitCheck = checkLimits(
    { leaguesLimit: limits.leagues_limit, divisionsLimit: limits.divisions_limit, teamsLimit: limits.teams_limit },
    ownedCount ?? 0,
    state.divisions ?? []
  )

  if (!limitCheck.allowed) {
    return NextResponse.json(
      { error: limitCheck.reason, limitType: limitCheck.limitType },
      { status: 403 }
    )
  }

  const { error: upsertError } = await serviceSupabase
    .from('leagues')
    .upsert({
      id: code,
      data: state,
      updated_at: new Date().toISOString(),
      updated_by: parsed.data.userName,
    })

  if (upsertError) {
    return NextResponse.json({ error: 'Failed to save league.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
