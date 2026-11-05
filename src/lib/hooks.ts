import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { loadSettings, saveSettings, type Settings } from './settings'

export type Async<T> = { data: T | null; error: string | null; loading: boolean; reload: () => void }

/** Run an async loader on mount (and when deps change); expose a reload function. */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[]): Async<T> {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({
    data: null,
    error: null,
    loading: true,
  })
  const [tick, setTick] = useState(0)
  const loaderRef = useRef(loader)
  useLayoutEffect(() => {
    loaderRef.current = loader
  })
  const key = JSON.stringify(deps)

  useEffect(() => {
    let cancelled = false
    loaderRef.current()
      .then((data) => !cancelled && setState({ data, error: null, loading: false }))
      .catch((e: Error) => !cancelled && setState((s) => ({ data: s.data, error: e.message, loading: false })))
    return () => {
      cancelled = true
    }
  }, [key, tick])

  return { ...state, reload: () => setTick((t) => t + 1) }
}

/** Keep the screen awake while mounted (Cook mode). Silently does nothing if unsupported. */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let released = false
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request('screen')
      } catch {
        /* denied or unavailable: not fatal */
      }
    }
    void acquire()
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !released) void acquire()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      released = true
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release()
    }
  }, [active])
}

/** Local app settings (units, voice language, text size...), saved on this device. */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch }
    setSettings(next)
    saveSettings(next)
  }
  return [settings, update] as const
}

/** Set the browser tab / history title for a screen. */
export function useTitle(title: string | null | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · Tweaked` : 'Tweaked'
  }, [title])
}

/** True while the device has a connection. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

/** "Install the app" support: Chrome/Android give us a prompt; iPhone needs the Share menu. */
export function useInstall() {
  const [event, setEvent] = useState<InstallEvent | null>(null)
  const [installed, setInstalled] = useState(() => typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches)
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setEvent(e as InstallEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setEvent(null)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  const isIos = /iphone|ipad|ipod/i.test(ua)
  return {
    installed,
    canPrompt: Boolean(event),
    isIos,
    install: async () => {
      if (!event) return
      await event.prompt()
      await event.userChoice
      setEvent(null)
    },
  }
}
