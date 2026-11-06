import type { Ingredient, Step } from './types'
import { supabase } from './supabase'

export type ShareKind = 'once' | 'open'

/** One of your own links, as listed under a recipe (the secret token itself is never readable). */
export type ShareRow = {
  id: string
  recipe_id: string
  kind: ShareKind
  created_at: string
  expires_at: string
  claimed_at: string | null
  views: number
  revoked_at: string | null
}

/** The frozen copy of a recipe that a link hands out. */
export type SharedSnapshot = {
  title: string
  tags: string[]
  servings: number | null
  source_type: string
  source_url: string | null
  ingredients: Ingredient[]
  steps: Step[]
  shared_by: string | null
}

export type ShareStatus = 'ok' | 'used' | 'expired' | 'revoked' | 'invalid'
export type Peek = { status: ShareStatus; kind?: ShareKind; mine?: boolean; title?: string; shared_by?: string | null }
export type Opened = { status: ShareStatus; kind?: ShareKind; expires_at?: string; snapshot?: SharedSnapshot }

const CLAIM_KEY = 'tweaked.claim'
const PENDING_KEY = 'tweaked.pendingShare'
let memoryClaim: string | null = null

const randomHex = (bytes: number) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('')

/**
 * A random secret that stays in THIS browser. A one-person link is claimed by it, so that browser can
 * reopen the link later while everyone else is told it has been used.
 */
export function claimToken(): string {
  try {
    const have = localStorage.getItem(CLAIM_KEY)
    if (have && have.length >= 16) return have
    const next = randomHex(16)
    localStorage.setItem(CLAIM_KEY, next)
    return next
  } catch {
    memoryClaim ??= randomHex(16)
    return memoryClaim
  }
}

export const shareUrl = (token: string) => `${window.location.origin}/s/${token}`

export async function createShare(recipeId: string, kind: ShareKind): Promise<{ id: string; token: string; url: string }> {
  const { data, error } = await supabase.rpc('create_share', { p_recipe: recipeId, p_kind: kind })
  if (error) throw new Error(error.message)
  const res = data as { id: string; token: string }
  return { ...res, url: shareUrl(res.token) }
}

export async function listShares(recipeId: string): Promise<ShareRow[]> {
  const { data, error } = await supabase
    .from('recipe_shares')
    .select('id, recipe_id, kind, created_at, expires_at, claimed_at, views, revoked_at')
    .eq('recipe_id', recipeId)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) throw new Error(error.message)
  return (data ?? []) as ShareRow[]
}

export async function revokeShare(id: string): Promise<void> {
  const { error } = await supabase.from('recipe_shares').update({ revoked_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function peekShare(token: string): Promise<Peek> {
  const { data, error } = await supabase.rpc('peek_share', { p_token: token, p_claim: claimToken() })
  if (error) throw new Error('Could not check that link. Check your connection.')
  return data as Peek
}

export async function openShare(token: string): Promise<Opened> {
  const { data, error } = await supabase.rpc('open_share', { p_token: token, p_claim: claimToken() })
  if (error) throw new Error('Could not open that link. Check your connection.')
  return data as Opened
}

/** A link a signed-out visitor wanted to keep: remembered so they land back on it after signing up. */
export const pendingShare = {
  get(): string | null {
    try {
      return localStorage.getItem(PENDING_KEY)
    } catch {
      return null
    }
  },
  set(token: string) {
    try {
      localStorage.setItem(PENDING_KEY, token)
    } catch {
      /* private mode: they will need to open the link again */
    }
  },
  clear() {
    try {
      localStorage.removeItem(PENDING_KEY)
    } catch {
      /* nothing to clear */
    }
  },
}

/** Plain-words state of one of your links. */
export function describeShare(s: ShareRow, now = Date.now()): { label: string; live: boolean } {
  if (s.revoked_at) return { label: 'Stopped by you', live: false }
  if (new Date(s.expires_at).getTime() < now) return { label: 'Expired', live: false }
  if (s.kind === 'once') return s.claimed_at ? { label: 'Opened, now kept by one person', live: true } : { label: 'Waiting to be opened', live: true }
  return { label: s.views === 0 ? 'Open to anyone, not viewed yet' : `Open to anyone, viewed ${s.views} ${s.views === 1 ? 'time' : 'times'}`, live: true }
}
