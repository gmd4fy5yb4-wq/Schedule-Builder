import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

// Lazy singleton — only initialized when first called in the browser
let _client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (_client) return _client
  // No flowType here on purpose: createBrowserClient hardcodes
  // flowType: 'pkce' after spreading the caller's auth options, so passing
  // 'implicit' was a silent no-op that read as a deliberate choice. PKCE is
  // harmless for this app — /login signs in with an 8-digit code via
  // verifyOtp(), which is flow-agnostic and works on any device. Revisit only
  // if the Supabase email template starts sending links again; see
  // src/app/auth/callback/page.tsx.
  _client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  return _client
}
