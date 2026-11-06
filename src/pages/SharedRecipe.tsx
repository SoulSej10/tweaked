import { BookmarkSimple, CookingPot, LinkBreak, ShoppingCart } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth'
import { Brand } from '../components/Brand'
import { useFeedback } from '../feedback'
import { createRecipe } from '../lib/api'
import { useAsync, useTitle } from '../lib/hooks'
import { formatIngredient } from '../lib/parse'
import { openShare, peekShare, pendingShare, type Opened, type ShareStatus } from '../lib/share'
import { addItems } from '../lib/shopping'
import Login from './Login'

const WHY: Record<Exclude<ShareStatus, 'ok'>, { title: string; body: string }> = {
  used: { title: 'This link was already opened', body: 'It was a one-person link, and someone has already opened it. Ask the person who sent it to make you a new one.' },
  expired: { title: 'This link has expired', body: 'Share links last 7 days. Ask the person who sent it to make you a new one.' },
  revoked: { title: 'This link was stopped', body: 'The person who shared it turned it off. Ask them to send a new one.' },
  invalid: { title: "We can't find that recipe", body: 'The link may be incomplete or mistyped. Check you copied all of it.' },
}

/** Keep search engines away from private links. */
function useNoIndex() {
  useEffect(() => {
    const m = document.createElement('meta')
    m.name = 'robots'
    m.content = 'noindex,nofollow'
    document.head.appendChild(m)
    return () => m.remove()
  }, [])
}

/**
 * A shared recipe: readable by anyone with the link, no account needed. Signing up is only for people who
 * want to keep a copy. A one-person link is claimed by the first person who taps "Open recipe".
 */
