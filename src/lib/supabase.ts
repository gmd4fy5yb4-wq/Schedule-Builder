import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Lazy singleton — only initialized when first called in the browser,
// not at module import time (which would crash Next.js static prerendering)
let _client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  _client = createClient(url, key)
  return _client
}
