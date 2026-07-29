'use client'
import { useState, useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'
import { getPlan } from '@/lib/plans'
import { billingLine } from '@/lib/planUsage'
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
      setClaimStatus({ type: 'success', msg: `League ${data.code} is now linked to your account.` })
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

  const plan = getPlan((sub?.plan_tier ?? 'trial') as Parameters<typeof getPlan>[0])
  const isActive = sub?.subscription_status === 'active' || sub?.subscription_status === 'trialing'

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <a href="/" className="text-sm text-gray-500 hover:text-gray-700">← Back to app</a>
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

          <h2 className="text-2xl font-bold text-gray-900 mb-1">{plan.name}</h2>
          <p className="text-sm text-gray-500 mb-4">
            {plan.sportsLimit >= 999 ? 'Unlimited' : plan.sportsLimit} sport{plan.sportsLimit !== 1 ? 's' : ''} ·{' '}
            {plan.divisionsLimit >= 999 ? 'Unlimited' : plan.divisionsLimit} divisions ·{' '}
            {plan.teamsLimit >= 999 ? 'Unlimited' : plan.teamsLimit} teams
          </p>

          {sub && <p className="text-sm text-gray-600 mb-4">{billingLine(sub)}</p>}

          <div className="flex gap-3">
            {sub?.stripe_customer_id ? (
              <button
                onClick={handleManageBilling}
                disabled={portalLoading}
                className="text-sm font-semibold text-[#00013a] underline disabled:opacity-50"
              >
                {portalLoading ? 'Opening…' : 'Manage billing →'}
              </button>
            ) : (
              <a href="/pricing" className="text-sm font-semibold text-[#00013a] underline">
                Upgrade plan →
              </a>
            )}
          </div>
        </div>

        {/* Owned leagues */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-4">Your Leagues</h2>
          {leagues.length === 0 ? (
            <p className="text-sm text-gray-400">No leagues linked to your account yet.</p>
          ) : (
            <ul className="space-y-2">
              {leagues.map(league => (
                <li key={league.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div>
                    <span className="font-mono text-sm font-semibold text-gray-800">{league.id}</span>
                    <span className="text-xs text-gray-400 ml-3">
                      Updated {new Date(league.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                  <a href={`/?code=${league.id}`} className="text-xs text-[#00013a] underline">
                    Open →
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Claim a league */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-2">Claim an Existing League</h2>
          <p className="text-sm text-gray-500 mb-4">
            Already have a league code? Enter it here to link it to your account so only you can manage it.
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
