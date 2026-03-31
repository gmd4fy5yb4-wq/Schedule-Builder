import { getSupabase } from './supabase'
import type { AppState } from './types'

export interface LeagueRecord {
  data: AppState
  updatedAt: string
  updatedBy: string
}

export async function loadLeague(code: string): Promise<LeagueRecord | null> {
  const { data, error } = await getSupabase()
    .from('leagues')
    .select('data, updated_at, updated_by')
    .eq('id', code.toUpperCase())
    .single()
  if (error || !data) return null
  return { data: data.data as AppState, updatedAt: data.updated_at, updatedBy: data.updated_by }
}

export async function saveLeague(code: string, state: AppState, userName: string): Promise<boolean> {
  const { error } = await getSupabase()
    .from('leagues')
    .upsert({ id: code.toUpperCase(), data: state, updated_at: new Date().toISOString(), updated_by: userName })
  return !error
}

export async function leagueExists(code: string): Promise<boolean> {
  const { data } = await getSupabase()
    .from('leagues')
    .select('id')
    .eq('id', code.toUpperCase())
    .single()
  return !!data
}

export function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

// ── Read-only view tokens ──────────────────────────────────────────────────────
// A view_token is a random UUID stored alongside the league. It is completely
// separate from the admin code and cannot be used to modify the league.

function randomToken(): string {
  // Use crypto.randomUUID if available, otherwise fall back to a hex string
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
}

/** Returns the existing view token for a league, or creates and saves a new one. */
export async function getOrCreateViewToken(leagueCode: string): Promise<string | null> {
  const sb = getSupabase()
  const code = leagueCode.toUpperCase()

  // Check if one already exists
  const { data } = await sb
    .from('leagues')
    .select('view_token')
    .eq('id', code)
    .single()

  if (data?.view_token) return data.view_token as string

  // Generate and save a new token
  const token = randomToken()
  const { error } = await sb
    .from('leagues')
    .update({ view_token: token })
    .eq('id', code)

  return error ? null : token
}

/** Loads a league by its read-only view token (never exposes the admin code). */
export async function loadLeagueByViewToken(token: string): Promise<LeagueRecord | null> {
  const { data, error } = await getSupabase()
    .from('leagues')
    .select('data, updated_at, updated_by')
    .eq('view_token', token)
    .single()
  if (error || !data) return null
  return { data: data.data as AppState, updatedAt: data.updated_at, updatedBy: data.updated_by }
}

// ── Snapshots ─────────────────────────────────────────────────────────────────

export interface Snapshot {
  id: string
  name: string
  data: AppState
  createdAt: string
  createdBy: string
}

export async function saveSnapshot(leagueId: string, name: string, state: AppState, userName: string): Promise<boolean> {
  const { error } = await getSupabase()
    .from('league_snapshots')
    .insert({ league_id: leagueId.toUpperCase(), name, data: state, created_by: userName })
  return !error
}

export async function listSnapshots(leagueId: string): Promise<Snapshot[]> {
  const { data } = await getSupabase()
    .from('league_snapshots')
    .select('id, name, data, created_at, created_by')
    .eq('league_id', leagueId.toUpperCase())
    .order('created_at', { ascending: false })
    .limit(30)
  return (data ?? []).map(s => ({
    id: s.id,
    name: s.name,
    data: s.data as AppState,
    createdAt: s.created_at,
    createdBy: s.created_by,
  }))
}

export async function deleteSnapshot(id: string): Promise<boolean> {
  const { error } = await getSupabase()
    .from('league_snapshots')
    .delete()
    .eq('id', id)
  return !error
}
