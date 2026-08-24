'use client'
import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import Icon from '@/components/Icon'

/**
 * Client-side auth callback.
 *
 * NOTE (verified in production 2026-08-24): this app does NOT use magic links.
 * The Supabase email template emits only the 8-digit code ({{ .Token }}), and
 * /login signs users in with verifyOtp() directly — which never routes through
 * here. This page only matters if a Supabase email template is ever changed to
 * include a confirmation URL again.
 *
 * It also does NOT run the implicit flow, despite what this comment used to
 * claim: createBrowserClient hardcodes flowType: 'pkce' AFTER spreading the
 * caller's auth options (@supabase/ssr createBrowserClient.js), so the flow is
 * PKCE and has been since at least May 2026 (auth.flow_state rows carry
 * code_challenge_method 's256'). PKCE ties the sign-in to the browser that
 * requested it, so if links are ever re-enabled in the email template, opening
 * one on a different device would fail here — switch to plain createClient with
 * a cookie adapter (as Prospect Card does) before doing that.
 *
 * The handler below waits for SIGNED_IN from onAuthStateChange, which covers a
 * hash-token redirect; a ?code= redirect would need exchangeCodeForSession.
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
          <Icon name="alert" className="w-10 h-10 mx-auto mb-4 text-amber-500" />
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
