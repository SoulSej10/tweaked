import { useState } from 'react'
import { signedUrls } from '../lib/photo'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useFeedback } from '../feedback'
import { deleteRecipe, getRecipe, rollbackTo, setFavorite } from '../lib/api'
import { dishEmoji, tileIndex } from '../lib/emoji'
import { useAsync, useSettings, useTitle } from '../lib/hooks'
import { addItems } from '../lib/shopping'
import { convertIngredient, formatIngredient, scaleAmount, type UnitSystem } from '../lib/parse'
import { ArrowLeft, Heart, Package, ShareNetwork, ShoppingCart } from '@phosphor-icons/react'
import { Picker } from '../components/Picker'

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
  const [defaults] = useSettings()
  const [units, setUnits] = useState<UnitSystem>(defaults.units)
  const [added, setAdded] = useState<number | null>(null)
  const [fav, setFav] = useState<boolean | null>(null)
  const { toast, confirm } = useFeedback()
  useTitle(data?.recipe.title)

  if (loading) return <main className="page"><p className="muted pad">Loading…</p></main>
  if (error || !data) return <main className="page"><p className="error pad">{error ?? 'Not found'}</p><Link to="/recipes" className="btn">Back</Link></main>

  const { recipe, versions, logs, urls } = data
  const currentId = recipe.current_version_id
  const shown = versions.find((v) => v.id === (viewId ?? currentId)) ?? versions[0]
  const isCurrent = shown?.id === currentId
  const base = recipe.servings
  const target = servings ?? base
  const factor = base && target ? target / base : 1
  const lastTweak = logs.find((l) => l.tweak_note)
  const favorite = fav ?? recipe.favorite
  // The banner shows your most recent photo of this dish, if you took one.
  const cover = logs.map((l) => (l.photo_path ? urls[l.photo_path] : null)).find(Boolean) ?? null

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

  function addToList() {
    if (!shown) return
    const lines = shown.ingredients.map((i) => formatIngredient(convertIngredient({ ...i, amount: scaleAmount(i.amount, factor, i.unit) }, units)))
    const n = addItems(lines, recipe.title)
    setAdded(n)
    toast(n > 0 ? `Added ${n} to your shopping list` : 'Already on your shopping list')
  }

  async function toggleFavorite() {
    const next = !(fav ?? recipe.favorite)
    setFav(next)
    try {
      await setFavorite(recipe.id, next)
      toast(next ? 'Added to favorites' : 'Removed from favorites')
    } catch (e) {
      setFav(!next)
      toast((e as Error).message, 'error')
    }
  }

  async function share() {
    if (!shown) return
    const lines = [
      recipe.title,
      '',
      'Ingredients',
      ...shown.ingredients.map((i) => `- ${formatIngredient(i)}`),
      '',
      'Steps',
      ...shown.steps.map((s, n) => `${n + 1}. ${s.text}`),
      ...(recipe.source_url ? ['', `Source: ${recipe.source_url}`] : []),
    ]
    const text = lines.join('\n')
    try {
      if (navigator.share) await navigator.share({ title: recipe.title, text })
      else {
        await navigator.clipboard.writeText(text)
        toast('Recipe copied to the clipboard')
      }
    } catch {
      /* share sheet dismissed */
    }
  }

  async function remove() {
    const ok = await confirm({ title: `Delete “${recipe.title}”?`, body: 'This removes the recipe, every version and its cook history. It cannot be undone.', confirmLabel: 'Delete', danger: true })
    if (!ok) return
    try {
      await deleteRecipe(recipe.id)
      toast('Recipe deleted')
      nav('/recipes', { replace: true })
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  return (
    <main className="page with-bar">
      <div className={`banner short dthumb t${tileIndex(recipe.title)} no-print`}>
        <span className="demoji" aria-hidden>{dishEmoji(recipe.title, recipe.tags)}</span>
        {cover && <img src={cover} alt={`${recipe.title}, as you cooked it`} onError={(e) => (e.currentTarget.style.display = 'none')} />}
        <Link to="/recipes" className="float-back" aria-label="Back to recipes"><ArrowLeft size={20} /></Link>
        <div className="float-actions">
          <button className={`float-btn ${favorite ? 'on' : ''}`} onClick={toggleFavorite} aria-pressed={favorite} aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}><Heart size={20} weight={favorite ? 'fill' : 'regular'} /></button>
          <button className="float-btn" onClick={share} aria-label="Share this recipe"><ShareNetwork size={20} /></button>
        </div>
      </div>

      <section className="pad">
        <h1 className="title">{recipe.title}</h1>
        <p className="chips-inline">
          <span className="pill">{recipe.cooked_count > 0 ? `Cooked ${recipe.cooked_count}×` : 'Not cooked yet'}</span>
          {recipe.bring_from_home && <span className="pill alt with-icon"><Package size={13} aria-hidden /> packed food</span>}
          {recipe.tags.slice(0, 4).map((t) => <span key={t} className="pill">#{t}</span>)}
        </p>
        {lastTweak && <p className="tweak">Last time: {lastTweak.tweak_note}</p>}
        <p className="meta">
          {recipe.source_type !== 'own' && recipe.source_url && <a href={recipe.source_url} target="_blank" rel="noreferrer">Source</a>}
          {recipe.source_note && recipe.source_type === 'person' && <> {recipe.source_note}</>}
        </p>

        {versions.length > 1 && (
          <div className="versions">
            <div className="inline-label">
              <span>Version</span>
              <Picker
                label="Choose a version"
                value={shown?.id ?? ''}
                onChange={(id) => setViewId(id)}
                options={versions.map((v) => ({
                  id: v.id,
                  label: `v${v.version_number}${v.is_original ? ' (original)' : ''}${v.id === currentId ? ' · current' : ''}`,
                  hint: v.change_note ?? (v.is_original ? 'The first version you saved' : undefined),
                }))}
              />
            </div>
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
          {shown?.ingredients.length ? <div className="chips seg no-print" role="group" aria-label="Units">
            {(['as-saved', 'metric', 'us'] as const).map((u) => (
              <button key={u} className={`chip ${units === u ? 'on' : ''}`} onClick={() => setUnits(u)}>
                {u === 'as-saved' ? 'As saved' : u === 'us' ? 'US' : 'Metric'}
              </button>
            ))}
          </div> : null}
        </div>
        {shown?.ingredients.length ? (
          <ul className="plain">
            {shown.ingredients.map((i, n) => (
              <li key={n}>{formatIngredient(convertIngredient({ ...i, amount: scaleAmount(i.amount, factor, i.unit) }, units))}</li>
            ))}
          </ul>
        ) : <p className="muted">None yet. <Link to={`/recipe/${recipe.id}/edit`}>Add some</Link></p>}
        {shown?.ingredients.length ? (
          <div className="no-print row" style={{ marginTop: 10 }}>
            <button className="btn" onClick={addToList}><ShoppingCart size={18} aria-hidden /> Add to shopping list</button>
            {added !== null && <Link to="/shopping" className="small">{added > 0 ? `Added ${added} · view list` : 'Already on your list · view'}</Link>}
          </div>
        ) : null}

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

      <div className="actionbar no-print">
        <Link to={`/recipe/${recipe.id}/edit`} className="btn">Edit</Link>
        {shown?.steps.length ? (
          <Link to={`/recipe/${recipe.id}/cook`} className="btn primary grow">Start cooking</Link>
        ) : (
          <Link to={`/recipe/${recipe.id}/edit`} className="btn primary grow">Add ingredients &amp; steps</Link>
        )}
      </div>
    </main>
  )
}
