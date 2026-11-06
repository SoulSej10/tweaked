import { useSyncExternalStore } from 'react'
import { mergeLines, parseLine } from './shopText'
import { supabase } from './supabase'

export type ShopItem = { id: string; text: string; done: boolean; from: string | null }

// The list lives on this device first (so it is instant and works offline) and is mirrored to the
// signed-in account in the background, so the same list shows up on every device you use.
const KEY = 'tweaked.shopping'
const SYNCED_KEY = 'tweaked.shopping.synced' // ids the server is known to have
const OWNER_KEY = 'tweaked.shopping.owner' // whose list is stored here
const listeners = new Set<() => void>()

function read(): ShopItem[] {
  try {
    const raw = localStorage.getItem(KEY)
    const arr = raw ? (JSON.parse(raw) as ShopItem[]) : []
    return Array.isArray(arr) ? arr.filter((i) => i && typeof i.text === 'string') : []
  } catch {
    return []
  }
}

function readSynced(): Set<string> {
  try {
    const arr = JSON.parse(localStorage.getItem(SYNCED_KEY) ?? '[]')
    return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

let items: ShopItem[] = read()
let synced = readSynced()
let dirty = false

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(items))
    localStorage.setItem(SYNCED_KEY, JSON.stringify([...synced]))
  } catch {
    /* private mode: list lasts for this visit only */
  }
}

function setItems(next: ShopItem[], sync: boolean) {
  items = next
  save()
  listeners.forEach((l) => l())
  if (sync) {
    dirty = true
    schedulePush()
  }
}

const commit = (next: ShopItem[]) => setItems(next, true)

function subscribe(fn: () => void) {
  listeners.add(fn)
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      items = read()
      fn()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(fn)
    window.removeEventListener('storage', onStorage)
  }
}

export function useShopping(): ShopItem[] {
  return useSyncExternalStore(subscribe, () => items)
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()))

/**
 * Add lines to the list. A line that is already there is skipped; "2 eggs" from one recipe and "1 egg" from another
 * are added together into "3 eggs". Returns how many lines were added or merged.
 */
export function addItems(texts: string[], from: string | null = null): number {
  const next = [...items]
  let added = 0
  for (const raw of texts) {
    const text = raw.trim().slice(0, 300)
    if (!text) continue
    const lower = text.toLowerCase()
    const open = next.filter((i) => !i.done)
    const same = open.find((i) => i.text.trim().toLowerCase() === lower)
    if (same && (parseLine(text).qty === null || same.from === from)) continue
    let merged = false
    for (let k = 0; k < next.length && !merged; k++) {
      if (next[k].done) continue
      const sum = mergeLines(next[k].text, text)
      if (!sum) continue
      const sources = [...new Set([...(next[k].from?.split(', ') ?? []), ...(from ? [from] : [])])]
      next[k] = { ...next[k], text: sum, from: sources.length ? sources.join(', ').slice(0, 200) : null }
      merged = true
    }
    if (!merged) next.push({ id: uid(), text, done: false, from })
    added++
  }
  if (added) commit(next)
  return added
}

export const toggleItem = (id: string) => commit(items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)))
export const removeItem = (id: string) => commit(items.filter((i) => i.id !== id))
export const clearDone = () => commit(items.filter((i) => !i.done))
export const clearAll = () => commit([])

// ---------- background sync ----------

let timer: ReturnType<typeof setTimeout> | undefined
let pushing: Promise<void> | null = null

function schedulePush() {
  clearTimeout(timer)
  timer = setTimeout(() => void push(), 600)
}

/** A different account signed in on this device: do not show or upload the previous person's list. */
function ensureOwner(userId: string) {
  try {
    const owner = localStorage.getItem(OWNER_KEY)
    if (owner && owner !== userId) {
      items = []
      synced = new Set()
      dirty = false
      save()
      listeners.forEach((l) => l())
    }
    localStorage.setItem(OWNER_KEY, userId)
  } catch {
    /* ignore */
  }
}

async function userId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession()
    const id = data.session?.user.id ?? null
    if (id) ensureOwner(id)
    return id
  } catch {
    return null
  }
}

async function push(): Promise<void> {
  if (pushing) {
    await pushing
    if (dirty) return push()
    return
  }
  pushing = (async () => {
    if (!(await userId())) return
    dirty = false
    const snapshot = items
    try {
      const keep = new Set(snapshot.map((i) => i.id))
      const gone = [...synced].filter((id) => !keep.has(id))
      if (gone.length) {
        const { error } = await supabase.from('shopping_items').delete().in('id', gone)
        if (error) throw error
      }
      if (snapshot.length) {
        const now = new Date().toISOString()
        const { error } = await supabase
          .from('shopping_items')
          .upsert(snapshot.map((i) => ({ id: i.id, text: i.text, done: i.done, from_label: i.from, updated_at: now })), { onConflict: 'id' })
        if (error) throw error
      }
      synced = keep
      save()
    } catch {
      dirty = true // offline or a hiccup: try again on the next change or when the app is opened
    }
  })().finally(() => {
    pushing = null
  })
  await pushing
}

/** Bring this device up to date with the account's list (other devices' changes arrive here). */
export async function pullShopping(): Promise<void> {
  try {
    if (!(await userId())) return
    if (dirty || pushing) await push()
    if (dirty) return // still offline: keep what is on this device
    const { data, error } = await supabase.from('shopping_items').select('id, text, done, from_label, created_at').order('created_at', { ascending: true })
    if (error || !data) return
    if (dirty) return // something changed while we were fetching; the next push will settle it
    const remote: ShopItem[] = data.map((r) => ({ id: r.id as string, text: r.text as string, done: r.done as boolean, from: (r.from_label as string | null) ?? null }))
    const remoteIds = new Set(remote.map((r) => r.id))
    // On this device only, never uploaded yet: keep. Uploaded before but gone from the server: another device removed it.
    const pending = items.filter((i) => !remoteIds.has(i.id) && !synced.has(i.id))
    synced = remoteIds
    const next = [...remote, ...pending]
    const changed = JSON.stringify(next) !== JSON.stringify(items)
    if (changed) setItems(next, pending.length > 0)
    else save()
  } catch {
    /* offline: the local list is still there */
  }
}

let started = false
/** Call once when the app starts. Syncs on sign-in, when the app comes back to the front, and every half minute while open. */
export function startShoppingSync() {
  if (started) return
  started = true
  const pull = () => {
    if (document.visibilityState === 'visible') void pullShopping()
  }
  supabase.auth.onAuthStateChange((_e, session) => {
    if (session) window.setTimeout(() => void pullShopping(), 0)
  })
  document.addEventListener('visibilitychange', pull)
  window.addEventListener('online', pull)
  window.setInterval(pull, 30_000)
  pull()
}
