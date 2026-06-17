import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseServer, getSupabaseServiceRole } from '@/lib/supabase-server'
import { checkLimits } from '@/lib/plans'
import { getSports } from '@/lib/sports'
import type { AppState } from '@/lib/types'

const schema = z.object({
  code: z.string().length(6),
  state: z.unknown().refine(v => JSON.stringify(v).length < 500_000, 'State too large'),
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

  // Fetch league ownership + subscription limits in parallel (independent queries)
  // The league code is the shared access credential — any authenticated user who
  // knows the code can save. owner_id is used only for limit counting (who created it).
  const [{ data: league }, { data: sub }] = await Promise.all([
    serviceSupabase.from('leagues').select('owner_id').eq('id', code).single(),
    serviceSupabase.from('user_subscriptions').select('sports_limit, divisions_limit, teams_limit').eq('user_id', session.user.id).single(),
  ])

  // Enforce limits only against the current user's own leagues (not shared leagues
  // they are collaborating on). Use the owner's limits if this is someone else's league.
  const limits = sub ?? { sports_limit: 1, divisions_limit: 1, teams_limit: 8 }

  // Sport gate counts the sports IN THIS league (one org = one league, shared fields).
  // Skip the gate for collaborators editing someone else's league — not their quota.
  const isOwnerOrUnclaimed = !league?.owner_id || league.owner_id === session.user.id
  const limitCheck = checkLimits(
    { sportsLimit: limits.sports_limit, divisionsLimit: limits.divisions_limit, teamsLimit: limits.teams_limit, adminsLimit: 999 },
    isOwnerOrUnclaimed ? getSports(state.season).length : 0,
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
      // Claim ownership on first save if the league is unclaimed
      ...(!league?.owner_id ? { owner_id: session.user.id } : {}),
    })

  if (upsertError) {
    return NextResponse.json({ error: 'Failed to save league.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
