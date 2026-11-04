import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useAuth } from './auth'
import { EMPTY_PREFS, normalizePrefs, type Preferences } from './lib/prefs'
import { supabase } from './lib/supabase'

type PrefsState = {
  prefs: Preferences
  loading: boolean
  onboarded: boolean
  save: (p: Preferences) => Promise<void>
}

const Ctx = createContext<PrefsState>({ prefs: EMPTY_PREFS, loading: true, onboarded: false, save: async () => {} })

export function PrefsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const uid = session?.user.id
  const [state, setState] = useState<{ prefs: Preferences; loading: boolean; onboarded: boolean }>({
    prefs: EMPTY_PREFS,
    loading: true,
    onboarded: false,
  })

  useEffect(() => {
    if (!uid) return
    let cancelled = false
    supabase
      .from('profiles')
      .select('preferences, onboarded_at')
      .eq('id', uid)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        setState({ prefs: normalizePrefs(data?.preferences), loading: false, onboarded: Boolean(data?.onboarded_at) })
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
      setState({ prefs: p, loading: false, onboarded: true })
    },
    [uid],
  )

  return <Ctx.Provider value={{ ...state, save }}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const usePrefs = () => useContext(Ctx)