export default function SharedRecipe() {
  const { token = '' } = useParams()
  const { session } = useAuth()
  const nav = useNavigate()
  const { toast } = useFeedback()
  const [manual, setManual] = useState<Opened | null>(null)
  const [opening, setOpening] = useState(false)
  const [saving, setSaving] = useState(false)
  const [signup, setSignup] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  useNoIndex()

  const peek = useAsync(() => peekShare(token), [token])

  // Open links, and one-person links this browser already owns, open by themselves.
  const status = peek.data?.status
  const autoOpen = status === 'ok' && (peek.data?.kind === 'open' || peek.data?.mine === true)
  const auto = useAsync(async () => (autoOpen ? await openShare(token) : null), [token, autoOpen])
  const opened: Opened | null = manual ?? auto.data
  const snap = opened?.status === 'ok' ? opened.snapshot : undefined
  useTitle(snap?.title ?? peek.data?.title ?? 'Shared recipe')

  // A one-person link that has not been opened here yet waits for a deliberate tap.
  async function open() {
    setOpening(true)
    setErr(null)
    try {
      setManual(await openShare(token))
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setOpening(false)
    }
  }

  async function save() {
    if (!snap) return
    if (!session) {
      pendingShare.set(token)
      setSignup(true)
      return
    }
    setSaving(true)
    try {
      const id = await createRecipe(
        {
          title: snap.title,
          source_type: 'person',
          source_url: snap.source_url,
          source_note: `Shared by ${snap.shared_by ?? 'a friend'}`,
          servings: snap.servings,
          tags: snap.tags ?? [],
          bring_from_home: false,
        },
        snap.ingredients,
        snap.steps,
      )
      pendingShare.clear()
      toast('Saved to your recipes')
      nav(`/recipe/${id}`, { replace: true })
    } catch (e) {
      setErr((e as Error).message)
      setSaving(false)
    }
  }

  // A dead link: nothing to remember for later.
  useEffect(() => {
    if (status && status !== 'ok') pendingShare.clear()
  }, [status])

  if (signup && !session) {
    return <Login note="Create a free account (or sign in) to keep this recipe. It will be waiting for you." onBack={() => setSignup(false)} />
  }

  const header = (
    <header className="topbar">
      <Brand size="sm" />
      {session ? <Link className="btn ghost" to="/">Open Tweaked</Link> : null}
    </header>
  )

  if (peek.loading || (autoOpen && !opened && !err && !auto.error)) {
    return <main className="page">{header}<p className="muted pad status">Opening the recipe…</p></main>
  }

  if (peek.error || auto.error || err) {
    return (
      <main className="page">
        {header}
        <div className="empty"><LinkBreak size={36} weight="duotone" className="empty-icon" aria-hidden /><h2>Couldn't open it</h2><p className="muted">{peek.error ?? auto.error ?? err}</p><button className="btn" onClick={() => window.location.reload()}>Try again</button></div>
      </main>
    )
  }

  const bad = opened && opened.status !== 'ok' ? opened.status : status && status !== 'ok' ? status : null
  if (bad) {
    const why = WHY[bad]
    return (
      <main className="page">
        {header}
        <div className="empty">
          <LinkBreak size={36} weight="duotone" className="empty-icon" aria-hidden />
          <h2>{why.title}</h2>
          <p className="muted">{why.body}</p>
          <Link className="btn primary" to="/">{session ? 'Go to my recipes' : 'See what Tweaked is'}</Link>
        </div>
      </main>
    )
  }

  // One-person link, not yet opened by this browser: ask first, so link previews and stray taps do not use it up.
  if (!snap) {
    const who = peek.data?.shared_by ?? 'Someone'
    return (
      <main className="page">
        {header}
        <div className="empty">
          <CookingPot size={36} weight="duotone" className="empty-icon" aria-hidden />
          <h2>{who} shared a recipe with you</h2>
          <p><b>{peek.data?.title}</b></p>
          <p className="muted">This link is for one person. Once you open it, it's yours: you can come back to it on this device, but nobody else can open it.</p>
          <button className="btn primary" onClick={open} disabled={opening}>{opening ? 'Opening…' : 'Open recipe'}</button>
        </div>
      </main>
    )
  }

  return (
    <main className="page with-bar">
      {header}
      <section className="pad">
        <p className="muted small">{snap.shared_by ? `Shared by ${snap.shared_by}` : 'Shared with you'} · view only</p>
        <h1 className="title">{snap.title}</h1>
        <p className="chips-inline">
          {snap.servings && <span className="pill">Serves {snap.servings}</span>}
          {(snap.tags ?? []).slice(0, 4).map((t) => <span key={t} className="pill">#{t}</span>)}
        </p>

        <h2>Ingredients</h2>
        <ul className="plain">
          {snap.ingredients.map((i, n) => <li key={n}>{formatIngredient(i)}</li>)}
          {snap.ingredients.length === 0 && <li className="muted">No ingredients listed.</li>}
        </ul>
        <div className="row" style={{ marginTop: 10 }}>
          <button
            className="btn"
            onClick={() => {
              const n = addItems(snap.ingredients.map(formatIngredient), snap.title)
              toast(n > 0 ? `Added ${n} to your shopping list` : 'Already on your shopping list')
            }}
          >
            <ShoppingCart size={18} aria-hidden /> Add to shopping list
          </button>
        </div>

        <h2>Steps</h2>
        <ol className="steps">
          {snap.steps.map((s, n) => <li key={n}>{s.text}</li>)}
          {snap.steps.length === 0 && <li className="muted">No steps listed.</li>}
        </ol>

        {snap.source_url && (
          <p className="muted small">Original source: <a href={snap.source_url} target="_blank" rel="noreferrer">{(() => { try { return new URL(snap.source_url).hostname.replace(/^www\./, '') } catch { return 'link' } })()}</a></p>
        )}
        {err && <p className="error" role="alert">{err}</p>}
      </section>

      <div className="actionbar">
        <button className="btn primary grow" onClick={save} disabled={saving}>
          <BookmarkSimple size={18} weight="fill" aria-hidden /> {saving ? 'Saving…' : session ? 'Save to my recipes' : 'Save a copy (free account)'}
        </button>
      </div>
    </main>
  )
}
