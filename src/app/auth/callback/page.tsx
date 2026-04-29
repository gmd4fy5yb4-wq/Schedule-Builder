'use client'
import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'

/**
 * Client-side auth callback — handles Supabase implicit flow.
 *
 * With flowType: 'implicit', Supabase puts the session tokens directly in the
 * URL hash (#access_token=...&refresh_token=...) so no PKCE code verifier is
 * needed. This makes magic links work from any browser or device, not just the
 * one that originally requested the link.
 *
 * createBrowserClient processes the hash automatically on init; we just wait
 * for the SIGNED_IN event from onAuthStateChange.
 */
export default function AuthCallbackPage() {
  const [status, setStatus] = useState<'exchanging' | 'error'>('exchanging')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const sb = getSupabase()

    // onAuthStateChange fires with SIGNED_IN once the client has processed
    // the #access_token hash and saved the session.
    const { data: { subscription } } = sb.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        subscription.unsubscribe()
        const next = localStorage.getItem('sb-login-next')
        if (next) localStorage.removeItem('sb-login-next')
        window.location.replace(next && next !== '/' ? next : '/')
        return
      }
      if (event === 'SIGNED_OUT') {
        setErrorMsg('Sign-in failed or link expired. Please request a new magic link.')
        setStatus('error')
        subscription.unsubscribe()
      }
    })

    // Fallback: if already signed in (e.g. page refresh), redirect immediately
    sb.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        subscription.unsubscribe()
        const next = localStorage.getItem('sb-login-next')
        if (next) localStorage.removeItem('sb-login-next')
        window.location.replace(next && next !== '/' ? next : '/')
      }
    })

    // Timeout fallback after 10s if nothing fires
    const timeout = setTimeout(() => {
      subscription.unsubscribe()
      setErrorMsg('Sign-in timed out. The link may have expired — please request a new one.')
      setStatus('error')
    }, 10000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Sign-in failed</h2>
          <p className="text-gray-500 text-sm mb-6">{errorMsg}</p>
          <a
            href="/login"
            className="inline-block px-6 py-2.5 rounded-lg bg-[#00013a] text-white text-sm font-semibold hover:bg-[#000128] transition-colors"
          >
            Back to sign in
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-[#00013a] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-500 text-sm">Signing you in…</p>
      </div>
    </div>
  )
}
