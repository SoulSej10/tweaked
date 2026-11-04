import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listRecipes } from '../lib/api'
import { useAsync } from '../lib/hooks'
import type { RecipeCard } from '../lib/types'

type Filter = 'all' | 'recent' | 'never' | 'home'
const WEEK = 7 * 24 * 3600 * 1000

function ago(iso: string | null): string {
  if (!iso) return 'Never cooked'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days <= 0) return 'Cooked today'
  if (days === 1) return 'Cooked yesterday'
  return `Cooked ${days} days ago`
}

export default function Library() {
  const { data, error, loading } = useAsync(listRecipes, [])
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [tag, setTag] = useState<string | null>(null)
  const [pantry, setPantry] = useState(false)
  const nav = useNavigate()
  const [now] = useState(() => Date.now())

  const tags = useMemo(() => [...new Set((data ?? []).flatMap((r) => r.tags))].sort(), [data])

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase()
    const have = term.split(/[,\s]+/).filter(Boolean)
    return (data ?? []).filter((r: RecipeCard) => {
      if (filter === 'recent' && !(r.last_cooked_at && now - new Date(r.last_cooked_at).getTime() < WEEK * 2)) return false
      if (filter === 'never' && r.cooked_count > 0) return false
      if (filter === 'home' && !r.bring_from_home) return false
      if (tag && !r.tags.includes(tag)) return false
      if (!term) return true
      if (pantry) {
        // "I have rice, egg": show dishes where most of the ingredients are on hand.
        const names = r.ingredientNames
        if (names.length === 0) return false
        const matched = names.filter((n) => have.some((h) => n.includes(h))).length
        return matched / names.length >= 0.5
      }
      return r.title.toLowerCase().includes(term) || r.ingredientNames.some((n) => n.includes(term))
    })
  }, [data, q, filter, tag, pantry, now])

  function surprise() {
    const pool = shown.length ? shown : data ?? []
    if (pool.length) nav(`/recipe/${pool[Math.floor(Math.random() * pool.length)].id}`)
  }

  return (
    <main>
      <header className="bar">
        <h1>Tweaked</h1>
        <div className="row">
          <button className="btn ghost" onClick={surprise} disabled={!data?.length}>Surprise me</button>
          <Link className="btn ghost" to="/settings" aria-label="Settings">⚙</Link>
        </div>
      </header>

      <div className="search">
        <input
          type="search"
          placeholder={pantry ? 'I have: rice, egg, garlic' : 'Search name or ingredient'}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search recipes"
        />
        <label className="check">
          <input type="checkbox" checked={pantry} onChange={(e) => setPantry(e.target.checked)} /> Pantry
        </label>
      </div>

      <div className="chips" role="group" aria-label="Filters">
        {([['all', 'All'], ['recent', 'Cooked recently'], ['never', 'Never cooked'], ['home', 'Bring from home']] as const).map(([k, label]) => (
          <button key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{label}</button>
        ))}
        {tags.map((t) => (
          <button key={t} className={`chip tag ${tag === t ? 'on' : ''}`} onClick={() => setTag(tag === t ? null : t)}>#{t}</button>
        ))}
      </div>

      {loading && <p className="muted pad">Loading…</p>}
      {error && <p className="error pad">{error}</p>}
      {!loading && !error && data?.length === 0 && (
        <div className="empty">
          <p>No recipes yet.</p>
          <p className="muted">Save the first one with just a title. Fill in the rest later.</p>
        </div>
      )}
      {!loading && data && data.length > 0 && shown.length === 0 && <p className="muted pad">Nothing matches.</p>}

      <ul className="cards">
        {shown.map((r) => (
          <li key={r.id}>
            <Link to={`/recipe/${r.id}`} className="card">
              <h2>{r.title}</h2>
              <p className="meta">{ago(r.last_cooked_at)}{r.cooked_count > 0 ? ` · ${r.cooked_count}×` : ''}</p>
              {r.lastTweak && <p className="tweak">Last time: {r.lastTweak}</p>}
              {(r.tags.length > 0 || r.bring_from_home) && (
                <p className="tags">
                  {r.bring_from_home && <span>🍱 home</span>}
                  {r.tags.map((t) => <span key={t}>#{t}</span>)}
                </p>
              )}
            </Link>
          </li>
        ))}
      </ul>

      <Link to="/new" className="fab" aria-label="Add recipe">+</Link>
    </main>
  )
}
