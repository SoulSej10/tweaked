import { useSyncExternalStore } from 'react'

export type ShopItem = { id: string; text: string; done: boolean; from: string | null }

const KEY = 'tweaked.shopping'
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

let items: ShopItem[] = read()

function commit(next: ShopItem[]) {
  items = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* private mode: list lasts for this visit only */
  }
  listeners.forEach((l) => l())
}

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

/** Add lines to the list, skipping ones already there. Returns how many were new. */
export function addItems(texts: string[], from: string | null = null): number {
  const have = new Set(items.map((i) => i.text.trim().toLowerCase()))
  const fresh: ShopItem[] = []
  for (const raw of texts) {
    const text = raw.trim()
    const key = text.toLowerCase()
    if (!text || have.has(key)) continue
    have.add(key)
    fresh.push({ id: uid(), text, done: false, from })
  }
  if (fresh.length) commit([...items, ...fresh])
  return fresh.length
}

export const toggleItem = (id: string) => commit(items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)))
export const removeItem = (id: string) => commit(items.filter((i) => i.id !== id))
export const clearDone = () => commit(items.filter((i) => !i.done))
export const clearAll = () => commit([])
