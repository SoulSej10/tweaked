import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { DishCard, DishSkeletons } from '../components/DishCard'
import { Shell } from '../components/Shell'
import { listRecentCooks, listRecipes } from '../lib/api'
import { buildFeed, thumbUrl, type Dish } from '../lib/discover'
import { dishEmoji, tileIndex } from '../lib/emoji'
import { RecipeThumb } from '../components/RecipeThumb'
import { loadCovers } from '../lib/covers'
import { historyFrom } from '../lib/history'
import { OPEN_SEED } from '../lib/openSeed'
import { useAsync } from '../lib/hooks'
import { useShopping } from '../lib/shopping'
import { usePrefs } from '../prefs'
import { BookmarkSimple, CookingPot, DiceFive, PencilSimpleLine, ShoppingCart } from '@phosphor-icons/react'

function greeting(hour: number) {
  if (hour < 5) return 'Late-night snack?'
  if (hour < 11) return 'Good morning'
  if (hour < 15) return 'Lunchtime'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function firstName(email: string | undefined) {
  const base = (email ?? '').split('@')[0].replace(/[^a-zA-Z]/g, ' ').trim().split(' ')[0]
  return base ? base[0].toUpperCase() + base.slice(1).toLowerCase() : 'chef'
}

function ago(iso: string | null): string {
  if (!iso) return 'Not cooked yet'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days <= 0) return 'Cooked today'
  if (days === 1) return 'Cooked yesterday'
  return `${days} days ago`
}

