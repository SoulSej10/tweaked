import { useParams, useSearchParams } from 'react-router-dom'
import { getRecipe } from '../lib/api'
import { useAsync, useTitle } from '../lib/hooks'
import { formatIngredient } from '../lib/parse'
import { BackLink } from '../components/Brand'

function Column({ lines, other }: { lines: string[]; other: string[] }) {
  return (
    <ul className="plain diff">
      {lines.map((l, i) => (
        <li key={i} className={other.includes(l) ? '' : 'changed'}>{l}</li>
      ))}
    </ul>
  )
}

export default function Compare() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const { data, error, loading } = useAsync(() => getRecipe(id), [id])
  useTitle(data ? `Compare ${data.recipe.title}` : 'Compare')

  if (loading) return <main className="page"><p className="muted pad">Loading…</p></main>
  if (error || !data) return <main className="page"><p className="error pad">{error ?? 'Not found'}</p></main>

  const { recipe, versions } = data
  const asc = [...versions].sort((x, y) => x.version_number - y.version_number)
  const find = (key: string, fallback: number) =>
    asc.find((v) => v.id === params.get(key)) ?? asc[Math.min(Math.max(fallback, 0), asc.length - 1)]
  const a = find('a', 0)
  const b = find('b', asc.length - 1)

  const select = (key: 'a' | 'b', value: string) => {
    const next = new URLSearchParams(params)
    next.set('a', params.get('a') ?? a.id)
    next.set('b', params.get('b') ?? b.id)
    next.set(key, value)
    setParams(next, { replace: true })
  }

  const ingA = a.ingredients.map(formatIngredient)
  const ingB = b.ingredients.map(formatIngredient)
  const stA = a.steps.map((s) => s.text)
  const stB = b.steps.map((s) => s.text)

  const picker = (key: 'a' | 'b', current: string) => (
    <select value={current} onChange={(e) => select(key, e.target.value)} aria-label={`Version ${key === 'a' ? 'left' : 'right'}`}>
      {asc.map((v) => <option key={v.id} value={v.id}>v{v.version_number}{v.is_original ? ' (original)' : ''}</option>)}
    </select>
  )

  return (
    <main className="page">
      <header className="topbar">
        <BackLink to={`/recipe/${recipe.id}`} />
        <h1>Compare</h1>
      </header>
      <section className="pad">
        <h2 className="title small-title">{recipe.title}</h2>
        <p className="muted small">Highlighted lines exist only in that version.</p>
        <div className="compare">
          <div className="cmp-col">
            {picker('a', a.id)}
            {a.change_note && <p className="muted small">{a.change_note}</p>}
            <h3>Ingredients</h3><Column lines={ingA} other={ingB} />
            <h3>Steps</h3><Column lines={stA} other={stB} />
          </div>
          <div className="cmp-col">
            {picker('b', b.id)}
            {b.change_note && <p className="muted small">{b.change_note}</p>}
            <h3>Ingredients</h3><Column lines={ingB} other={ingA} />
            <h3>Steps</h3><Column lines={stB} other={stA} />
          </div>
        </div>
      </section>
    </main>
  )
}
