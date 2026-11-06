import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Shell } from '../components/Shell'
import { listRecipes } from '../lib/api'
import { RecipeThumb } from '../components/RecipeThumb'
import { loadCovers } from '../lib/covers'
import { useAsync } from '../lib/hooks'
import type { RecipeCard } from '../lib/types'
import { BookOpen, DiceFive, Heart, MagnifyingGlass, Package } from '@phosphor-icons/react'
import { Picker } from '../components/Picker'

type Filter = 'all' | 'fav' | 'top' | 'recent' | 'never' | 'home'
type Sort = 'updated' | 'az' | 'most' | 'cooked' | 'rated'
const WEEK = 7 * 24 * 3600 * 1000

function ago(iso: string | null): string {
  if (!iso) return 'Not cooked yet'
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
  const [sort, setSort] = useState<Sort>('updated')
  const nav = useNavigate()
  const [now] = useState(() => Date.now())

  const covers = useAsync(async () => (data ? await loadCovers(data) : {}), [data?.map((r) => r.id + r.source_url + r.title + r.photo_path).join()])
  const tags = useMemo(() => [...new Set((data ?? []).flatMap((r) => r.tags))].sort(), [data])

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase()
    const list = (data ?? []).filter((r: RecipeCard) => {
      if (filter === 'fav' && !r.favorite) return false
      if (filter === 'top' && !(r.rating && r.rating >= 4)) return false
      if (filter === 'recent' && !(r.last_cooked_at && now - new Date(r.last_cooked_at).getTime() < WEEK * 2)) return false
      if (filter === 'never' && r.cooked_count > 0) return false
      if (filter === 'home' && !r.bring_from_home) return false
      if (tag && !r.tags.includes(tag)) return false
      if (!term) return true
      return r.title.toLowerCase().includes(term) || r.ingredientNames.some((n) => n.includes(term))
    })
    const by: Record<Sort, (a: RecipeCard, b: RecipeCard) => number> = {
      updated: () => 0, // the list already arrives newest first
      az: (a, b) => a.title.localeCompare(b.title),
      most: (a, b) => b.cooked_count - a.cooked_count,
      cooked: (a, b) => (b.last_cooked_at ?? '').localeCompare(a.last_cooked_at ?? ''),
      rated: (a, b) => (b.rating ?? 0) - (a.rating ?? 0),
    }
    return [...list].sort(by[sort])
  }, [data, q, filter, tag, now, sort])

  function surprise() {
    const pool = shown.length ? shown : data ?? []
    if (pool.length) nav(`/recipe/${pool[Math.floor(Math.random() * pool.length)].id}`)
  }

  return (
    <Shell>
      <header className="topbar">
        <h1>My recipes</h1>
        <button className="icon-btn" onClick={surprise} disabled={!data?.length} aria-label="Surprise me" title="Surprise me"><DiceFive size={20} /></button>
      </header>

      <div className="searchbar">
        <div className="searchfield">
          <MagnifyingGlass size={18} aria-hidden />
          <input
          type="search"
          placeholder="Search name or ingredient"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search recipes"
        />
        </div>
      </div>

      <div className="sortrow">
        <div className="inline-label">
          <span>Sort</span>
          <Picker<Sort>
            label="Sort recipes"
            value={sort}
            onChange={setSort}
            options={[
              { id: 'updated', label: 'Recently changed' },
              { id: 'cooked', label: 'Recently cooked' },
              { id: 'most', label: 'Most cooked' },
              { id: 'rated', label: 'Highest rated' },
              { id: 'az', label: 'A to Z' },
            ]}
          />
        </div>
        <span className="muted small">{shown.length} {shown.length === 1 ? 'recipe' : 'recipes'}</span>
      </div>

      <div className="chips" role="group" aria-label="Filters">
        {([['all', 'All'], ['fav', 'Favorites'], ['top', '4 stars and up'], ['recent', 'Cooked recently'], ['never', 'Never cooked'], ['home', 'Bring from home']] as const).map(([k, label]) => (
          <button key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{k === 'fav' && <Heart size={14} weight="fill" aria-hidden />}{label}</button>
        ))}
        {tags.map((t) => (
          <button key={t} className={`chip alt ${tag === t ? 'on' : ''}`} onClick={() => setTag(tag === t ? null : t)}>#{t}</button>
        ))}
      </div>

      {loading && <p className="muted pad">Loading…</p>}
      {error && <p className="error pad">{error}</p>}
      {!loading && !error && data?.length === 0 && (
        <div className="empty">
          <BookOpen size={36} weight="duotone" className="empty-icon" aria-hidden />
          <h2>No recipes yet</h2>
          <p className="muted">Save a dish you like from Discover, or add your own with just a title.</p>
          <div className="row center wrap"><Link className="btn primary" to="/discover">Browse ideas</Link><Link className="btn" to="/new">Add my own</Link></div>
        </div>
      )}
      {!loading && data && data.length > 0 && shown.length === 0 && <p className="empty">Nothing matches.</p>}

      <ul className="cards">
        {shown.map((r, i) => (
          <li key={r.id} className="rise" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
            <Link to={`/recipe/${r.id}`} className="rcard">
              <RecipeThumb title={r.title} tags={r.tags} src={covers.data?.[r.id]} />
              <span className="rbody">
                <b>{r.favorite && <Heart size={13} weight="fill" className="heart" aria-label="Favorite" />} {r.title}</b>
                <span className="meta">{r.rating ? <span className="rate-pill">★ {r.rating} · </span> : null}{ago(r.last_cooked_at)}{r.cooked_count > 0 ? ` · ${r.cooked_count}×` : ''}</span>
                {r.lastTweak && <span className="tweak">Last time: {r.lastTweak}</span>}
                {(r.tags.length > 0 || r.bring_from_home) && (
                  <span className="tags">
                    {r.bring_from_home && <span className="with-icon"><Package size={12} aria-hidden /> packed</span>}
                    {r.tags.slice(0, 3).map((t) => <span key={t}>#{t}</span>)}
                  </span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Shell>
  )
}
