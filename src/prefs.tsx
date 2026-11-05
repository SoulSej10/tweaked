import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useAuth } from './auth'
import { EMPTY_PREFS, normalizePrefs, type Preferences } from './lib/prefs'
import { supabase } from './lib/supabase'

type PrefsState = {
  prefs: Preferences
  loading: boolean
  onboarded: boolean
  /** What to call the person: their chosen name, else the name Google gave us, else null. */
  name: string | null
  save: (p: Preferences) => Promise<void>
  saveName: (name: string) => Promise<void>
}

const Ctx = createContext<PrefsState>({ prefs: EMPTY_PREFS, loading: true, onboarded: false, name: null, save: async () => {}, saveName: async () => {} })

export function PrefsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const uid = session?.user.id
  const [state, setState] = useState<{ prefs: Preferences; loading: boolean; onboarded: boolean; displayName: string | null }>({
    prefs: EMPTY_PREFS,
    loading: true,
    onboarded: false,
    displayName: null,
  })

  useEffect(() => {
    if (!uid) return
    let cancelled = false
    supabase
      .from('profiles')
      .select('preferences, onboarded_at, display_name')
      .eq('id', uid)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        setState({ prefs: normalizePrefs(data?.preferences), loading: false, onboarded: Boolean(data?.onboarded_at), displayName: (data?.display_name as string | null) ?? null })
      })
    return () => {
      cancelled = true
    }
  }, [uid])

  const save = useCallback(
    async (p: Preferences) => {
      if (!uid) return
      const { data, error } = await supabase
        .from('profiles')
        .update({ preferences: p, onboarded_at: new Date().toISOString() })
        .eq('id', uid)
        .select('id')
      if (error) throw new Error(error.message)
      if (!data || data.length === 0) throw new Error('Could not find your profile. Sign out and back in, then try again.')
      setState((s) => ({ ...s, prefs: p, loading: false, onboarded: true }))
    },
    [uid],
  )

  const saveName = useCallback(
    async (name: string) => {
      if (!uid) return
      const clean = name.trim().slice(0, 60)
      const { error } = await supabase.from('profiles').update({ display_name: clean || null }).eq('id', uid)
      if (error) throw new Error(error.message)
      setState((s) => ({ ...s, displayName: clean || null }))
    },
    [uid],
  )

  const meta = session?.user.user_metadata as { full_name?: string; name?: string } | undefined
  const name = state.displayName ?? meta?.full_name ?? meta?.name ?? null

  return <Ctx.Provider value={{ prefs: state.prefs, loading: state.loading, onboarded: state.onboarded, name, save, saveName }}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const usePrefs = () => useContext(Ctx)
