import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseServer, getSupabaseServiceRole } from '@/lib/supabase-server'
import { generateLeagueCode } from '@/lib/leagueCode'
import { LEAGUE_CODE_LENGTH } from '@/lib/codeHints'

const schema = z.object({
  code: z.string().length(LEAGUE_CODE_LENGTH),
  /** Also invalidate read-only share links that are already out. Off by default. */
  revokeViewLinks: z.boolean().optional().default(false),
})

/**
 * POST /api/leagues/rotate-code
 *
 * Changes a league's code — the credential anyone edits with. This is the only
 * way to withdraw edit access from someone you previously gave the code to,
 * because there is no membership table to remove them from.
 *
 * OWNER ONLY, and that is the one place in this app where owner_id is
 * authorization rather than just "whose plan pays". Gating on the code instead
 * would hand the power to the very person being removed. The check is inside
 * the SQL function (fd_022), under a row lock, so it cannot be raced.
 *
 * NOT gated on the plan. Rotating is a security action, and paywalling "lock
 * this person out of my league" would be indefensible — a lapsed owner is
 * exactly who needs it. Middleware exempts this path for the same reason.
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

  const oldCode = parsed.data.code.toUpperCase()
  const serviceSupabase = getSupabaseServiceRole()

  // Retry only on a code collision. Every other refusal is terminal — retrying a
  // not_owner ten times just makes ten identical failures.
  for (let attempt = 0; attempt < 10; attempt++) {
    const { data, error } = await serviceSupabase.rpc('fd_rotate_league_code', {
      p_old_code: oldCode,
      p_new_code: generateLeagueCode(),
      p_owner: session.user.id,
      p_revoke_view_links: parsed.data.revokeViewLinks,
    })

    if (error) {
      console.error('[rotate-code] rpc failed', { league: oldCode, user: session.user.id, error })
      return NextResponse.json({ error: 'Could not change the code. Please try again.' }, { status: 500 })
    }

    const result = data as { ok: boolean; code?: string; reason?: string }
    if (result?.ok) {
      return NextResponse.json(
        { code: result.code, viewLinksRevoked: parsed.data.revokeViewLinks },
        { headers: { 'Cache-Control': 'private, no-store' } }
      )
    }

    if (result?.reason === 'code_taken') continue

    if (result?.reason === 'not_found') {
      return NextResponse.json({ error: 'League not found.' }, { status: 404 })
    }
    // not_owner covers both "someone else owns it" and "nobody does". Say so
    // precisely: an unclaimed league is fixable by claiming it, and telling that
    // user "this is not your league" would be a dead end.
    return NextResponse.json(
      { error: 'Only the league owner can change the code. If no one owns this league yet, claim it first on your account page.' },
      { status: 403 }
    )
  }

  return NextResponse.json({ error: 'Could not generate a unique code. Try again.' }, { status: 500 })
}
