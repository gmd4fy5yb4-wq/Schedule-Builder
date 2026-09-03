'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getSupabase } from '@/lib/supabase'
import { getPlan, planDisplayName } from '@/lib/plans'
import { billingLine, planCta } from '@/lib/planUsage'
import type { User } from '@supabase/supabase-js'

interface Subscription {
  plan_tier: string
  subscription_status: string
  subscription_end: string | null
  stripe_customer_id: string | null
  billing_period: string | null
  sports_limit: number
  divisions_limit: number
  teams_limit: number
}

interface OwnedLeague {
  id: string
  updated_at: string
  updated_by: string
}

export default function AccountPage() {
  const [user, setUser] = useState<User | null>(null)
  const [sub, setSub] = useState<Subscription | null>(null)
  const [leagues, setLeagues] = useState<OwnedLeague[]>([])
  const [claimCode, setClaimCode] = useState('')
  const [claimStatus, setClaimStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [claimLoading, setClaimLoading] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  // Which league's "change code" panel is open, and whether that rotation should
  // also kill share links already in circulation.
  const [rotating, setRotating] = useState<string | null>(null)
  const [rotateRevokeLinks, setRotateRevokeLinks] = useState(false)
  const [rotateBusy, setRotateBusy] = useState(false)
  const [rotated, setRotated] = useState<{ from: string; to: string; linksRevoked: boolean } | null>(null)
  const [rotateError, setRotateError] = useState<string | null>(null)

  useEffect(() => {
    const sb = getSupabase()
    sb.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.href = '/login'; return }
      setUser(session.user)

      const [{ data: subData }, { data: leaguesData }] = await Promise.all([
        sb.from('user_subscriptions').select('*').eq('user_id', session.user.id).single(),
        sb.from('leagues').select('id, updated_at, updated_by').eq('owner_id', session.user.id).order('updated_at', { ascending: false }),
      ])

      if (subData) setSub(subData as Subscription)
      if (leaguesData) setLeagues(leaguesData as OwnedLeague[])
      setLoading(false)
    })
  }, [])

  async function handleClaim(e: React.FormEvent) {
    e.preventDefault()
    if (!claimCode.trim()) return
    setClaimLoading(true)
    setClaimStatus(null)

    const res = await fetch('/api/leagues/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: claimCode.toUpperCase().trim() }),
    })
    const data = await res.json()

    if (res.ok) {
      setClaimStatus({ type: 'success', msg: `You now own league ${data.code}.` })
      setClaimCode('')
      // Refresh leagues list
      const sb = getSupabase()
      const { data: { session } } = await sb.auth.getSession()
      if (session) {
        const { data: leaguesData } = await sb
          .from('leagues')
          .select('id, updated_at, updated_by')
          .eq('owner_id', session.user.id)
          .order('updated_at', { ascending: false })
        if (leaguesData) setLeagues(leaguesData as OwnedLeague[])
      }
    } else {
      setClaimStatus({ type: 'error', msg: data.error ?? 'Failed to claim league.' })
    }
    setClaimLoading(false)
  }

  async function handleRotate(oldCode: string) {
    setRotateBusy(true)
    setRotateError(null)

    const res = await fetch('/api/leagues/rotate-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: oldCode, revokeViewLinks: rotateRevokeLinks }),
    })
    const data = await res.json()

    if (res.ok) {
      // This browser may itself be holding the old code — page.tsx loads from
      // localStorage on boot and would silently fail to find the league, which
      // reads as "my league is gone" rather than "I just changed the code".
      if (localStorage.getItem('sb-league-code') === oldCode) {
        localStorage.setItem('sb-league-code', data.code)
      }
      localStorage.removeItem(`fd-unload-${oldCode}`)
      setLeagues(prev => prev.map(l => (l.id === oldCode ? { ...l, id: data.code } : l)))
      setRotated({ from: oldCode, to: data.code, linksRevoked: !!data.viewLinksRevoked })
      setRotating(null)
      setRotateRevokeLinks(false)
    } else {
      setRotateError(data.error ?? 'Could not change the code.')
    }
    setRotateBusy(false)
  }

  async function handleManageBilling() {
    setPortalLoading(true)
    const res = await fetch('/api/payments/portal', { method: 'POST' })
    const data = await res.json()
    if (res.ok && data.url) {
      window.location.href = data.url
    } else {
      alert(data.error ?? 'Could not open billing portal.')
      setPortalLoading(false)
    }
  }

  async function handleSignOut() {
    await getSupabase().auth.signOut()
    window.location.href = '/'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading…</div>
      </div>
    )
  }

  // Name and limits both come from the row itself. Routing them through
  // getPlan(plan_tier) showed every tier PLANS doesn't sell — 'unlimited',
  // legacy 'small' — as "Free Trial" with trial limits it does not have.
  const planName = planDisplayName(sub?.plan_tier)
  // 'none' covers a non-expiring account: nothing to sell it, no portal to open.
  const cta = sub ? planCta(sub) : 'buy'
  const fallback = getPlan('trial')
  const limits = {
    sports: sub?.sports_limit ?? fallback.sportsLimit,
    divisions: sub?.divisions_limit ?? fallback.divisionsLimit,
    teams: sub?.teams_limit ?? fallback.teamsLimit,
  }
  const isActive = sub?.subscription_status === 'active' || sub?.subscription_status === 'trialing'

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">← Back to app</Link>
            <h1 className="text-2xl font-bold text-gray-900 mt-1">My Account</h1>
          </div>
          <button
            onClick={handleSignOut}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Sign out
          </button>
        </div>

        {/* Profile */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-3">Account</h2>
          <p className="text-sm text-gray-500">
            Signed in as <span className="font-medium text-gray-800">{user?.email}</span>
          </p>
        </div>

        {/* Subscription */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-start justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Plan</h2>
            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
              isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
              {sub?.subscription_status ?? 'No plan'}
            </span>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-1">{planName}</h2>
          <p className="text-sm text-gray-500 mb-4">
            {limits.sports >= 999 ? 'Unlimited' : limits.sports} sport{limits.sports !== 1 ? 's' : ''} ·{' '}
            {limits.divisions >= 999 ? 'Unlimited' : limits.divisions} divisions ·{' '}
            {limits.teams >= 999 ? 'Unlimited' : limits.teams} teams
          </p>

          {sub && <p className="text-sm text-gray-600 mb-4">{billingLine(sub)}</p>}

          <div className="flex gap-3">
            {cta === 'manage' && (
              <button
                onClick={handleManageBilling}
                disabled={portalLoading}
                className="text-sm font-semibold text-[#00013a] underline disabled:opacity-50"
              >
                {portalLoading ? 'Opening…' : 'Manage billing →'}
              </button>
            )}
            {cta === 'buy' && (
              <a href="/pricing" className="text-sm font-semibold text-[#00013a] underline">
                Upgrade plan →
              </a>
            )}
          </div>
        </div>

        {/* Owned leagues */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-1">Leagues You Own</h2>
          <p className="text-xs text-gray-400 mb-4">
            Leagues you joined with someone else&rsquo;s code aren&rsquo;t listed here.
          </p>
          {leagues.length === 0 ? (
            <p className="text-sm text-gray-400">You don&rsquo;t own any leagues yet.</p>
          ) : (
            <ul className="space-y-2">
              {leagues.map(league => (
                <li key={league.id} className="py-2 border-b border-gray-100 last:border-0">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <span className="font-mono text-sm font-semibold text-gray-800">{league.id}</span>
                      <span className="text-xs text-gray-400 ml-3">
                        Updated {new Date(league.updated_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <button
                        onClick={() => {
                          setRotating(rotating === league.id ? null : league.id)
                          setRotateRevokeLinks(false)
                          setRotateError(null)
                          setRotated(null)
                        }}
                        className="text-xs text-gray-500 underline hover:text-gray-700"
                      >
                        Change code
                      </button>
                      <a href={`/?code=${league.id}`} className="text-xs text-[#00013a] underline">
                        Open →
                      </a>
                    </div>
                  </div>

                  {rotating === league.id && (
                    <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-4">
                      <p className="text-sm text-amber-900 font-semibold mb-1">
                        Change the code for {league.id}?
                      </p>
                      <p className="text-sm text-amber-900 mb-3">
                        The code is how people edit this league, so this is how you remove
                        someone you gave it to. <span className="font-semibold">Everyone</span>{' '}
                        using the old code loses access &mdash; including you on your other
                        devices &mdash; so send the new one to the people you still want editing.
                        Your schedule, snapshots and settings are untouched.
                      </p>

                      <label className="flex items-start gap-2 mb-4 text-sm text-amber-900">
                        <input
                          type="checkbox"
                          checked={rotateRevokeLinks}
                          onChange={e => setRotateRevokeLinks(e.target.checked)}
                          className="mt-0.5"
                        />
                        <span>
                          Also break the read-only share links already sent out.{' '}
                          <span className="text-amber-800">
                            Leave this off to let coaches and parents keep viewing the schedule
                            &mdash; those links can&rsquo;t edit anything. Turn it on if the person
                            you&rsquo;re removing shouldn&rsquo;t see it either; you&rsquo;ll need to
                            re-share a fresh link with everyone.
                          </span>
                        </span>
                      </label>

                      <div className="flex gap-3">
                        <button
                          onClick={() => handleRotate(league.id)}
                          disabled={rotateBusy}
                          className="px-4 py-2 rounded-lg bg-amber-900 text-white text-sm font-semibold disabled:opacity-50 hover:bg-amber-800 transition-colors"
                        >
                          {rotateBusy ? 'Changing…' : 'Change code'}
                        </button>
                        <button
                          onClick={() => { setRotating(null); setRotateError(null) }}
                          disabled={rotateBusy}
                          className="text-sm text-amber-900 underline disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>

                      {rotateError && <p className="mt-3 text-sm text-red-600">{rotateError}</p>}
                    </div>
                  )}

                  {rotated?.to === league.id && (
                    <div className="mt-3 rounded-lg bg-green-50 border border-green-200 p-4">
                      <p className="text-sm text-green-900">
                        <span className="font-semibold">{rotated.from}</span> is now{' '}
                        <span className="font-mono font-semibold">{rotated.to}</span>. The old
                        code no longer works.
                        {rotated.linksRevoked
                          ? ' Existing read-only share links have been broken — open the league and share a new one.'
                          : ' Read-only share links already sent out still work.'}
                      </p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Claim a league */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-2">Claim an Existing League</h2>
          <p className="text-sm text-gray-500 mb-4">
            Enter a league code to become its owner &mdash; your plan then covers that
            league&rsquo;s limits. You can&rsquo;t claim a league someone else already owns, and
            anyone who has the code can still edit the schedule.
          </p>

          <form onSubmit={handleClaim} className="flex gap-3">
            <input
              type="text"
              value={claimCode}
              onChange={e => setClaimCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6))}
              placeholder="LEAGUE CODE"
              maxLength={6}
              className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-sm font-mono font-semibold uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-[#00013a]"
            />
            <button
              type="submit"
              disabled={claimCode.length !== 6 || claimLoading}
              className="px-5 py-2 rounded-lg bg-[#00013a] text-white text-sm font-semibold disabled:opacity-50 hover:bg-[#000128] transition-colors"
            >
              {claimLoading ? 'Claiming…' : 'Claim'}
            </button>
          </form>

          {claimStatus && (
            <p className={`mt-3 text-sm ${claimStatus.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
              {claimStatus.msg}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
