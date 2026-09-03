import { NextResponse } from 'next/server'
import { getSupabaseServer, getSupabaseServiceRole } from '@/lib/supabase-server'
import { sendWelcomeEmail } from '@/lib/welcomeEmail'

// Hit by /login right after a successful code verification. Idempotent — the
// helper sends once per user, so calling it on every sign-in is fine.
export async function POST() {
  const supabase = await getSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  return NextResponse.json({ result: await sendWelcomeEmail(user, getSupabaseServiceRole()) })
}
