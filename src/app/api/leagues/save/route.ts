import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseServer, getSupabaseServiceRole } from '@/lib/supabase-server'
import { checkLimits, isWritable } from '@/lib/plans'
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
    serviceSupabase.from('user_subscriptions').select('sports_limit, divisions_limit, teams_limit, plan_tier, trial_started_at, subscription_status, subscription_end').eq('user_id', session.user.id).single(),
  ])

  // Expiry is no longer enforced by a middleware redirect (lapsed users now get a
  // read-only app instead of a /pricing wall), so the write gate lives here. Without
  // this an expired user could still POST straight to this route.
  // A NULL subscription_end = no expiry (unlimited testers, unstarted trials).
  if (!isWritable(sub)) {
    return NextResponse.json(
      { error: 'Your plan has expired. Renew to make changes — your league stays exactly as it is.', expired: true },
      { status: 403 }
    )
  }

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

  // Trial clock (migration fd_014): the 14 days start the first time a trial user saves
  // a league whose schedule has actually been generated — not at signup, which burned
  // the whole trial for off-season admins (finding 2).
  //
  // The .eq('plan_tier','trial') + .is('trial_started_at', null) filters make this
  // one-shot and unable to touch a tester or a paying subscriber, so it is safe to
  // run on every save rather than reading first.
  // ponytail: fires on any save of an already-generated schedule, not strictly the
  // generation event. Same outcome (they've seen a schedule), one query, no new state.
  if (state.schedule?.generatedAt) {
    const startedAt = new Date()
    const endsAt = new Date(startedAt.getTime() + 14 * 24 * 60 * 60 * 1000)
    const { error: clockError } = await serviceSupabase
      .from('user_subscriptions')
      .update({ trial_started_at: startedAt.toISOString(), subscription_end: endsAt.toISOString() })
      .eq('user_id', session.user.id)
      .eq('plan_tier', 'trial')
      .is('trial_started_at', null)
    // Non-fatal: the league is already saved. A failed clock start just means the
    // trial stays unstarted and the next save tries again.
    if (clockError) console.error('trial clock start failed', clockError)
  }

  return NextResponse.json({ success: true })
}
