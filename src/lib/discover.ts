import { AVOID, CUISINES, KINDS, cuisineById, cuisineOf, homeCuisine, type Cuisine, type Effort, type Preferences } from './prefs'
import { compact, interpret, normalize, wordMatches } from './fuzzy'
import { parseIngredientLine, parseStepLine } from './parse'
import type { Ingredient, Step } from './types'

/**
 * Where dishes come from (all free and callable straight from the browser):
 *  - a bundled catalog (public/catalog.json, built by scripts/build-catalog.mjs) with ~900 dishes
 *    from TheMealDB, DummyJSON and TheCocktailDB: instant and works offline
 *  - Wikibooks Cookbook: searched live, for dishes that are not in the catalog (e.g. "Bicol Express")
 *  - the three original APIs, only as a fallback if the catalog cannot be loaded
 * Dish ids: plain number = TheMealDB, "dj-5" = DummyJSON, "cd-11007" = TheCocktailDB, "wb-Cookbook:Title" = Wikibooks,
 * "url-<base64 of a web address>" = any recipe page imported through our server (see src/lib/web.ts).
 */
const MEAL = 'https://www.themealdb.com/api/json/v1/1'
const DUMMY = 'https://dummyjson.com/recipes'
const DRINK = 'https://www.thecocktaildb.com/api/json/v1/1'
const WIKI = 'https://en.wikibooks.org/w/api.php'

export type Dish = {
  id: string
  name: string
  thumb: string
  category: string
  cuisine: string // display label ("Filipino", or the source's own label if we do not know it)
  cuisineId: string | null
  ingredients: { name: string; measure: string }[]
  steps: string[]
  source: string | null
  youtube: string | null
  minutes: number | null
}

export type Stub = { id: string; name: string; thumb: string }

type Raw = Record<string, string | null | undefined>

// ---------- network + caches ----------

const inflight = new Map<string, Promise<unknown>>()

function getJson<T>(url: string): Promise<T> {
  let p = inflight.get(url)
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`Recipe source returned ${r.status}`)
      return r.json()
    })
    inflight.set(url, p)
    p.catch(() => inflight.delete(url))
  }
  return p as Promise<T>
}

const LS = 'tweaked.dish.v3.'
const MAX_CACHED = 400

function readCached(id: string): Dish | null {
  try {
    const s = localStorage.getItem(LS + id)
    return s ? (JSON.parse(s) as Dish) : null
  } catch {
    return null
  }
}

function writeCached(d: Dish) {
  try {
    localStorage.setItem(LS + d.id, JSON.stringify(d))
    if (Math.random() < 0.05) pruneCache()
  } catch {
    pruneCache(true)
  }
}

/** Keep the offline dish cache from growing without limit. */
function pruneCache(force = false) {
  try {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(LS))
    if (force || keys.length > MAX_CACHED) keys.slice(0, Math.max(0, keys.length - Math.floor(MAX_CACHED / 2))).forEach((k) => localStorage.removeItem(k))
    Object.keys(localStorage).filter((k) => k.startsWith('tweaked.dish.v2.')).forEach((k) => localStorage.removeItem(k))
  } catch {
    /* storage unavailable: fine */
  }
}

/** Thumbnail URL at a sensible size (TheMealDB serves /small /medium /large variants). */
export function thumbUrl(d: Pick<Dish, 'thumb'>, size: 'small' | 'medium' | 'large'): string {
  if (!d.thumb) return ''
  return d.thumb.includes('themealdb.com') ? `${d.thumb}/${size}` : d.thumb
}

// ---------- parsing ----------

const STEP_PREFIX = /^\s*(?:step\s*\d+\s*[:.)-]?|\d+\s*[.)]|\d+\s*\t)\s*/i

export function cleanSteps(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(STEP_PREFIX, '').trim())
    .filter((l) => l.length > 8)
  if (lines.length >= 3) return lines
  // One big paragraph: split into sentences and group them in pairs so each step is readable.
  const sentences = text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 3)
  if (sentences.length <= 2) return lines.length ? lines : sentences
  const out: string[] = []
  for (let i = 0; i < sentences.length; i += 2) out.push(sentences.slice(i, i + 2).join(' '))
  return out
}

function mealToDish(m: Raw): Dish {
  const ingredients: Dish['ingredients'] = []
  for (let i = 1; i <= 20; i++) {
    const name = (m[`strIngredient${i}`] ?? '').trim()
    if (name) ingredients.push({ name, measure: (m[`strMeasure${i}`] ?? '').trim() })
  }
  const known = cuisineOf(m.strCountry) ?? cuisineOf(m.strArea)
  return {
    id: String(m.idMeal),
    name: String(m.strMeal).trim(),
    thumb: String(m.strMealThumb ?? ''),
    category: m.strCategory ?? '',
    cuisine: known?.label ?? m.strArea ?? m.strCountry ?? '',
    cuisineId: known?.id ?? null,
    ingredients,
    steps: cleanSteps(m.strInstructions ?? ''),
    source: m.strSource || null,
    youtube: null,
    minutes: null,
  }
}

