'use client'
import { useState, useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'
import Icon from '@/components/Icon'

// Translates raw Supabase Auth error strings into copy a user can act on,
// instead of surfacing SDK internals (rate-limit wording, etc.) directly.
function friendlyAuthError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('rate limit') || m.includes('security purposes')) {
    return 'Too many attempts — please wait a minute and try again.'
  }
  if (m.includes('email') && (m.includes('invalid') || m.includes('valid'))) {
    return "That doesn't look like a valid email address."
  }
  if (m.includes('network') || m.includes('fetch')) {
    return 'Network error — check your connection and try again.'
  }
  return "Something went wrong sending your sign-in code. Please try again."
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // OTP code entry (for iOS PWA / mobile — avoids Safari redirect)
  const [code, setCode] = useState('')
  const [verifyLoading, setVerifyLoading] = useState(false)
  const [verifyError, setVerifyError] = useState('')

  // Seconds until "resend" is offered again. Supabase rate-limits repeat sends,
  // so an always-live resend button mostly produces rate-limit errors — the
  // countdown says "wait" instead of letting the user earn one.
  const [resendIn, setResendIn] = useState(0)
  useEffect(() => {
    if (resendIn <= 0) return
    const t = setTimeout(() => setResendIn(n => n - 1), 1000)
    return () => clearTimeout(t)
  }, [resendIn])

  // Also used by the resend link, which hands over a MouseEvent rather than a submit.
  async function handleLogin(e?: { preventDefault: () => void }) {
    e?.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    setError('')

    // Stash the ?next= destination in localStorage right before sending the link,
    // so page.tsx can redirect there after auth without putting query params in
    // emailRedirectTo (which breaks Supabase's URL allowlist validation).
    const params = new URLSearchParams(window.location.search)
    const next = params.get('next')
    if (next && next !== '/') {
      localStorage.setItem('sb-login-next', next)
    }

    // Always use the production site URL if set, so magic links point to the
    // deployed app instead of localhost. The callback URL must be a plain path
    // with no query params — Supabase validates it against the exact allowlist entry.
    const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || window.location.origin
    const callbackUrl = `${siteOrigin}/auth/callback`

    const { error: authError } = await getSupabase().auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: callbackUrl,
        // Records signup origin in raw_user_meta_data. The Sports Supabase project is
        // shared by three apps, so without this a signup cannot be attributed. Applies
        // at user creation only — a returning user's attribution is never rewritten.
        data: { app: 'fieldday' },
      },
    })

    if (authError) {
      setError(friendlyAuthError(authError.message))
      setLoading(false)
      return
    }

    setSent(true)
    setResendIn(60)
    setLoading(false)
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault()
    const trimmedCode = code.trim()
    if (trimmedCode.length < 8) return
    setVerifyLoading(true)
    setVerifyError('')

    const { error: otpError } = await getSupabase().auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: trimmedCode,
      type: 'email',
    })

    if (otpError) {
      setVerifyError('Invalid or expired code — check your email and try again.')
      setVerifyLoading(false)
      return
    }

    // Success — redirect (session is now set in this browser context)
    const next = localStorage.getItem('sb-login-next')
    if (next) localStorage.removeItem('sb-login-next')
    window.location.replace(next && next !== '/' ? next : '/')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo / brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-[#00013a] text-white text-2xl font-bold mb-4">
            FD
          </div>
          <h1 className="text-2xl font-bold text-gray-900">FieldDay Planner</h1>
          <p className="text-gray-500 text-sm mt-1">Any sport. Any league. One planner.</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          {sent ? (
            <div>
              <div className="text-center mb-5">
                <Icon name="mail" className="w-10 h-10 mx-auto mb-3 text-[var(--fd-primary)]" />
                <h2 className="text-lg font-semibold text-gray-900 mb-1">Check your email</h2>
                <p className="text-gray-500 text-sm">
                  We sent a sign-in link and an 8-digit code to <strong>{email}</strong>{' '}
                  {/* Keeps the address so a typo can be corrected, not retyped. */}
                  <button
                    onClick={() => { setSent(false); setCode(''); setVerifyError(''); setError('') }}
                    className="underline text-[#00013a]"
                  >
                    edit
                  </button>
                </p>
              </div>

              {/* OTP code entry — works in iOS PWA without leaving the app */}
              <form onSubmit={handleVerifyCode} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Enter the 8-digit code from the email
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    maxLength={8}
                    value={code}
                    onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    placeholder="12345678"
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-center text-xl font-mono tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-[#00013a] focus:border-transparent"
                  />
                </div>
                {verifyError && <p className="text-red-600 text-sm">{verifyError}</p>}
                <button
                  type="submit"
                  disabled={verifyLoading || code.length < 8}
                  className="w-full py-2.5 px-4 rounded-lg bg-[#00013a] text-white text-sm font-semibold disabled:opacity-50 hover:bg-[#000128] transition-colors"
                >
                  {verifyLoading ? 'Verifying…' : 'Sign in'}
                </button>
              </form>

              <div className="mt-4 pt-4 border-t border-gray-100 text-center space-y-1">
                <p className="text-gray-500 text-xs">
                  On desktop? Just click the link in the email.
                </p>
                <p className="text-gray-500 text-xs">
                  Nothing after a minute? Check spam, or{' '}
                  {resendIn > 0 ? (
                    <span className="text-gray-400">resend in {resendIn}s</span>
                  ) : (
                    <button onClick={handleLogin} disabled={loading} className="underline text-[#00013a] disabled:opacity-50">
                      {loading ? 'sending…' : 'resend the email'}
                    </button>
                  )}
                </p>
                <p className="text-gray-500 text-xs">
                  The link and code expire in 1 hour.
                </p>
              </div>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Sign in</h2>
              <p className="text-gray-500 text-sm mb-6">
                Enter your email and we&apos;ll send you a sign-in code — no password needed.
              </p>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#00013a] focus:border-transparent"
                    required
                  />
                </div>

                {error && (
                  <p className="text-red-600 text-sm">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading || !email.trim()}
                  className="w-full py-2.5 px-4 rounded-lg bg-[#00013a] text-white text-sm font-semibold disabled:opacity-50 hover:bg-[#000128] transition-colors"
                >
                  {loading ? 'Sending…' : 'Send sign-in code'}
                </button>
              </form>

              <div className="text-center mt-6">
                <p className="text-gray-500 text-xs">
                  New to FieldDay?{' '}
                  <a href="/pricing" className="text-[#00013a] underline font-medium">
                    Start free — create your league
                  </a>
                </p>
                <p className="text-gray-400 text-xs mt-1">14-day full trial · no credit card</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
