import { ArrowSquareOut, DiceFive, Link as LinkIcon, MagnifyingGlass, Plus, Sparkle } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DishCard } from '../components/DishCard'
import { Shell } from '../components/Shell'
import { browseDishes, conflicts, isSimple, loadCatalog, searchCatalog, searchWebSmart, urlDishId, type Browse, type Dish, type SearchOutcome } from '../lib/discover'
import { useAsync } from '../lib/hooks'
import { CUISINES, KINDS } from '../lib/prefs'
import { webSearch, type WebResult } from '../lib/web'
import { usePrefs } from '../prefs'

const PAGE = 24
const NO_OUTCOME: SearchOutcome = { dishes: [], closest: false, meant: null, similar: [], variants: [] }

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

  const isLink = /^https?:\/\//i.test(q.trim())
  const term = useDebounced(isLink ? '' : q.trim(), 200)
  const webTerm = useDebounced(isLink ? '' : q.trim(), 600)
  const searching = term.length >= 2

  // Warm the catalog as soon as the page opens so the first tap is instant.
  useEffect(() => {
    void loadCatalog()
  }, [])

  const browse = useAsync(() => browseDishes(pick), [JSON.stringify(pick), spin])
  // Each result remembers which query it answers, so we never say "nothing found" for a query that is still loading.
  const local = useAsync(async () => ({ q: term, out: searching ? await searchCatalog(term) : NO_OUTCOME }), [term])
  const web = useAsync(async () => ({ q: webTerm, dishes: webTerm.length >= 3 ? await searchWebSmart(webTerm) : ([] as Dish[]) }), [webTerm])
  const localReady = local.data?.q === term
  const webReady = web.data?.q === webTerm && webTerm === term

  const browseList = useMemo(
    () => (browse.data ?? []).filter((d) => (!simple || isSimple(d, prefs.effort)) && !conflicts(d, prefs.avoid)),
    [browse.data, simple, prefs.effort, prefs.avoid],
  )

  // When searching, do not hide results behind "keep it simple": people asked for that dish by name.
  const outcome = local.data?.out ?? NO_OUTCOME
  const allowed = (d: Dish) => showHidden || !conflicts(d, prefs.avoid)
  const localList = outcome.dishes.filter(allowed)
  const seen = new Set(outcome.dishes.map((d) => d.id))
  const webAll = (web.data?.dishes ?? []).filter((d) => !seen.has(d.id))
  const webList = webAll.filter(allowed)
  const similarList = outcome.similar.filter((d) => allowed(d) && !seen.has(d.id)).slice(0, 8)
  // Dishes the user's own "skip" choices are hiding; say so instead of pretending nothing exists.
  const hiddenCount = outcome.dishes.length + webAll.length - localList.length - webList.length

  const choose = (p: Browse) => {
    setPick(p)
    setQ('')
    setShown(PAGE)
  }

  const ready = localReady && webReady
  const list = browseList.slice(0, shown)

  return (
    <Shell>
      <header className="topbar">
        <h1>Discover</h1>
        <button className="icon-btn" onClick={() => { choose({ type: 'mix' }); setSpin((s) => s + 1) }} aria-label="Surprise me"><DiceFive size={20} /></button>
      </header>

      <form className="searchbar" onSubmit={(e) => e.preventDefault()}>
        <div className="searchfield">
          <MagnifyingGlass size={18} aria-hidden />
          <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setShowHidden(false) }} placeholder="Search a dish, however you spell it" aria-label="Search dishes" enterKeyHint="search" />
        </div>
      </form>

      {isLink && (
        <div className="empty">
          <LinkIcon size={34} className="empty-icon" aria-hidden />
          <h2>Import this recipe page</h2>
          <p className="muted">Tweaked reads the ingredients and steps from the page, so you can save and tweak your own version.</p>
          <Link className="btn primary" to={`/dish/${encodeURIComponent(urlDishId(q.trim()))}`}>Read this page</Link>
        </div>
      )}

      {!searching && !isLink && (
        <>
          <div className="chips" role="group" aria-label="Cuisine">
            <button className={`chip ${pick.type === 'mix' ? 'on' : ''}`} onClick={() => choose({ type: 'mix' })}>Mix</button>
            {CUISINES.map((c) => (
              <button key={c.id} className={`chip ${pick.type === 'cuisine' && pick.id === c.id ? 'on' : ''}`} onClick={() => choose({ type: 'cuisine', id: c.id })}>{c.flag} {c.label}</button>
            ))}
          </div>
          <div className="chips" role="group" aria-label="Kind of dish">
            {KINDS.map((k) => (
              <button key={k.id} className={`chip alt ${pick.type === 'kind' && pick.id === k.id ? 'on' : ''}`} onClick={() => choose({ type: 'kind', id: k.id })}>{k.label}</button>
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

          {localReady && outcome.meant && (
            <p className="pad status meant">Showing results for <b>{outcome.meant}</b></p>
          )}

          {localList.length > 0 && (
            <>
              <div className="sec-head">
                <div>
                  <h2>{outcome.closest ? 'Closest matches' : 'In Tweaked'} <span className="count">{localList.length}</span></h2>
                  {outcome.closest && <p className="muted small">Nothing is named exactly “{term}”, but these are close.</p>}
                </div>
              </div>
              <div className="grid2c">{localList.slice(0, 30).map((d) => <DishCard key={d.id} dish={d} />)}</div>
            </>
          )}

          {webList.length > 0 && (
            <>
              <div className="sec-head"><div><h2>More from the web</h2><p className="muted small">Wikibooks Cookbook, free to use</p></div></div>
              <div className="grid2c">{webList.map((d) => <DishCard key={d.id} dish={d} />)}</div>
            </>
          )}

          {localReady && similarList.length > 0 && (
            <>
              <div className="sec-head"><div><h2>Similar dishes</h2><p className="muted small">Not the same, but in the same spirit</p></div></div>
              <div className="rail">{similarList.map((d) => <DishCard key={d.id} dish={d} />)}</div>
            </>
          )}

          {!webReady && <p className="muted small pad status">Searching the web for more…</p>}

          {hiddenCount > 0 && !showHidden && ready && (
            <p className="pad status muted small">
              {hiddenCount} {hiddenCount === 1 ? 'dish is' : 'dishes are'} hidden because of what you skip ({prefs.avoid.join(', ')}).{' '}
              <button className="link inline" onClick={() => setShowHidden(true)}>Show {hiddenCount === 1 ? 'it' : 'them'} anyway</button>
            </p>
          )}

          {/* Shown as soon as the local results are in; it never waits on the web search. */}
          {localReady && <CantFind term={term} meant={outcome.meant} none={ready && localList.length + webList.length + similarList.length === 0} />}
        </>
      ) : isLink ? null : (
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

/**
 * Always the last thing on a search: a way forward when the dish is not here. Add it yourself,
 * search the open web, or (when switched on) ask AI to search for recipe pages.
 */
function CantFind({ term, meant, none }: { term: string; meant: string | null; none: boolean }) {
  const [state, setState] = useState<{ term: string; status: 'loading' | 'done' | 'error'; results: WebResult[]; message?: string } | null>(null)
  const current = state && state.term === term ? state : null
  const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(`${meant ?? term} recipe`)}`

  async function run() {
    setState({ term, status: 'loading', results: [] })
    try {
      const r = await webSearch(meant ?? term)
      setState({ term, status: 'done', results: r.results })
    } catch (e) {
      setState({ term, status: 'error', results: [], message: (e as Error).message })
    }
  }

  return (
    <section className="cantfind" aria-label="Can't find it?">
      <h2>{none ? `We couldn't find “${term}”` : "Can't find it?"}</h2>
      <p className="muted">
        {none ? 'It is not in our collections yet. ' : ''}
        You can keep it anyway: add it yourself, or find a recipe online and paste the link or caption in.
      </p>
      <div className="cantfind-actions">
        <Link className="btn primary" to={`/new?title=${encodeURIComponent(meant ?? term)}`}><Plus size={18} /> Add “{meant ?? term}” myself</Link>
        <a className="btn" href={googleUrl} target="_blank" rel="noreferrer"><ArrowSquareOut size={18} /> Search online</a>
        <button className="btn" onClick={run} disabled={current?.status === 'loading'}><Sparkle size={18} /> {current?.status === 'loading' ? 'Searching…' : 'Ask AI to search the web'}</button>
      </div>
      <p className="muted small">AI search uses 1 of your 20 daily web lookups.</p>

      {current?.status === 'error' && <p className="error" role="alert">{current.message}</p>}
      {current?.status === 'done' && current.results.length === 0 && <p className="muted small">No recipe pages found. Try different words.</p>}
      {current?.status === 'done' && current.results.length > 0 && (
        <ul className="webres">
          {current.results.map((r) => (
            <li key={r.url}>
              <Link to={`/dish/${encodeURIComponent(urlDishId(r.url))}`}><b>{r.title}</b><span>{r.site}</span></Link>
            </li>
          ))}
        </ul>
      )}
    </section>
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
