'use client'
import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'

/**
 * Client-side auth callback handler.
 *
 * Supabase magic links use PKCE: the code verifier is stored in the browser
 * (localStorage/sessionStorage) when signInWithOtp() is called. The exchange
 * MUST happen in the same browser context — a server-side route handler can't
 * access the client's PKCE verifier, so we do it here instead.
 */
export default function AuthCallbackPage() {
  const [status, setStatus] = useState<'exchanging' | 'error'>('exchanging')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')

    if (!code) {
      setErrorMsg('No auth code in URL. The magic link may have expired — please request a new one.')
      setStatus('error')
      return
    }

    getSupabase()
      .auth.exchangeCodeForSession(code)
      .then(({ error }) => {
        if (error) {
          setErrorMsg(error.message)
          setStatus('error')
          return
        }

        // Success — navigate to intended destination (stored before login)
        const next = localStorage.getItem('sb-login-next')
        if (next) localStorage.removeItem('sb-login-next')
        window.location.replace(next && next !== '/' ? next : '/')
      })
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
