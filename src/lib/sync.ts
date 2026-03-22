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
