import { Basket, Plus, X } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listRecipes } from '../lib/api'
import { conflicts, loadCatalog, type Dish } from '../lib/discover'
import { dishEmoji, tileIndex } from '../lib/emoji'
import { useAsync } from '../lib/hooks'
import { COMMON_PANTRY, loadPantry, parsePantry, rank, savePantry, shortName, type Rated } from '../lib/pantry'
import type { RecipeCard } from '../lib/types'
import { usePrefs } from '../prefs'
import { DishCard } from './DishCard'

const STEP = 12

/**
 * "What can I cook with what I have?" Type what is in the kitchen and get dishes you can make, easiest
 * first, with exactly what is missing. Looks at your own recipes first, then the whole collection.
 */
export function PantryPanel() {
  const { prefs } = usePrefs()
  const [items, setItems] = useState<string[]>(loadPantry)
  const [text, setText] = useState('')
  const [limit, setLimit] = useState(STEP)
  const catalog = useAsync(loadCatalog, [])
  const mine = useAsync(listRecipes, [])

  function commit(next: string[]) {
    setItems(next)
    savePantry(next)
    setLimit(STEP)
  }

  function add(raw: string) {
    const parsed = parsePantry(raw)
    if (parsed.length === 0) return
    commit([...new Set([...items, ...parsed])].slice(0, 40))
    setText('')
  }

  const dishes = useMemo(
    () =>
      rank(
        (catalog.data ?? []).filter((d) => d.category !== 'Drink' && !conflicts(d, prefs.avoid)),
        (d) => d.ingredients.map((i) => i.name),
        items,
      ),
    [catalog.data, items, prefs.avoid],
  )
  const own = useMemo(() => rank<RecipeCard>(mine.data ?? [], (r) => r.ingredientNames, items), [mine.data, items])

  const ready = dishes.filter((r) => r.a.missing.length === 0)
  const almost = dishes.filter((r) => r.a.missing.length >= 1 && r.a.missing.length <= 2)
  const more = dishes.filter((r) => r.a.missing.length > 2)
  const suggestions = COMMON_PANTRY.filter((s) => !items.includes(s))

  return (
    <section className="pantry" aria-label="Pantry">
      <div className="pantry-box">
        <p className="muted small">Tell Tweaked what is in your kitchen. Salt, pepper, water and cooking oil are assumed.</p>
        <form
          className="pantry-input"
          onSubmit={(e) => {
            e.preventDefault()
            add(text)
          }}
        >
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add what you have: egg, rice, garlic…" aria-label="Add a pantry item" enterKeyHint="done" autoCapitalize="none" />
          <button className="btn primary" disabled={!text.trim()}><Plus size={18} aria-hidden /> Add</button>
        </form>

        {items.length > 0 && (
          <div className="pchips" aria-label="In your pantry">
            {items.map((it) => (
              <span key={it} className="pchip">
                {it}
                <button onClick={() => commit(items.filter((x) => x !== it))} aria-label={`Remove ${it}`}><X size={14} weight="bold" aria-hidden /></button>
              </span>
            ))}
            <button className="link inline" onClick={() => commit([])}>Clear all</button>
          </div>
        )}

        {suggestions.length > 0 && (
          <div className="chips-wrap suggest" aria-label="Quick add">
            {suggestions.slice(0, 14).map((s) => (
              <button key={s} className="chip" onClick={() => add(s)}><Plus size={12} aria-hidden /> {s}</button>
            ))}
          </div>
        )}
      </div>

      {items.length === 0 && (
        <div className="empty">
          <Basket size={36} weight="duotone" className="empty-icon" aria-hidden />
          <h2>What's in your kitchen?</h2>
          <p className="muted">Add a few things you have and we'll find dishes you can cook, plus what you'd still need.</p>
        </div>
      )}

      {items.length > 0 && (catalog.loading || mine.loading) && <p className="muted small pad status">Looking through the recipes…</p>}

      {items.length > 0 && !catalog.loading && !mine.loading && own.length + dishes.length === 0 && (
        <div className="empty">
          <Basket size={36} weight="duotone" className="empty-icon" aria-hidden />
          <h2>Nothing close yet</h2>
          <p className="muted">Add a couple more ingredients, or take away ones that are very unusual.</p>
        </div>
      )}

      {own.length > 0 && (
        <>
          <div className="sec-head"><div><h2>From your recipes <span className="count">{own.length}</span></h2><p className="muted small">Dishes you already keep</p></div></div>
          <ul className="cards">
            {own.slice(0, 6).map(({ item: r, a }) => (
              <li key={r.id}>
                <Link to={`/recipe/${r.id}`} className="rcard">
                  <span className={`rtile t${tileIndex(r.title)}`} aria-hidden>{dishEmoji(r.title, r.tags)}</span>
                  <span className="rbody">
                    <b>{r.title}</b>
                    <Note have={a.have.length} total={a.have.length + a.missing.length} missing={a.missing} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <Group title="Ready to cook" sub="You have everything" list={ready} limit={limit} />
      <Group title="Just a little short" sub="One or two things to pick up" list={almost} limit={limit} />
      <Group title="Worth a shopping trip" sub="You have at least 4 in 10 ingredients" list={more} limit={limit} />

      {ready.length > limit || almost.length > limit || more.length > limit ? (
        <div className="row center" style={{ padding: '0 16px 16px' }}>
          <button className="btn" onClick={() => setLimit(limit + STEP)}>Show more dishes</button>
        </div>
      ) : null}
    </section>
  )
}

function Group({ title, sub, list, limit }: { title: string; sub: string; list: Rated<Dish>[]; limit: number }) {
  if (list.length === 0) return null
  return (
    <>
      <div className="sec-head"><div><h2>{title} <span className="count">{list.length}</span></h2><p className="muted small">{sub}</p></div></div>
      <div className="grid2c">
        {list.slice(0, limit).map(({ item, a }) => (
          <DishCard key={item.id} dish={item} note={{ have: a.have.length, total: a.have.length + a.missing.length, missing: a.missing.map(shortName) }} />
        ))}
      </div>
    </>
  )
}

function Note({ have, total, missing }: { have: number; total: number; missing: string[] }) {
  return (
    <span className="pnote">
      <b>Have {have} of {total}</b>
      {missing.length > 0 ? ` · need ${missing.slice(0, 3).map(shortName).join(', ')}${missing.length > 3 ? ` +${missing.length - 3}` : ''}` : ' · nothing to buy'}
    </span>
  )
}
