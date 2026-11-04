import { useState } from 'react'
import { DishCard } from '../components/DishCard'
import { Shell } from '../components/Shell'
import { conflicts, dummyAll, isSimple, listByCategory, listByCuisine, lookupMany, randomDishes, searchDishes, type Dish } from '../lib/discover'
import { useAsync } from '../lib/hooks'
import { CUISINES, KINDS } from '../lib/prefs'
import { usePrefs } from '../prefs'

type Pick = { type: 'mix' } | { type: 'cuisine'; id: string } | { type: 'kind'; id: string }

export default function Discover() {
  const { prefs } = usePrefs()
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const [pick, setPick] = useState<Pick>({ type: 'mix' })
  const [simple, setSimple] = useState(true)
  const [spin, setSpin] = useState(0)

  const dishes = useAsync(async (): Promise<Dish[]> => {
    let list: Dish[]
    if (term) list = await searchDishes(term)
    else if (pick.type === 'cuisine') {
      const c = CUISINES.find((x) => x.id === pick.id)
      const stubs = c ? await listByCuisine(c) : []
      const [meals, extra] = await Promise.all([lookupMany(stubs.slice(0, 30).map((s) => s.id)), dummyAll()])
      list = [...extra.filter((d) => d.cuisineId === pick.id), ...meals]
    } else if (pick.type === 'kind') {
      const k = KINDS.find((x) => x.id === pick.id)
      const lists = await Promise.all((k?.categories ?? []).map((c) => listByCategory(c)))
      const ids = lists.flat().sort(() => Math.random() - 0.5).slice(0, 24).map((s) => s.id)
      const cats = new Set<string>(k?.categories ?? [])
      const [meals, extra] = await Promise.all([lookupMany(ids), dummyAll()])
      list = [...extra.filter((d) => cats.has(d.category)), ...meals]
    } else list = await randomDishes(16)
    if (simple) list = list.filter((d) => isSimple(d, prefs.effort))
    return list.filter((d) => !conflicts(d, prefs.avoid))
  }, [term, JSON.stringify(pick), simple, spin, prefs.effort, prefs.avoid.join()])

  return (
    <Shell>
      <header className="topbar"><h1>Discover</h1><button className="icon-btn" onClick={() => { setPick({ type: 'mix' }); setTerm(''); setQ(''); setSpin((s) => s + 1) }} aria-label="Surprise me">🎲</button></header>

      <form className="searchbar" onSubmit={(e) => { e.preventDefault(); setTerm(q.trim()) }}>
        <input type="search" value={q} onChange={(e) => { setQ(e.target.value); if (!e.target.value) setTerm('') }} placeholder="Search dishes: adobo, pasta, cake…" aria-label="Search dishes" enterKeyHint="search" />
      </form>

      <div className="chips" role="group" aria-label="Cuisine">
        <button className={`chip ${pick.type === 'mix' && !term ? 'on' : ''}`} onClick={() => { setPick({ type: 'mix' }); setTerm(''); setQ('') }}>🎲 Mix</button>
        {CUISINES.map((c) => (
          <button key={c.id} className={`chip ${pick.type === 'cuisine' && pick.id === c.id ? 'on' : ''}`} onClick={() => { setPick({ type: 'cuisine', id: c.id }); setTerm(''); setQ('') }}>{c.flag} {c.label}</button>
        ))}
      </div>
      <div className="chips" role="group" aria-label="Kind of dish">
        {KINDS.map((k) => (
          <button key={k.id} className={`chip alt ${pick.type === 'kind' && pick.id === k.id ? 'on' : ''}`} onClick={() => { setPick({ type: 'kind', id: k.id }); setTerm(''); setQ('') }}>{k.emoji} {k.label}</button>
        ))}
      </div>

      <label className="switch">
        <input type="checkbox" checked={simple} onChange={(e) => setSimple(e.target.checked)} />
        <span>Keep it simple <small>(skip long ingredient lists)</small></span>
      </label>

      {dishes.loading && (
        <div className="grid2c" aria-hidden>{Array.from({ length: 6 }, (_, i) => <div key={i} className="dcard skeleton"><div className="dthumb" /><div className="dbody"><span className="sk-line" /><span className="sk-line short" /></div></div>)}</div>
      )}
      {dishes.error && <p className="error pad">Couldn't load dishes. Check your connection. <button className="link" onClick={dishes.reload}>Try again</button></p>}
      {!dishes.loading && dishes.data && dishes.data.length === 0 && (
        <p className="empty">Nothing simple here. Try another cuisine, or switch off “Keep it simple”.</p>
      )}
      {!dishes.loading && dishes.data && dishes.data.length > 0 && (
        <div className="grid2c">{dishes.data.map((d) => <DishCard key={d.id} dish={d} />)}</div>
      )}
    </Shell>
  )
}
