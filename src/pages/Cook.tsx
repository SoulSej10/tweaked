import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getRecipe, logCook } from '../lib/api'
import { useAsync, useWakeLock } from '../lib/hooks'
import { formatDuration, formatIngredient } from '../lib/parse'

function Timer({ seconds }: { seconds: number }) {
  const [left, setLeft] = useState(seconds)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000)
    return () => clearInterval(t)
  }, [running])

  const finished = left === 0
  useEffect(() => {
    if (finished && running && 'vibrate' in navigator) navigator.vibrate?.([300, 150, 300])
  }, [finished, running])

  return (
    <div className={`timer ${finished ? 'done' : ''}`}>
      <span>{finished ? 'Time!' : formatDuration(left)}</span>
      <button className="btn" onClick={() => setRunning((r) => !r)} disabled={finished}>{running ? 'Pause' : 'Start timer'}</button>
      <button className="btn ghost" onClick={() => { setLeft(seconds); setRunning(false) }}>Reset</button>
    </div>
  )
}

export default function Cook() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { data, error, loading } = useAsync(() => getRecipe(id), [id])
  const [i, setI] = useState(0)
  const [showIng, setShowIng] = useState(false)
  const [ticked, setTicked] = useState<Set<number>>(new Set())
  const [finished, setFinished] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const touchX = useRef<number | null>(null)

  useWakeLock(!loading && !finished)

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
      await logCook(recipe.id, text)
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
          {err && <p className="error" role="alert">{err}</p>}
          <button className="btn primary" disabled={busy || !note.trim()} onClick={() => finish('note')}>Save note</button>
          <button className="btn" disabled={busy} onClick={() => finish('same')}>Nothing, same as before</button>
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
        <Link to={`/recipe/${recipe.id}`} className="btn ghost">✕ Exit</Link>
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
          {step.timer_seconds && <Timer key={i} seconds={step.timer_seconds} />}
        </section>
      )}

      <footer className="nav">
        <button className="btn big" onClick={() => setI(i - 1)} disabled={i === 0}>← Back</button>
        {last ? (
          <button className="btn primary big" onClick={() => setFinished(true)}>Done</button>
        ) : (
          <button className="btn primary big" onClick={() => setI(i + 1)}>Next →</button>
        )}
      </footer>
    </main>
  )
}
