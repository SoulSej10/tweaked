import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getRecipe, logCook } from '../lib/api'
import { useAsync, useSettings, useTitle, useWakeLock } from '../lib/hooks'
import { cancelRing, enablePush, pushState, scheduleRing, startRinging, stopRinging, unlockSound, type PushState } from '../lib/push'
import { formatDuration, formatIngredient } from '../lib/parse'
import { uploadDishPhoto } from '../lib/photo'
import { useDictation } from '../lib/speech'
import { ArrowLeft, ArrowRight, Camera, Microphone, X } from '@phosphor-icons/react'

type Saved = { endAt: number | null; left: number; ringId: string | null }

/**
 * Counts down against the clock, so it stays right if the phone sleeps or the tab is in the background. It is
 * remembered on this device (reloads do not lose it) and also booked on the server, which sends a push
 * notification to ring the phone even when the app is closed.
 */
function Timer({ recipeId, index, seconds, label, vibrate }: { recipeId: string; index: number; seconds: number; label: string; vibrate: boolean }) {
  const storeKey = `tweaked.timer.${recipeId}.${index}`
  const [saved, setSaved] = useState<Saved>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(storeKey) ?? 'null') as Saved | null
      if (v && typeof v.left === 'number') return v
    } catch {
      /* start fresh */
    }
    return { endAt: null, left: seconds, ringId: null }
  })
  const { endAt, left, ringId } = saved
  const [now, setNow] = useState(() => Date.now())
  const [ringing, setRinging] = useState(false)
  const [alerts, setAlerts] = useState<PushState>(() => pushState())
  const running = endAt !== null
  const remaining = running ? Math.max(0, Math.ceil((endAt - now) / 1000)) : left
  const finished = !running && left === 0

  function update(next: Saved) {
    setSaved(next)
    try {
      if (next.endAt === null && next.left === seconds) localStorage.removeItem(storeKey)
      else localStorage.setItem(storeKey, JSON.stringify(next))
    } catch {
      /* private mode: still works until reload */
    }
  }

  useEffect(() => {
    if (endAt === null) return
    const tick = () => {
      const t = Date.now()
      setNow(t)
      if (t >= endAt) {
        update({ endAt: null, left: 0, ringId })
        // Ringing in the open app; if the app is hidden the server push is what reaches you.
        if (!document.hidden) {
          startRinging(vibrate)
          setRinging(true)
        } else if (vibrate && 'vibrate' in navigator) navigator.vibrate?.([300, 150, 300])
      }
    }
    tick()
    const t = setInterval(tick, 250)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', tick)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endAt, vibrate])

  useEffect(() => () => stopRinging(), [])

  async function toggle() {
    unlockSound()
    if (running) {
      void cancelRing(ringId)
      update({ endAt: null, left: remaining, ringId: null })
      return
    }
    const end = Date.now() + left * 1000
    setNow(Date.now())
    update({ endAt: end, left, ringId: null })
    // Ask for notifications on the first start (it must come from this tap), then book the phone ring.
    const state = await enablePush()
    setAlerts(state)
    const id = await scheduleRing(recipeId, label, end)
    setSaved((cur) => {
      const next = cur.endAt === end ? { ...cur, ringId: id } : cur
      try {
        localStorage.setItem(storeKey, JSON.stringify(next))
      } catch {
        /* fine */
      }
      if (cur.endAt !== end) void cancelRing(id)
      return next
    })
  }

  function reset() {
    stopRinging()
    setRinging(false)
    void cancelRing(ringId)
    update({ endAt: null, left: seconds, ringId: null })
  }

  return (
    <div className={`timer ${finished ? 'done' : ''}`}>
      <span>{finished ? 'Time!' : formatDuration(remaining)}</span>
      {ringing ? (
        <button className="btn primary" onClick={() => { stopRinging(); setRinging(false) }}>Stop ringing</button>
      ) : (
        <button className="btn" onClick={toggle} disabled={finished}>{running ? 'Pause' : 'Start timer'}</button>
      )}
      <button className="btn ghost" onClick={reset}>Reset</button>
      {running && alerts === 'blocked' && <small className="muted timer-note">Notifications are blocked, so it will only ring while this screen is open.</small>}
      {running && alerts === 'unsupported' && <small className="muted timer-note">This browser cannot ring in the background. Add Tweaked to your home screen for that.</small>}
    </div>
  )
}

export default function Cook() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { data, error, loading } = useAsync(() => getRecipe(id), [id])
  useTitle(data ? `Cooking ${data.recipe.title}` : 'Cooking')
  const [i, setI] = useState(0)
  const [showIng, setShowIng] = useState(false)
  const [ticked, setTicked] = useState<Set<number>>(new Set())
  const [finished, setFinished] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const touchX = useRef<number | null>(null)

  const [settings] = useSettings()
  useWakeLock(!loading && !finished && settings.keepAwake)
  const [photo, setPhoto] = useState<File | null>(null)
  const dictation = useDictation(useCallback((t: string) => setNote((n) => (n ? `${n} ${t}` : t)), []), settings.voiceLang)

  if (loading) return <main className="cook"><p className="muted pad">Loading…</p></main>
  if (error || !data) return <main className="cook"><p className="error pad">{error ?? 'Not found'}</p></main>

  const { recipe, versions } = data
  const version = versions.find((v) => v.id === recipe.current_version_id) ?? versions[0]
  const steps = version?.steps ?? []
  const ingredients = version?.ingredients ?? []
  const last = i >= steps.length - 1

  async function finish(kind: 'note' | 'same' | 'version') {
    setBusy(true)
    setErr(null)
    try {
      const text = kind === 'same' ? null : note.trim() || null
      const photoPath = photo ? await uploadDishPhoto(photo, recipe.id).catch(() => null) : null
      await logCook(recipe.id, text, photoPath)
      if (kind === 'version') nav(`/recipe/${recipe.id}/edit?note=${encodeURIComponent(text ?? '')}`, { replace: true })
      else nav(`/recipe/${recipe.id}`, { replace: true })
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }

  if (finished) {
    return (
      <main className="cook">
        <section className="pad stack post">
          <h1>Nice. What did you change?</h1>
          <input
            className="big"
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="less soy sauce, added chili"
            aria-label="What did you change?"
            onKeyDown={(e) => e.key === 'Enter' && note.trim() && void finish('note')}
          />
          <div className="row">
            {dictation.supported && (
              <button type="button" className={`btn ${dictation.listening ? 'primary' : ''}`} onClick={dictation.toggle} aria-pressed={dictation.listening}>
                {dictation.listening ? <><Microphone size={18} weight="fill" aria-hidden /> Listening… tap to stop</> : <><Microphone size={18} aria-hidden /> Say it</>}
              </button>
            )}
            <label className="btn photo-pick">
              <><Camera size={18} weight={photo ? 'fill' : 'regular'} aria-hidden /> {photo ? 'Photo added' : 'Add photo'}</>
              <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
            </label>
          </div>
          {err && <p className="error" role="alert">{err}</p>}
          <button className="btn primary" disabled={busy || !note.trim()} onClick={() => finish('note')}>Save note</button>
          <button className="btn" disabled={busy} onClick={() => finish('same')}>{photo ? 'Save photo only' : 'Nothing, same as before'}</button>
          <button className="btn" disabled={busy || !note.trim()} onClick={() => finish('version')}>Save note + new version</button>
          <Link to={`/recipe/${recipe.id}`} className="link">Skip</Link>
        </section>
      </main>
    )
  }

  if (steps.length === 0) {
    return (
      <main className="cook">
        <section className="pad stack">
          <h1>{recipe.title}</h1>
          <p className="muted">This recipe has no steps yet.</p>
          <Link className="btn primary" to={`/recipe/${recipe.id}/edit`}>Add steps</Link>
          <Link className="link" to={`/recipe/${recipe.id}`}>Back</Link>
        </section>
      </main>
    )
  }

  const step = steps[i]

  return (
    <main
      className="cook"
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return
        const dx = e.changedTouches[0].clientX - touchX.current
        touchX.current = null
        if (dx < -60 && !last) setI(i + 1)
        if (dx > 60 && i > 0) setI(i - 1)
      }}
    >
      <header className="bar">
        <Link to={`/recipe/${recipe.id}`} className="btn ghost"><X size={18} aria-hidden /> Exit</Link>
        <span className="muted">Step {i + 1} / {steps.length}</span>
        <button className="btn" onClick={() => setShowIng(!showIng)} aria-expanded={showIng}>Ingredients</button>
      </header>

      <div className="progress" aria-hidden><span style={{ width: `${((i + 1) / steps.length) * 100}%` }} /></div>

      {showIng ? (
        <ul className="plain checklist">
          {ingredients.map((ing, n) => (
            <li key={n}>
              <label className={ticked.has(n) ? 'ticked' : ''}>
                <input
                  type="checkbox"
                  checked={ticked.has(n)}
                  onChange={() => {
                    const next = new Set(ticked)
                    if (next.has(n)) next.delete(n)
                    else next.add(n)
                    setTicked(next)
                  }}
                />
                {formatIngredient(ing)}
              </label>
            </li>
          ))}
          {ingredients.length === 0 && <li className="muted">No ingredients saved.</li>}
        </ul>
      ) : (
        <section className="step">
          <p className="step-text">{step.text}</p>
          {step.timer_seconds && <Timer key={i} recipeId={id} index={i} seconds={step.timer_seconds} label={`${recipe.title}, step ${i + 1}`} vibrate={settings.vibrate} />}
        </section>
      )}

      <footer className="nav">
        <button className="btn big" onClick={() => setI(i - 1)} disabled={i === 0}><ArrowLeft size={20} aria-hidden /> Back</button>
        {last ? (
          <button className="btn primary big" onClick={() => setFinished(true)}>Done</button>
        ) : (
          <button className="btn primary big" onClick={() => setI(i + 1)}>Next <ArrowRight size={20} aria-hidden /></button>
        )}
      </footer>
    </main>
  )
}
