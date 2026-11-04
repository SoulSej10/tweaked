import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DishCard } from '../components/DishCard'
import { Shell } from '../components/Shell'
import { browseDishes, conflicts, isSimple, loadCatalog, searchCatalog, searchWeb, type Browse, type Dish } from '../lib/discover'
import { useAsync } from '../lib/hooks'
import { CUISINES, KINDS } from '../lib/prefs'
import { usePrefs } from '../prefs'

const PAGE = 24

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export default function Discover() {
  const { prefs } = usePrefs()
  const [q, setQ] = useState('')
  const [pick, setPick] = useState<Browse>({ type: 'mix' })
  const [simple, setSimple] = useState(true)
  const [spin, setSpin] = useState(0)
  const [shown, setShown] = useState(PAGE)
  const [showHidden, setShowHidden] = useState(false)

  const term = useDebounced(q.trim(), 200)
  const webTerm = useDebounced(q.trim(), 600)
  const searching = term.length >= 2

  // Warm the catalog as soon as the page opens so the first tap is instant.
  useEffect(() => {
    void loadCatalog()
  }, [])

  const browse = useAsync(() => browseDishes(pick), [JSON.stringify(pick), spin])
  // Each result remembers which query it answers, so we never show "nothing found" for a query that is still loading.
  const local = useAsync(async () => ({ q: term, dishes: searching ? await searchCatalog(term) : ([] as Dish[]) }), [term])
  const web = useAsync(async () => ({ q: webTerm, dishes: webTerm.length >= 3 ? await searchWeb(webTerm) : ([] as Dish[]) }), [webTerm])
  const localReady = local.data?.q === term
  const webReady = web.data?.q === webTerm && webTerm === term

  const browseList = useMemo(
    () => (browse.data ?? []).filter((d) => (!simple || isSimple(d, prefs.effort)) && !conflicts(d, prefs.avoid)),
    [browse.data, simple, prefs.effort, prefs.avoid],
  )
  // When searching, do not hide results behind "keep it simple": people asked for that dish by name.
  const allowed = (d: Dish) => showHidden || !conflicts(d, prefs.avoid)
  const localAll = local.data?.dishes ?? []
  const localList = useMemo(() => localAll.filter(allowed), [local.data, prefs.avoid, showHidden]) // eslint-disable-line react-hooks/exhaustive-deps
  const localIds = new Set(localAll.map((d) => d.id))
  const webAll = (web.data?.dishes ?? []).filter((d) => !localIds.has(d.id))
  const webList = webAll.filter(allowed)
  // Dishes the user's own "skip" choices are hiding; say so instead of claiming nothing exists.
  const hiddenCount = localAll.length + webAll.length - localList.length - webList.length

  const choose = (p: Browse) => {
    setPick(p)
    setQ('')
    setShown(PAGE)
  }

  const webPending = searching && !webReady
  const nothing = searching && localReady && webReady && localList.length === 0 && webList.length === 0 && hiddenCount === 0
  const list = browseList.slice(0, shown)
  const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(`${term} recipe`)}`

  return (
    <Shell>
      <header className="topbar">
        <h1>Discover</h1>
        <button className="icon-btn" onClick={() => { choose({ type: 'mix' }); setSpin((s) => s + 1) }} aria-label="Surprise me">🎲</button>
      </header>

      <form className="searchbar" onSubmit={(e) => e.preventDefault()}>
        <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setShowHidden(false) }} placeholder="Search any dish: bicol express, adobo, cake…" aria-label="Search dishes" enterKeyHint="search" />
      </form>

      {!searching && (
        <>
          <div className="chips" role="group" aria-label="Cuisine">
            <button className={`chip ${pick.type === 'mix' ? 'on' : ''}`} onClick={() => choose({ type: 'mix' })}>🎲 Mix</button>
            {CUISINES.map((c) => (
              <button key={c.id} className={`chip ${pick.type === 'cuisine' && pick.id === c.id ? 'on' : ''}`} onClick={() => choose({ type: 'cuisine', id: c.id })}>{c.flag} {c.label}</button>
            ))}
          </div>
          <div className="chips" role="group" aria-label="Kind of dish">
            {KINDS.map((k) => (
              <button key={k.id} className={`chip alt ${pick.type === 'kind' && pick.id === k.id ? 'on' : ''}`} onClick={() => choose({ type: 'kind', id: k.id })}>{k.emoji} {k.label}</button>
            ))}
          </div>
          <label className="switch">
            <input type="checkbox" checked={simple} onChange={(e) => { setSimple(e.target.checked); setShown(PAGE) }} />
            <span>Keep it simple <small>(skip long ingredient lists)</small></span>
          </label>
        </>
      )}

      {searching ? (
        <>
          {!localReady && localList.length === 0 && <Skeletons n={4} />}
          {localList.length > 0 && (
            <>
              <div className="sec-head"><h2>In Tweaked ({localList.length})</h2></div>
              <div className="grid2c">{localList.slice(0, 30).map((d) => <DishCard key={d.id} dish={d} />)}</div>
            </>
          )}
          {webList.length > 0 && (
            <>
              <div className="sec-head"><div><h2>More from the web</h2><p className="muted small">Wikibooks Cookbook, free to use</p></div></div>
              <div className="grid2c">{webList.map((d) => <DishCard key={d.id} dish={d} />)}</div>
            </>
          )}
          {webPending && <p className="muted small pad status">Searching the web for more…</p>}
          {hiddenCount > 0 && !showHidden && localReady && webReady && (
            <p className="pad status muted small">
              {hiddenCount} {hiddenCount === 1 ? 'dish is' : 'dishes are'} hidden because of what you skip ({prefs.avoid.join(', ')}).{' '}
              <button className="link inline" onClick={() => setShowHidden(true)}>Show {hiddenCount === 1 ? 'it' : 'them'} anyway</button>
            </p>
          )}
          {nothing && (
            <div className="empty">
              <p className="nudge-emoji" aria-hidden>🔎</p>
              <h2>No “{term}” yet</h2>
              <p className="muted">It isn't in our collections. You can still keep it: add it yourself, or find a recipe online and paste it in.</p>
              <div className="row center wrap">
                <Link className="btn primary" to={`/new?title=${encodeURIComponent(term)}`}>Add “{term}” myself</Link>
                <a className="btn" href={googleUrl} target="_blank" rel="noreferrer">Search the web ↗</a>
              </div>
            </div>
          )}
          {!nothing && localReady && webReady && (
            <p className="pad status muted small">Can't see the one you want? <Link to={`/new?title=${encodeURIComponent(term)}`}>Add “{term}” yourself</Link> or <a href={googleUrl} target="_blank" rel="noreferrer">search the web</a>.</p>
          )}
        </>
      ) : (
        <>
          {browse.loading && <Skeletons n={6} />}
          {browse.error && <p className="error pad">Couldn't load dishes. Check your connection. <button className="link" onClick={browse.reload}>Try again</button></p>}
          {!browse.loading && browse.data && browseList.length === 0 && <p className="empty">Nothing simple here. Try another cuisine, or switch off “Keep it simple”.</p>}
          {list.length > 0 && <div className="grid2c">{list.map((d) => <DishCard key={d.id} dish={d} />)}</div>}
          {browseList.length > shown && (
            <div className="row center" style={{ padding: '0 16px 16px' }}>
              <button className="btn" onClick={() => setShown(shown + PAGE)}>Show more ({browseList.length - shown} left)</button>
            </div>
          )}
        </>
      )}
    </Shell>
  )
}

function Skeletons({ n }: { n: number }) {
  return (
    <div className="grid2c" aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="dcard skeleton"><div className="dthumb" /><div className="dbody"><span className="sk-line" /><span className="sk-line short" /></div></div>
      ))}
    </div>
  )
}
