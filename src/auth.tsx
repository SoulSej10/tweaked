import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'

type AuthState = {
  session: Session | null
  loading: boolean
  /** True while the person arrived from a "reset your password" email and must choose a new password. */
  recovery: boolean
  endRecovery: () => void
}

const AuthContext = createContext<AuthState>({ session: null, loading: true, recovery: false, endRecovery: () => {} })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ session: Session | null; loading: boolean; recovery: boolean }>({ session: null, loading: true, recovery: false })

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setState((s) => ({ ...s, session: data.session, loading: false })))
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setState((s) => ({ session, loading: false, recovery: event === 'PASSWORD_RECOVERY' ? true : session ? s.recovery : false }))
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const endRecovery = useCallback(() => setState((s) => ({ ...s, recovery: false })), [])

  return <AuthContext.Provider value={{ ...state, endRecovery }}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)
