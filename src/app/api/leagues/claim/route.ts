import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseServer, getSupabaseServiceRole } from '@/lib/supabase-server'

const schema = z.object({
  code: z.string().length(6),
})

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServer()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  }

  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid league code.' }, { status: 422 })
  }

  const code = parsed.data.code.toUpperCase()
  const serviceSupabase = getSupabaseServiceRole()

  // Atomic conditional UPDATE — eliminates SELECT-then-UPDATE race condition.
  // Only sets owner_id if the league is unclaimed (NULL) or already owned by this user.
  const { data, error } = await serviceSupabase
    .from('leagues')
    .update({ owner_id: session.user.id })
    .eq('id', code)
    .or(`owner_id.is.null,owner_id.eq.${session.user.id}`)
    .select('id, owner_id')
    .single()

  if (error || !data) {
    // No row returned = league not found OR already claimed by someone else
    const { data: exists } = await serviceSupabase
      .from('leagues')
      .select('id')
      .eq('id', code)
      .single()

    if (!exists) return NextResponse.json({ error: 'League not found.' }, { status: 404 })
    return NextResponse.json({ error: 'This league is already claimed by another account.' }, { status: 409 })
  }

  return NextResponse.json({ success: true, code: data.id })
}