type DummyRaw = {
  id: number
  name: string
  ingredients: string[]
  instructions: string[]
  prepTimeMinutes?: number
  cookTimeMinutes?: number
  cuisine?: string
  tags?: string[]
  image?: string
  mealType?: string[]
}

/** DummyJSON has no category field: infer one so "chicken", "dessert" etc. still work. */
export function inferCategory(r: Pick<DummyRaw, 'name' | 'tags' | 'mealType'>): string {
  const text = `${r.name} ${(r.tags ?? []).join(' ')}`.toLowerCase()
  const meal = (r.mealType ?? []).join(' ').toLowerCase()
  // Whole words only: "15 pieces" must not look like "pie".
  if (/\b(beverage|smoothie|cocktail|drink|lemonade|juice)s?\b/.test(meal + ' ' + text)) return 'Drink'
  if (meal.includes('dessert') || /\b(cake|cookie|pie|pudding|brownie|ice cream|tart|flan|leche)s?\b/.test(text)) return 'Dessert'
  if (meal.includes('breakfast')) return 'Breakfast'
  if (/\b(pasta|spaghetti|noodle|lasagna|fettuccine|ramen|pancit)s?\b/.test(text)) return 'Pasta'
  if (/\bchicken\b/.test(text)) return 'Chicken'
  if (/\b(beef|steak|pork|lamb|bacon|sausage)\b/.test(text)) return 'Beef'
  if (/\b(shrimp|prawn|salmon|fish|tuna|seafood|crab|cod|squid)s?\b/.test(text)) return 'Seafood'
  if (/\b(vegetarian|vegan|tofu|salad|veggie|lentil)s?\b/.test(text)) return 'Vegetarian'
  if (meal.includes('side') || meal.includes('appetizer') || meal.includes('snack')) return 'Side'
  return 'Miscellaneous'
}

function dummyToDish(r: DummyRaw): Dish {
  const known = cuisineOf(r.cuisine)
  return {
    id: `dj-${r.id}`,
    name: r.name.trim(),
    thumb: r.image ?? '',
    category: inferCategory(r),
    cuisine: known?.label ?? r.cuisine ?? '',
    cuisineId: known?.id ?? null,
    ingredients: r.ingredients.map((name) => ({ name: name.trim(), measure: '' })),
    steps: r.instructions.map((s) => s.trim()).filter(Boolean),
    source: `${DUMMY}/${r.id}`,
    youtube: null,
    minutes: (r.prepTimeMinutes ?? 0) + (r.cookTimeMinutes ?? 0) || null,
  }
}

function drinkToDish(m: Raw): Dish {
  const ingredients: Dish['ingredients'] = []
  for (let i = 1; i <= 15; i++) {
    const name = (m[`strIngredient${i}`] ?? '').trim()
    if (name) ingredients.push({ name, measure: (m[`strMeasure${i}`] ?? '').trim() })
  }
  return {
    id: `cd-${m.idDrink}`,
    name: String(m.strDrink).trim(),
    thumb: String(m.strDrinkThumb ?? ''),
    category: 'Drink',
    cuisine: 'Drinks',
    cuisineId: null,
    ingredients,
    steps: cleanSteps(m.strInstructions ?? ''),
    source: `https://www.thecocktaildb.com/drink/${m.idDrink}`,
    youtube: null,
    minutes: null,
  }
}

// ---------- dishes imported from any web page ----------

