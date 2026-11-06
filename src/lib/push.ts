import { supabase } from './supabase'

/** Public half of the push key pair (the private half stays on the server). */
const VAPID_PUBLIC = 'BJZ_qae_T_JktGAX6aeVxVPKfu5EjOYHzjZUsfg8tyJu58zBW6vGzRMd3biu1KRP3JJPzRI-HX6a6PAuBJWBMDc'

export type PushState = 'on' | 'blocked' | 'unsupported' | 'off'

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export function pushState(): PushState {
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'blocked'
  return Notification.permission === 'granted' ? 'on' : 'off'
}

function keyBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const bin = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

/** Ask permission (must be called from a tap) and register this device for timer pushes. */
export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'default') await Notification.requestPermission()
  if (Notification.permission !== 'granted') return pushState()
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC) }))
    const j = sub.toJSON()
    if (j.endpoint && j.keys?.p256dh && j.keys.auth) {
      await supabase.from('push_subscriptions').upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: 'endpoint' })
    }
  } catch {
    /* the in-app ring still works */
  }
  return pushState()
}

/** Tell the server when to ring this person's phone. Returns an id to cancel with, or null if it could not be set. */
export async function scheduleRing(recipeId: string, label: string, fireAt: number): Promise<string | null> {
  try {
    const { data, error } = await supabase.from('cook_timers').insert({ recipe_id: recipeId, label, fire_at: new Date(fireAt).toISOString() }).select('id').single()
    return error ? null : (data.id as string)
  } catch {
    return null
  }
}

export async function cancelRing(id: string | null): Promise<void> {
  if (!id) return
  try {
    await supabase.from('cook_timers').delete().eq('id', id)
  } catch {
    /* it will be cleaned up later */
  }
}

let ctx: AudioContext | null = null
let ringing: number | null = null

/** Call from a tap so the browser lets sound play later. */
export function unlockSound() {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
  } catch {
    /* no audio */
  }
}

function beep(at: number, freq: number) {
  if (!ctx) return
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = 'sine'
  o.frequency.value = freq
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(0.5, at + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.28)
  o.connect(g).connect(ctx.destination)
  o.start(at)
  o.stop(at + 0.3)
}

/** Ring in the open app: a repeating chime until stopRinging() or about a minute. */
export function startRinging(vibrate: boolean) {
  stopRinging()
  const round = () => {
    if (ctx) {
      const t = ctx.currentTime
      beep(t, 880)
      beep(t + 0.35, 1100)
      beep(t + 0.7, 880)
    }
    if (vibrate && 'vibrate' in navigator) navigator.vibrate?.([300, 150, 300])
  }
  round()
  let n = 0
  ringing = window.setInterval(() => (++n > 30 ? stopRinging() : round()), 2000)
}

export function stopRinging() {
  if (ringing !== null) clearInterval(ringing)
  ringing = null
}
