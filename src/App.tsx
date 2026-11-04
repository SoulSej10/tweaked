import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, Login, useAuth } from './auth'
import { configured } from './lib/supabase'
import { PrefsProvider, usePrefs } from './prefs'
import Home from './pages/Home'
const Compare = lazy(() => import('./pages/Compare'))
const Cook = lazy(() => import('./pages/Cook'))
const Detail = lazy(() => import('./pages/Detail'))
const Discover = lazy(() => import('./pages/Discover'))
const DishPage = lazy(() => import('./pages/DishPage'))
const Edit = lazy(() => import('./pages/Edit'))
const Library = lazy(() => import('./pages/Library'))
const Onboarding = lazy(() => import('./pages/Onboarding'))
const Settings = lazy(() => import('./pages/Settings'))
const Shopping = lazy(() => import('./pages/Shopping'))
const Share = lazy(() => import('./pages/Share'))

const Splash = () => (
  <main className="splash"><p className="splash-emoji bounce" aria-hidden>🍳</p><p className="muted">Warming up the pan…</p></main>
)

function Routed() {
  const { loading, onboarded } = usePrefs()
  const { pathname } = useLocation()
  if (loading) return <Splash />
  if (!onboarded && pathname !== '/onboarding') return <Navigate to="/onboarding" replace />
  return (
    <Suspense fallback={<Splash />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/recipes" element={<Library />} />
        <Route path="/discover" element={<Discover />} />
        <Route path="/dish/:id" element={<DishPage />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/new" element={<Edit />} />
        <Route path="/recipe/:id" element={<Detail />} />
        <Route path="/recipe/:id/edit" element={<Edit />} />
        <Route path="/recipe/:id/compare" element={<Compare />} />
        <Route path="/recipe/:id/cook" element={<Cook />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/shopping" element={<Shopping />} />
        <Route path="/share" element={<Share />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

function Gate() {
  const { session, loading } = useAuth()
  if (!configured) {
    return (
      <main className="login">
        <h1>Setup needed</h1>
        <p className="muted">Copy .env.example to .env.local and fill in the Supabase URL and publishable key.</p>
      </main>
    )
  }
  if (loading) return <Splash />
  if (!session) return <Login />
  return (
    <PrefsProvider>
      <Routed />
    </PrefsProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Gate />
      </BrowserRouter>
    </AuthProvider>
  )
}
