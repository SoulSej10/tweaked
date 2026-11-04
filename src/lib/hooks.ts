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
