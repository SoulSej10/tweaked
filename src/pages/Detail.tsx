import { useState } from 'react'
import { signedUrls } from '../lib/photo'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { deleteRecipe, getRecipe, rollbackTo } from '../lib/api'
import { useAsync } from '../lib/hooks'
import { convertIngredient, formatIngredient, scaleAmount, type UnitSystem } from '../lib/parse'

export default function Detail() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { data, error, loading, reload } = useAsync(async () => {
    const full = await getRecipe(id)
    const urls = await signedUrls(full.logs.map((l) => l.photo_path).filter((x): x is string => Boolean(x))).catch(() => ({}))
    return { ...full, urls: urls as Record<string, string> }
  }, [id])
  const [viewId, setViewId] = useState<string | null>(null)
  const [servings, setServings] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [units, setUnits] = useState<UnitSystem>('as-saved')

  if (loading) return <main><p className="muted pad">Loading…</p></main>
  if (error || !data) return <main><p className="error pad">{error ?? 'Not found'}</p><Link to="/" className="btn">Back</Link></main>

  const { recipe, versions, logs, urls } = data
  const currentId = recipe.current_version_id
  const shown = versions.find((v) => v.id === (viewId ?? currentId)) ?? versions[0]
  const isCurrent = shown?.id === currentId
  const base = recipe.servings
  const target = servings ?? base
  const factor = base && target ? target / base : 1
  const lastTweak = logs.find((l) => l.tweak_note)

  async function rollback() {
    if (!shown) return
    setBusy(true)
    try {
      await rollbackTo(recipe.id, shown.id)
      setViewId(null)
      reload()
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!window.confirm(`Delete “${recipe.title}” and all its versions? This cannot be undone.`)) return
    await deleteRecipe(recipe.id)
    nav('/', { replace: true })
  }

  return (
    <main>
      <header className="bar no-print">
        <Link to="/" className="btn ghost">← Library</Link>
        <Link to={`/recipe/${recipe.id}/edit`} className="btn ghost">Edit</Link>
      </header>

      <section className="pad">
        <h1 className="title">{recipe.title}</h1>
        {lastTweak && <p className="tweak">Last time: {lastTweak.tweak_note}</p>}
        <p className="meta">
          {recipe.cooked_count > 0 ? `Cooked ${recipe.cooked_count}×` : 'Not cooked yet'}
          {recipe.source_type !== 'own' && recipe.source_url && <> · <a href={recipe.source_url} target="_blank" rel="noreferrer">source</a></>}
          {recipe.source_note && recipe.source_type === 'person' && <> · {recipe.source_note}</>}
        </p>

        <Link to={`/recipe/${recipe.id}/cook`} className="btn primary cook no-print">Cook</Link>

        {versions.length > 1 && (
          <div className="versions">
            <label>
              Version{' '}
              <select value={shown?.id} onChange={(e) => setViewId(e.target.value)}>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    v{v.version_number}{v.is_original ? ' (original)' : ''}{v.id === currentId ? ' · current' : ''}
                  </option>
                ))}
              </select>
            </label>
            <Link className="btn" to={`/recipe/${recipe.id}/compare`}>Compare</Link>
            {!isCurrent && <button className="btn" onClick={rollback} disabled={busy}>Make this current</button>}
          </div>
        )}
        {shown?.change_note && <p className="muted small">v{shown.version_number}: {shown.change_note}</p>}

        {base && (
          <div className="scale">
            <span>Servings</span>
            <button className="btn" onClick={() => setServings(Math.max(1, (target ?? 1) - 1))} aria-label="Fewer servings">−</button>
            <strong>{target}</strong>
            <button className="btn" onClick={() => setServings((target ?? 1) + 1)} aria-label="More servings">+</button>
          </div>
        )}

        <div className="ing-head">
          <h2>Ingredients</h2>
          <div className="chips seg no-print" role="group" aria-label="Units">
            {(['as-saved', 'metric', 'us'] as const).map((u) => (
              <button key={u} className={`chip ${units === u ? 'on' : ''}`} onClick={() => setUnits(u)}>
                {u === 'as-saved' ? 'As saved' : u === 'us' ? 'US' : 'Metric'}
              </button>
            ))}
          </div>
        </div>
        {shown?.ingredients.length ? (
          <ul className="plain">
            {shown.ingredients.map((i, n) => (
              <li key={n}>{formatIngredient(convertIngredient({ ...i, amount: scaleAmount(i.amount, factor) }, units))}</li>
            ))}
          </ul>
        ) : <p className="muted">None yet. <Link to={`/recipe/${recipe.id}/edit`}>Add some</Link></p>}

        <h2>Steps</h2>
        {shown?.steps.length ? (
          <ol className="steps">{shown.steps.map((s, n) => <li key={n}>{s.text}</li>)}</ol>
        ) : <p className="muted">None yet.</p>}

        {logs.length > 0 && (
          <>
            <h2>History</h2>
            <ul className="plain history">
              {logs.map((l) => (
                <li key={l.id}>
                  <time>{new Date(l.cooked_at).toLocaleDateString()}</time> {l.tweak_note ?? <span className="muted">no changes</span>}
                  {l.photo_path && urls[l.photo_path] && <img className="dish" src={urls[l.photo_path]} alt={`${recipe.title} on ${new Date(l.cooked_at).toLocaleDateString()}`} loading="lazy" />}
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="no-print row">
          <button className="btn" onClick={() => window.print()}>Print / save as PDF</button>
        </div>
        <button className="link danger no-print" onClick={remove}>Delete recipe</button>
      </section>
    </main>
  )
}
