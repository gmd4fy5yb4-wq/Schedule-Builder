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

  const { data: league, error: fetchError } = await serviceSupabase
    .from('leagues')
    .select('id, owner_id')
    .eq('id', code)
    .single()

  if (fetchError || !league) {
    return NextResponse.json({ error: 'League not found.' }, { status: 404 })
  }

  if (league.owner_id && league.owner_id !== session.user.id) {
    return NextResponse.json(
      { error: 'This league is already claimed by another account.' },
      { status: 409 }
    )
  }

  const { error: updateError } = await serviceSupabase
    .from('leagues')
    .update({ owner_id: session.user.id })
    .eq('id', code)

  if (updateError) {
    return NextResponse.json({ error: 'Failed to claim league.' }, { status: 500 })
  }

  return NextResponse.json({ success: true, code })
}
