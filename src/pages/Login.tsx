import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { errorFromAddress, friendlyAuthError, isEmail, passwordProblem } from '../lib/authErrors'
import { useTitle } from '../lib/hooks'
import { supabase } from '../lib/supabase'
import { Brand } from '../components/Brand'
import { Eye, EyeSlash } from '@phosphor-icons/react'

type Mode = 'in' | 'up' | 'forgot' | 'sent-signup' | 'sent-reset'

// Which sign-in methods the project has switched on (so we never show a button that would fail).
let providersPromise: Promise<{ google: boolean }> | null = null
function loadProviders(): Promise<{ google: boolean }> {
  providersPromise ??= fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } })
    .then((r) => r.json())
    .then((s: { external?: { google?: boolean } }) => ({ google: Boolean(s.external?.google) }))
    .catch(() => ({ google: false }))
  return providersPromise
}

function PasswordInput(props: { value: string; onChange: (v: string) => void; placeholder: string; autoComplete: string; label: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="pw">
      <input
        type={show ? 'text' : 'password'}
        required
        placeholder={props.placeholder}
        aria-label={props.label}
        autoComplete={props.autoComplete}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
      <button type="button" className="pw-toggle" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>
        {show ? <EyeSlash size={20} aria-hidden /> : <Eye size={20} aria-hidden />}
      </button>
    </div>
  )
}

export default function Login() {
  useTitle('Sign in')
  const [mode, setMode] = useState<Mode>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(() => errorFromAddress(window.location.hash, window.location.search))
  const [needsConfirm, setNeedsConfirm] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [google, setGoogle] = useState(false)

  useEffect(() => {
    void loadProviders().then((p) => setGoogle(p.google))
    // A link error (expired email link, cancelled Google sign-in) arrives in the address: show it once, then tidy the address.
    if (window.location.hash || window.location.search.includes('error')) window.history.replaceState(null, '', window.location.pathname)
  }, [])

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown(cooldown - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const origin = window.location.origin
  const go = (m: Mode) => {
    setMode(m)
    setMsg(null)
    setNeedsConfirm(false)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (!isEmail(email)) return setMsg('That does not look like an email address.')

    if (mode === 'up') {
      const problem = passwordProblem(password)
      if (problem) return setMsg(problem)
      if (password !== confirm) return setMsg("The two passwords don't match.")
    }

    setBusy(true)
    try {
      if (mode === 'in') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) {
          setMsg(friendlyAuthError(error.message))
          setNeedsConfirm(/not confirmed/i.test(error.message))
        }
      } else if (mode === 'up') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: `${origin}/`, data: name.trim() ? { full_name: name.trim() } : undefined },
        })
        if (error) setMsg(friendlyAuthError(error.message))
        else if (!data.session) {
          setCooldown(45)
          setMode('sent-signup')
        }
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${origin}/` })
        if (error) setMsg(friendlyAuthError(error.message))
        else {
          setCooldown(45)
          setMode('sent-reset')
        }
      }
    } catch (err) {
      setMsg(friendlyAuthError((err as Error).message))
    } finally {
      setBusy(false)
    }
  }

  async function resend() {
    if (cooldown > 0) return
    setBusy(true)
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: `${origin}/` } })
    setBusy(false)
    if (error) setMsg(friendlyAuthError(error.message))
    else {
      setMsg('Sent again. Check your inbox and spam folder.')
      setCooldown(45)
      if (mode === 'in') setMode('sent-signup')
    }
  }

  async function resendReset() {
    if (cooldown > 0) return
    setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${origin}/` })
    setBusy(false)
    if (error) setMsg(friendlyAuthError(error.message))
    else {
      setMsg('Sent again. Check your inbox and spam folder.')
      setCooldown(45)
    }
  }

  async function withGoogle() {
    setMsg(null)
    setBusy(true)
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${origin}/` } })
    if (error) {
      setMsg(friendlyAuthError(error.message))
      setBusy(false)
    }
  }

  const sent = mode === 'sent-signup' || mode === 'sent-reset'

  return (
    <main className="login">
      <Brand />

      {sent ? (
        <section className="stack" aria-live="polite">
          <h2 style={{ margin: 0 }}>Check your email</h2>
          <p className="muted">
            {mode === 'sent-signup'
              ? <>We sent a confirmation link to <b>{email}</b>. Open it to finish creating your account.</>
              : <>If <b>{email}</b> has an account, a link to choose a new password is on its way.</>}
          </p>
          <p className="muted small">Nothing yet? Look in spam. {mode === 'sent-signup' && 'If you already have an account with this email, no new email is sent: try signing in or reset your password.'}</p>
          {msg && <p className="muted small" role="status">{msg}</p>}
          <button className="btn" onClick={mode === 'sent-signup' ? resend : resendReset} disabled={busy || cooldown > 0}>
            {cooldown > 0 ? `Send again in ${cooldown}s` : 'Send it again'}
          </button>
          <button className="link" onClick={() => go('in')}>Back to sign in</button>
        </section>
      ) : (
        <>
          <p className="muted">
            {mode === 'forgot' ? 'Enter your email and we will send you a link to choose a new password.' : 'Easy dishes, made your way. Tweaked remembers every change you make.'}
          </p>

          {mode !== 'forgot' && google && (
            <>
              <button className="btn google" onClick={withGoogle} disabled={busy}>
                <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden>
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                </svg>
                Continue with Google
              </button>
              <p className="or"><span>or use email</span></p>
            </>
          )}

          <form onSubmit={submit} className="stack" noValidate>
            {mode === 'up' && (
              <input placeholder="Your name (optional)" aria-label="Your name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
            )}
            <input type="email" required placeholder="Email" aria-label="Email" autoComplete="email" inputMode="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} />
            {mode !== 'forgot' && (
              <PasswordInput label="Password" placeholder={mode === 'up' ? 'Password (8+ characters, letters and numbers)' : 'Password'} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} value={password} onChange={setPassword} />
            )}
            {mode === 'up' && <PasswordInput label="Confirm password" placeholder="Type the password again" autoComplete="new-password" value={confirm} onChange={setConfirm} />}

            {msg && <p className="error" role="alert">{msg}</p>}
            {needsConfirm && <button type="button" className="btn" onClick={resend} disabled={busy || cooldown > 0}>{cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend the confirmation email'}</button>}

            <button className="btn primary" disabled={busy}>
              {busy ? 'One moment…' : mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create account' : 'Send reset link'}
            </button>
          </form>

          {mode === 'in' && <button className="link" onClick={() => go('forgot')}>Forgot your password?</button>}
          {mode === 'forgot' && <button className="link" onClick={() => go('in')}>Back to sign in</button>}
          {mode !== 'forgot' && (
            <button className="link" onClick={() => go(mode === 'in' ? 'up' : 'in')}>
              {mode === 'in' ? 'First time? Create your account' : 'Have an account? Sign in'}
            </button>
          )}
        </>
      )}

      <p className="legal-links">
        By continuing you agree to the <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>.
      </p>
    </main>
  )
}