export default function Home() {
  const { session } = useAuth()
  const { prefs, name } = usePrefs()
  const recipes = useAsync(listRecipes, [])
  const covers = useAsync(async () => (recipes.data ? await loadCovers(recipes.data) : {}), [recipes.data?.map((r) => r.id + r.source_url + r.title).join()])
  const cooks = useAsync(() => listRecentCooks(60), [])
  const shopping = useShopping().filter((i) => !i.done).length
  const nav = useNavigate()
  const [bump, setBump] = useState(0)
  const [now] = useState(() => Date.now())

  const history = useMemo(() => historyFrom(recipes.data ?? []), [recipes.data])
  const key = JSON.stringify([prefs, history.cuisines, history.categories, [...history.savedIds].sort(), bump])
  const feed = useAsync(async () => {
    if (!recipes.data) return null
    return buildFeed(prefs, history, OPEN_SEED + bump * 7919)
  }, [key, Boolean(recipes.data)])

  const mine = recipes.data ?? []
  const week = (cooks.data ?? []).filter((c) => now - new Date(c.cooked_at).getTime() < 7 * 86400000).length
  const tweaks = (cooks.data ?? []).filter((c) => c.tweak_note).length
  const again = [...mine].filter((r) => r.cooked_count > 0).sort((a, b) => (b.last_cooked_at ?? '').localeCompare(a.last_cooked_at ?? '')).slice(0, 8)
  const tweaked = mine.filter((r) => r.lastTweak).slice(0, 4)
  const tryNext = mine.find((r) => r.cooked_count === 0)

  const sections = feed.data ?? []
  const hero: Dish | undefined = sections[0]?.dishes[0]
  const feedLoading = feed.loading || (recipes.data !== null && feed.data === null && !feed.error)

  return (
    <Shell>
      <header className="topbar">
        <div>
          <p className="eyebrow">{greeting(new Date().getHours())}</p>
          <h1 className="hello">Hi {name ? name.split(' ')[0] : firstName(session?.user.email)}</h1>
        </div>
        <button className="icon-btn" onClick={() => setBump((b) => b + 1)} aria-label="Shuffle suggestions" title="Shuffle suggestions"><DiceFive size={20} /></button>
      </header>

      <section className="stats" aria-label="Your cooking">
        <div className="stat"><b>{mine.length}</b><span>recipes</span></div>
        <div className="stat"><b>{week}</b><span>cooked this week</span></div>
        <div className="stat"><b>{tweaks}</b><span>tweaks logged</span></div>
      </section>

      <nav className="quick" aria-label="Quick actions">
        <Link to="/shopping" className="qa"><ShoppingCart size={22} aria-hidden /><span>Shopping list</span>{shopping > 0 && <span className="badge">{shopping}</span>}</Link>
        <Link to="/discover?pantry=1" className="qa"><CookingPot size={22} aria-hidden /><span>What can I make?</span></Link>
        <button className="qa" onClick={() => (hero ? nav(`/dish/${encodeURIComponent(hero.id)}`) : setBump((b) => b + 1))}><DiceFive size={22} aria-hidden /><span>Surprise me</span></button>
        <Link to="/new" className="qa"><PencilSimpleLine size={22} aria-hidden /><span>Add recipe</span></Link>
      </nav>

      {hero ? (
        <section className="hero rise">
          <Link to={`/dish/${encodeURIComponent(hero.id)}`} className={`hero-img dthumb t${tileIndex(hero.name)}`}>
            <span className="demoji" aria-hidden>{dishEmoji(hero.name, [hero.category])}</span>
            {hero.thumb && <img src={thumbUrl(hero, 'medium')} alt="" decoding="async" referrerPolicy="no-referrer" fetchPriority="high" onError={(e) => (e.currentTarget.style.display = 'none')} />}
            <span className="hero-badge">Tonight's pick</span>
          </Link>
          <div className="hero-body">
            <h2>{hero.name}</h2>
            <p className="muted">{hero.cuisine ? `${hero.cuisine} · ` : ''}{hero.ingredients.length} ingredients · {hero.steps.length} steps{hero.minutes ? ` · ${hero.minutes} min` : ''}</p>
            <div className="row wrap">
              <Link className="btn primary" to={`/dish/${encodeURIComponent(hero.id)}`}>See the recipe</Link>
              <button className="btn" onClick={() => setBump((b) => b + 1)}>Not feeling it</button>
            </div>
          </div>
        </section>
      ) : feedLoading ? (
        <div className="hero skeleton"><div className="hero-img dthumb" /><div className="hero-body"><span className="sk-line" /><span className="sk-line short" /></div></div>
      ) : null}

      {!recipes.loading && mine.length === 0 && (
        <section className="nudge rise">
          <CookingPot size={36} weight="duotone" className="empty-icon" aria-hidden />
          <h2>Start your cookbook</h2>
          <p className="muted">Save a dish from below, or add one you already make. Each time you cook it, tell Tweaked what you changed.</p>
          <Link className="btn primary" to="/new">Add my own recipe</Link>
        </section>
      )}

      {tryNext && mine.length > 0 && (
        <Link to={`/recipe/${tryNext.id}`} className="callout rise">
          <BookmarkSimple size={18} weight="fill" aria-hidden />
          <span><b>Saved but never cooked:</b> {tryNext.title}</span>
          <span className="chev" aria-hidden>›</span>
        </Link>
      )}

      {again.length > 0 && (
        <section>
          <div className="sec-head"><h2>Cook again</h2><Link to="/recipes">All recipes</Link></div>
          <div className="rail">
            {again.map((r) => (
              <Link key={r.id} to={`/recipe/${r.id}`} className="mini">
                <RecipeThumb mini title={r.title} tags={r.tags} src={covers.data?.[r.id]} />
                <b>{r.title}</b>
                <small>{ago(r.last_cooked_at)} · {r.cooked_count}×</small>
              </Link>
            ))}
          </div>
        </section>
      )}

      {tweaked.length > 0 && (
        <section>
          <div className="sec-head"><h2>Your latest tweaks</h2></div>
          <ul className="plain tweak-list">
            {tweaked.map((r) => (
              <li key={r.id}><Link to={`/recipe/${r.id}`}><b>{r.title}</b><span>“{r.lastTweak}”</span></Link></li>
            ))}
          </ul>
        </section>
      )}

      {feedLoading && [0, 1].map((i) => (
        <section key={i}><div className="sec-head"><span className="sk-line title" /></div><DishSkeletons /></section>
      ))}

      {feed.error && (
        <section className="nudge">
          <h2>Can't reach the recipe feed</h2>
          <p className="muted">Check your connection. Your own recipes still work offline.</p>
          <button className="btn" onClick={feed.reload}>Try again</button>
        </section>
      )}

      {sections.map((s, i) => (
        <section key={s.id} className="rise" style={{ animationDelay: `${Math.min(i, 6) * 60}ms` }}>
          <div className="sec-head">
            <div><h2>{s.title}</h2><p className="muted small">{s.subtitle}</p></div>
            <Link to="/discover">More</Link>
          </div>
          <div className="rail">{s.dishes.map((d) => <DishCard key={d.id} dish={d} />)}</div>
        </section>
      ))}

      {!feedLoading && !feed.error && sections.length === 0 && recipes.data && (
        <section className="nudge">
          <h2>Nothing matched your filters</h2>
          <p className="muted">Try relaxing what you avoid or how simple the dishes must be.</p>
          <Link className="btn" to="/onboarding">Update my taste</Link>
        </section>
      )}
    </Shell>
  )
}
