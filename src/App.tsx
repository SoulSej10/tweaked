import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, Login, useAuth } from './auth'
import { configured } from './lib/supabase'
const Compare = lazy(() => import('./pages/Compare'))
const Cook = lazy(() => import('./pages/Cook'))
const Detail = lazy(() => import('./pages/Detail'))
const Edit = lazy(() => import('./pages/Edit'))
import Library from './pages/Library'
const Settings = lazy(() => import('./pages/Settings'))

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
  if (loading) return <main><p className="muted pad">Loading…</p></main>
  if (!session) return <Login />
  return (
    <Suspense fallback={<main><p className="muted pad">Loading…</p></main>}>
    <Routes>
      <Route path="/" element={<Library />} />
      <Route path="/new" element={<Edit />} />
      <Route path="/recipe/:id" element={<Detail />} />
      <Route path="/recipe/:id/edit" element={<Edit />} />
      <Route path="/recipe/:id/compare" element={<Compare />} />
      <Route path="/recipe/:id/cook" element={<Cook />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
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
