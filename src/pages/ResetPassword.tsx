import { useState } from 'react'
import { useAuth } from '../auth'
import { useFeedback } from '../feedback'
import { friendlyAuthError, passwordProblem } from '../lib/authErrors'
import { supabase } from '../lib/supabase'

/** Shown after someone opens the link in a "reset your password" email. */
export default function ResetPassword() {
  const { endRecovery } = useAuth()
  const { toast } = useFeedback()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    const problem = passwordProblem(password)
    if (problem) return setMsg(problem)
    if (password !== confirm) return setMsg("The two passwords don't match.")
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) return setMsg(friendlyAuthError(error.message))
    toast('Password changed. You are signed in.')
    window.history.replaceState(null, '', '/')
    endRecovery()
  }

  async function cancel() {
    await supabase.auth.signOut()
    window.history.replaceState(null, '', '/')
    endRecovery()
  }

  return (
    <main className="login">
      <p className="quiz-emoji" aria-hidden>🔑</p>
      <h1>Choose a new password</h1>
      <p className="muted">Pick something you have not used on other sites.</p>
      <form onSubmit={submit} className="stack" noValidate>
        <div className="pw">
          <input type={show ? 'text' : 'password'} required autoFocus placeholder="New password (8+ characters, letters and numbers)" aria-label="New password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="button" className="pw-toggle" onClick={() => setShow(!show)} aria-pressed={show}>{show ? 'Hide' : 'Show'}</button>
        </div>
        <input type={show ? 'text' : 'password'} required placeholder="Type it again" aria-label="Confirm new password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        {msg && <p className="error" role="alert">{msg}</p>}
        <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button>
      </form>
      <button className="link" onClick={cancel}>Cancel</button>
    </main>
  )
}
