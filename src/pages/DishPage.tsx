import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { createRecipe } from '../lib/api'
import { dishToRecipe, lookup } from '../lib/discover'
import { dishEmoji, tileIndex } from '../lib/emoji'
import { useAsync } from '../lib/hooks'

export default function DishPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { data: dish, error, loading } = useAsync(() => lookup(id), [id])
  const [busy, setBusy] = useState<'save' | 'cook' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  if (loading) return <main className="page"><p className="muted pad">Loading…</p></main>
  if (error || !dish) return (
    <main className="page">
      <header className="topbar"><Link to="/discover" className="btn ghost">← Back</Link></header>
      <p className="error pad">{error ?? 'That dish is not available any more.'}</p>
    </main>
  )

  async function save(thenCook: boolean) {
    if (!dish) return
    setBusy(thenCook ? 'cook' : 'save')
    setErr(null)
    try {
      const r = dishToRecipe(dish)
      const rid = await createRecipe(r.meta, r.ingredients, r.steps)
      nav(thenCook ? `/recipe/${rid}/cook` : `/recipe/${rid}`, { replace: true })
    } catch (e) {
      setErr((e as Error).message)
      setBusy(null)
    }
  }

  return (
    <main className="page with-bar">
      <div className={`banner dthumb t${tileIndex(dish.name)}`}>
        <span className="demoji" aria-hidden>{dishEmoji(dish.name, [dish.category])}</span>
        {dish.thumb && <img src={`${dish.thumb}/large`} alt={dish.name} onError={(e) => (e.currentTarget.style.display = 'none')} />}
        <Link to="/discover" className="float-back" aria-label="Back">←</Link>
      </div>

      <section className="pad">
        <h1 className="title">{dish.name}</h1>
        <p className="chips-inline">
          {dish.cuisine && <span className="pill">{dish.cuisine}</span>}
          {dish.category && <span className="pill alt">{dish.category}</span>}
          <span className="pill">{dish.ingredients.length} ingredients</span>
          <span className="pill">{dish.steps.length} steps</span>
        </p>
        <p className="muted small">Suggested from an open recipe collection. Save it, then change it however you like. Tweaked remembers every version.</p>

        <h2>Ingredients</h2>
        <ul className="plain ing">
          {dish.ingredients.map((i, n) => <li key={n}><span>{i.name}</span><b>{i.measure}</b></li>)}
        </ul>

        <h2>Steps</h2>
        <ol className="steps">{dish.steps.map((s, n) => <li key={n}>{s}</li>)}</ol>

        <p className="muted small">
          {dish.youtube && <><a href={dish.youtube} target="_blank" rel="noreferrer">Watch a video</a> · </>}
          <a href={dish.source ?? `https://www.themealdb.com/meal/${dish.id}`} target="_blank" rel="noreferrer">Original source</a>
        </p>
        {err && <p className="error" role="alert">{err}</p>}
      </section>

      <div className="actionbar">
        <button className="btn" disabled={busy !== null} onClick={() => save(false)}>{busy === 'save' ? 'Saving…' : '＋ Save'}</button>
        <button className="btn primary grow" disabled={busy !== null} onClick={() => save(true)}>{busy === 'cook' ? 'Saving…' : 'Save & start cooking'}</button>
      </div>
    </main>
  )
}