function toB64(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  bytes.forEach((b) => (bin += String.fromCharCode(b)))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64(s: string): string {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

/** Dish id for a web page: "url-" plus the address, so the page can be opened again from the id alone. */
export const urlDishId = (url: string) => `url-${toB64(url)}`

export function urlFromDishId(id: string): string | null {
  try {
    return id.startsWith('url-') ? fromB64(id.slice(4)) : null
  } catch {
    return null
  }
}

// ---------- the bundled catalog (instant, offline) ----------

type CatalogFile = { meals: Raw[]; dummy: DummyRaw[]; drinks: Raw[] }

const catalogIndex = new Map<string, Dish>()
let catalogPromise: Promise<Dish[]> | null = null

/** Every dish in the bundled catalog. Resolves to [] if the file cannot be loaded. */
export function loadCatalog(): Promise<Dish[]> {
  catalogPromise ??= fetch('/catalog.json')
    .then((r) => {
      if (!r.ok) throw new Error('catalog')
      return r.json() as Promise<CatalogFile>
    })
    .then((c) => {
      const all = [...c.meals.map(mealToDish), ...c.dummy.map(dummyToDish), ...c.drinks.map(drinkToDish)]
      all.forEach((d) => catalogIndex.set(d.id, d))
      return all
    })
    .catch(() => {
      catalogPromise = null
      return [] as Dish[]
    })
  return catalogPromise
}

// ---------- Wikibooks Cookbook (live search for anything not in the catalog) ----------

const wikiTitle = (id: string) => id.slice(3)

function wikiPageUrl(title: string) {
  return `https://en.wikibooks.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
}

const clean = (s: string | null) => (s ?? '').replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim()

/** Turn a Wikibooks recipe page into a Dish, or null if it is not a recipe (no ingredients + steps). */
export function parseWikiRecipe(html: string, title: string): Dish | null {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const root = doc.querySelector('.mw-parser-output') ?? doc.body
  const ingredients: string[] = []
  const steps: string[] = []
  let section = ''
  for (const el of Array.from(root.children)) {
    const heading = el.matches('h1,h2,h3,h4') ? el : el.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > h4')
    if (heading) {
      section = clean(heading.textContent).toLowerCase()
      continue
    }
    const isSteps = /procedure|preparation|direction|method|instruction/.test(section)
    if (el.matches('ul, ol')) {
      const items = Array.from(el.querySelectorAll(':scope > li')).map((li) => clean(li.textContent)).filter(Boolean)
      if (/ingredient/.test(section)) ingredients.push(...items)
      else if (isSteps) steps.push(...items)
    } else if (el.matches('p') && isSteps) {
      const t = clean(el.textContent)
      if (t.length > 15) steps.push(t)
    }
  }
  if (ingredients.length < 2 || steps.length < 1) return null

  const label = title.replace(/^Cookbook:/, '')
  const country = Array.from(root.querySelectorAll('a[title^="Cookbook:Cuisine of"]'))
    .map((a) => (a.getAttribute('title') ?? '').match(/Cuisine of (?:the )?(.+)$/)?.[1])
    .find(Boolean)
  const known = cuisineOf(country)
  return {
    id: `wb-${title}`,
    name: label,
    thumb: '',
    category: inferCategory({ name: label, tags: ingredients.slice(0, 4), mealType: [] }),
    cuisine: known?.label ?? country ?? '',
    cuisineId: known?.id ?? null,
    ingredients: ingredients.map((name) => ({ name, measure: '' })),
    steps,
    source: wikiPageUrl(title),
    youtube: null,
    minutes: null,
  }
}

async function wikiDish(title: string): Promise<Dish | null> {
  const url = `${WIKI}?${new URLSearchParams({ action: 'parse', page: title, prop: 'text', redirects: '1', disablelimitreport: '1', format: 'json', formatversion: '2', origin: '*' })}`
  const res = await getJson<{ parse?: { title: string; text: string } }>(url)
  return res.parse ? parseWikiRecipe(res.parse.text, res.parse.title) : null
}

/** Search Wikibooks Cookbook for recipes matching the words. Returns [] on any failure. */
export async function searchWeb(q: string): Promise<Dish[]> {
  try {
    // Search the words as typed, and as a prefix ("lechon" also finds "Lechon Paksiw").
    const find = (srsearch: string) =>
      getJson<{ query: { search: { title: string }[] } }>(`${WIKI}?${new URLSearchParams({ action: 'query', list: 'search', srsearch, srnamespace: '102', srlimit: '6', format: 'json', origin: '*' })}`)
        .then((r) => r.query.search.map((s) => s.title))
        .catch(() => [] as string[])
    const term = q.trim()
    const titles = [...new Set((await Promise.all([find(term), find(`${term}*`)])).flat())].filter((t) => !/^Cookbook:Cuisine of/i.test(t)).slice(0, 8)
    const dishes = await Promise.all(titles.map((t) => wikiDish(t).catch(() => null)))
    const out = dishes.filter((d): d is Dish => d !== null)
    out.forEach((d) => catalogIndex.set(d.id, d))
    out.forEach(writeCached)
    return out
  } catch {
    return []
  }
}

// ---------- API ----------

export async function lookup(id: string): Promise<Dish | null> {
  const hit = catalogIndex.get(id) ?? readCached(id)
  if (hit) return hit
  if (id.startsWith('url-')) {
    const url = urlFromDishId(id)
    if (!url) return null
    const { importDish } = await import('./web')
    const imported = await importDish(url)
    catalogIndex.set(imported.id, imported)
    writeCached(imported)
    return imported
  }
  if (!id.startsWith('wb-')) {
    await loadCatalog()
    const fromCatalog = catalogIndex.get(id)
    if (fromCatalog) return fromCatalog
  }
  let d: Dish | null
  if (id.startsWith('wb-')) {
    d = await wikiDish(wikiTitle(id))
  } else if (id.startsWith('dj-')) {
    const r = await getJson<DummyRaw>(`${DUMMY}/${id.slice(3)}`)
    d = r?.name ? dummyToDish(r) : null
  } else if (id.startsWith('cd-')) {
    const res = await getJson<{ drinks: Raw[] | null }>(`${DRINK}/lookup.php?i=${id.slice(3)}`)
    d = res.drinks?.[0] ? drinkToDish(res.drinks[0]) : null
  } else {
    const res = await getJson<{ meals: Raw[] | null }>(`${MEAL}/lookup.php?i=${encodeURIComponent(id)}`)
    d = res.meals?.[0] ? mealToDish(res.meals[0]) : null
  }
  if (d) writeCached(d)
  return d
}

export async function lookupMany(ids: string[], concurrency = 8): Promise<Dish[]> {
  const out: (Dish | null)[] = new Array(ids.length).fill(null)
  let next = 0
  async function worker() {
    while (next < ids.length) {
      const i = next++
      out[i] = await lookup(ids[i]).catch(() => null)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker))
  return out.filter((d): d is Dish => d !== null)
}

function mealStubs(res: { meals: Raw[] | null }): Stub[] {
  return (res.meals ?? []).map((m) => ({ id: String(m.idMeal), name: String(m.strMeal), thumb: String(m.strMealThumb ?? '') }))
}

// Live-API fallbacks, used only when the bundled catalog could not be loaded.
async function listByCuisine(c: Cuisine): Promise<Stub[]> {
  const all = await Promise.all(
    c.areas.map((a) => getJson<{ meals: Raw[] | null }>(`${MEAL}/filter.php?a=${encodeURIComponent(a)}`).then(mealStubs).catch(() => [])),
  )
  const seen = new Set<string>()
  return all.flat().filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)))
}

async function listByCategory(cat: string): Promise<Stub[]> {
  if (cat === 'Drink') {
    const res = await getJson<{ drinks: Raw[] | null }>(`${DRINK}/filter.php?a=Non_Alcoholic`).catch(() => ({ drinks: null }))
    return (res.drinks ?? []).map((m) => ({ id: `cd-${m.idDrink}`, name: String(m.strDrink), thumb: String(m.strDrinkThumb ?? '') }))
  }
  return getJson<{ meals: Raw[] | null }>(`${MEAL}/filter.php?c=${encodeURIComponent(cat)}`).then(mealStubs).catch(() => [])
}

let dummyAllPromise: Promise<Dish[]> | null = null
function dummyAll(): Promise<Dish[]> {
  dummyAllPromise ??= getJson<{ recipes: DummyRaw[] }>(`${DUMMY}?limit=0`)
    .then((r) => r.recipes.map(dummyToDish))
    .catch(() => {
      dummyAllPromise = null
      return [] as Dish[]
    })
  return dummyAllPromise
}

// ---------- search ----------

/** Words people use for dishes that may be missing from the catalog's own names (so they can still be split and corrected). */
const EXTRA_WORDS = ['pan', 'de', 'sal', 'sa', 'ng', 'na', 'con', 'al', 'la', 'el', 'kare', 'leche', 'flan', 'arroz', 'caldo', 'halo', 'bicol', 'express', 'sinigang', 'adobo', 'pancit', 'lumpia', 'lechon', 'tinola', 'sisig', 'puto', 'turon', 'laing', 'bulalo', 'nilaga']

let vocabCache: { vocab: Set<string>; names: string[]; size: number } | null = null

/** Every word that appears in a dish name or ingredient, and every whole dish name. Built once. */
function vocabFor(all: Dish[]) {
  if (vocabCache && vocabCache.size === all.length) return vocabCache
  const vocab = new Set<string>(EXTRA_WORDS)
  const names: string[] = []
  for (const d of all) {
    names.push(d.name)
    for (const w of normalize(d.name).split(' ')) if (w.length >= 2) vocab.add(w)
    for (const i of d.ingredients) for (const w of normalize(i.name).split(' ')) if (w.length >= 3) vocab.add(w)
  }
  vocabCache = { vocab, names, size: all.length }
  return vocabCache
}

export type SearchOutcome = {
  dishes: Dish[]
  /** True when nothing matched exactly and these are only the nearest dishes. */
  closest: boolean
  /** What we think the person meant, when it differs from what they typed ("pan de sal"). */
  meant: string | null
  /** Related dishes to suggest when the exact one is missing (bread for "pandesal"). */
  similar: Dish[]
  /** Every spelling worth searching the web for. */
  variants: string[]
}

type Hit = { score: number; fuzzy: boolean }

const STOP = new Set(['de', 'la', 'el', 'sa', 'na', 'ng', 'con', 'al', 'and', 'with', 'of', 'the', 'a', 'y', 'at', 'in', 'to', 'for'])
const stem = (w: string) => (w.length > 4 ? w.replace(/(es|s)$/, '') : w)
/** A typed word is "in" a list of words if it is the same word (ignoring plurals) or the start of a longer one. */
const present = (w: string, tokens: string[]) => {
  const sw = stem(w)
  return tokens.some((t) => t === w || stem(t) === sw || (sw.length >= 4 && t.startsWith(sw)))
}

/** How well one dish matches one search string, or null. Exact word matches beat close spellings. */
function matchDish(d: Dish, variant: string, rank: number): Hit | null {
  const all = variant.split(' ').filter((w) => w.length > 1)
  const words = all.filter((w) => !STOP.has(w)).length > 0 ? all.filter((w) => !STOP.has(w)) : all
  if (words.length === 0) return null
  const name = normalize(d.name)
  const nameCompact = name.replace(/ /g, '')
  const nameWords = name.split(' ')
  const restWords = `${normalize(d.cuisine)} ${normalize(d.category)} ${d.ingredients.map((i) => normalize(i.name)).join(' ')}`.split(' ')
  const penalty = rank * 0.4

  // 1. every word is a word of the dish (name, cuisine, category or an ingredient)
  if (words.every((w) => present(w, nameWords) || present(w, restWords))) {
    const inName = words.filter((w) => present(w, nameWords)).length
    return { score: 10 + inName * 3 + (name.startsWith(words[0]) ? 2 : 0) - d.ingredients.length * 0.01 - penalty, fuzzy: false }
  }
  // 2. the same letters without spaces or hyphens: "karekare" inside "Kare-Kare (Oxtail...)"
  const vc = compact(variant)
  if (vc.length >= 6 && nameCompact.includes(vc)) return { score: 16 - penalty, fuzzy: false }
  // 3. every word is a small typo of a word in the name (or is an ingredient)
  const close = words.filter((w) => nameWords.some((nw) => wordMatches(w, nw))).length
  if (close > 0 && words.every((w) => nameWords.some((nw) => wordMatches(w, nw)) || present(w, restWords))) {
    return { score: 5 + close * 2 - penalty, fuzzy: true }
  }
  return null
}

/** How related a dish is to a loose idea ("rice cake"): words in the name count most. */
function relatedness(d: Dish, term: string): number {
  const words = normalize(term).split(' ').filter((w) => w.length > 1 && !STOP.has(w))
  if (words.length === 0) return 0
  const nameWords = normalize(d.name).split(' ')
  const catWords = `${normalize(d.category)} ${normalize(d.cuisine)}`.split(' ')
  const ingWords = d.ingredients.flatMap((i) => normalize(i.name).split(' '))
  let score = 0
  for (const w of words) score += present(w, nameWords) ? 3 : present(w, catWords) ? 1 : present(w, ingWords) ? 0.5 : 0
  return score / words.length
}

/** Search the bundled catalog the way a person types, not the way a recipe book spells. */
export async function searchCatalog(q: string): Promise<SearchOutcome> {
  const all = await loadCatalog()
  const empty: SearchOutcome = { dishes: [], closest: false, meant: null, similar: [], variants: [normalize(q)].filter(Boolean) }
  if (all.length === 0 || normalize(q).length < 2) return empty

  const { vocab, names } = vocabFor(all)
  const reading = interpret(q, vocab, names)

  const best = new Map<string, { dish: Dish; hit: Hit }>()
  for (const d of all) {
    for (const [rank, v] of reading.variants.entries()) {
      const hit = matchDish(d, v, rank)
      if (!hit) continue
      const prev = best.get(d.id)
      if (!prev || hit.score > prev.hit.score) best.set(d.id, { dish: d, hit })
    }
  }
  const ranked = [...best.values()].sort((a, b) => b.hit.score - a.hit.score)
  const exact = ranked.filter((r) => !r.hit.fuzzy).map((r) => r.dish)
  const near = ranked.filter((r) => r.hit.fuzzy).map((r) => r.dish)
  // Always give a few close alternatives when the exact list is thin.
  const dishes = exact.length >= 6 ? exact : [...exact, ...near].slice(0, Math.max(exact.length, 12))

  let similar: Dish[] = []
  if (dishes.length < 6 && reading.similar.length > 0) {
    const have = new Set(dishes.map((d) => d.id))
    const scored = all
      .filter((d) => !have.has(d.id) && d.category !== 'Drink')
      // the first idea listed is the closest one, so it counts a little more than the later ones
      .map((d) => ({ d, score: Math.max(...reading.similar.map((t, i) => relatedness(d, t) * (1 - i * 0.2))) + (d.thumb ? 0.2 : 0) }))
      .filter((x) => x.score >= 1)
      .sort((x, y) => y.score - x.score)
    similar = scored.slice(0, 8).map((x) => x.d)
  }

  return { dishes, closest: exact.length === 0 && dishes.length > 0, meant: reading.meant, similar, variants: reading.variants }
}

/** Search the web (Wikibooks) under the typed spelling and the best guesses at the proper one. */
export async function searchWebSmart(q: string): Promise<Dish[]> {
  const all = await loadCatalog()
  const { vocab, names } = vocabFor(all)
  const reading = interpret(q, vocab, names)
  const tries = reading.variants.filter((v) => v.length >= 3).slice(0, 3)
  const lists = await Promise.all(tries.map((t) => searchWeb(t)))
  const seen = new Set<string>()
  return lists.flat().filter((d) => (seen.has(d.id) ? false : (seen.add(d.id), true)))
}

// ---------- "not overly fancy" + preferences ----------

export function effortLimit(e: Effort): number {
  return e === 'quick' ? 7 : e === 'easy' ? 10 : 14
}

export function isSimple(d: Dish, e: Effort): boolean {
  return d.ingredients.length > 0 && d.ingredients.length <= effortLimit(e) && d.steps.length > 0 && d.steps.length <= 12
}

/** Short words must match whole words ("ham" must not hide "chamomile"); longer ones match as prefixes ("anchov"). */
function mentions(text: string, word: string): boolean {
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(word.length <= 4 ? `\\b${esc}s?\\b` : `\\b${esc}`, 'i').test(text)
}

export function conflicts(d: Dish, avoid: string[]): boolean {
  // The drinks shelf promises "no alcohol", so that rule always applies to it.
  const rules = d.category === 'Drink' && !avoid.includes('alcohol') ? [...avoid, 'alcohol'] : avoid
  if (rules.length === 0) return false
  const text = `${d.name} ${d.ingredients.map((i) => i.name).join(' ')}`
  return AVOID.filter((a) => rules.includes(a.id)).some((a) => a.words.some((w) => mentions(text, w)))
}

export function dishUrl(d: Dish): string {
  if (d.id.startsWith('url-')) return urlFromDishId(d.id) ?? ''
  if (d.id.startsWith('wb-')) return wikiPageUrl(wikiTitle(d.id))
  if (d.id.startsWith('dj-')) return `${DUMMY}/${d.id.slice(3)}`
  if (d.id.startsWith('cd-')) return `https://www.thecocktaildb.com/drink/${d.id.slice(3)}`
  return `https://www.themealdb.com/meal/${d.id}`
}

/** Which dish id (if any) a saved recipe's source link points at. */
export function dishIdFromUrl(url: string | null): string | null {
  if (!url) return null
  const meal = url.match(/themealdb\.com\/meal\/(\d+)/)
  if (meal) return meal[1]
  const dummy = url.match(/dummyjson\.com\/recipes\/(\d+)/)
  if (dummy) return `dj-${dummy[1]}`
  const drink = url.match(/thecocktaildb\.com\/drink\/(\d+)/)
  if (drink) return `cd-${drink[1]}`
  const wiki = url.match(/en\.wikibooks\.org\/wiki\/(Cookbook(?::|%3A)[^?#]+)/i)
  if (wiki) {
    try {
      return `wb-${decodeURIComponent(wiki[1]).replace(/_/g, ' ')}`
    } catch {
      return null
    }
  }
  // Any other link was imported from the web: its id is just the address.
  return /^https?:\/\//i.test(url) ? urlDishId(url) : null
}

const UNIT_ALIASES: Record<string, string> = {
  tbs: 'tbsp', tbsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp', tblsp: 'tbsp',
  tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
  cup: 'cup', cups: 'cup', ounce: 'oz', ounces: 'oz', oz: 'oz', lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  g: 'g', gram: 'g', grams: 'g', kg: 'kg', ml: 'ml', l: 'l', litre: 'l', liter: 'l', clove: 'cloves', cloves: 'cloves',
}

/** "1 tbs" -> 1 tbsp, "50ml/2fl oz" -> 50 ml, "Pinch" -> note only. Never glued onto the name. */
export function measureToParts(measure: string): Pick<Ingredient, 'amount' | 'unit' | 'note'> {
  const m = measure.trim().split('/').length > 2 || /^\d+\s*\d*\/\d+/.test(measure.trim()) ? measure.trim() : measure.trim().split('/')[0]
  const match = m.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?|[½¼¾])\s*([a-zA-Z]+)?\.?\s*(.*)$/)
  if (!match) return { amount: '', unit: '', note: measure.trim() }
  const [, amount, word = '', rest] = match
  const unit = UNIT_ALIASES[word.toLowerCase()]
  if (unit) return { amount: amount.replace(',', '.'), unit, note: rest.trim() }
  // Not a unit ("1 large", "2 chopped"): keep the number, move the word into the note.
  return { amount: amount.replace(',', '.'), unit: '', note: `${word} ${rest}`.trim() }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'the web'
  }
}

export function dishToRecipe(d: Dish) {
  // DummyJSON and Wikibooks give whole lines ("1 lb pork, cubed"); TheMealDB gives name and measure apart.
  const wholeLines = d.id.startsWith('dj-') || d.id.startsWith('wb-') || d.id.startsWith('url-')
  const ingredients: Ingredient[] = d.ingredients.map((i) =>
    wholeLines ? parseIngredientLine(i.name) ?? { name: i.name, amount: '', unit: '', note: '' } : { name: i.name, ...measureToParts(i.measure) },
  )
  const steps: Step[] = d.steps.map((s) => parseStepLine(s) ?? { text: s, timer_seconds: null })
  const tags = [...new Set([d.cuisineId ?? d.cuisine.toLowerCase(), d.category.toLowerCase()].filter(Boolean))]
  return {
    meta: {
      title: d.name,
      source_type: 'link' as const,
      source_url: dishUrl(d),
      source_note: d.id.startsWith('wb-') ? 'Wikibooks Cookbook, CC BY-SA' : d.id.startsWith('url-') ? `Imported from ${hostOf(dishUrl(d))}` : 'from the Discover feed',
      servings: null,
      tags,
      bring_from_home: false,
    },
    ingredients,
    steps,
  }
}

// ---------- browsing ----------

export type Browse = { type: 'mix' } | { type: 'cuisine'; id: string } | { type: 'kind'; id: string }

function sample<T>(list: T[], n: number): T[] {
  return shuffled(list, Math.random).slice(0, n)
}

/** Dishes for a Discover chip. Uses the catalog; falls back to live APIs if it is unavailable. */
export async function browseDishes(pick: Browse): Promise<Dish[]> {
  const catalog = await loadCatalog()
  if (catalog.length > 100) {
    if (pick.type === 'cuisine') return catalog.filter((d) => d.cuisineId === pick.id)
    if (pick.type === 'kind') {
      const cats = new Set<string>(KINDS.find((k) => k.id === pick.id)?.categories ?? [])
      return catalog.filter((d) => cats.has(d.category))
    }
    return sample(catalog.filter((d) => d.category !== 'Drink'), 60)
  }
  if (pick.type === 'cuisine') {
    const c = CUISINES.find((x) => x.id === pick.id)
    const stubs = c ? await listByCuisine(c) : []
    const [meals, extra] = await Promise.all([lookupMany(stubs.slice(0, 30).map((s) => s.id)), dummyAll()])
    return [...extra.filter((d) => d.cuisineId === pick.id), ...meals]
  }
  if (pick.type === 'kind') {
    const k = KINDS.find((x) => x.id === pick.id)
    const lists = await Promise.all((k?.categories ?? []).map((c) => listByCategory(c)))
    const meals = await lookupMany(sample(lists.flat(), 24).map((s) => s.id))
    const cats = new Set<string>(k?.categories ?? [])
    return [...(await dummyAll()).filter((d) => cats.has(d.category)), ...meals]
  }
  const got = await Promise.all(
    Array.from({ length: 12 }, () =>
      fetch(`${MEAL}/random.php`).then((r) => r.json() as Promise<{ meals: Raw[] | null }>).then((r) => (r.meals?.[0] ? mealToDish(r.meals[0]) : null)).catch(() => null),
    ),
  )
  const seen = new Set<string>()
  return [...got.filter((d): d is Dish => d !== null), ...sample(await dummyAll(), 6)].filter((d) => (seen.has(d.id) ? false : (seen.add(d.id), true)))
}

// ---------- the feed ----------

export type History = {
  cuisines: Record<string, number> // cuisine id -> weight (cooked count + 1)
  categories: Record<string, number> // lowercase category -> weight
  savedIds: Set<string> // source dish ids already in the user's library
}

export type Section = { id: string; title: string; subtitle: string; dishes: Dish[] }

function rngFrom(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffled<T>(list: T[], rnd: () => number): T[] {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const topKeys = (r: Record<string, number>, n: number) =>
  Object.entries(r).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k)

const DEFAULT_KINDS = ['chicken', 'pasta', 'breakfast']
const EXPLORE = ['thai', 'japanese', 'mexican', 'greek', 'indian', 'spanish', 'vietnamese', 'italian', 'turkish', 'korean', 'lebanese', 'pakistani', 'moroccan']
const ALL_CATEGORIES = KINDS.flatMap((k) => k.categories as readonly string[])

export async function buildFeed(prefs: Preferences, history: History, seed: number): Promise<Section[]> {
  const rnd = rngFrom(seed)
  const kindCats = (ids: string[]) => KINDS.filter((k) => ids.includes(k.id)).flatMap((k) => k.categories as readonly string[])
  const prefCats = new Set(kindCats(prefs.kinds).map((c) => c.toLowerCase()))

  // Who and what to feature: stated taste first, then what the user actually cooks.
  const cuisineIds = shuffled([...new Set([...prefs.cuisines, ...topKeys(history.cuisines, 3)])], rnd).slice(0, 4)
  const catNames = shuffled(
    [
      ...new Set([
        ...kindCats(prefs.kinds.length ? prefs.kinds : DEFAULT_KINDS),
        ...topKeys(history.categories, 2).map((c) => ALL_CATEGORIES.find((x) => x.toLowerCase() === c) ?? ''),
      ]),
    ].filter(Boolean),
    rnd,
  ).slice(0, 3)
  const exploreId = shuffled(EXPLORE.filter((id) => !prefs.cuisines.includes(id) && !(id in history.cuisines)), rnd)[0]
  const cuisines = cuisineIds.map((id) => CUISINES.find((c) => c.id === id)).filter((c): c is Cuisine => Boolean(c))
  const explore = CUISINES.find((c) => c.id === exploreId)

  // The pool: the bundled catalog when we have it (instant); otherwise sample the live APIs.
  let pool: Dish[]
  const catalog = await loadCatalog()
  if (catalog.length > 100) {
    pool = catalog
  } else {
    const [cuisineLists, catLists, sweetList, exploreList, dummy] = await Promise.all([
      Promise.all(cuisines.map((c) => listByCuisine(c))),
      Promise.all(catNames.map((c) => listByCategory(c))),
      listByCategory('Dessert'),
      explore ? listByCuisine(explore) : Promise.resolve([] as Stub[]),
      dummyAll(),
    ])
    const ids = new Set<string>()
    const add = (list: Stub[], n: number) => shuffled(list.filter((s) => !history.savedIds.has(s.id)), rnd).slice(0, n).forEach((s) => ids.add(s.id))
    cuisineLists.forEach((l) => add(l, 7))
    catLists.forEach((l) => add(l, 5))
    add(sweetList, 6)
    add(exploreList, 7)
    const drinkStubs = shuffled(await listByCategory('Drink'), rnd).slice(0, 8)
    pool = [...(await lookupMany([...ids, ...drinkStubs.map((s) => s.id)])), ...dummy]
  }

  const ok = pool.filter((d) => isSimple(d, prefs.effort) && !conflicts(d, prefs.avoid) && !history.savedIds.has(d.id))

  const maxC = Math.max(1, ...Object.values(history.cuisines))
  const maxK = Math.max(1, ...Object.values(history.categories))

  // What the person chose in the sign-up quiz is the main thing: a dish "matches" when it is one of their
  // cuisines or one of their kinds of dish. (If they skipped the quiz, everything counts.)
  const hasQuiz = prefs.cuisines.length > 0 || prefs.kinds.length > 0
  const cuisineHit = (d: Dish) => Boolean(d.cuisineId && prefs.cuisines.includes(d.cuisineId))
  const kindHit = (d: Dish) => prefCats.has(d.category.toLowerCase())
  const quizMatch = (d: Dish) => !hasQuiz || cuisineHit(d) || kindHit(d)

  // How much we want a dish to turn up. This only sets the odds: the order itself is a weighted lucky draw,
  // so the home screen is different every time it is opened but leans hard towards what the person chose.
  const weight = (d: Dish) =>
    1 +
    (cuisineHit(d) ? 4 : 0) +
    (kindHit(d) ? 3 : 0) +
    (d.cuisineId ? (history.cuisines[d.cuisineId] ?? 0) / maxC : 0) * 1.5 +
    ((history.categories[d.category.toLowerCase()] ?? 0) / maxK) * 1.5 +
    (d.ingredients.length <= 6 ? 0.3 : 0) +
    (d.thumb ? 0.7 : 0)

  // Weighted sampling without replacement (Efraimidis-Spirakis): a smaller key comes earlier, and a heavier
  // weight makes a small key likelier. Keys are computed once so the sort is consistent.
  const draw = new Map<string, number>()
  for (const d of ok) draw.set(d.id, -Math.log(Math.max(rnd(), 1e-9)) / weight(d))
  const scored = [...ok].sort((a, b) => (draw.get(a.id) ?? 0) - (draw.get(b.id) ?? 0))
  const used = new Set<string>()
  const take = (list: Dish[], n: number) => {
    const fresh = list.filter((d) => !used.has(d.id)).slice(0, n)
    fresh.forEach((d) => used.add(d.id))
    return fresh
  }

  const sections: Section[] = []
  const push = (id: string, title: string, subtitle: string, dishes: Dish[]) => {
    if (dishes.length >= 2) sections.push({ id, title, subtitle, dishes })
  }
  const solid = scored.filter((d) => d.category !== 'Drink')

  // "Picked for you" is tied to the person's own country: dishes from their home cuisine, drawn at random each
  // opening and leaning towards the kinds of dish they like. Only when home has too few dishes do we fill in from
  // their other chosen cuisines, then their chosen kinds.
  const home = homeCuisine(prefs)
  const fromHome = home ? solid.filter((d) => d.cuisineId === home) : []
  const picked: Dish[] = []
  for (const d of fromHome) {
    if (picked.length >= 10) break
    if (!used.has(d.id)) {
      used.add(d.id)
      picked.push(d)
    }
  }
  if (picked.length < 10) picked.push(...take(solid.filter((d) => cuisineHit(d)), 10 - picked.length))
  if (picked.length < 10) picked.push(...take(solid.filter((d) => quizMatch(d)), 10 - picked.length))
  if (picked.length < 6) picked.push(...take(solid, 6 - picked.length))
  // Lead with a dish that has a photo, if there is one among them.
  const lead = picked.findIndex((d) => d.thumb)
  if (lead > 0) [picked[0], picked[lead]] = [picked[lead], picked[0]]
  push('picked', 'Picked for you', home ? `From ${cuisineById(home)?.label ?? 'home'} kitchens` : hasQuiz ? 'Matched to the tastes you chose' : 'Based on what you cook', picked)
  push('few', 'Short shopping list', 'Six ingredients or fewer', take(solid.filter((d) => d.ingredients.length <= 6), 10))
  push('quick', 'Quick to cook', 'Ready in 30 minutes or less', take(solid.filter((d) => d.minutes !== null && d.minutes <= 30), 8))
  for (const c of cuisines.slice(0, 2)) {
    push(`c-${c.id}`, `${c.flag} ${c.label} favourites`, 'Home-style, nothing fancy', take(solid.filter((d) => d.cuisineId === c.id), 10))
  }
  push('sweet', '🥐 Pastries & sweets', 'For when you want something nice', take(solid.filter((d) => d.category === 'Dessert'), 10))
  if (explore) push('explore', `Try something new: ${explore.flag} ${explore.label}`, 'A little outside your usual', take(solid.filter((d) => d.cuisineId === explore.id), 10))
  for (const cat of catNames.filter((c) => c !== 'Drink')) {
    push(`k-${cat}`, `More ${cat.toLowerCase()} ideas`, 'Easy to start tonight', take(solid.filter((d) => d.category === cat), 10))
  }
  push('drinks', '🥤 Drinks & coolers', 'Refreshing, no alcohol', take(scored.filter((d) => d.category === 'Drink'), 10))
  return sections
}
