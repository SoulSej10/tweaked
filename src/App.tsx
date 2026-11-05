import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth'
import { Banners } from './components/Banners'
import { ErrorBoundary } from './components/ErrorBoundary'
import { FeedbackProvider } from './feedback'
import { configured } from './lib/supabase'
import { PrefsProvider, usePrefs } from './prefs'
import Home from './pages/Home'
import Legal from './pages/Legal'
import Login from './pages/Login'
import { Navigate } from 'react-router-dom'
const Compare = lazy(() => import('./pages/Compare'))
const Cook = lazy(() => import('./pages/Cook'))
const Detail = lazy(() => import('./pages/Detail'))
const Discover = lazy(() => import('./pages/Discover'))
const DishPage = lazy(() => import('./pages/DishPage'))
const Edit = lazy(() => import('./pages/Edit'))
const Library = lazy(() => import('./pages/Library'))
const NotFound = lazy(() => import('./pages/NotFound'))
const Onboarding = lazy(() => import('./pages/Onboarding'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const Settings = lazy(() => import('./pages/Settings'))
const Shopping = lazy(() => import('./pages/Shopping'))
const Share = lazy(() => import('./pages/Share'))

const Splash = () => (
  <main className="splash"><p className="splash-emoji bounce" aria-hidden>🍳</p><p className="muted">Warming up the pan…</p></main>
)

/** Every screen starts at the top, and the tab title says where you are (pages can set a more specific one). */
const TITLES: Record<string, string> = {
  '/': 'Home',
  '/recipes': 'My recipes',
  '/discover': 'Discover',
  '/new': 'New recipe',
  '/settings': 'Me',
  '/shopping': 'Shopping list',
  '/onboarding': 'Your taste',
}

function RouteEffects() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
    const t = TITLES[pathname]
    if (t) document.title = `${t} · Tweaked`
  }, [pathname])
  return null
}

function Routed() {
  const { loading, onboarded } = usePrefs()
  const { pathname } = useLocation()
  if (loading) return <Splash />
  if (!onboarded && pathname !== '/onboarding' && pathname !== '/terms' && pathname !== '/privacy') return <Navigate to="/onboarding" replace />
  return (
    <Suspense fallback={<Splash />}>
      <RouteEffects />
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
        <Route path="/terms" element={<Legal kind="terms" />} />
        <Route path="/privacy" element={<Legal kind="privacy" />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}

function Gate() {
  const { session, loading, recovery } = useAuth()
  const { pathname } = useLocation()
  if (!configured) {
    return (
      <main className="login">
        <h1>Setup needed</h1>
        <p className="muted">Copy .env.example to .env.local and fill in the Supabase URL and publishable key.</p>
      </main>
    )
  }
  if (loading) return <Splash />
  // Arrived from a "reset your password" email: choose a new password before anything else.
  if (recovery && session) {
    return (
      <Suspense fallback={<Splash />}>
        <ResetPassword />
      </Suspense>
    )
  }
  if (!session) {
    // The legal pages must be readable before signing in.
    if (pathname === '/terms') return <Legal kind="terms" />
    if (pathname === '/privacy') return <Legal kind="privacy" />
    return <Login />
  }
  return (
    <PrefsProvider>
      <Routed />
    </PrefsProvider>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <FeedbackProvider>
            <Banners />
            <Gate />
          </FeedbackProvider>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  )
}
